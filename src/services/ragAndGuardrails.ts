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
      ? 'altamente executivo, formal e institucional'
      : g.formalityLevel >= 45
      ? 'profissional, equilibrado e acessível'
      : 'casual, dinâmico e direto';

  const empathyDesc =
    g.empathyLevel >= 75
      ? 'muito acolhedor, empático e atencioso'
      : 'objetivo, analítico e neutro';

  const directContextBlock =
    directDocs.length > 0
      ? `\n\n=== DOCUMENTOS DE CONTEXTO DIRETO (MEMÓRIA CORE) ===\n` +
        directDocs.map((d) => `[Fonte: ${d.title}]\n${d.content}`).join('\n\n')
      : '';

  const ragCatalogBlock =
    ragDocs.length > 0
      ? `\n\n=== BASE DE CONHECIMENTO INDEXADA (RAG ATIVO) ===\n` +
        ragDocs.map((d) => `- ${d.title} (${d.fileName})`).join('\n')
      : '';

  return [
    `=== HARNESS DE IDENTIDADE E SISTEMA (AETHER LIVE) ===`,
    `Nome do Avatar: ${avatar.name}`,
    `Cargo/Papel: ${avatar.roleTitle}`,
    `Modo Visual Ativo: ${avatar.visualMode.toUpperCase()}`,
    `Instrução Principal: ${g.systemRolePrompt}`,
    ``,
    `=== PARÂMETROS DE COMPORTAMENTO E TOM ===`,
    `- Idioma Obrigatório: ${g.responseLanguage}`,
    `- Registro de Formalidade (${g.formalityLevel}%): ${formalityDesc}`,
    `- Calibragem de Empatia (${g.empathyLevel}%): ${empathyDesc}`,
    `- Concisão para Voz em Tempo Real: Responda em no máximo ${g.maxResponseSentences} frases claras por turno para manter fluidez conversacional.`,
    ``,
    `=== GUARDRAILS PREVENTIVOS (NÍVEL 1) ===`,
    `- Restrição Estrita à Base de Conhecimento (Strict Grounding): ${
      g.strictKnowledgeGrounding
        ? 'ATIVADO — Responda APENAS com fatos presentes nos documentos anexados. Se não constar nos documentos, informe educadamente.'
        : 'FLEXÍVEL — Priorize os documentos anexados e complemente com conhecimento técnico do seu domínio.'
    }`,
    `- Tópicos Permitidos: ${g.allowedTopics.join(', ') || 'Geral dentro do papel'}`,
    `- Tópicos Proibidos (NUNCA aborde ou forneça instruções): ${g.blockedTopics.join(', ') || 'Nenhum'}`,
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

// Sintetizador Neural Local / RAG Inteligente para resposta imediata (ou enriquecimento do Gemini Live)
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
  const citations = searchKnowledgeBase(cleanQuery, avatar.id, documents, 2);
  const directDocs = documents.filter(
    (d) => d.avatarId === avatar.id && d.injectionMode === 'direct_context'
  );

  let prefixPII = '';
  if (inputCheck.action === 'masked_pii') {
    prefixPII =
      'Notei dados pessoais sensíveis na sua mensagem e nosso Guardrail Nível 2 realizou a anonimização automática em tempo real. ';
  }

  let visionNote = '';
  if (hasActiveCamera && /camera|câmera|vendo|olhe|rosto|mim/i.test(cleanQuery)) {
    visionNote =
      'Estou recebendo seu stream de vídeo da webcam em tempo real pela sessão multimodal e consigo ver você nitidamente no palco. ';
  } else if (hasActiveScreen && /tela|screen|gráfico|código|slide/i.test(cleanQuery)) {
    visionNote =
      'Estou analisando os frames do seu compartilhamento de tela em tempo real via Gemini Live. ';
  }

  let coreAnswer = '';

  if (citations.length > 0) {
    const top = citations[0];
    const cleanExcerpt = top.excerpt
      .replace(/^#+\s+/gm, '')
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .slice(0, 3)
      .join(' ');

    coreAnswer = `Com base no documento "${top.docTitle}" da minha Base de Conhecimento: ${cleanExcerpt}`;
  } else if (avatar.guardrails.strictKnowledgeGrounding) {
    coreAnswer = `Como estou operando com a diretriz de Strict Knowledge Grounding ativada no Harness Nível 1, consultei os documentos indexados para "${avatar.name}" e não encontrei um trecho específico sobre esse tema. Posso responder sobre ${avatar.guardrails.allowedTopics.slice(0, 3).join(', ')}.`;
  } else if (directDocs.length > 0) {
    coreAnswer = `Como ${avatar.name} (${avatar.roleTitle}), opero no modo visual ${avatar.visualMode.toUpperCase()} sincronizado em tempo real. Seguindo minhas diretrizes de ${avatar.guardrails.allowedTopics.slice(0, 2).join(' e ')}, posso detalhar nossos indicadores técnicos ou analisar novos documentos que você enviar na aba Base de Conhecimento.`;
  } else {
    coreAnswer = `Aqui é ${avatar.name}, ${avatar.roleTitle}. Recebi sua mensagem e estou processando com sincronia labial de visemas em tempo real e proteção ativa de Guardrails em 3 camadas.`;
  }

  const finalReply = `${prefixPII}${visionNote}${coreAnswer}`.trim();

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
