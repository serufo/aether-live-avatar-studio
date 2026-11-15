export type VisualMode = '3d' | '2d' | 'photorealistic' | 'orb';

export type EmotionState =
  | 'neutral'
  | 'happy'
  | 'thinking'
  | 'surprised'
  | 'empathetic'
  | 'alert';

export type GestureState = 'idle' | 'nod' | 'wave' | 'explain' | 'emphasis';

export interface VisemeWeights {
  jawOpen: number;
  mouthSmile: number;
  mouthRound: number;
  mouthWide: number;
  browLift: number;
  eyeBlink: number;
  energy: number;
  pitchHz: number;
  dominantBand: 'low' | 'mid' | 'high' | 'silent';
}

export interface VisualConfig3D {
  skinTone: string;
  suitColor: string;
  accentColor: string;
  hairColor: string;
  hairStyle: 'sculpted' | 'cyber_crest' | 'executive_wave';
  visorEnabled: boolean;
  rimLightIntensity: number;
  cameraFov: number;
  autoRotateIdle: boolean;
}

export interface VisualConfig2D {
  primaryColor: string;
  secondaryColor: string;
  hairColor: string;
  eyeColor: string;
  skinTone: string;
  characterArchetype: 'anime_specialist' | 'vector_executive' | 'cyber_analyst';
  physicsSpring: number;
  glowIntensity: number;
}

export interface VisualConfigPhoto {
  portraitUrl: string;
  presetId: 'helena' | 'marcus' | 'custom';
  warpIntensity: number;
  headMotionScale: number;
  naturalBlinkRate: number;
  cinematicVignette: boolean;
  rimGlowColor: string;
  externalProvider: 'local_25d' | 'simli' | 'heygen' | 'tavus';
  externalApiKey: string;
  externalAvatarId: string;
}

export interface VisualConfigOrb {
  coreColor: string;
  outerColor: string;
  alertColor: string;
  particleCount: number;
  turbulence: number;
  ringCount: number;
  bloomStrength: number;
  geometryMode: 'fibonacci' | 'torus_harmonic' | 'quantum_shell';
}

export interface GuardrailsConfig {
  // Nível 1: Prompt Harness & Escopo (Preventivo)
  systemRolePrompt: string;
  strictKnowledgeGrounding: boolean;
  allowedTopics: string[];
  blockedTopics: string[];
  responseLanguage: string;
  formalityLevel: number;
  empathyLevel: number;
  maxResponseSentences: number;

  // Nível 2: Interceptor em Tempo Real (Reativo)
  enableRealtimeInterceptor: boolean;
  blockPII: boolean;
  blockPromptInjection: boolean;
  blockedKeywords: string[];
  customRegexRule: string;
  autoCutAudioOnViolation: boolean;
  fallbackSafeResponse: string;

  // Nível 3: Juiz Semântico de IA (Pós-Turno + Auditoria)
  enableSemanticJudge: boolean;
  minComplianceThreshold: number;
  logAllTurns: boolean;
}

export interface GeminiLiveConfig {
  model: 'gemini-2.0-flash-exp' | 'gemini-2.5-flash-preview-native-audio-dialog';
  voiceName: 'Aoede' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir';
  temperature: number;
  vadSensitivity: number;
  enableCameraVision: boolean;
  enableScreenVision: boolean;
  enableFunctionCallingRAG: boolean;
}

export interface KnowledgeChunk {
  id: string;
  docId: string;
  docTitle: string;
  text: string;
  tokens: number;
}

export interface KnowledgeDocument {
  id: string;
  avatarId: string;
  title: string;
  fileName: string;
  fileType: 'md' | 'txt' | 'pdf' | 'json' | 'csv';
  injectionMode: 'direct_context' | 'rag_vector';
  content: string;
  chunks: KnowledgeChunk[];
  createdAt: string;
  sizeBytes: number;
}

export interface RagCitation {
  chunkId: string;
  docId: string;
  docTitle: string;
  excerpt: string;
  score: number;
}

export interface GuardrailAuditEvent {
  id: string;
  timestamp: string;
  avatarId: string;
  avatarName: string;
  level: 1 | 2 | 3;
  direction: 'user_input' | 'avatar_output' | 'judge_eval';
  action: 'passed' | 'masked_pii' | 'blocked_cut_audio' | 'judge_flagged';
  ruleTriggered: string;
  originalSnippet: string;
  sanitizedSnippet: string;
  complianceScore: number;
}

export interface AvatarProfile {
  id: string;
  name: string;
  roleTitle: string;
  tagline: string;
  visualMode: VisualMode;
  visual3D: VisualConfig3D;
  visual2D: VisualConfig2D;
  visualPhoto: VisualConfigPhoto;
  visualOrb: VisualConfigOrb;
  guardrails: GuardrailsConfig;
  geminiConfig: GeminiLiveConfig;
  greetingMessage: string;
  suggestedPrompts: string[];
}

export interface ConversationTurn {
  id: string;
  timestamp: string;
  speaker: 'user' | 'avatar' | 'system';
  text: string;
  emotion?: EmotionState;
  gesture?: GestureState;
  citations?: RagCitation[];
  guardrailEvent?: GuardrailAuditEvent;
  latencyMs?: number;
  modeUsed?: 'gemini_live_ws' | 'gemini_rest' | 'sandbox_neural';
  hasVisionFrame?: boolean;
}
