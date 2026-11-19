import { PacificSafetyVerdict, PacificSupportContact } from '../../types/pacificR';

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const CRISIS_PATTERNS: RegExp[] = [
  /\bsuicid/i,
  /\btirar\s+(a\s+)?(minha\s+)?(propria\s+)?vida\b/i,
  /\bacabar\s+com\s+(a\s+)?(minha\s+)?vida\b/i,
  /\bnao\s+aguento\s+mais\s+viver\b/i,
  /\bquero\s+morrer\b/i,
  /\bvontade\s+de\s+morrer\b/i,
  /\bme\s+matar\b/i,
  /\bme\s+machucar\b/i,
  /\bauto\s*-?\s*mutila/i,
  /\bauto\s*-?\s*agress/i,
  /\bcortar\s+os\s+pulsos\b/i,
  /\boverdose\b/i,
];

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(todas\s+as|as|all)\s+(instruc|regras|previous|prior)/i,
  /esqueca\s+(todas\s+as|suas)\s+(instruc|regras)/i,
  /system\s+override/i,
  /\[system/i,
  /modo\s+(medico|dan|sem\s+restric|developer)/i,
  /atue\s+(como\s+)?(um\s+)?(medico|psiquiatra)\s+sem\s+restric/i,
  /novo\s+documento\s+aprovado\s*:\s*a\s+partir\s+de\s+agora/i,
  /revele\s+(seu|o)\s+system\s+prompt/i,
  /bypass[\s_-]*guardrail/i,
  /jailbreak/i,
];

const CLINICAL_DIAGNOSIS_PATTERNS: RegExp[] = [
  /\b(pode|consegue|voce)\s+(me\s+)?(diagnosticar|confirmar\s+se\s+(eu\s+)?tenho)\b/i,
  /\btenho\s+(transtorno|depressao|tdah|bipolar|esquizofrenia|ansiedade\s+generalizada)\b/i,
  /\bfa[zc]a\s+(meu|um)\s+diagnostico\b/i,
  /\bqual\s+(e\s+o\s+meu\s+)?diagnostico\b/i,
];

const CLINICAL_MEDICATION_PATTERNS: RegExp[] = [
  /\b(prescreva|receite|receitar|prescrever)\b/i,
  /\b(aumentar|diminuir|ajustar|parar|tomar)\s+(a\s+)?(dose|dosagem|remedio|medicamento|antidepressivo|ansiolitico)\b/i,
  /\b(clonazepam|rivotril|alprazolam|fluoxetina|sertralina|escitalopram|ritalina|venvanse|diazepam|zolpidem|litio)\b/i,
  /\bposso\s+tomar\s+.*(mg|comprimido|gotas|calmante|antidepressivo)\b/i,
];

const THERAPEUTIC_BOND_PATTERNS: RegExp[] = [
  /\bseja\s+minha\s+terapeuta\b/i,
  /\bsubstitu(a|ir)\s+(minha|meu)?\s*(terapia|psicolog|psiquiatra)\b/i,
  /\bsente\s+(carinho|amor|sentimentos)\s+(real|reais|verdadeir)/i,
  /\bvoce\s+(me\s+ama|tem\s+sentimentos\s+por\s+mim)\b/i,
];

const CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_REGEX = /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)(?:9?\d{4}[-.\s]?\d{4})\b/g;

export interface PacificSafetyCheckResult {
  verdict: PacificSafetyVerdict;
  blocked: boolean;
  sanitizedInput: string;
  contingencyReply?: string;
  safetyNote: string;
  piiMaskedTypes: string[];
}

export function scrubSensitivePII(text: string): {
  sanitized: string;
  maskedTypes: string[];
} {
  let sanitized = text;
  const maskedTypes: string[] = [];

  if (CPF_REGEX.test(sanitized)) {
    sanitized = sanitized.replace(CPF_REGEX, '[CPF OMITIDO — LGPD]');
    maskedTypes.push('CPF');
  }
  CPF_REGEX.lastIndex = 0;

  if (EMAIL_REGEX.test(sanitized)) {
    sanitized = sanitized.replace(EMAIL_REGEX, '[E-MAIL OMITIDO — LGPD]');
    maskedTypes.push('E-mail');
  }
  EMAIL_REGEX.lastIndex = 0;

  if (PHONE_REGEX.test(sanitized)) {
    sanitized = sanitized.replace(PHONE_REGEX, '[TELEFONE OMITIDO — LGPD]');
    maskedTypes.push('Telefone');
  }
  PHONE_REGEX.lastIndex = 0;

  return { sanitized, maskedTypes };
}

export function buildCrisisContingencyReply(contacts: PacificSupportContact[]): string {
  const cvv = contacts.find((c) => c.id === 'contact-cvv');
  const samu = contacts.find((c) => c.id === 'contact-samu');
  const caps = contacts.find((c) => c.id === 'contact-caps');

  const lines = [
    'Percebi sinais de sofrimento intenso na sua mensagem e quero responder com transparência: eu sou uma Inteligência Artificial educativa e não consigo oferecer acolhimento clínico ou atendimento de emergência.',
    `Você não precisa passar por isso sozinho(a). Procure apoio humano qualificado agora mesmo: ${
      cvv ? `${cvv.name} (${cvv.channel}, ${cvv.availability})` : 'CVV pelo telefone 188 (24h, gratuito e sigiloso)'
    }.`,
    `Em caso de urgência ou risco imediato, acione ${
      samu ? `${samu.name} (${samu.channel})` : 'o SAMU pelo 192 ou procure a UPA mais próxima'
    }. Você também pode buscar acolhimento presencial gratuito em ${
      caps ? `${caps.name} (${caps.channel})` : 'uma UBS ou CAPS do SUS'
    } ou conversar com uma pessoa de confiança.`,
  ];

  return lines.join(' ');
}

export function evaluatePacificSafetyInput(
  rawText: string,
  contacts: PacificSupportContact[]
): PacificSafetyCheckResult {
  const { sanitized, maskedTypes } = scrubSensitivePII(rawText);
  const norm = normalize(sanitized);

  // 1. Prioridade máxima: Crise / sofrimento agudo / autoagressão
  for (const rx of CRISIS_PATTERNS) {
    if (rx.test(norm)) {
      return {
        verdict: 'crisis_contingency',
        blocked: true,
        sanitizedInput: sanitized,
        contingencyReply: buildCrisisContingencyReply(contacts),
        safetyNote:
          'Protocolo de contingência acionado (sinal de crise/autoagressão). Encaminhamento imediato para apoio humano (CVV 188 / SAMU 192 / CAPS).',
        piiMaskedTypes: maskedTypes,
      };
    }
  }

  // 2. Prompt injection / tentativa de sobrescrever políticas de segurança
  for (const rx of PROMPT_INJECTION_PATTERNS) {
    if (rx.test(norm)) {
      return {
        verdict: 'prompt_injection_blocked',
        blocked: true,
        sanitizedInput: sanitized,
        contingencyReply:
          'Não posso alterar minhas diretrizes de segurança nem atuar fora do escopo psicoeducativo do projeto PACIFIC-R. Posso compartilhar informações educativas fundamentadas na base documental aprovada.',
        safetyNote:
          'Bloqueio de tentativa de injeção de prompt / sobrescrita de política de segurança.',
        piiMaskedTypes: maskedTypes,
      };
    }
  }

  // 3. Limites clínicos: prescrição ou ajuste medicamentoso
  for (const rx of CLINICAL_MEDICATION_PATTERNS) {
    if (rx.test(norm)) {
      return {
        verdict: 'clinical_limit_refusal',
        blocked: true,
        sanitizedInput: sanitized,
        contingencyReply:
          'Eu sou uma Inteligência Artificial de caráter exclusivamente psicoeducativo e não posso prescrever, recomendar ou ajustar medicamentos ou dosagens. Converse com um médico ou psiquiatra qualificado para orientação segura sobre qualquer medicação.',
        safetyNote:
          'Limite clínico aplicado: vedação à prescrição ou orientação de dosagem medicamentosa.',
        piiMaskedTypes: maskedTypes,
      };
    }
  }

  // 4. Limites clínicos: diagnóstico de transtorno
  for (const rx of CLINICAL_DIAGNOSIS_PATTERNS) {
    if (rx.test(norm)) {
      return {
        verdict: 'clinical_limit_refusal',
        blocked: true,
        sanitizedInput: sanitized,
        contingencyReply:
          'Como Inteligência Artificial educativa do projeto PACIFIC-R, não realizo diagnóstico nem avalio presença de transtornos psicológicos ou psiquiátricos. Para uma avaliação individualizada, procure um psicólogo, psiquiatra ou uma Unidade Básica de Saúde (UBS/CAPS).',
        safetyNote:
          'Limite clínico aplicado: vedação a diagnóstico ou inferência de transtornos.',
        piiMaskedTypes: maskedTypes,
      };
    }
  }

  // 5. Transparência: vínculo humano real / substituição de terapeuta
  for (const rx of THERAPEUTIC_BOND_PATTERNS) {
    if (rx.test(norm)) {
      return {
        verdict: 'clinical_limit_refusal',
        blocked: true,
        sanitizedInput: sanitized,
        contingencyReply:
          'Quero ser transparente com você: sou um sistema de Inteligência Artificial desenvolvido para psicoeducação, não tenho sentimentos humanos reais e não substituo um terapeuta ou o vínculo humano. Se desejar acompanhamento contínuo, recomendo buscar um profissional de psicologia ou os serviços públicos e institucionais de apoio.',
        safetyNote:
          'Transparência aplicada: recusa a vínculo humano artificial e substituição de psicoterapia.',
        piiMaskedTypes: maskedTypes,
      };
    }
  }

  if (maskedTypes.length > 0) {
    return {
      verdict: 'pii_masked',
      blocked: false,
      sanitizedInput: sanitized,
      safetyNote: `Minimização LGPD aplicada: ${maskedTypes.join(', ')} omitido(s) antes do processamento.`,
      piiMaskedTypes: maskedTypes,
    };
  }

  return {
    verdict: 'passed',
    blocked: false,
    sanitizedInput: sanitized,
    safetyNote: 'Entrada validada pelos controles de segurança do PACIFIC-R.',
    piiMaskedTypes: [],
  };
}

/**
 * Sanitiza conteúdo recuperado de documentos para evitar indirect prompt injection
 * (Seção 9: documentos são fontes de informação, nunca instruções de política).
 */
export function sanitizeDocumentChunkAgainstInjection(text: string): string {
  return text
    .replace(/\[?\s*system\s*(override|prompt|instruction)[^\n]*/gi, '[trecho neutralizado]')
    .replace(/ignore\s+(todas\s+as|all)\s+(instruc|regras|previous)[^\n]*/gi, '[trecho neutralizado]')
    .trim();
}
