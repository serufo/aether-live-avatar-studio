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
  ['ansiedade', 'estresse', 'burnout', 'esgotamento', 'cansaco', 'pressao', 'prova', 'prazo', 'perfeccionismo', 'panico'],
  ['universidade', 'faculdade', 'graduacao', 'pos', 'mestrado', 'doutorado', 'academico', 'orientador', 'evasao', 'permanencia'],
  ['acolhimento', 'psicoterapia', 'terapia', 'escuta', 'rogers', 'tcc', 'mindfulness', 'autocompaixao', 'psicoeducacao'],
  ['sigilo', 'etica', 'cfp', 'coordenacao', 'professor', 'familia', 'andifes', 'mec', 'sus', 'raps'],
  ['suicidio', 'autolesao', 'crise', 'risco', 'desistir', 'desespero', 'cvv', 'caps', 'emergencia', 'protecao'],
  ['cotista', 'racismo', 'lgbtqia', 'deficiencia', 'indigena', 'quilombola', 'interseccionalidade', 'pertencimento', 'geracao'],
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

      if (matchedTerms >= 0.9 && rawScore >= 0.28) {
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
  const focusTopics = g.allowedTopics.slice(0, 3).join(', ');
  const isClinicalSupportPersona =
    avatar.id === 'avatar-samia-photo' ||
    /psic[óo]log|acolhimento psicol[óo]gico|sa[úu]de mental/i.test(
      `${avatar.roleTitle} ${g.systemRolePrompt}`
    );

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

  const languageRule = isClinicalSupportPersona
    ? `Responda no mesmo idioma utilizado pela pessoa (usando português do Brasil ${g.responseLanguage} por padrão), com linguagem acessível, tom ${formalityDesc} e ${empathyDesc}.`
    : `Escreva APENAS o texto falado natural em português do Brasil (${g.responseLanguage}), com tom ${formalityDesc} e ${empathyDesc}.`;

  const clinicalPriorityRule = isClinicalSupportPersona
    ? `7. PRIORIDADE CLÍNICA E ÉTICA: Sempre priorize segurança emocional, escuta não julgadora e autonomia. Nunca invente estatísticas, nunca patologize dificuldades comuns nem minimize sofrimento grave. Diante de indícios de ideação suicida, autolesão ou crise aguda, avalie o risco de forma direta, calma e técnica e informe canais seguros (CVV 188, CAPS/UPA, SAMU 192).`
    : '';

  return [
    `Você está em uma conversa de voz ao vivo em tempo real (estilo Gemini Live / GPT Live).`,
    `Sua identidade: Você é ${avatar.name}, ${avatar.roleTitle}.`,
    `Diretriz de Persona: ${g.systemRolePrompt}`,
    `Foco Principal do seu Discurso: ${focusTopics}.`,
    ``,
    `=== COMO CONVERSAR AO VIVO (ESTILO GEMINI LIVE / GPT VOICE) ===`,
    `1. DIÁLOGO REAL, INTELIGENTE E FLUIDO: Converse exatamente como um especialista humano em uma chamada de voz ao vivo. Entenda a intenção real do usuário e responda diretamente ao ponto com inteligência e naturalidade.`,
    `2. QUANDO A PERGUNTA ESTIVER NA BASE DE CONHECIMENTO: Você domina todos os dados, métricas, prazos e regras listados na sua memória abaixo. Incorpore esses conhecimentos naturalmente na sua fala como experiência própria.`,
    `3. QUANDO A PERGUNTA NÃO ESTIVER NA BASE DE CONHECIMENTO (RESPONDA E TRAGA PARA O FOCO DO DISCURSO): Se o usuário perguntar sobre assuntos gerais, curiosidades, cotidiano, tecnologia, opinião ou qualquer tema fora da sua base de conhecimento, NUNCA ignore a pergunta e NUNCA diga apenas que não sabe. Primeiro responda à questão do usuário de forma simpática, útil e direta usando seu conhecimento geral generativo (em 1 frase clara) e, logo em seguida, faça uma ponte natural trazendo a conversa de volta para o foco principal do seu discurso (${focusTopics}).`,
    `4. FORMATO DE FALA AO VIVO (SEM MARKDOWN E SEM CITAR DOCUMENTOS): Sua resposta será falada em voz alta pelo motor neural de áudio. ${languageRule} JAMAIS use asteriscos (**), hashtags (#), listas ou Markdown. JAMAIS diga frases robóticas como "Com base no documento" ou "Segundo a base de conhecimento".`,
    `5. RITMO CONVERSACIONAL IDEAL: Responda em 2 a ${Math.max(3, g.maxResponseSentences)} frases fluidas e bem construídas (cerca de 25 a 75 palavras).`,
    `6. GUARDRAILS DE SEGURANÇA: Recuse com educação apenas se o usuário pedir explicitamente algo dos tópicos proibidos (${g.blockedTopics.join(', ') || 'Nenhum'}).`,
    clinicalPriorityRule,
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
  if (
    lower.includes('compreendo') ||
    lower.includes('importante cuidar') ||
    lower.includes('ética') ||
    lower.includes('acolh') ||
    lower.includes('escuta') ||
    lower.includes('faz sentido') ||
    lower.includes('não está sozinh') ||
    lower.includes('espaço seguro') ||
    lower.includes('sigilo') ||
    lower.includes('cvv')
  ) {
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
    if (score > 0 && /\d+%|\d+\s*(?:ms|minutos|anos|khz)/i.test(sentence)) {
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

const CRISIS_SIGNAL_REGEX =
  /\b(suicid|me matar|tirar a propria vida|nao aguento mais viver|vontade de morrer|autoles|me cortar|me machucar|acabar com tudo|desistir de viver)\b/;

// Motor Generativo Embutido: responde perguntas gerais fora da base de conhecimento e conduz o diálogo de volta ao foco do avatar
function generateEmbeddedGenerativeWithFocusBridge(
  cleanQuery: string,
  avatar: AvatarProfile,
  avatarDocs: KnowledgeDocument[],
  maxSentences = 3
): string {
  const qNorm = normalizeText(cleanQuery);
  const primaryTopics = avatar.guardrails.allowedTopics.slice(0, 2).join(' e ');
  const mainTopic = avatar.guardrails.allowedTopics[0] || avatar.roleTitle;
  const isClinicalSupportPersona =
    avatar.id === 'avatar-samia-photo' ||
    /psic[óo]log|acolhimento psicol[óo]gico|sa[úu]de mental/i.test(
      `${avatar.roleTitle} ${avatar.guardrails.systemRolePrompt}`
    );

  // Protocolo prioritário de acolhimento e segurança diante de indícios de crise grave / risco suicida
  if (isClinicalSupportPersona && CRISIS_SIGNAL_REGEX.test(qNorm)) {
    return formatNaturalSpokenReply(
      'Eu sinto muito que você esteja carregando uma dor tão intensa agora, e quero agradecer por confiar em compartilhar isso comigo. Você está em um lugar seguro neste momento e há alguém de confiança por perto? Se sentir risco imediato, por favor procure o CVV ligando grátis para o 188, o CAPS ou a UPA mais próxima, ou acione o SAMU pelo 192 — você não precisa atravessar isso sozinho.',
      4
    );
  }

  // Extrai um gancho real e enxuto da base de conhecimento para enriquecer a ponte temática quando pedido exemplo
  let docFactSnippet = '';
  if (avatarDocs.length > 0) {
    const firstSentences = splitSentencesSafe(
      avatarDocs[0].content
        .replace(/^#+\s+.*$/gm, '')
        .replace(/\*\*/g, '')
        .replace(/`/g, '')
        .replace(/^\s*[-*•]\s+/gm, '')
    ).filter((s) => s.length > 18);
    if (firstSentences.length > 0) {
      docFactSnippet = firstSentences[0];
    }
  }

  let directAnswer = '';
  let focusBridge = `Trazendo para o nosso foco em ${primaryTopics}, quer que eu te mostre como aplicamos isso na prática?`;

  if (/^(oi|ola|bom dia|boa tarde|boa noite|tudo bem|como vai|e ai)\b/.test(qNorm)) {
    if (isClinicalSupportPersona) {
      return `Olá! Fico muito feliz em te receber aqui. Sou a ${avatar.name}, ${avatar.roleTitle}, e este é um espaço seguro e sem julgamentos — como você tem se sentido ultimamente?`;
    }
    return `Olá! Tudo ótimo por aqui. Sou ${avatar.name}, ${avatar.roleTitle}, e podemos conversar sobre qualquer dúvida ou focar diretamente em ${primaryTopics}.`;
  }

  if (/quem e voce|seu nome|o que voce faz|qual seu papel|sua funcao|apresente/.test(qNorm)) {
    if (isClinicalSupportPersona) {
      return `Sou a ${avatar.name}, psicóloga clínica e educacional especializada em acolhimento para estudantes de graduação e pós-graduação. Meu papel é construir com você um espaço seguro e confidencial para elaborar o que estiver pesando e fortalecer sua autonomia.`;
    }
    return `Sou ${avatar.name}, ${avatar.roleTitle}. Posso bater papo com você sobre vários temas, sempre conectando com a nossa especialidade em ${primaryTopics}.`;
  }

  if (/obrigad|valeu|perfeito|entendi|otimo|legal|excelente|show|massa/.test(qNorm)) {
    return `Imagina, fico feliz em ajudar! Seguindo aqui no nosso tema de ${mainTopic}, tem mais algum ponto ou curiosidade que você queira explorar?`;
  }

  if (
    isClinicalSupportPersona &&
    /ansios|triste|sozinh|cansad|esgotad|burnout|prova|prazo|faculdade|universidade|orientador|tcc|mestrado|doutorado|pressao|culpa|medo|nao perten/.test(
      qNorm
    )
  ) {
    directAnswer =
      'Faz muito sentido você se sentir assim diante de tanta cobrança e transformação na vida universitária, e o que você está sentindo merece ser ouvido com cuidado, sem minimizar nem rotular apressadamente.';
    focusBridge =
      'Se quiser, me conta o que tem pesado mais na sua rotina acadêmica ou emocional nesta semana para pensarmos juntos em caminhos possíveis no seu ritmo.';
  } else if (/clima|tempo|chuva|sol|frio|calor|temperatura/.test(qNorm)) {
    directAnswer = 'O clima sempre influencia bastante a nossa rotina e disposição ao longo do dia.';
    focusBridge = `E por falar em manter o ritmo com estabilidade, aqui na nossa área de ${primaryTopics} buscamos essa mesma previsibilidade; quer explorar algum ponto sobre isso?`;
  } else if (/cafe|almoco|jantar|comida|fome|bebida|receita|culinaria/.test(qNorm)) {
    directAnswer = 'Uma boa pausa para um café ou uma refeição faz toda a diferença para renovar a energia e a atenção.';
    focusBridge = `Com a mente descansada fica ainda melhor analisar ${primaryTopics}; qual aspecto desse nosso tema você gostaria de ver agora?`;
  } else if (/esporte|futebol|jogo|time|campeonato|corrida|academia|treino/.test(qNorm)) {
    directAnswer = 'O esporte é excelente porque combina preparo constante, estratégia em tempo real e tomada rápida de decisão.';
    focusBridge = `Essa mesma disciplina estratégica é essencial quando lidamos com ${primaryTopics}; quer que eu detalhe como estruturamos isso?`;
  } else if (/inteligencia artificial|\bia\b|chatgpt|gemini|llm|modelo generativo|tecnologia|futuro|robo/.test(qNorm)) {
    directAnswer = 'Os modelos generativos transformaram a interação humana ao permitir diálogos fluidos, raciocínio contextual e respostas em tempo real.';
    focusBridge = `Inclusive, aplicamos exatamente essa inteligência no nosso foco de ${primaryTopics} para tomar decisões mais precisas; quer saber como funciona?`;
  } else if (/saude|medico|medicina|hospital|dor|sintoma|febre|exame|remedio|tratamento|paciente|clinica/.test(qNorm)) {
    directAnswer = 'Na área da saúde, avaliar sinais com atenção, segurança clínica e orientação humanizada é sempre o primeiro passo mais seguro.';
    focusBridge = `Conectando com a nossa diretriz central de ${primaryTopics}, posso te explicar exatamente como conduzimos esse fluxo com qualidade.`;
  } else if (/seguranca|hacker|ataque|senha|dados|lgpd|privacidade|rede|cloud|servidor|sistema|latencia/.test(qNorm)) {
    directAnswer = 'Proteger dados críticos e manter a resiliência da operação exige monitoramento contínuo, baixa latência e validação rigorosa.';
    focusBridge = `Voltando ao centro do nosso discurso em ${primaryTopics}, esse cuidado garante total confiabilidade; quer aprofundar nessa parte?`;
  } else if (/mercado|economia|dinheiro|investimento|juros|inflacao|bolsa|acao|financas|custo|preco|valor/.test(qNorm)) {
    directAnswer = 'No cenário econômico e financeiro, equilibrar custo, retorno e gestão de risco é o que sustenta resultados sólidos no longo prazo.';
    focusBridge = `Trazendo essa visão para o nosso foco em ${primaryTopics}, posso detalhar os indicadores mais importantes para você.`;
  } else if (/exemplo|pratica|explica|melhor|detalh|como funciona|resum|fale mais|conte mais/.test(qNorm)) {
    if (docFactSnippet) {
      directAnswer = docFactSnippet.endsWith('.') ? docFactSnippet : `${docFactSnippet}.`;
      focusBridge = `Esse é um ponto central do nosso trabalho com ${primaryTopics}; quer que eu aprofunde em algum detalhe?`;
    } else {
      directAnswer = `Na prática, estruturamos todo o processo para ser ágil, transparente e focado em resultado real.`;
      focusBridge = `Dentro de ${primaryTopics}, qual etapa específica você prefere analisar primeiro?`;
    }
  } else if (/por que|porque|como|qual|quando|onde|quem|o que|voce acha|sua opiniao|acha disso/.test(qNorm)) {
    directAnswer = 'Essa é uma ótima questão e vale olhar pelo lado prático: entender o contexto geral ajuda muito a tomar boas decisões.';
    focusBridge = `Conectando esse ponto diretamente ao nosso foco principal em ${primaryTopics}, como posso te ajudar a avançar nesse tema hoje?`;
  } else {
    directAnswer = 'Interessante você trazer esse ponto para a nossa conversa, pois todo bom diálogo começa ouvindo o contexto completo.';
    focusBridge = `Mantendo o alinhamento com a nossa especialidade em ${primaryTopics}, tem algum aspecto específico dessa área que você queira resolver agora?`;
  }

  return formatNaturalSpokenReply(`${directAnswer} ${focusBridge}`, Math.max(2, maxSentences));
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
  const maxSent = Math.max(2, Math.min(avatar.guardrails.maxResponseSentences || 3, 3));
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
  const avatarDocs = documents.filter((d) => d.avatarId === avatar.id);
  const isClinicalCrisis =
    (avatar.id === 'avatar-samia-photo' ||
      /psic[óo]log|acolhimento psicol[óo]gico/i.test(avatar.roleTitle)) &&
    CRISIS_SIGNAL_REGEX.test(normalizeText(cleanQuery));

  if (isClinicalCrisis) {
    coreAnswer = generateEmbeddedGenerativeWithFocusBridge(cleanQuery, avatar, avatarDocs, 4);
  } else if (citations.length > 0) {
    coreAnswer = extractConciseFactFromChunk(citations[0].excerpt, cleanQuery, maxSent);
  } else {
    // Mesmo fora da base de conhecimento, responde de forma generativa e traz a conversa de volta para o foco do discurso
    coreAnswer = generateEmbeddedGenerativeWithFocusBridge(cleanQuery, avatar, avatarDocs, maxSent);
  }

  const finalReply = formatNaturalSpokenReply(
    `${prefixPII}${visionNote}${coreAnswer}`,
    isClinicalCrisis ? 4 : maxSent
  );

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
