import {
  AvatarProfile,
  EmotionState,
  GestureState,
  KnowledgeDocument,
  RagCitation,
  VisemeWeights,
} from '../types/avatar';
import {
  compileSystemInstruction,
  evaluateRealtimeGuardrails,
  formatNaturalSpokenReply,
  searchKnowledgeBase,
  synthesizeGroundedResponse,
} from './ragAndGuardrails';

export type VoicePersonaName = 'Aoede' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';

interface VoiceProfileSpec {
  gender: 'female' | 'male';
  variantIndex: number;
  pitch: number;
  rate: number;
  baseFormantHz: number;
  label: string;
}

export const VOICE_PERSONA_SPECS: Record<VoicePersonaName, VoiceProfileSpec> = {
  Aoede: {
    gender: 'female',
    variantIndex: 0,
    pitch: 1.18,
    rate: 1.05,
    baseFormantHz: 225,
    label: 'Aoede (Feminina • Executiva & Clara)',
  },
  Kore: {
    gender: 'female',
    variantIndex: 1,
    pitch: 0.92,
    rate: 0.93,
    baseFormantHz: 185,
    label: 'Kore (Feminina • Serena & Empática)',
  },
  Puck: {
    gender: 'male',
    variantIndex: 0,
    pitch: 0.74,
    rate: 1.12,
    baseFormantHz: 140,
    label: 'Puck (Masculina • Dinâmica & Ágil)',
  },
  Charon: {
    gender: 'male',
    variantIndex: 1,
    pitch: 0.52,
    rate: 0.88,
    baseFormantHz: 100,
    label: 'Charon (Masculina • Profunda & Analítica)',
  },
  Fenrir: {
    gender: 'male',
    variantIndex: 2,
    pitch: 0.64,
    rate: 1.0,
    baseFormantHz: 120,
    label: 'Fenrir (Masculina • Firme & Direta)',
  },
};

export class RealtimeAudioVisemeEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(256));
  private isSpeaking = false;
  private hasActivePcmStream = false;
  private currentPhonemeText = '';
  private currentVoiceName: VoicePersonaName = 'Aoede';
  private lastSelectedVoiceLabel = 'Inicializando...';
  private boundaryCharIndex = -1;
  private speechStartTime = 0;
  private speechDurationMs = 0;
  private nextPlaybackTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private blinkTimer = 0;
  private nextBlinkAt = 2.8;
  private isBlinking = false;
  private muted = false;
  private apiKey = '';
  private cachedVoices: SpeechSynthesisVoice[] = [];
  private activeAbortController: AbortController | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const loadVoices = () => {
        try {
          const list = window.speechSynthesis.getVoices();
          if (list && list.length > 0) {
            this.cachedVoices = list;
          }
        } catch {
          // Ignore
        }
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  public setApiKey(key: string) {
    this.apiKey = key.trim();
  }

  public getLastSelectedVoiceLabel(): string {
    return this.lastSelectedVoiceLabel;
  }

  public getAvailableDeviceVoices(): SpeechSynthesisVoice[] {
    if (this.cachedVoices.length > 0) return this.cachedVoices;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        this.cachedVoices = window.speechSynthesis.getVoices();
      } catch {
        // Ignore
      }
    }
    return this.cachedVoices;
  }

  public initAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new Ctx();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.65;
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.muted ? 0 : 0.98;
      this.analyser.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);
      this.freqData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.setValueAtTime(muted ? 0 : 0.98, this.audioCtx.currentTime);
    }
    if (muted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  // Seleciona vozes reais e distintas (Android, iOS, Windows, macOS) para cada persona
  public selectVoiceForPersona(voiceName: VoicePersonaName): {
    voice: SpeechSynthesisVoice | null;
    pitch: number;
    rate: number;
    resolvedLabel: string;
  } {
    const spec = VOICE_PERSONA_SPECS[voiceName] || VOICE_PERSONA_SPECS.Aoede;
    const allVoices = this.getAvailableDeviceVoices();

    if (!allVoices || allVoices.length === 0) {
      return {
        voice: null,
        pitch: spec.pitch,
        rate: spec.rate,
        resolvedLabel: `${voiceName} (Pitch ${spec.pitch}x)`,
      };
    }

    // Filtra vozes em Português (pt-BR, pt_BR, pt-PT)
    const ptVoices = allVoices.filter(
      (v) => /^pt([-_]|$)/i.test(v.lang.trim()) || /portugu/i.test(v.name)
    );
    const pool = ptVoices.length > 0 ? ptVoices : allVoices;

    // Pontuação de qualidade (prioriza vozes Network/Natural/Neural/Premium de alta definição)
    const scoreVoice = (v: SpeechSynthesisVoice): number => {
      const n = v.name.toLowerCase();
      let s = 0;
      if (v.lang.toLowerCase().includes('br')) s += 30;
      if (n.includes('natural') || n.includes('neural')) s += 60;
      if (n.includes('network') || n.includes('online')) s += 45;
      if (n.includes('premium') || n.includes('enhanced')) s += 40;
      if (n.includes('google')) s += 30;
      if (
        n.includes('francisca') ||
        n.includes('antonio') ||
        n.includes('thalita') ||
        n.includes('luciana') ||
        n.includes('felipe') ||
        n.includes('fabio') ||
        n.includes('daniel')
      ) {
        s += 25;
      }
      return s;
    };

    const sortedPool = [...pool].sort((a, b) => scoreVoice(b) - scoreVoice(a));

    // Identificadores femininos e masculinos incluindo códigos internos do Android (afs, bmf, pte, bmm, ptd) e iOS/Desktop
    const femaleRegex =
      /francisca|thalita|luciana|maria|joana|yara|fernanda|catarina|helena|vitoria|vitória|camila|leticia|leila|raquel|shelley|flo|sandy|samantha|victoria|female|feminina|mulher|\bafs\b|\bbmf\b|\bptc\b|\bsfg\b|#f\b/i;
    const maleRegex =
      /antonio|antônio|fabio|fábio|daniel|felipe|joaquim|humberto|nicolau|ricardo|cristiano|jorge|lucas|marcelo|donato|duarte|reed|rocko|eddy|alex|male|masculino|homem|\bpte\b|\bbmm\b|\bptd\b|\bsfm\b|#m\b/i;

    const femaleVoices = sortedPool.filter((v) => femaleRegex.test(v.name));
    const maleVoices = sortedPool.filter((v) => maleRegex.test(v.name));

    let chosenVoice: SpeechSynthesisVoice | null = null;

    if (spec.gender === 'female') {
      if (femaleVoices.length > spec.variantIndex) {
        chosenVoice = femaleVoices[spec.variantIndex];
      } else if (femaleVoices.length > 0) {
        chosenVoice = femaleVoices[0];
      } else {
        chosenVoice = sortedPool[spec.variantIndex % sortedPool.length];
      }
    } else {
      if (maleVoices.length > spec.variantIndex) {
        chosenVoice = maleVoices[spec.variantIndex];
      } else if (maleVoices.length > 0) {
        chosenVoice = maleVoices[0];
      } else if (sortedPool.length > 1) {
        // Garante voz diferente da primeira quando o SO tem múltiplas vozes sem gênero explícito no nome
        const altIndex = Math.min(
          sortedPool.length - 1,
          1 + (spec.variantIndex % Math.max(1, sortedPool.length - 1))
        );
        chosenVoice = sortedPool[altIndex];
      } else {
        chosenVoice = sortedPool[0];
      }
    }

    const shortVoiceName = chosenVoice
      ? chosenVoice.name.replace(/^Microsoft |^Google /i, '').slice(0, 26)
      : ' Padrão';

    return {
      voice: chosenVoice,
      pitch: spec.pitch,
      rate: spec.rate,
      resolvedLabel: `${voiceName} → ${shortVoiceName} (Tom ${Math.round(spec.pitch * 100)}%)`,
    };
  }

  // Enfileira áudio PCM 24kHz 16-bit Little Endian vindo da Gemini Live API (Vozes Aoede, Kore, Puck, Charon, Fenrir)
  public enqueuePcm24kBase64(base64Pcm: string, onEndedCallback?: () => void) {
    const ctx = this.initAudioContext();
    if (!this.analyser) return;

    const binaryStr = atob(base64Pcm);
    const len = binaryStr.length;
    const int16 = new Int16Array(len / 2);
    const view = new DataView(new ArrayBuffer(len));
    for (let i = 0; i < len; i++) {
      view.setUint8(i, binaryStr.charCodeAt(i));
    }
    for (let i = 0; i < int16.length; i++) {
      int16[i] = view.getInt16(i * 2, true);
    }

    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.analyser);

    const now = ctx.currentTime;
    const startAt = Math.max(now, this.nextPlaybackTime);
    source.start(startAt);
    this.nextPlaybackTime = startAt + buffer.duration;
    this.isSpeaking = true;
    this.hasActivePcmStream = true;

    this.activeSources.push(source);
    source.onended = () => {
      this.activeSources = this.activeSources.filter((s) => s !== source);
      if (this.activeSources.length === 0 && ctx.currentTime >= this.nextPlaybackTime - 0.05) {
        this.isSpeaking = false;
        this.hasActivePcmStream = false;
        onEndedCallback?.();
      }
    };
  }

  // Tenta sintetizar áudio neural direto pela API do Gemini (24kHz PCM com a voz exata: Aoede, Kore, Puck, Charon, Fenrir)
  private async trySynthesizeGeminiNativeAudio(
    cleanText: string,
    persona: VoicePersonaName,
    signal: AbortSignal
  ): Promise<string | null> {
    if (!this.apiKey) return null;

    const endpoints = [
      {
        model: 'gemini-2.5-flash-preview-tts',
        prompt: `Leia exatamente este texto em português do Brasil com naturalidade: ${cleanText}`,
      },
      {
        model: 'gemini-2.0-flash-exp',
        prompt: `Repita exatamente o seguinte texto em português do Brasil, sem adicionar nenhuma palavra antes ou depois: "${cleanText}"`,
      },
    ];

    for (const ep of endpoints) {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${ep.model}:generateContent?key=${encodeURIComponent(
            this.apiKey
          )}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: ep.prompt }] }],
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: persona,
                    },
                  },
                },
              },
            }),
          }
        );

        if (resp.ok) {
          const data = await resp.json();
          const parts = data?.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part?.inlineData?.data && part?.inlineData?.mimeType?.includes('audio')) {
              return String(part.inlineData.data);
            }
          }
        }
      } catch {
        if (signal.aborted) return null;
      }
    }

    return null;
  }

  // Fala com troca real de voz por Avatar (Gemini Neural 24kHz quando com API Key + Vozes Distintas do Dispositivo)
  public async speakWithVisemes(
    text: string,
    voiceName: VoicePersonaName | string,
    onComplete?: () => void
  ) {
    this.interrupt();

    const cleanText = text.replace(/[*#`_~]/g, '').trim();
    if (!cleanText) {
      onComplete?.();
      return;
    }

    const persona = (voiceName in VOICE_PERSONA_SPECS ? voiceName : 'Aoede') as VoicePersonaName;
    this.currentVoiceName = persona;
    this.currentPhonemeText = cleanText;
    this.boundaryCharIndex = -1;
    this.speechStartTime = performance.now();

    const spec = VOICE_PERSONA_SPECS[persona];
    this.speechDurationMs = Math.max(
      1400,
      Math.min(18000, ((cleanText.length / 14.2) * 1000) / spec.rate)
    );
    this.isSpeaking = true;

    // 1. Se houver GEMINI_API_KEY configurada, gera o áudio neural nativo do Gemini (Aoede/Kore/Puck/Charon/Fenrir)
    if (this.apiKey && !this.muted) {
      const abortCtrl = new AbortController();
      this.activeAbortController = abortCtrl;
      this.lastSelectedVoiceLabel = `Gemini Neural 24kHz (${persona})`;

      const pcmBase64 = await this.trySynthesizeGeminiNativeAudio(
        cleanText,
        persona,
        abortCtrl.signal
      );

      if (abortCtrl.signal.aborted) return;

      if (pcmBase64) {
        this.speechStartTime = performance.now();
        this.enqueuePcm24kBase64(pcmBase64, onComplete);
        return;
      }
    }

    // 2. Síntese Neural do Dispositivo com Seleção de Vozes Femininas/Masculinas Distintas e Tom Calibrado
    let completed = false;
    const finishSpeech = () => {
      if (completed) return;
      completed = true;
      this.isSpeaking = false;
      this.boundaryCharIndex = -1;
      if (this.fallbackTimer) {
        clearTimeout(this.fallbackTimer);
        this.fallbackTimer = null;
      }
      onComplete?.();
    };

    if (typeof window !== 'undefined' && 'speechSynthesis' in window && !this.muted) {
      try {
        window.speechSynthesis.cancel();

        const selected = this.selectVoiceForPersona(persona);
        this.lastSelectedVoiceLabel = selected.resolvedLabel;

        // Divide em sentenças curtas para evitar que o Chrome Mobile corte falas longas ou ignore o pitch
        const sentences = cleanText
          .split(/(?<=[.!?])\s+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        const chunksToSpeak = sentences.length > 0 ? sentences : [cleanText];
        let charOffset = 0;

        chunksToSpeak.forEach((sentence, idx) => {
          const utter = new SpeechSynthesisUtterance(sentence);
          utter.lang = 'pt-BR';
          if (selected.voice) {
            utter.voice = selected.voice;
            utter.lang = selected.voice.lang || 'pt-BR';
          }
          utter.pitch = selected.pitch;
          utter.rate = selected.rate;
          utter.volume = 1.0;

          const baseOffset = charOffset;
          charOffset += sentence.length + 1;

          utter.onboundary = (ev) => {
            if (typeof ev.charIndex === 'number') {
              this.boundaryCharIndex = baseOffset + ev.charIndex;
            }
          };

          if (idx === chunksToSpeak.length - 1) {
            utter.onend = () => finishSpeech();
            utter.onerror = () => finishSpeech();
          }

          window.speechSynthesis.speak(utter);
        });
      } catch {
        // Fallback por timer
      }
    } else {
      const selected = this.selectVoiceForPersona(persona);
      this.lastSelectedVoiceLabel = selected.resolvedLabel;
    }

    this.fallbackTimer = setTimeout(() => {
      finishSpeech();
    }, this.speechDurationMs + 1200);
  }

  // Corte imediato de áudio
  public interrupt() {
    this.isSpeaking = false;
    this.hasActivePcmStream = false;
    this.currentPhonemeText = '';
    this.boundaryCharIndex = -1;
    this.nextPlaybackTime = 0;

    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }

    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }

    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Ignore
      }
    }
    this.activeSources = [];

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }

  // Amostragem de Visemas a 60 FPS
  public sampleVisemes(deltaSec: number): VisemeWeights {
    this.blinkTimer += deltaSec;
    if (!this.isBlinking && this.blinkTimer >= this.nextBlinkAt) {
      this.isBlinking = true;
      this.blinkTimer = 0;
    } else if (this.isBlinking && this.blinkTimer >= 0.14) {
      this.isBlinking = false;
      this.blinkTimer = 0;
      this.nextBlinkAt = 2.2 + Math.random() * 2.8;
    }
    const eyeBlink = this.isBlinking
      ? Math.sin((this.blinkTimer / 0.14) * Math.PI)
      : 0;

    if (!this.isSpeaking) {
      return {
        jawOpen: 0,
        mouthSmile: 0.18,
        mouthRound: 0,
        mouthWide: 0.1,
        browLift: 0,
        eyeBlink,
        energy: 0,
        pitchHz: 0,
        dominantBand: 'silent',
      };
    }

    let lowEnergy = 0;
    let midEnergy = 0;
    let highEnergy = 0;

    if (this.analyser && this.hasActivePcmStream) {
      this.analyser.getByteFrequencyData(this.freqData);
      for (let i = 1; i < 12; i++) lowEnergy += this.freqData[i];
      for (let i = 12; i < 48; i++) midEnergy += this.freqData[i];
      for (let i = 48; i < 110; i++) highEnergy += this.freqData[i];
      lowEnergy = lowEnergy / (11 * 255);
      midEnergy = midEnergy / (36 * 255);
      highEnergy = highEnergy / (62 * 255);
    }

    const elapsed = performance.now() - this.speechStartTime;
    const progress =
      this.speechDurationMs > 0
        ? Math.min(1, elapsed / this.speechDurationMs)
        : 0.5;

    let phonemeJaw = 0;
    let phonemeRound = 0;
    let phonemeWide = 0;

    if (this.currentPhonemeText.length > 0 && !this.hasActivePcmStream) {
      const estimatedIdx = Math.floor(progress * this.currentPhonemeText.length);
      const idx =
        this.boundaryCharIndex >= 0
          ? Math.min(
              this.currentPhonemeText.length - 1,
              this.boundaryCharIndex + Math.floor(((elapsed % 420) / 420) * 6)
            )
          : estimatedIdx;

      const ch = (this.currentPhonemeText[idx] || ' ').toLowerCase();
      const wave = 0.62 + 0.38 * Math.sin(elapsed * 0.034);

      if ('aáâãà'.includes(ch)) {
        phonemeJaw = 0.86 * wave;
        phonemeWide = 0.55 * wave;
      } else if ('oóôõuú'.includes(ch)) {
        phonemeJaw = 0.64 * wave;
        phonemeRound = 0.88 * wave;
      } else if ('eéêií'.includes(ch)) {
        phonemeJaw = 0.5 * wave;
        phonemeWide = 0.84 * wave;
      } else if ('mpb'.includes(ch)) {
        phonemeJaw = 0.04;
        phonemeRound = 0.15;
      } else if ('szfvcx'.includes(ch)) {
        phonemeJaw = 0.28 * wave;
        phonemeWide = 0.62 * wave;
      } else if (' .,;!?'.includes(ch)) {
        phonemeJaw = 0.03;
      } else {
        phonemeJaw = 0.44 * wave;
        phonemeRound = 0.3 * wave;
        phonemeWide = 0.36 * wave;
      }
    }

    const jawOpen = Math.min(1, Math.max(phonemeJaw, lowEnergy * 2.2 + midEnergy * 1.4));
    const mouthRound = Math.min(1, Math.max(phonemeRound, midEnergy * 1.8));
    const mouthWide = Math.min(1, Math.max(phonemeWide, highEnergy * 2.1));
    const energy = Math.min(1, jawOpen * 0.6 + mouthRound * 0.25 + mouthWide * 0.25);

    const spec = VOICE_PERSONA_SPECS[this.currentVoiceName] || VOICE_PERSONA_SPECS.Aoede;

    const dominantBand: VisemeWeights['dominantBand'] =
      energy < 0.05
        ? 'silent'
        : mouthRound > mouthWide && mouthRound > 0.45
        ? 'mid'
        : mouthWide > 0.5
        ? 'high'
        : 'low';

    return {
      jawOpen,
      mouthSmile: 0.22 + energy * 0.2,
      mouthRound,
      mouthWide,
      browLift: Math.min(1, energy * 0.65),
      eyeBlink,
      energy,
      pitchHz: Math.round(spec.baseFormantHz + energy * 95),
      dominantBand,
    };
  }
}

export class GeminiLiveSessionManager {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private apiKey = '';

  public setApiKey(key: string) {
    this.apiKey = key.trim();
  }

  public getApiKey(): string {
    return this.apiKey;
  }

  public isLiveWsConnected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  public disconnect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }
    this.isConnected = false;
  }

  public connectLiveWebSocket(
    avatar: AvatarProfile,
    documents: KnowledgeDocument[],
    audioEngine: RealtimeAudioVisemeEngine,
    callbacks: {
      onStatusChange: (
        status: 'connecting' | 'connected' | 'fallback_ready' | 'error',
        detail: string
      ) => void;
      onModelTurnComplete: (text: string, citations: RagCitation[]) => void;
      onGuardrailCut: (reason: string, fallbackText: string) => void;
    }
  ) {
    this.disconnect();
    audioEngine.setApiKey(this.apiKey);

    if (!this.apiKey) {
      const selected = audioEngine.selectVoiceForPersona(avatar.geminiConfig.voiceName);
      callbacks.onStatusChange(
        'fallback_ready',
        `Voz Ativa: ${selected.resolvedLabel}`
      );
      return;
    }

    callbacks.onStatusChange('connecting', 'Conectando ao WebSocket Gemini Multimodal Live API...');

    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(
      this.apiKey
    )}`;

    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;
      let accumulatedText = '';
      let activeCitations: RagCitation[] = [];

      ws.onopen = () => {
        this.isConnected = true;
        const systemPrompt = compileSystemInstruction(avatar, documents);

        const setupPayload = {
          setup: {
            model: `models/${avatar.geminiConfig.model}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              temperature: avatar.geminiConfig.temperature,
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: avatar.geminiConfig.voiceName,
                  },
                },
              },
            },
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
            tools: avatar.geminiConfig.enableFunctionCallingRAG
              ? [
                  {
                    functionDeclarations: [
                      {
                        name: 'search_knowledge_base',
                        description:
                          'Busca trechos relevantes nos documentos enviados pelo administrador para a base de conhecimento do avatar.',
                        parameters: {
                          type: 'OBJECT',
                          properties: {
                            query: {
                              type: 'STRING',
                              description: 'Consulta semântica para buscar nos documentos do avatar',
                            },
                          },
                          required: ['query'],
                        },
                      },
                    ],
                  },
                ]
              : undefined,
          },
        };

        ws.send(JSON.stringify(setupPayload));
        callbacks.onStatusChange(
          'connected',
          `Gemini Live 24kHz Ativo (${avatar.geminiConfig.model} • Voz ${avatar.geminiConfig.voiceName})`
        );
      };

      ws.onmessage = async (event) => {
        try {
          const rawText =
            event.data instanceof Blob ? await event.data.text() : String(event.data);
          const msg = JSON.parse(rawText);

          if (msg.toolCall?.functionCalls) {
            for (const fnCall of msg.toolCall.functionCalls) {
              if (fnCall.name === 'search_knowledge_base') {
                const q = String(fnCall.args?.query || '');
                const found = searchKnowledgeBase(q, avatar.id, documents, 2);
                activeCitations = found;
                const toolResp = {
                  toolResponse: {
                    functionResponses: [
                      {
                        id: fnCall.id,
                        name: 'search_knowledge_base',
                        response: {
                          result:
                            found.length > 0
                              ? found.map((c) => c.excerpt).join('\n\n')
                              : 'Informação não consta no contexto.',
                        },
                      },
                    ],
                  },
                };
                ws.send(JSON.stringify(toolResp));
              }
            }
          }

          const parts = msg.serverContent?.modelTurn?.parts;
          if (Array.isArray(parts)) {
            for (const part of parts) {
              if (part.text) {
                accumulatedText += part.text;
                const check = evaluateRealtimeGuardrails(
                  accumulatedText,
                  'avatar_output',
                  avatar
                );
                if (!check.allowed && avatar.guardrails.autoCutAudioOnViolation) {
                  audioEngine.interrupt();
                  callbacks.onGuardrailCut(check.ruleTriggered, check.sanitizedText);
                  accumulatedText = '';
                  return;
                }
              }
              if (part.inlineData?.mimeType?.startsWith('audio/pcm') && part.inlineData.data) {
                audioEngine.enqueuePcm24kBase64(part.inlineData.data);
              }
            }
          }

          if (msg.serverContent?.turnComplete) {
            if (accumulatedText.trim()) {
              const cleanTurn = formatNaturalSpokenReply(
                accumulatedText.trim(),
                avatar.guardrails.maxResponseSentences || 2
              );
              callbacks.onModelTurnComplete(cleanTurn, activeCitations);
            }
            accumulatedText = '';
            activeCitations = [];
          }
        } catch {
          // Ignore malformed chunk
        }
      };

      ws.onerror = () => {
        this.isConnected = false;
        callbacks.onStatusChange(
          'fallback_ready',
          `Gemini Neural TTS Ativo (Voz ${avatar.geminiConfig.voiceName})`
        );
      };

      ws.onclose = () => {
        this.isConnected = false;
      };
    } catch {
      this.isConnected = false;
      callbacks.onStatusChange(
        'fallback_ready',
        `Voz Ativa (${avatar.geminiConfig.voiceName})`
      );
    }
  }

  public sendRealtimeVideoFrame(base64JpegNoPrefix: string) {
    if (!this.isLiveWsConnected() || !this.ws) return;
    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: 'image/jpeg',
              data: base64JpegNoPrefix,
            },
          ],
        },
      })
    );
  }

  public async processConversationTurn(params: {
    userText: string;
    avatar: AvatarProfile;
    documents: KnowledgeDocument[];
    visionFrameBase64?: string | null;
    hasActiveCamera: boolean;
    hasActiveScreen: boolean;
    recentTurns?: Array<{ speaker: 'user' | 'avatar' | 'system'; text: string }>;
  }): Promise<{
    replyText: string;
    citations: RagCitation[];
    emotion: EmotionState;
    gesture: GestureState;
    wasBlocked: boolean;
    latencyMs: number;
    modeUsed: 'gemini_live_ws' | 'gemini_rest' | 'sandbox_neural';
  }> {
    const t0 = performance.now();
    const {
      userText,
      avatar,
      documents,
      visionFrameBase64,
      hasActiveCamera,
      hasActiveScreen,
      recentTurns = [],
    } = params;

    const inputGuard = evaluateRealtimeGuardrails(userText, 'user_input', avatar);
    if (!inputGuard.allowed) {
      return {
        replyText: inputGuard.sanitizedText,
        citations: [],
        emotion: 'alert',
        gesture: 'emphasis',
        wasBlocked: true,
        latencyMs: Math.round(performance.now() - t0),
        modeUsed: this.apiKey ? 'gemini_rest' : 'sandbox_neural',
      };
    }

    const citations = searchKnowledgeBase(inputGuard.sanitizedText, avatar.id, documents, 2);
    const maxSentences = Math.max(1, Math.min(avatar.guardrails.maxResponseSentences || 2, 3));

    if (this.apiKey) {
      const systemInstruction = compileSystemInstruction(avatar, documents);
      const ragContextText =
        citations.length > 0
          ? `\n\n[FATOS DE APOIO RELACIONADOS (use apenas se ajudar a responder diretamente à pergunta do usuário, em até ${maxSentences} frases curtas e sem citar fonte)]:\n` +
            citations.map((c) => c.excerpt).join('\n\n')
          : `\n\n[Instrução: Responda diretamente ao que o usuário perguntou em até ${maxSentences} frases curtas e naturais.]`;

      // Constrói histórico recente do diálogo para manter contexto real da conversa
      const historyContents: Array<{
        role: 'user' | 'model';
        parts: Array<Record<string, unknown>>;
      }> = [];

      const validHistory = recentTurns
        .filter((t) => (t.speaker === 'user' || t.speaker === 'avatar') && t.text.trim().length > 0)
        .slice(-6);

      for (const turn of validHistory) {
        const role = turn.speaker === 'user' ? 'user' : 'model';
        const prev = historyContents[historyContents.length - 1];
        if (prev && prev.role === role) {
          prev.parts[0].text = `${prev.parts[0].text} ${turn.text}`;
        } else {
          historyContents.push({
            role,
            parts: [{ text: turn.text }],
          });
        }
      }

      // Garante que o histórico comece com 'user' conforme exigido pela API Gemini
      while (historyContents.length > 0 && historyContents[0].role !== 'user') {
        historyContents.shift();
      }
      // Se o último item do histórico for 'user', mescla ou remove para adicionar a pergunta atual
      if (historyContents.length > 0 && historyContents[historyContents.length - 1].role === 'user') {
        historyContents.pop();
      }

      const userParts: Array<Record<string, unknown>> = [
        {
          text: `Pergunta do usuário: "${inputGuard.sanitizedText}"${ragContextText}`,
        },
      ];

      if (visionFrameBase64) {
        userParts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: visionFrameBase64.replace(/^data:image\/\w+;base64,/, ''),
          },
        });
      }

      historyContents.push({
        role: 'user',
        parts: userParts,
      });

      const candidateModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];
      for (const modelId of candidateModels) {
        try {
          const is25 = modelId.startsWith('gemini-2.5');
          const generationConfig: Record<string, unknown> = {
            temperature: avatar.geminiConfig.temperature,
            maxOutputTokens: 380,
          };
          if (is25) {
            generationConfig.thinkingConfig = { thinkingBudget: 0 };
          }

          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(
              this.apiKey
            )}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemInstruction }] },
                contents: historyContents,
                generationConfig,
              }),
            }
          );

          if (resp.ok) {
            const data = await resp.json();
            const parts: Array<Record<string, unknown>> =
              data?.candidates?.[0]?.content?.parts || [];
            const rawReply = parts
              .filter((p) => !p?.thought && typeof p?.text === 'string')
              .map((p) => String(p.text))
              .join(' ')
              .trim();

            if (rawReply) {
              const naturalReply = formatNaturalSpokenReply(rawReply, maxSentences);
              const outGuard = evaluateRealtimeGuardrails(naturalReply, 'avatar_output', avatar);
              return {
                replyText: outGuard.sanitizedText,
                citations,
                emotion: !outGuard.allowed ? 'alert' : citations.length > 0 ? 'thinking' : 'happy',
                gesture: !outGuard.allowed ? 'emphasis' : 'explain',
                wasBlocked: !outGuard.allowed,
                latencyMs: Math.round(performance.now() - t0),
                modeUsed: this.isLiveWsConnected() ? 'gemini_live_ws' : 'gemini_rest',
              };
            }
          }
        } catch {
          // Tenta próximo modelo ou fallback local
        }
      }
    }

    const localResult = synthesizeGroundedResponse(
      userText,
      avatar,
      documents,
      hasActiveCamera,
      hasActiveScreen
    );

    return {
      replyText: localResult.replyText,
      citations: localResult.citations,
      emotion: localResult.emotion,
      gesture: localResult.gesture,
      wasBlocked: localResult.wasBlocked,
      latencyMs: Math.max(42, Math.round(performance.now() - t0) + 110),
      modeUsed: 'sandbox_neural',
    };
  }
}
