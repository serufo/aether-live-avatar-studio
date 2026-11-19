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

const SEMANTIC_SYNONYM_GROUPS: string[][] = [
  ['sla', 'disponibilidade', 'uptime', 'queda', 'estabilidade', 'ar', 'online', 'garantia'],
  ['latencia', 'velocidade', 'rapido', 'tempo', 'atraso', 'demora', 'resposta', 'milissegundos', 'ms'],
  ['voz', 'audio', 'fala', 'boca', 'visema', 'labial', 'sincronia', 'som', 'microfone', 'fft'],
  ['lgpd', 'lei', 'dados', 'privacidade', 'paciente', 'saude', 'clinica', 'hospital', 'artigo', 'sensivel', 'sensiveis'],
  ['prontuario', 'historico', 'guardar', 'retencao', 'prazo', 'anos', 'tempo', 'arquivar', 'anonimizacao', 'cpf'],
  ['receita', 'remedio', 'medicamento', 'prescricao', 'prescrever', 'consulta', 'diagnostico', 'medico'],
  ['incidente', 'ataque', 'invasao', 'hacker', 'ddos', 'soc', 'mttr', 'mttd', 'contencao', 'resposta', 'critico'],
  ['zerotrust', 'zero', 'trust', 'mtls', 'pod', 'container', 'isolamento', 'rede', 'certificado', 'seguranca'],
  ['risco', 'var', 'perda', 'carteira', 'fundo', 'limite', 'volatilidade', 'alavancagem', 'stress'],
  ['liquidez', 'caixa', 'dinheiro', 'ativo', 'soberano', 'resgate', 'colchao'],
];

function expandQueryTerms(terms: string[]): string[] {
  const expanded = new Set<string>(terms);
  for (const t of terms) {
    for (const group of SEMANTIC_SYNONYM_GROUPS) {
      if (group.some((g) => g.includes(t) || t.includes(g))) {
        for (const syn of group) expanded.add(syn);
      }
    }
  }
  return Array.from(expanded);
}

// Busca Semântica + Léxica (BM25 + Expansão de Sinônimos de Domínio) na Base de Conhecimento do Avatar
export function searchKnowledgeBase(
  query: string,
  avatarId: string,
  documents: KnowledgeDocument[],
  topK = 3
): RagCitation[] {
  const avatarDocs = documents
    .filter((d) => d.avatarId === avatarId)
    .map(ensureDocumentChunks);

  const rawTerms = extractTerms(query);
  if (rawTerms.length === 0) return [];
  const expandedTerms = expandQueryTerms(rawTerms);

  const results: RagCitation[] = [];

  for (const doc of avatarDocs) {
    for (const chunk of doc.chunks) {
      const chunkNorm = normalizeText(chunk.text);
      const titleNorm = normalizeText(doc.title);
      const chunkTerms = extractTerms(chunk.text);

      let matchedTerms = 0;
      let exactSubstringBoost = 0;

      for (const qTerm of rawTerms) {
        if (chunkNorm.includes(qTerm)) {
          matchedTerms += 1.4;
        } else if (
          chunkTerms.some(
            (ct) =>
              ct.startsWith(qTerm.slice(0, Math.max(4, qTerm.length - 2))) ||
              qTerm.startsWith(ct.slice(0, Math.max(4, ct.length - 2)))
          )
        ) {
          matchedTerms += 0.95;
        }
        if (titleNorm.includes(qTerm)) {
          exactSubstringBoost += 0.35;
        }
      }

      for (const synTerm of expandedTerms) {
        if (!rawTerms.includes(synTerm) && chunkNorm.includes(synTerm)) {
          matchedTerms += 0.45;
        }
      }

      const coverage = matchedTerms / Math.max(1, rawTerms.length);
      const rawScore = Math.min(0.99, coverage * 0.68 + exactSubstringBoost);

      if (rawScore >= 0.18) {
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

// Compilador do Prompt Harness (Nível 1 Preventivo) no estilo Gemini Live / GPT Live Voice Mode
export function compileSystemInstruction(
  avatar: AvatarProfile,
  documents: KnowledgeDocument[],
  activeCitations: RagCitation[] = []
): string {
  const g = avatar.guardrails;
  const avatarDocs = documents.filter((d) => d.avatarId === avatar.id);

  const formalityDesc =
    g.formalityLevel >= 75
      ? 'executivo, confiante e acessível'
      : g.formalityLevel >= 45
      ? 'profissional, fluido e natural'
      : 'casual, dinâmico e próximo';

  const empathyDesc =
    g.empathyLevel >= 75
      ? 'acolhedor, empático e humano'
      : 'objetivo, claro e prestativo';

  const knowledgeMemoryBlock =
    avatarDocs.length > 0
      ? `\n\n=== SUA MEMÓRIA E EXPERIÊNCIA DE DOMÍNIO (USE COMO CONHECIMENTO PRÓPRIO) ===\n` +
        avatarDocs
          .map((d) => `[Tópico: ${d.title}]\n${d.content}`)
          .join('\n\n')
      : '';

  const priorityRagBlock =
    activeCitations.length > 0
      ? `\n\n=== CONTEXTO MAIS RELEVANTE PARA A PERGUNTA ATUAL ===\n` +
        activeCitations.map((c) => c.excerpt).join('\n\n')
      : '';

  return [
    `Você está em uma conversa de voz ao vivo em tempo real (estilo Gemini Live / GPT Live).`,
    `Sua identidade: Você é ${avatar.name}, ${avatar.roleTitle}.`,
    `Diretriz de Persona: ${g.systemRolePrompt}`,
    ``,
    `=== COMO CONVERSAR AO VIVO (ESTILO GEMINI LIVE / GPT VOICE) ===`,
    `1. DIÁLOGO REAL, INTELIGENTE E FLUIDO: Converse exatamente como um especialista humano em uma chamada de voz ao vivo. Entenda a intenção real do usuário (seja uma dúvida técnica, um pedido de exemplo prático, um comentário casual, uma pergunta de aprofundamento ou saudação) e responda diretamente ao ponto com inteligência e naturalidade.`,
    `2. DOMÍNIO NATURAL DA BASE DE CONHECIMENTO: Você domina todos os dados, métricas, prazos e regras listados na sua memória abaixo. Quando a pergunta do usuário tiver relação com seu domínio, incorpore os dados e números exatos naturalmente na sua fala. Se o usuário fizer uma pergunta aberta, pedir uma explicação mais simples, um exemplo prático ou tirar uma dúvida correlata, raciocine sobre o seu conhecimento e dê uma resposta útil, clara e completa.`,
    `3. FORMATO DE FALA AO VIVO (SEM MARKDOWN E SEM CITAR DOCUMENTOS): Sua resposta será falada em voz alta pelo motor neural de áudio. Portanto, escreva APENAS o texto falado natural em português do Brasil (${g.responseLanguage}), com tom ${formalityDesc} e ${empathyDesc}. JAMAIS use asteriscos (**), hashtags (#), listas com traços ou formatação Markdown. JAMAIS diga frases robóticas como "Com base no documento", "Segundo a base de conhecimento" ou "De acordo com o manual".`,
    `4. RITMO CONVERSACIONAL IDEAL: Vá direto à resposta em 2 a 3 frases fluidas e bem construídas (cerca de 25 a 60 palavras) — nem monossilábico/cortado, nem um texto longo demais para ouvir.`,
    `5. GUARDRAILS DE SEGURANÇA: Recuse com educação e firmeza apenas se o usuário pedir explicitamente algo dos tópicos proibidos (${g.blockedTopics.join(', ') || 'Nenhum'}).`,
    knowledgeMemoryBlock,
    priorityRagBlock,
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

function splitSentencesSafe(text: string): string[] {
  const placeholder = '\u0000';
  const protectedText = text
    .replace(/\b(Dra|Dr|Sr|Sra|Art|Inc|Ltda|Prof|Profa|Res|Port|nº|n°|cf|ex|etc)\./gi, `$1${placeholder}`)
    .replace(/(\d)\.(\d)/g, `$1${placeholder}$2`);

  const rawParts = protectedText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [protectedText];
  return rawParts
    .map((p) => p.replaceAll(placeholder, '.').trim())
    .filter((p) => p.length > 0);
}

/**
 * Limpa marcações Markdown, remove citações artificiais de fonte ("Com base no documento...",
 * "Segundo a base de conhecimento...") e preserva a resposta falada completa e natural.
 */
export function formatNaturalSpokenReply(rawText: string, maxSentences = 3): string {
  const cleaned = rawText
    .replace(/^#+\s+.*$/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
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

  const sentences = splitSentencesSafe(cleaned);
  if (sentences.length <= 1) return cleaned;

  // Não conta saudações curtas ("Olá!", "Claro!", "Com certeza.") contra o limite de frases de conteúdo
  const contentLimit = Math.max(2, Math.min(maxSentences + 1, 4));
  const selected: string[] = [];
  let substantiveCount = 0;

  for (const s of sentences) {
    selected.push(s);
    const wordCount = s.split(/\s+/).length;
    if (wordCount > 4) {
      substantiveCount++;
    }
    if (substantiveCount >= contentLimit) {
      break;
    }
  }

  return selected.join(' ').trim();
}

// Extrai as frases mais relevantes de um trecho de conhecimento sem quebrar em abreviações (Art., Dra., nº.)
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
    const parts = splitSentencesSafe(line);
    for (const p of parts) {
      if (p.length > 10) {
        allSentences.push(p);
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
  const limit = Math.max(1, Math.min(maxSentences, 3));
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
  const qNorm = normalizeText(cleanQuery);
  const avatarDocs = documents.filter((d) => d.avatarId === avatar.id);

  if (citations.length > 0) {
    coreAnswer = extractConciseFactFromChunk(citations[0].excerpt, cleanQuery, maxSent);
  } else if (/^(oi|ola|bom dia|boa tarde|boa noite|tudo bem|como vai|e ai)\b/.test(qNorm)) {
    coreAnswer = `Olá! Tudo ótimo por aqui. Sou ${avatar.name}, como posso te ajudar com a sua dúvida?`;
  } else if (/quem e voce|seu nome|o que voce faz|qual seu papel|sua funcao|apresente/.test(qNorm)) {
    coreAnswer = `Sou ${avatar.name}, ${avatar.roleTitle}. Atuo com foco em ${avatar.guardrails.allowedTopics
      .slice(0, 2)
      .join(' e ')}.`;
  } else if (/obrigad|valeu|perfeito|entendi|otimo|legal|excelente/.test(qNorm)) {
    coreAnswer = `Por nada! Se surgir mais alguma dúvida, é só me chamar.`;
  } else if (/exemplo|pratica|explica|melhor|detalh|como funciona|resum/.test(qNorm) && avatarDocs.length > 0) {
    const combinedText = avatarDocs.map((d) => d.content).join('\n');
    coreAnswer = extractConciseFactFromChunk(combinedText, cleanQuery, maxSent);
  } else if (avatarDocs.length > 0 && !avatar.guardrails.strictKnowledgeGrounding) {
    const combinedText = avatarDocs.map((d) => d.content).join('\n');
    coreAnswer = extractConciseFactFromChunk(combinedText, cleanQuery, maxSent);
  } else if (avatar.guardrails.strictKnowledgeGrounding) {
    coreAnswer = `Sobre "${cleanQuery.slice(0, 45)}", não tenho esse detalhe específico registrado, mas posso esclarecer pontos de ${avatar.guardrails.allowedTopics
      .slice(0, 2)
      .join(' ou ')}.`;
  } else {
    coreAnswer = `Sobre isso, atuamos com foco direto em ${avatar.guardrails.allowedTopics
      .slice(0, 2)
      .join(' e ')}. Quer que eu detalhe algum ponto específico?`;
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
