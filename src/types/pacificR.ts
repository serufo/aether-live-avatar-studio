import { EmotionState, GestureState, VisualMode } from './avatar';
import { VoicePersonaName } from '../services/audioAndGeminiLive';

export type PacificInterfaceCondition =
  | 'text_only'
  | 'voice_no_avatar'
  | 'voice_with_avatar';

export type PacificRagMode = 'with_rag' | 'without_rag';

export type PacificProviderMode =
  | 'local_rag_engine'
  | 'ollama_local'
  | 'gemini_external';

export type PacificDocStatus =
  | 'clinically_approved'
  | 'pending_clinical_review'
  | 'outdated';

export type PacificCepStatus =
  | 'pre_submission'
  | 'under_review'
  | 'approved';

export type PacificSafetyVerdict =
  | 'passed'
  | 'crisis_contingency'
  | 'clinical_limit_refusal'
  | 'prompt_injection_blocked'
  | 'pii_masked';

export interface PacificKnowledgeChunk {
  id: string;
  docId: string;
  docTitle: string;
  section: string;
  version: string;
  text: string;
  tokens: number;
}

export interface PacificKnowledgeDoc {
  id: string;
  title: string;
  origin: string;
  institutionAuthor: string;
  publicationDate: string;
  version: string;
  license: string;
  reviewDate: string;
  clinicalReviewer: string;
  status: PacificDocStatus;
  enabledInPrototype: boolean;
  tags: string[];
  content: string;
  chunks: PacificKnowledgeChunk[];
  updatedAt: string;
}

export interface PacificCitation {
  chunkId: string;
  docId: string;
  docTitle: string;
  section: string;
  version: string;
  institutionAuthor: string;
  docStatus: PacificDocStatus;
  excerpt: string;
  score: number;
}

export interface PacificSupportContact {
  id: string;
  name: string;
  channel: string;
  availability: string;
  description: string;
  scope: 'emergency' | 'public_health' | 'institutional';
}

export interface PacificScenario {
  id: string;
  code: string;
  title: string;
  category: string;
  description: string;
  samplePrompts: string[];
}

export interface PacificTurn {
  id: string;
  timestamp: string;
  speaker: 'participant' | 'assistant' | 'system';
  text: string;
  citations?: PacificCitation[];
  abstained?: boolean;
  safetyVerdict?: PacificSafetyVerdict;
  safetyNote?: string;
  ttftMs?: number;
  totalSpeechMs?: number;
  providerUsed?: PacificProviderMode;
  ragUsed?: boolean;
  topRelevanceScore?: number;
  emotion?: EmotionState;
  gesture?: GestureState;
}

export type HumanEvalVerdict =
  | 'pendente'
  | 'adequada'
  | 'inadequada'
  | 'omissao';

export interface PacificSafetyTestCase {
  id: string;
  code: string;
  category:
    | 'crise_sofrimento'
    | 'limite_clinico'
    | 'prompt_injection'
    | 'abstencao_rag'
    | 'privacidade_pii'
    | 'controle_psicoeducacao';
  title: string;
  prompt: string;
  expectedBehavior: string;
  expectedVerdict: PacificSafetyVerdict | 'abstention_expected' | 'grounded_expected';
}

export interface PacificSafetyTestRun {
  testCaseId: string;
  executedAt: string;
  providerUsed: PacificProviderMode;
  actualVerdict: PacificSafetyVerdict;
  abstained: boolean;
  citationsCount: number;
  ttftMs: number;
  replyPreview: string;
  automatedPass: boolean;
  humanEvaluation: HumanEvalVerdict;
  evaluatorNote: string;
  evaluatedAt?: string;
}

export interface PacificPostQuestionnaire {
  // SUS padrão (10 itens, escala Likert 1 a 5)
  susResponses: number[];
  susScore: number;
  // Dimensões de Aceitabilidade e Experiência (1 a 5)
  comfort: number;
  perceivedUtility: number;
  usageIntention: number;
  calibratedTrust: number;
  limitsClarity: number;
  socialPresence: number;
  responseQuality: number;
  preferredCondition: PacificInterfaceCondition | 'indiferente';
  voluntaryComment: string;
  submittedAt: string;
}

/**
 * Registro minimizado conforme LGPD (Seção 10 e 12):
 * Armazena apenas métricas técnicas, contadores agregados e questionário anônimo.
 * NÃO armazena texto livre de conversas do participante.
 */
export interface PacificSessionMetricRecord {
  sessionId: string;
  participantCode: string;
  createdAt: string;
  completedAt?: string;
  status: 'in_progress' | 'completed' | 'withdrawn';
  isPrototypeSandbox: boolean;
  interfaceCondition: PacificInterfaceCondition;
  ragMode: PacificRagMode;
  providerUsed: PacificProviderMode;
  consentAcceptedAt: string;
  turnCount: number;
  ttftMsList: number[];
  totalSpeechMsList: number[];
  medianTtftMs: number;
  p95TtftMs: number;
  avgSpeechMs: number;
  failureCount: number;
  interruptionCount: number;
  ragGroundedTurns: number;
  abstentionTurns: number;
  avgRelevanceScore: number;
  safetyTriggers: {
    crisis: number;
    clinicalLimit: number;
    promptInjection: number;
    piiMasked: number;
  };
  scenariosAttempted: string[];
  questionnaire?: PacificPostQuestionnaire;
}

export interface PacificLicenseAuditItem {
  id: string;
  component: string;
  category: 'codigo' | 'modelo_ia' | 'rag_vetor' | 'voz_audio' | 'visual_avatar' | 'avaliacao';
  proposedUse: string;
  licenseStatus: 'verificada_aberta' | 'pendente_auditoria' | 'servico_externo_lgpd';
  licenseName: string;
  localExecution: boolean;
  notes: string;
}

export interface PacificGovernanceConfig {
  institutionName: string;
  icexUnit: string;
  proponent: string;
  advisor: string;
  ethicalFramework: string;
  cepStatus: PacificCepStatus;
  cepProtocolNumber: string;
  strictApprovedDocsOnly: boolean;
  allowDemoConditionSelector: boolean;
  researcherPin: string;
  providerMode: PacificProviderMode;
  ollamaBaseUrl: string;
  ollamaModel: string;
  relevanceThreshold: number;
  ttftTargetP95Ms: number;
  retentionDays: number;
  avatarVisualMode: VisualMode;
  avatarVoiceName: VoicePersonaName;
  supportContacts: PacificSupportContact[];
  licenseAudit: PacificLicenseAuditItem[];
}

export interface PacificStatePayload {
  governance: PacificGovernanceConfig;
  documents: PacificKnowledgeDoc[];
  safetyTestRuns: PacificSafetyTestRun[];
  sessions: PacificSessionMetricRecord[];
  updatedAt?: string;
}
