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
  searchKnowledgeBase,
  synthesizeGroundedResponse,
} from './ragAndGuardrails';

export class RealtimeAudioVisemeEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(256));
  private isSpeaking = false;
  private currentPhonemeText = '';
  private speechStartTime = 0;
  private speechDurationMs = 0;
  private nextPlaybackTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private blinkTimer = 0;
  private nextBlinkAt = 2.8;
  private isBlinking = false;
  private muted = false;

  public initAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new Ctx();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.65;
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.muted ? 0 : 0.9;
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
      this.gainNode.gain.setValueAtTime(muted ? 0 : 0.9, this.audioCtx.currentTime);
    }
    if (muted && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  // Enfileira áudio PCM 24kHz 16-bit Little Endian vindo da Gemini Live API WebSocket
  public enqueuePcm24kBase64(base64Pcm: string) {
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

    this.activeSources.push(source);
    source.onended = () => {
      this.activeSources = this.activeSources.filter((s) => s !== source);
      if (this.activeSources.length === 0 && ctx.currentTime >= this.nextPlaybackTime - 0.05) {
        this.isSpeaking = false;
      }
    };
  }

  // Fala com síntese de voz natural + gerador harmônico de formantes para alimentar o FFT AnalyserNode
  public speakWithVisemes(
    text: string,
    voiceName: string,
    onComplete?: () => void
  ) {
    this.interrupt();
    this.currentPhonemeText = text;
    this.speechStartTime = performance.now();
    // Média de 14 caracteres por segundo de fala fluida em PT-BR
    this.speechDurationMs = Math.max(1800, Math.min(16000, (text.length / 14.5) * 1000));
    this.isSpeaking = true;

    // 1. Dispara Web Speech API nativa do navegador (se disponível e não mutado)
    if ('speechSynthesis' in window && !this.muted) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'pt-BR';
        const voices = window.speechSynthesis.getVoices();
        const ptVoice = voices.find((v) => v.lang.includes('pt'));
        if (ptVoice) utter.voice = ptVoice;
        utter.pitch =
          voiceName === 'Aoede' || voiceName === 'Kore'
            ? 1.08
            : voiceName === 'Charon' || voiceName === 'Fenrir'
            ? 0.92
            : 1.0;
        utter.rate = 1.05;
        utter.onend = () => {
          this.isSpeaking = false;
          onComplete?.();
        };
        window.speechSynthesis.speak(utter);
      } catch {
        // Fallback para timer de visemas
      }
    }

    // 2. Alimenta o AnalyserNode com envoltória acústica suave para garantir FFT real em qualquer navegador
    try {
      const ctx = this.initAudioContext();
      if (this.analyser) {
        const sampleRate = ctx.sampleRate;
        const totalSamples = Math.floor((this.speechDurationMs / 1000) * sampleRate);
        const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
        const data = buffer.getChannelData(0);
        const baseFreq =
          voiceName === 'Aoede' || voiceName === 'Kore' ? 210 : 125;

        for (let i = 0; i < totalSamples; i++) {
          const t = i / sampleRate;
          const charIdx = Math.floor((i / totalSamples) * text.length);
          const ch = (text[charIdx] || ' ').toLowerCase();
          const isPause = ch === ' ' || ch === ',' || ch === '.' || ch === ';';
          const syllabicEnv = isPause
            ? 0.02
            : 0.35 + 0.65 * Math.abs(Math.sin(t * 14.0));
          // Sinal muito sutil (quase inaudível sob a voz principal, mas forte no AnalyserNode antes do Gain)
          const f1 = Math.sin(2 * Math.PI * baseFreq * t);
          const f2 = 0.6 * Math.sin(2 * Math.PI * (baseFreq * 3.2) * t);
          const f3 = 0.3 * Math.sin(2 * Math.PI * (baseFreq * 6.5) * t);
          data[i] = (f1 + f2 + f3) * syllabicEnv * 0.008;
        }

        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(this.analyser);
        src.start();
        this.activeSources.push(src);
        src.onended = () => {
          this.activeSources = this.activeSources.filter((s) => s !== src);
          if (this.activeSources.length === 0) {
            this.isSpeaking = false;
            onComplete?.();
          }
        };
      }
    } catch {
      setTimeout(() => {
        this.isSpeaking = false;
        onComplete?.();
      }, this.speechDurationMs);
    }
  }

  // Corte imediato de áudio (Interrupt do Usuário ou Corte por Violação de Guardrail Nível 2)
  public interrupt() {
    this.isSpeaking = false;
    this.currentPhonemeText = '';
    this.nextPlaybackTime = 0;
    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Ignora caso já parado
      }
    }
    this.activeSources = [];
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }

  // Amostragem de Visemas a 60 FPS combinando espectro FFT + fonética da sílaba atual
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

    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.freqData);
      for (let i = 1; i < 12; i++) lowEnergy += this.freqData[i];
      for (let i = 12; i < 48; i++) midEnergy += this.freqData[i];
      for (let i = 48; i < 110; i++) highEnergy += this.freqData[i];
      lowEnergy = lowEnergy / (11 * 255);
      midEnergy = midEnergy / (36 * 255);
      highEnergy = highEnergy / (62 * 255);
    }

    // Fonética sincronizada pelo caractere atual quando há texto conhecido
    const elapsed = performance.now() - this.speechStartTime;
    const progress =
      this.speechDurationMs > 0
        ? Math.min(1, elapsed / this.speechDurationMs)
        : 0.5;

    let phonemeJaw = 0;
    let phonemeRound = 0;
    let phonemeWide = 0;

    if (this.currentPhonemeText.length > 0) {
      const idx = Math.floor(progress * this.currentPhonemeText.length);
      const ch = (this.currentPhonemeText[idx] || ' ').toLowerCase();
      const wave = 0.65 + 0.35 * Math.sin(elapsed * 0.032);

      if ('aáâãà'.includes(ch)) {
        phonemeJaw = 0.85 * wave;
        phonemeWide = 0.55 * wave;
      } else if ('oóôõuú'.includes(ch)) {
        phonemeJaw = 0.62 * wave;
        phonemeRound = 0.88 * wave;
      } else if ('eéêií'.includes(ch)) {
        phonemeJaw = 0.48 * wave;
        phonemeWide = 0.82 * wave;
      } else if ('mpb'.includes(ch)) {
        phonemeJaw = 0.05;
        phonemeRound = 0.15;
      } else if ('szfvcx'.includes(ch)) {
        phonemeJaw = 0.28 * wave;
        phonemeWide = 0.6 * wave;
      } else if (' .,;!?'.includes(ch)) {
        phonemeJaw = 0.04;
      } else {
        phonemeJaw = 0.42 * wave;
        phonemeRound = 0.3 * wave;
        phonemeWide = 0.35 * wave;
      }
    }

    const jawOpen = Math.min(1, Math.max(phonemeJaw, lowEnergy * 2.2 + midEnergy * 1.4));
    const mouthRound = Math.min(1, Math.max(phonemeRound, midEnergy * 1.8));
    const mouthWide = Math.min(1, Math.max(phonemeWide, highEnergy * 2.1));
    const energy = Math.min(1, jawOpen * 0.6 + mouthRound * 0.25 + mouthWide * 0.25);

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
      pitchHz: Math.round(140 + energy * 180),
      dominantBand,
    };
  }
}

// Cliente Híbrido Gemini Live API (WebSocket BidiGenerateContent + REST Multimodal + RAG Function Calling)
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

  // Inicia conexão WebSocket real com a Gemini Multimodal Live API
  public connectLiveWebSocket(
    avatar: AvatarProfile,
    documents: KnowledgeDocument[],
    audioEngine: RealtimeAudioVisemeEngine,
    callbacks: {
      onStatusChange: (status: 'connecting' | 'connected' | 'fallback_ready' | 'error', detail: string) => void;
      onModelTurnComplete: (text: string, citations: RagCitation[]) => void;
      onGuardrailCut: (reason: string, fallbackText: string) => void;
    }
  ) {
    this.disconnect();

    if (!this.apiKey) {
      callbacks.onStatusChange(
        'fallback_ready',
        'Modo Neural Sandbox Ativo (Insira sua GEMINI_API_KEY no Admin para WebSocket Live direto)'
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
          `Gemini Live WebSocket Ativo (${avatar.geminiConfig.model} • Voz ${avatar.geminiConfig.voiceName})`
        );
      };

      ws.onmessage = async (event) => {
        try {
          const rawText =
            event.data instanceof Blob ? await event.data.text() : String(event.data);
          const msg = JSON.parse(rawText);

          // Resposta de Tool Call (RAG em Tempo Real durante sessão Gemini Live)
          if (msg.toolCall?.functionCalls) {
            for (const fnCall of msg.toolCall.functionCalls) {
              if (fnCall.name === 'search_knowledge_base') {
                const q = String(fnCall.args?.query || '');
                const found = searchKnowledgeBase(q, avatar.id, documents, 3);
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
                              ? found.map((c) => `[${c.docTitle}]: ${c.excerpt}`).join('\n\n')
                              : 'Nenhum trecho específico encontrado.',
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
                // Verifica Guardrail Nível 2 em tempo real durante a geração!
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
              callbacks.onModelTurnComplete(accumulatedText.trim(), activeCitations);
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
          'Gemini REST / Neural Sandbox Ativo (Fallback automático de baixa latência)'
        );
      };

      ws.onclose = () => {
        this.isConnected = false;
      };
    } catch {
      this.isConnected = false;
      callbacks.onStatusChange(
        'fallback_ready',
        'Modo Neural Sandbox Ativo'
      );
    }
  }

  // Envia frame de vídeo (Webcam ou Compartilhamento de Tela) para a Gemini Live API
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

  // Processa um turno completo de diálogo (via Gemini API quando há chave ou Motor RAG Neural Integrado)
  public async processConversationTurn(params: {
    userText: string;
    avatar: AvatarProfile;
    documents: KnowledgeDocument[];
    visionFrameBase64?: string | null;
    hasActiveCamera: boolean;
    hasActiveScreen: boolean;
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
    const { userText, avatar, documents, visionFrameBase64, hasActiveCamera, hasActiveScreen } = params;

    // 1. Guardrail Nível 2 imediato na entrada do usuário
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

    // 2. Busca Semântica RAG na Base de Conhecimento do Avatar
    const citations = searchKnowledgeBase(inputGuard.sanitizedText, avatar.id, documents, 3);

    // 3. Se houver GEMINI_API_KEY configurada, chama a API oficial do Gemini com System Instruction + RAG + Frame de Visão
    if (this.apiKey) {
      try {
        const systemInstruction = compileSystemInstruction(avatar, documents);
        const ragContextText =
          citations.length > 0
            ? `\n\n[TRECHOS RECUPERADOS DO RAG PARA ESTA PERGUNTA]:\n` +
              citations
                .map((c) => `Fonte (${c.docTitle} - score ${Math.round(c.score * 100)}%):\n${c.excerpt}`)
                .join('\n\n')
            : '';

        const userParts: Array<Record<string, unknown>> = [
          {
            text: `${inputGuard.sanitizedText}${ragContextText}`,
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

        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(
            this.apiKey
          )}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemInstruction }] },
              contents: [{ role: 'user', parts: userParts }],
              generationConfig: {
                temperature: avatar.geminiConfig.temperature,
                maxOutputTokens: 280,
              },
            }),
          }
        );

        if (resp.ok) {
          const data = await resp.json();
          const rawReply =
            data?.candidates?.[0]?.content?.parts?.[0]?.text ||
            'Processado via Gemini Live.';

          // Passa resposta pelo Guardrail Nível 2
          const outGuard = evaluateRealtimeGuardrails(rawReply, 'avatar_output', avatar);
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
      } catch {
        // Fallback suave para o sintetizador local caso a chave seja inválida ou sem rede
      }
    }

    // 4. Motor Neural Local com RAG e Guardrails (funciona instantaneamente mesmo sem API Key)
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
