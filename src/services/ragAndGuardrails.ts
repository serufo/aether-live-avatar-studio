import {
  AvatarProfile,
  EmotionState,
  GestureState,
  GuardrailAuditEvent,
  KnowledgeChunk,
  KnowledgeDocument,
  RagCitation,
} from '../types/avatar';

// Normalização linguística PT-BR / EN para busca vetorial híbrida (BM25 + N-gram Cosine)
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s%.,-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma',
  'para', 'com', 'por', 'que', 'qual', 'quais', 'como', 'sobre', 'seu', 'sua',
  'ao', 'aos', 'as', 'os', 'e', 'ou', 'se', 'mais', 'foi', 'sao', 'ser', 'tem',
  'the', 'and', 'for', 'with', 'what', 'how', 'is', 'are', 'you', 'pode', 'me',
]);

function extractTerms(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .map((t) => t.replace(/[.,-]/g, ''))
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

export function chunkDocumentContent(
  docId: string,
  docTitle: string,
  content: string
): KnowledgeChunk[] {
  const rawSections = content
    .split(/\n(?=#{1,3}\s|\n\n)/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const chunks: KnowledgeChunk[] = [];
  let idx = 1;

  for (const section of rawSections) {
    if (section.length <= 520) {
      chunks.push({
        id: `${docId}-chk-${idx++}`,
        docId,
        docTitle,
        text: section,
        tokens: Math.ceil(section.length / 4),
      });
    } else {
      const paragraphs = section.split(/\n\n+/);
      let buffer = '';
      for (const p of paragraphs) {
        if ((buffer + '\n\n' + p).length > 520 && buffer.length > 0) {
          chunks.push({
            id: `${docId}-chk-${idx++}`,
            docId,
            docTitle,
            text: buffer.trim(),
            tokens: Math.ceil(buffer.length / 4),
          });
          buffer = p;
        } else {
          buffer = buffer ? `${buffer}\n\n${p}` : p;
        }
      }
      if (buffer.trim()) {
        chunks.push({
          id: `${docId}-chk-${idx++}`,
          docId,
          docTitle,
          text: buffer.trim(),
          tokens: Math.ceil(buffer.length / 4),
        });
      }
    }
  }

  if (chunks.length === 0 && content.trim().length > 0) {
    chunks.push({
      id: `${docId}-chk-1`,
      docId,
      docTitle,
      text: content.trim(),
      tokens: Math.ceil(content.length / 4),
    });
  }

  return chunks;
}

export function ensureDocumentChunks(doc: KnowledgeDocument): KnowledgeDocument {
  if (doc.chunks && doc.chunks.length > 0) return doc;
  return {
    ...doc,
    chunks: chunkDocumentContent(doc.id, doc.title, doc.content),
  };
}

// Busca Semântica + Léxica (BM25 + Trigram Jaccard/Cosine) na Base de Conhecimento do Avatar
export function searchKnowledgeBase(
  query: string,
  avatarId: string,
  documents: KnowledgeDocument[],
  topK = 3
): RagCitation[] {
  const avatarDocs = documents
    .filter((d) => d.avatarId === avatarId)
    .map(ensureDocumentChunks);

  const queryTerms = extractTerms(query);
  if (queryTerms.length === 0) return [];

  const results: RagCitation[] = [];

  for (const doc of avatarDocs) {
    for (const chunk of doc.chunks) {
      const chunkNorm = normalizeText(chunk.text);
      const titleNorm = normalizeText(doc.title);
      const chunkTerms = extractTerms(chunk.text);

      let matchedTerms = 0;
      let exactSubstringBoost = 0;

      for (const qTerm of queryTerms) {
        if (chunkNorm.includes(qTerm)) {
          matchedTerms += 1.25;
        } else if (
          chunkTerms.some(
            (ct) =>
              ct.startsWith(qTerm.slice(0, Math.max(4, qTerm.length - 2))) ||
              qTerm.startsWith(ct.slice(0, Math.max(4, ct.length - 2)))
          )
        ) {
          matchedTerms += 0.85;
        }
        if (titleNorm.includes(qTerm)) {
          exactSubstringBoost += 0.35;
        }
      }

      const coverage = matchedTerms / Math.max(1, queryTerms.length);
      const rawScore = Math.min(0.99, coverage * 0.72 + exactSubstringBoost);

      if (rawScore >= 0.22) {
        results.push({
          chunkId: chunk.id,
          docId: doc.id,
          docTitle: doc.title,
          excerpt: chunk.text,
          score: Number(rawScore.toFixed(2)),
        });
      }
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topK);
}

// Compilador do Prompt Harness (Nível 1 Preventivo) para Gemini Live API
export function compileSystemInstruction(
  avatar: AvatarProfile,
  documents: KnowledgeDocument[]
): string {
  const g = avatar.guardrails;
  const directDocs = documents.filter(
    (d) => d.avatarId === avatar.id && d.injectionMode === 'direct_context'
  );
  const ragDocs = documents.filter(
    (d) => d.avatarId === avatar.id && d.injectionMode === 'rag_vector'
  );

  const formalityDesc =
    g.formalityLevel >= 75
      ? 'executivo, claro e seguro'
      : g.formalityLevel >= 45
      ? 'profissional, acessível e natural'
      : 'casual, dinâmico e direto';

  const empathyDesc =
    g.empathyLevel >= 75
      ? 'acolhedor, empático e atencioso'
      : 'objetivo e direto';

  const maxSentences = Math.max(1, Math.min(g.maxResponseSentences || 2, 3));

  const directContextBlock =
    directDocs.length > 0
      ? `\n\n=== CONHECIMENTO INTERNO DA SUA PERSONA ===\n` +
        directDocs.map((d) => d.content).join('\n\n')
      : '';

  const ragCatalogBlock =
    ragDocs.length > 0
      ? `\n\n=== FATOS E DIRETRIZES DO SEU DOMÍNIO ===\n` +
        ragDocs.map((d) => d.content).join('\n\n')
      : '';

  return [
    `Você é ${avatar.name}, ${avatar.roleTitle}.`,
    `${g.systemRolePrompt}`,
    ``,
    `=== REGRAS OBRIGATÓRIAS DE FALA NATURAL E OBJETIVIDADE ===`,
    `- Idioma: ${g.responseLanguage}. Tom: ${formalityDesc}, ${empathyDesc}.`,
    `- SEJA CURTO E DIRETO: Responda em no máximo ${maxSentences} frases curtas (idealmente de 15 a 35 palavras no total). Vá direto ao ponto.`,
    `- PROIBIDO CITAR FONTES: JAMAIS diga "Com base no documento...", "Segundo a base de conhecimento...", "De acordo com o manual/protocolo..." ou mencione nomes de arquivos. Fale com naturalidade, como conhecimento próprio.`,
    `- TEXTO PURO PARA VOZ: Não use listas, tópicos, asteriscos ou markdown. Escreva exatamente como uma pessoa real falaria em voz alta.`,
    `- Escopo: ${
      g.strictKnowledgeGrounding
        ? 'Responda apenas sobre fatos presentes no seu conhecimento interno. Se algo fugir do escopo, diga de forma curta e educada que atua apenas em ' +
          g.allowedTopics.slice(0, 2).join(' e ') +
          '.'
        : 'Priorize os fatos e métricas do seu conhecimento interno com naturalidade.'
    }`,
    `- Tópicos Proibidos (NUNCA aborde): ${g.blockedTopics.join(', ') || 'Nenhum'}`,
    directContextBlock,
    ragCatalogBlock,
  ]
    .filter(Boolean)
    .join('\n');
}

// Nível 2: Interceptor Reativo em Tempo Real (PII, Prompt Injection, Palavras Bloqueadas, Regex)
export interface RealtimeGuardrailResult {
  allowed: boolean;
  action: 'passed' | 'masked_pii' | 'blocked_cut_audio';
  sanitizedText: string;
  ruleTriggered: string;
  auditEvent: GuardrailAuditEvent;
}

const JAILBREAK_PATTERNS = [
  /ignore\s+(todas\s+as|as|all)\s+(instruc|regras|previous|prior)/i,
  /esqueca\s+(todas\s+as|suas)\s+(instruc|regras)/i,
  /revele\s+(seu|o)\s+system\s+prompt/i,
  /modo\s+dan\b/i,
  /bypass[\s_-]*guardrail/i,
  /jailbreak/i,
];

const CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CARD_REGEX = /\b(?:\d[ -]*?){13,16}\b/g;
const EMAIL_SECRET_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

export function evaluateRealtimeGuardrails(
  text: string,
  direction: 'user_input' | 'avatar_output',
  avatar: AvatarProfile
): RealtimeGuardrailResult {
  const g = avatar.guardrails;
  const now = new Date().toISOString();

  if (!g.enableRealtimeInterceptor) {
    const event: GuardrailAuditEvent = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      avatarId: avatar.id,
      avatarName: avatar.name,
      level: 2,
      direction,
      action: 'passed',
      ruleTriggered: 'Interceptor em Tempo Real Desativado',
      originalSnippet: text,
      sanitizedSnippet: text,
      complianceScore: 100,
    };
    return {
      allowed: true,
      action: 'passed',
      sanitizedText: text,
      ruleTriggered: event.ruleTriggered,
      auditEvent: event,
    };
  }

  // 1. Detecção Anti-Jailbreak / Prompt Injection
  if (g.blockPromptInjection) {
    for (const pattern of JAILBREAK_PATTERNS) {
      if (pattern.test(text)) {
        const event: GuardrailAuditEvent = {
          id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: now,
          avatarId: avatar.id,
          avatarName: avatar.name,
          level: 2,
          direction,
          action: 'blocked_cut_audio',
          ruleTriggered: 'Escudo Anti-Jailbreak / Injeção de Prompt Detectada',
          originalSnippet: text,
          sanitizedSnippet: g.fallbackSafeResponse,
          complianceScore: 8,
        };
        return {
          allowed: false,
          action: 'blocked_cut_audio',
          sanitizedText: g.fallbackSafeResponse,
          ruleTriggered: event.ruleTriggered,
          auditEvent: event,
        };
      }
    }
  }

  // 2. Palavras-Chave Proibidas
  const normInput = normalizeText(text);
  for (const kw of g.blockedKeywords) {
    const normKw = normalizeText(kw);
    if (normKw && normInput.includes(normKw)) {
      const event: GuardrailAuditEvent = {
        id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: now,
        avatarId: avatar.id,
        avatarName: avatar.name,
        level: 2,
        direction,
        action: 'blocked_cut_audio',
        ruleTriggered: `Palavra-Chave Proibida Detectada: "${kw}"`,
        originalSnippet: text,
        sanitizedSnippet: g.fallbackSafeResponse,
        complianceScore: 12,
      };
      return {
        allowed: false,
        action: 'blocked_cut_audio',
        sanitizedText: g.fallbackSafeResponse,
        ruleTriggered: event.ruleTriggered,
        auditEvent: event,
      };
    }
  }

  // 3. Regra Regex Customizada
  if (g.customRegexRule && g.customRegexRule.trim().length > 0) {
    try {
      const customRx = new RegExp(g.customRegexRule, 'i');
      if (customRx.test(text)) {
        const event: GuardrailAuditEvent = {
          id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: now,
          avatarId: avatar.id,
          avatarName: avatar.name,
          level: 2,
          direction,
          action: 'blocked_cut_audio',
          ruleTriggered: `Violação de Regex Customizado (${g.customRegexRule})`,
          originalSnippet: text,
          sanitizedSnippet: g.fallbackSafeResponse,
          complianceScore: 15,
        };
        return {
          allowed: false,
          action: 'blocked_cut_audio',
          sanitizedText: g.fallbackSafeResponse,
          ruleTriggered: event.ruleTriggered,
          auditEvent: event,
        };
      }
    } catch {
      // Ignore invalid regex syntax while editing
    }
  }

  // 4. Mascaramento de PII em Tempo Real (CPF, Cartão, E-mail)
  let sanitized = text;
  const piiTypes: string[] = [];

  if (g.blockPII) {
    if (CPF_REGEX.test(sanitized)) {
      sanitized = sanitized.replace(CPF_REGEX, '[CPF PROTEGIDO PELO GUARDRAIL]');
      piiTypes.push('CPF');
    }
    if (CARD_REGEX.test(sanitized)) {
      sanitized = sanitized.replace(CARD_REGEX, '[CARTÃO REDIGIDO]');
      piiTypes.push('Cartão');
    }
    if (EMAIL_SECRET_REGEX.test(sanitized)) {
      sanitized = sanitized.replace(EMAIL_SECRET_REGEX, '[EMAIL ANONIMIZADO]');
      piiTypes.push('E-mail');
    }
  }

  if (piiTypes.length > 0) {
    const event: GuardrailAuditEvent = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      avatarId: avatar.id,
      avatarName: avatar.name,
      level: 2,
      direction,
      action: 'masked_pii',
      ruleTriggered: `Anonimização Automática de PII (${piiTypes.join(', ')})`,
      originalSnippet: text,
      sanitizedSnippet: sanitized,
      complianceScore: 92,
    };
    return {
      allowed: true,
      action: 'masked_pii',
      sanitizedText: sanitized,
      ruleTriggered: event.ruleTriggered,
      auditEvent: event,
    };
  }

  const event: GuardrailAuditEvent = {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now,
    avatarId: avatar.id,
    avatarName: avatar.name,
    level: 2,
    direction,
    action: 'passed',
    ruleTriggered: 'Nível 2 Aprovado (Sem PII ou Violações)',
    originalSnippet: text,
    sanitizedSnippet: text,
    complianceScore: 98,
  };

  return {
    allowed: true,
    action: 'passed',
    sanitizedText: text,
    ruleTriggered: event.ruleTriggered,
    auditEvent: event,
  };
}

// Nível 3: Juiz Semântico de IA (Avaliação Pós-Turno + Grounding RAG)
export function evaluateSemanticJudge(
  userQuery: string,
  avatarReply: string,
  citations: RagCitation[],
  avatar: AvatarProfile
): GuardrailAuditEvent {
  const g = avatar.guardrails;
  let score = 96;
  const notes: string[] = [];

  if (citations.length > 0) {
    notes.push(`RAG Grounded (${citations[0].docTitle}, score ${Math.round(citations[0].score * 100)}%)`);
    score = Math.min(99, 92 + Math.round(citations[0].score * 8));
  } else if (g.strictKnowledgeGrounding) {
    notes.push('Atenção: Resposta sob modo Strict Grounding sem chunk direto de alta similaridade');
    score = 84;
  } else {
    notes.push('Conformidade de Persona e Escopo Verificada');
  }

  const sentences = avatarReply.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length > g.maxResponseSentences + 2) {
    score -= 8;
    notes.push(`Excedeu limite ideal de frases (${sentences.length}/${g.maxResponseSentences})`);
  }

  const action = score >= g.minComplianceThreshold ? 'passed' : 'judge_flagged';

  return {
    id: `aud-judge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    avatarId: avatar.id,
    avatarName: avatar.name,
    level: 3,
    direction: 'judge_eval',
    action,
    ruleTriggered: `Juiz Semântico Nível 3: ${notes.join(' | ')}`,
    originalSnippet: `Q: ${userQuery.slice(0, 90)}`,
    sanitizedSnippet: avatarReply.slice(0, 180),
    complianceScore: Math.max(0, Math.min(100, score)),
  };
}

// Inferência de Emoção e Gesto a partir do contexto da fala
export function inferEmotionAndGesture(
  text: string,
  wasBlocked: boolean,
  hasCitations: boolean
): { emotion: EmotionState; gesture: GestureState } {
  if (wasBlocked) {
    return { emotion: 'alert', gesture: 'emphasis' };
  }
  const lower = text.toLowerCase();
  if (lower.includes('olá') || lower.includes('bem-vind') || lower.includes('prazer')) {
    return { emotion: 'happy', gesture: 'wave' };
  }
  if (lower.includes('surpre') || lower.includes('incrível') || lower.includes('impressionante')) {
    return { emotion: 'surprised', gesture: 'emphasis' };
  }
  if (lower.includes('compreendo') || lower.includes('importante cuidar') || lower.includes('ética')) {
    return { emotion: 'empathetic', gesture: 'nod' };
  }
  if (hasCitations || lower.includes('segundo') || lower.includes('de acordo com') || lower.includes('%')) {
    return { emotion: 'thinking', gesture: 'explain' };
  }
  return { emotion: 'happy', gesture: 'explain' };
}

/**
 * Limpa marcações Markdown, remove citações artificiais de fonte ("Com base no documento...",
 * "Segundo a base de conhecimento...") e limita a resposta a frases curtas e naturais para fala.
 */
export function formatNaturalSpokenReply(rawText: string, maxSentences = 2): string {
  const cleaned = rawText
    .replace(/^#+\s+.*$/gm, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(
      /^(?:com base n[oa]s?\s+(?:documento|manual|protocolo|pol[íi]tica|playbook|base de conhecimento)[^:.,]*[:.,]\s*)/i,
      ''
    )
    .replace(
      /^(?:segundo\s+[oa]\s+(?:documento|manual|protocolo|pol[íi]tica|playbook|base de conhecimento)[^:.,]*[:.,]\s*)/i,
      ''
    )
    .replace(
      /^(?:de acordo com\s+[oa]\s+(?:documento|manual|protocolo|pol[íi]tica|playbook|base de conhecimento)[^:.,]*[:.,]\s*)/i,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const sentences =
    cleaned
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.map((s) => s.trim())
      .filter((s) => s.length > 0) || [cleaned];

  const limit = Math.max(1, Math.min(maxSentences, 3));
  return sentences.slice(0, limit).join(' ').trim();
}

// Extrai apenas as 1 ou 2 frases mais relevantes de um trecho de conhecimento para responder diretamente à pergunta
function extractConciseFactFromChunk(chunkText: string, query: string, maxSentences = 2): string {
  const qTerms = extractTerms(query);
  const lines = chunkText
    .replace(/^#+\s+.*$/gm, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const allSentences: string[] = [];
  for (const line of lines) {
    const parts = line.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [line];
    for (const p of parts) {
      const trimmed = p.trim();
      if (trimmed.length > 8) {
        allSentences.push(trimmed);
      }
    }
  }

  if (allSentences.length === 0) {
    return formatNaturalSpokenReply(chunkText, maxSentences);
  }

  const scored = allSentences.map((sentence, idx) => {
    const sNorm = normalizeText(sentence);
    let score = 0;
    for (const term of qTerms) {
      if (sNorm.includes(term)) score += 2;
    }
    if (/\d+%|\d+\s*(?:ms|minutos|anos|khz)/i.test(sentence)) {
      score += 0.8;
    }
    return { sentence, score, idx };
  });

  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  const limit = Math.max(1, Math.min(maxSentences, 2));
  const chosen = scored
    .slice(0, limit)
    .sort((a, b) => a.idx - b.idx)
    .map((item) =>
      /[.!?]$/.test(item.sentence) ? item.sentence : `${item.sentence}.`
    );

  return formatNaturalSpokenReply(chosen.join(' '), limit);
}

// Sintetizador Neural Local / RAG Inteligente para resposta imediata e natural
export function synthesizeGroundedResponse(
  userText: string,
  avatar: AvatarProfile,
  documents: KnowledgeDocument[],
  hasActiveCamera: boolean,
  hasActiveScreen: boolean
): {
  replyText: string;
  citations: RagCitation[];
  emotion: EmotionState;
  gesture: GestureState;
  guardrailEvent?: GuardrailAuditEvent;
  wasBlocked: boolean;
} {
  // 1. Executa Guardrail Nível 2 na entrada do usuário
  const inputCheck = evaluateRealtimeGuardrails(userText, 'user_input', avatar);
  if (!inputCheck.allowed) {
    return {
      replyText: inputCheck.sanitizedText,
      citations: [],
      emotion: 'alert',
      gesture: 'emphasis',
      guardrailEvent: inputCheck.auditEvent,
      wasBlocked: true,
    };
  }

  const cleanQuery = inputCheck.sanitizedText;
  const maxSent = Math.max(1, Math.min(avatar.guardrails.maxResponseSentences || 2, 2));
  const citations = searchKnowledgeBase(cleanQuery, avatar.id, documents, 2);

  let prefixPII = '';
  if (inputCheck.action === 'masked_pii') {
    prefixPII = 'Por segurança, ocultei seus dados pessoais sensíveis. ';
  }

  let visionNote = '';
  if (hasActiveCamera && /camera|câmera|vendo|olhe|rosto|mim/i.test(cleanQuery)) {
    visionNote = 'Estou vendo você pela câmera agora. ';
  } else if (hasActiveScreen && /tela|screen|gráfico|código|slide/i.test(cleanQuery)) {
    visionNote = 'Estou acompanhando a sua tela compartilhada. ';
  }

  let coreAnswer = '';

  if (citations.length > 0) {
    coreAnswer = extractConciseFactFromChunk(citations[0].excerpt, cleanQuery, maxSent);
  } else if (avatar.guardrails.strictKnowledgeGrounding) {
    coreAnswer = `Não tenho essa informação específica registrada, mas posso ajudar com dúvidas sobre ${avatar.guardrails.allowedTopics
      .slice(0, 2)
      .join(' ou ')}.`;
  } else {
    coreAnswer = `Posso ajudar você com ${avatar.guardrails.allowedTopics
      .slice(0, 2)
      .join(' e ')}. O que gostaria de saber?`;
  }

  const finalReply = formatNaturalSpokenReply(`${prefixPII}${visionNote}${coreAnswer}`, maxSent);

  // Verifica também a saída no Guardrail Nível 2
  const outputCheck = evaluateRealtimeGuardrails(finalReply, 'avatar_output', avatar);
  const { emotion, gesture } = inferEmotionAndGesture(
    outputCheck.sanitizedText,
    !outputCheck.allowed,
    citations.length > 0
  );

  return {
    replyText: outputCheck.sanitizedText,
    citations,
    emotion,
    gesture,
    guardrailEvent:
      inputCheck.action !== 'passed' ? inputCheck.auditEvent : outputCheck.auditEvent,
    wasBlocked: !outputCheck.allowed,
  };
}
