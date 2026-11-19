import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AvatarProfile,
  ConversationTurn,
  EmotionState,
  GestureState,
  GuardrailAuditEvent,
  KnowledgeDocument,
  VisemeWeights,
  VisualMode,
} from './types/avatar';
import {
  DEFAULT_AVATARS,
  DEFAULT_DOCUMENTS,
  INITIAL_AUDIT_EVENTS,
} from './data/defaultAvatars';
import {
  ensureDocumentChunks,
  evaluateRealtimeGuardrails,
  evaluateSemanticJudge,
} from './services/ragAndGuardrails';
import {
  GeminiLiveSessionManager,
  RealtimeAudioVisemeEngine,
} from './services/audioAndGeminiLive';
import { AvatarEngine3D } from './components/stage/AvatarEngine3D';
import { AvatarEngine2D } from './components/stage/AvatarEngine2D';
import { AvatarEnginePhotorealistic } from './components/stage/AvatarEnginePhotorealistic';
import { AvatarEngineOrb } from './components/stage/AvatarEngineOrb';
import { AdminStudioPanel } from './components/admin/AdminStudioPanel';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  Volume2,
  VolumeX,
  Square,
  Send,
  ShieldCheck,
  ShieldAlert,
  Settings,
  Play,
  Activity,
  MessageSquare,
  X,
  ChevronUp,
  ChevronDown,
  Captions,
  RotateCcw,
} from 'lucide-react';

type ScreenMode = 'live_stage' | 'admin_config';

const STORAGE_KEY = 'aether_live_studio_state_v4';

export function App() {
  // Estado Principal Persistente
  const [avatars, setAvatars] = useState<AvatarProfile[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.avatars) && parsed.avatars.length > 0) {
          return parsed.avatars;
        }
      }
    } catch {
      // Fallback
    }
    return DEFAULT_AVATARS;
  });

  const [activeAvatarId, setActiveAvatarId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.activeAvatarId) return parsed.activeAvatarId;
      }
    } catch {
      // Fallback
    }
    return DEFAULT_AVATARS[0].id;
  });

  const [documents, setDocuments] = useState<KnowledgeDocument[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.documents)) {
          return parsed.documents.map(ensureDocumentChunks);
        }
      }
    } catch {
      // Fallback
    }
    return DEFAULT_DOCUMENTS.map(ensureDocumentChunks);
  });

  const [auditEvents, setAuditEvents] = useState<GuardrailAuditEvent[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.auditEvents)) return parsed.auditEvents;
      }
    } catch {
      // Fallback
    }
    return INITIAL_AUDIT_EVENTS;
  });

  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('aether_gemini_api_key');
      if (saved && saved.trim().length > 10) return saved.trim();
    } catch {
      // Ignore sandbox storage restriction
    }
    try {
      const envObj = (import.meta as unknown as { env?: Record<string, string> }).env;
      const vault = envObj?.VITE_GEMINI_KEY_VAULT;
      if (vault) {
        return atob(vault.trim()).split('').reverse().join('');
      }
    } catch {
      // Ignore decode error
    }
    return '';
  });

  useEffect(() => {
    if (geminiApiKey) return;
    fetch('/api/key')
      .then((r) => r.json())
      .then((data) => {
        if (data?.geminiApiKey && String(data.geminiApiKey).trim().length > 10) {
          setGeminiApiKey(String(data.geminiApiKey).trim());
        }
      })
      .catch(() => {});
  }, []);

  const activeAvatar =
    avatars.find((a) => a.id === activeAvatarId) || avatars[0];

  // Separação clara entre Palco Ao Vivo (padrão, limpo) e Ambiente de Administração
  const [screenMode, setScreenMode] = useState<ScreenMode>('live_stage');
  const [showTranscript, setShowTranscript] = useState<boolean>(false);
  const [showDockOptions, setShowDockOptions] = useState<boolean>(false);
  const [showSubtitles, setShowSubtitles] = useState<boolean>(true);
  const [replayingTurnId, setReplayingTurnId] = useState<string | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Estado Conversacional & Expressões do Avatar em Tempo Real
  const [emotion, setEmotion] = useState<EmotionState>('neutral');
  const [gesture, setGesture] = useState<GestureState>('idle');
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isListeningMic, setIsListeningMic] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const [liveTelemetry, setLiveTelemetry] = useState<{
    jaw: number;
    energy: number;
    band: string;
    lastLatencyMs: number;
    guardrailState: 'nominal' | 'masked' | 'blocked';
  }>({
    jaw: 0,
    energy: 0,
    band: 'silent',
    lastLatencyMs: 185,
    guardrailState: 'nominal',
  });

  const [liveWsStatus, setLiveWsStatus] = useState<{
    state: string;
    detail: string;
  }>({
    state: 'fallback_ready',
    detail: 'Motor Neural RAG + Sincronia de Visemas Ativo',
  });

  // Histórico de Diálogo (Usado para memória de contexto da conversa)
  const [turns, setTurns] = useState<ConversationTurn[]>(() => [
    {
      id: 'turn-welcome',
      timestamp: new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      speaker: 'avatar',
      text: DEFAULT_AVATARS[0].greetingMessage,
      emotion: 'happy',
      gesture: 'wave',
      modeUsed: 'sandbox_neural',
      latencyMs: 140,
    },
  ]);

  // Streams Multimodais (Webcam & Screen Share)
  const [cameraActive, setCameraActive] = useState(false);
  const [screenActive, setScreenActive] = useState(false);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const audioEngineRef = useRef<RealtimeAudioVisemeEngine | null>(null);
  const geminiManagerRef = useRef<GeminiLiveSessionManager | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const liveVoiceModeRef = useRef<boolean>(false);

  if (!audioEngineRef.current) {
    audioEngineRef.current = new RealtimeAudioVisemeEngine();
  }
  if (!geminiManagerRef.current) {
    geminiManagerRef.current = new GeminiLiveSessionManager();
  }

  // Sincroniza estado com LocalStorage e Backend Express
  useEffect(() => {
    const payload = {
      avatars,
      activeAvatarId,
      documents,
      auditEvents,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore quota errors
    }
    fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }, [avatars, activeAvatarId, documents, auditEvents]);

  useEffect(() => {
    if (showTranscript) {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [turns, showTranscript]);

  // Atualiza conexão Gemini Live quando chave ou avatar mudam
  useEffect(() => {
    try {
      localStorage.setItem('aether_gemini_api_key', geminiApiKey);
    } catch {
      // Ignore sandbox storage restrictions
    }
    const manager = geminiManagerRef.current;
    const audio = audioEngineRef.current;
    if (!manager || !audio) return;

    manager.setApiKey(geminiApiKey);
    manager.connectLiveWebSocket(activeAvatar, documents, audio, {
      onStatusChange: (state, detail) => setLiveWsStatus({ state, detail }),
      onModelTurnComplete: (text, citations) => {
        setTurns((prev) => [
          ...prev,
          {
            id: `turn-ws-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString('pt-BR'),
            speaker: 'avatar',
            text,
            citations,
            emotion: 'happy',
            gesture: 'explain',
            modeUsed: 'gemini_live_ws',
          },
        ]);
      },
      onGuardrailCut: (reason, fallbackText) => {
        setEmotion('alert');
        setGesture('emphasis');
        setLiveTelemetry((prev) => ({ ...prev, guardrailState: 'blocked' }));
        setTurns((prev) => [
          ...prev,
          {
            id: `turn-cut-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString('pt-BR'),
            speaker: 'system',
            text: `[CORTE DE ÁUDIO — ${reason}]: ${fallbackText}`,
            emotion: 'alert',
          },
        ]);
      },
    });

    return () => {
      manager.disconnect();
    };
  }, [geminiApiKey, activeAvatar.id]);

  // Telemetria de Visemas a cada 120ms
  useEffect(() => {
    const timer = setInterval(() => {
      const audio = audioEngineRef.current;
      if (!audio) return;
      const speaking = audio.getIsSpeaking();
      setIsSpeaking(speaking);
      if (speaking) {
        const sample = audio.sampleVisemes(0.016);
        setLiveTelemetry((prev) => ({
          ...prev,
          jaw: Math.round(sample.jawOpen * 100),
          energy: Math.round(sample.energy * 100),
          band: sample.dominantBand,
        }));
      } else {
        setLiveTelemetry((prev) =>
          prev.jaw === 0 && prev.energy === 0
            ? prev
            : { ...prev, jaw: 0, energy: 0, band: 'silent' }
        );
      }
    }, 120);
    return () => clearInterval(timer);
  }, []);

  const getVisemes = useCallback((dt: number): VisemeWeights => {
    return (
      audioEngineRef.current?.sampleVisemes(dt) || {
        jawOpen: 0,
        mouthSmile: 0.15,
        mouthRound: 0,
        mouthWide: 0.1,
        browLift: 0,
        eyeBlink: 0,
        energy: 0,
        pitchHz: 0,
        dominantBand: 'silent',
      }
    );
  }, []);

  const captureVisionSnapshot = (): string | null => {
    const video = videoPreviewRef.current;
    if (!video || (!cameraActive && !screenActive) || video.videoWidth === 0) {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = Math.round((video.videoHeight / video.videoWidth) * 480) || 270;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.75);
  };

  const handleSendMessage = async (overrideText?: string) => {
    const rawText = (overrideText ?? inputText).trim();
    if (!rawText || isProcessing) return;
    if (!overrideText) setInputText('');

    const audio = audioEngineRef.current;
    const manager = geminiManagerRef.current;
    if (!audio || !manager) return;

    audio.initAudioContext();

    const inputGuard = evaluateRealtimeGuardrails(rawText, 'user_input', activeAvatar);
    setAuditEvents((prev) => [inputGuard.auditEvent, ...prev]);

    const nowStr = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const visionSnapshot = captureVisionSnapshot();

    setTurns((prev) => [
      ...prev,
      {
        id: `turn-user-${Date.now()}`,
        timestamp: nowStr,
        speaker: 'user',
        text: rawText,
        guardrailEvent:
          inputGuard.action !== 'passed' ? inputGuard.auditEvent : undefined,
        hasVisionFrame: Boolean(visionSnapshot),
      },
    ]);

    if (inputGuard.action === 'blocked_cut_audio') {
      audio.interrupt();
      setEmotion('alert');
      setGesture('emphasis');
      setLiveTelemetry((prev) => ({ ...prev, guardrailState: 'blocked' }));

      const blockedTurn: ConversationTurn = {
        id: `turn-guard-${Date.now()}`,
        timestamp: nowStr,
        speaker: 'avatar',
        text: inputGuard.sanitizedText,
        emotion: 'alert',
        gesture: 'emphasis',
        guardrailEvent: inputGuard.auditEvent,
        latencyMs: 18,
        modeUsed: 'sandbox_neural',
      };
      setTurns((prev) => [...prev, blockedTurn]);
      audio.speakWithVisemes(
        inputGuard.sanitizedText,
        activeAvatar.geminiConfig.voiceName,
        () => {
          setGesture('idle');
        }
      );
      return;
    }

    if (inputGuard.action === 'masked_pii') {
      setLiveTelemetry((prev) => ({ ...prev, guardrailState: 'masked' }));
    } else {
      setLiveTelemetry((prev) => ({ ...prev, guardrailState: 'nominal' }));
    }

    setIsProcessing(true);
    setEmotion('thinking');
    setGesture('nod');

    try {
      const result = await manager.processConversationTurn({
        userText: rawText,
        avatar: activeAvatar,
        documents,
        visionFrameBase64: visionSnapshot,
        hasActiveCamera: cameraActive,
        hasActiveScreen: screenActive,
        recentTurns: turns.slice(-8),
      });

      if (activeAvatar.guardrails.enableSemanticJudge) {
        const judgeEvent = evaluateSemanticJudge(
          rawText,
          result.replyText,
          result.citations,
          activeAvatar
        );
        setAuditEvents((prev) => [judgeEvent, ...prev]);
      }

      setLiveTelemetry((prev) => ({
        ...prev,
        lastLatencyMs: result.latencyMs,
        guardrailState: result.wasBlocked
          ? 'blocked'
          : inputGuard.action === 'masked_pii'
          ? 'masked'
          : 'nominal',
      }));

      let turnAppended = false;
      const commitTurnOnAudioStart = () => {
        if (turnAppended) return;
        turnAppended = true;
        setIsProcessing(false);
        setEmotion(result.emotion);
        setGesture(result.gesture);
        const avatarTurn: ConversationTurn = {
          id: `turn-av-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          speaker: 'avatar',
          text: result.replyText,
          emotion: result.emotion,
          gesture: result.gesture,
          citations: result.citations,
          latencyMs: result.latencyMs,
          modeUsed: result.modeUsed,
        };
        setTurns((prev) => [...prev, avatarTurn]);
      };

      await audio.speakWithVisemes(
        result.replyText,
        activeAvatar.geminiConfig.voiceName,
        () => {
          commitTurnOnAudioStart();
          setEmotion('neutral');
          setGesture('idle');
          // Modo Live Contínuo (estilo GPT Live / Gemini Live): volta a escutar automaticamente após o avatar concluir a fala
          if (liveVoiceModeRef.current) {
            setTimeout(() => {
              if (liveVoiceModeRef.current && !audioEngineRef.current?.getIsSpeaking()) {
                startLiveMicSession();
              }
            }, 260);
          }
        },
        () => {
          commitTurnOnAudioStart();
        }
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const startLiveMicSession = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      liveVoiceModeRef.current = false;
      handleSendMessage('Olá! Como funciona a nossa conversa ao vivo?');
      return;
    }

    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore
    }

    const rec = new SpeechRec();
    rec.lang = 'pt-BR';
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setIsListeningMic(true);
      audioEngineRef.current?.interrupt();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (ev: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = ev.resultIndex || 0; i < (ev.results?.length || 0); i++) {
        const res = ev.results[i];
        const text = res?.[0]?.transcript || '';
        if (res.isFinal) {
          finalTranscript += text;
        } else {
          interimTranscript += text;
        }
      }

      if (interimTranscript.trim()) {
        setInputText(interimTranscript);
      }

      if (finalTranscript.trim()) {
        setInputText('');
        try {
          rec.stop();
        } catch {
          // Ignore
        }
        handleSendMessage(finalTranscript.trim());
      }
    };

    rec.onerror = () => {
      setIsListeningMic(false);
    };

    rec.onend = () => {
      setIsListeningMic(false);
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      setIsListeningMic(false);
    }
  };

  const toggleMicrophone = () => {
    if (isListeningMic || liveVoiceModeRef.current) {
      liveVoiceModeRef.current = false;
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore
      }
      setIsListeningMic(false);
      return;
    }

    liveVoiceModeRef.current = true;
    startLiveMicSession();
  };

  const toggleCamera = async () => {
    if (cameraActive) {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      setCameraActive(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 360 },
        audio: false,
      });
      mediaStreamRef.current = stream;
      setCameraActive(true);
      setScreenActive(false);
      setTimeout(() => {
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = stream;
        }
      }, 60);
    } catch {
      alert('Não foi possível acessar a webcam neste dispositivo/ambiente.');
    }
  };

  const toggleScreenShare = async () => {
    if (screenActive) {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      setScreenActive(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      mediaStreamRef.current = stream;
      setScreenActive(true);
      setCameraActive(false);
      setTimeout(() => {
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = stream;
        }
      }, 60);
    } catch {
      // Usuário cancelou
    }
  };

  const handleReplayTurnAudio = (turn: ConversationTurn) => {
    const audio = audioEngineRef.current;
    if (!audio || !turn.text.trim()) return;

    audio.initAudioContext();

    // Se clicar no mesmo trecho que já está sendo reproduzido, interrompe
    if (replayingTurnId === turn.id && isSpeaking) {
      audio.interrupt();
      setReplayingTurnId(null);
      setIsSpeaking(false);
      setEmotion('neutral');
      setGesture('idle');
      return;
    }

    setReplayingTurnId(turn.id);
    if (turn.emotion) setEmotion(turn.emotion);
    if (turn.gesture) setGesture(turn.gesture);

    void audio.speakWithVisemes(
      turn.text,
      activeAvatar.geminiConfig.voiceName,
      () => {
        setReplayingTurnId((prev) => (prev === turn.id ? null : prev));
        setEmotion('neutral');
        setGesture('idle');
      },
      () => {
        setReplayingTurnId(turn.id);
      }
    );
  };

  const handleSelectAvatar = (id: string) => {
    audioEngineRef.current?.interrupt();
    setReplayingTurnId(null);
    setActiveAvatarId(id);
    const chosen = avatars.find((a) => a.id === id);
    if (chosen) {
      setEmotion('happy');
      setGesture('wave');
      setTurns((prev) => [
        ...prev,
        {
          id: `turn-switch-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          speaker: 'avatar',
          text: chosen.greetingMessage,
          emotion: 'happy',
          gesture: 'wave',
          modeUsed: 'sandbox_neural',
          latencyMs: 95,
        },
      ]);
      audioEngineRef.current?.speakWithVisemes(
        chosen.greetingMessage,
        chosen.geminiConfig.voiceName,
        () => {
          setEmotion('neutral');
          setGesture('idle');
        }
      );
    }
  };

  const handleUpdateAvatar = (updated: AvatarProfile) => {
    const prevVoice = activeAvatar.geminiConfig.voiceName;
    setAvatars((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));

    if (updated.geminiConfig.voiceName !== prevVoice) {
      audioEngineRef.current?.speakWithVisemes(
        `Voz alterada para ${updated.geminiConfig.voiceName}. Olá, eu sou ${updated.name}.`,
        updated.geminiConfig.voiceName,
        () => {
          setEmotion('neutral');
          setGesture('idle');
        }
      );
    }
  };

  const handleCreateAvatar = () => {
    const newId = `avatar-custom-${Date.now()}`;
    const voices: AvatarProfile['geminiConfig']['voiceName'][] = [
      'Aoede',
      'Kore',
      'Puck',
      'Charon',
      'Fenrir',
    ];
    const nextVoice = voices[avatars.length % voices.length];
    const clone: AvatarProfile = {
      ...activeAvatar,
      id: newId,
      name: `Agente Custom #${avatars.length + 1}`,
      roleTitle: 'Especialista Configurável em Tempo Real',
      geminiConfig: {
        ...activeAvatar.geminiConfig,
        voiceName: nextVoice,
      },
      greetingMessage:
        'Olá! Sou um novo perfil de avatar configurado pelo ambiente de administração.',
    };
    setAvatars((prev) => [...prev, clone]);
    setActiveAvatarId(newId);
    audioEngineRef.current?.speakWithVisemes(clone.greetingMessage, nextVoice);
  };

  const handleDeleteAvatar = (id: string) => {
    if (avatars.length <= 1) return;
    const remaining = avatars.filter((a) => a.id !== id);
    setAvatars(remaining);
    if (activeAvatarId === id) {
      setActiveAvatarId(remaining[0].id);
    }
  };

  const handleResetDefaults = () => {
    audioEngineRef.current?.interrupt();
    setAvatars(DEFAULT_AVATARS);
    setActiveAvatarId(DEFAULT_AVATARS[0].id);
    setDocuments(DEFAULT_DOCUMENTS.map(ensureDocumentChunks));
    setAuditEvents(INITIAL_AUDIT_EVENTS);
  };

  const renderActiveAvatarStage = () => {
    switch (activeAvatar.visualMode) {
      case '3d':
        return (
          <AvatarEngine3D
            avatar={activeAvatar}
            emotion={emotion}
            gesture={gesture}
            getVisemes={getVisemes}
          />
        );
      case '2d':
        return (
          <AvatarEngine2D
            avatar={activeAvatar}
            emotion={emotion}
            gesture={gesture}
            getVisemes={getVisemes}
          />
        );
      case 'photorealistic':
        return (
          <AvatarEnginePhotorealistic
            avatar={activeAvatar}
            emotion={emotion}
            gesture={gesture}
            getVisemes={getVisemes}
          />
        );
      case 'orb':
        return (
          <AvatarEngineOrb
            avatar={activeAvatar}
            emotion={emotion}
            gesture={gesture}
            getVisemes={getVisemes}
          />
        );
    }
  };

  // ============================================================================
  // TELA 1: PALCO AO VIVO (EXPERIÊNCIA DO USUÁRIO LIMPA: APENAS AVATAR + BARRA)
  // ============================================================================
  if (screenMode === 'live_stage') {
    return (
      <div className="clean-stage-shell">
        <h1 className="sr-only">{activeAvatar.name} — Palco Interativo em Tempo Real</h1>

        {/* Avatar em Tela Cheia 100dvh */}
        <main className="clean-stage-viewport" aria-label="Palco do Avatar Interativo">
          {renderActiveAvatarStage()}

          {/* PiP Discreto de Câmera/Tela somente quando o usuário ativar */}
          {(cameraActive || screenActive) && (
            <div className="clean-vision-pip">
              <video
                ref={videoPreviewRef}
                autoPlay
                playsInline
                muted
                className="vision-pip-video"
              />
            </div>
          )}

          {/* Legenda Ao Vivo da Fala (Closed Captions / CC) acima da barra inferior */}
          {showSubtitles && !showTranscript && turns.length > 0 && (
            <div
              id="stage-live-subtitles"
              className={`clean-subtitle-caption ${
                turns[turns.length - 1].emotion === 'alert' ? 'caption-alert' : ''
              }`}
              style={{
                bottom: showDockOptions ? '168px' : '78px',
                pointerEvents: 'auto',
                cursor: 'pointer',
              }}
              onClick={() => handleReplayTurnAudio(turns[turns.length - 1])}
              title="Toque na legenda para ouvir este trecho novamente"
            >
              <span className="caption-speaker">
                {turns[turns.length - 1].speaker === 'user'
                  ? 'Você: '
                  : `${activeAvatar.name}: `}
              </span>
              <span>{turns[turns.length - 1].text}</span>
              <span
                style={{
                  marginLeft: '8px',
                  fontSize: '0.7rem',
                  color: '#00f0ff',
                  opacity: 0.85,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
              >
                <Volume2 size={12} />
              </span>
            </div>
          )}

          {/* Painel Flutuante de Texto das Conversas (clique em qualquer trecho para reproduzir o áudio novamente) */}
          {showTranscript && (
            <div
              id="stage-transcript-panel"
              style={{
                position: 'absolute',
                bottom: showDockOptions ? '170px' : '80px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 'min(680px, calc(100vw - 20px))',
                maxHeight: '46dvh',
                zIndex: 18,
                background: 'rgba(11, 15, 25, 0.92)',
                backdropFilter: 'blur(22px)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.65)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  color: '#94a3b8',
                  gap: '8px',
                }}
              >
                <span>HISTÓRICO ({turns.length}) • TOQUE NO TRECHO PARA OUVIR</span>
                <button
                  type="button"
                  onClick={() => setShowTranscript(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '2px',
                  }}
                  title="Fechar histórico de texto"
                >
                  <X size={15} />
                </button>
              </div>
              <div
                style={{
                  padding: '12px 14px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {turns.map((turn) => {
                  const isReplayingThis = replayingTurnId === turn.id && isSpeaking;
                  return (
                    <div
                      key={turn.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleReplayTurnAudio(turn)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleReplayTurnAudio(turn);
                        }
                      }}
                      title="Clique para reproduzir o áudio deste trecho novamente"
                      style={{
                        alignSelf: turn.speaker === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '88%',
                        padding: '9px 13px',
                        borderRadius:
                          turn.speaker === 'user'
                            ? '14px 14px 4px 14px'
                            : '14px 14px 14px 4px',
                        background: isReplayingThis
                          ? 'rgba(16, 185, 129, 0.22)'
                          : turn.speaker === 'user'
                          ? 'rgba(0, 240, 255, 0.14)'
                          : turn.emotion === 'alert'
                          ? 'rgba(255, 59, 92, 0.18)'
                          : 'rgba(255, 255, 255, 0.07)',
                        border: isReplayingThis
                          ? '1px solid #10b981'
                          : turn.speaker === 'user'
                          ? '1px solid rgba(0, 240, 255, 0.32)'
                          : turn.emotion === 'alert'
                          ? '1px solid rgba(255, 59, 92, 0.4)'
                          : '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#f8fafc',
                        fontSize: '0.83rem',
                        lineHeight: 1.45,
                        cursor: 'pointer',
                        transition: 'all 0.16s ease',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          marginBottom: '4px',
                          color:
                            turn.speaker === 'user'
                              ? '#00f0ff'
                              : turn.emotion === 'alert'
                              ? '#ff3b5c'
                              : '#10b981',
                        }}
                      >
                        <span>
                          {turn.speaker === 'user' ? 'Você' : activeAvatar.name}{' '}
                          <span style={{ opacity: 0.6, fontWeight: 400 }}>{turn.timestamp}</span>
                        </span>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: isReplayingThis ? '#10b981' : '#94a3b8',
                            fontSize: '0.65rem',
                            fontWeight: 500,
                          }}
                        >
                          {isReplayingThis ? (
                            <>
                              <Volume2 size={12} />
                              <span>Falando...</span>
                            </>
                          ) : (
                            <>
                              <RotateCcw size={11} />
                              <span>Ouvir</span>
                            </>
                          )}
                        </span>
                      </div>
                      <div>{turn.text}</div>
                    </div>
                  );
                })}
                <div ref={transcriptEndRef} />
              </div>
            </div>
          )}

          {/* Barra Inferior Responsiva em Duas Linhas com Expansor de Opções e Legendas nos Botões */}
          <div
            className={`stage-bottom-hud-dock clean-dock ${
              showDockOptions ? 'dock-expanded' : 'dock-collapsed'
            }`}
          >
            {/* LINHA 1 (Sempre visível e compacta para celular): Voz + Input + Enviar + Botão Opções */}
            <div className="hud-primary-row">
              <button
                type="button"
                id="btn-toggle-mic"
                className={`hud-labeled-btn ${isListeningMic ? 'mic-active' : ''}`}
                onClick={toggleMicrophone}
                title="Ativar ou Desativar Conversa por Voz em Tempo Real"
              >
                {isListeningMic ? <Mic size={16} /> : <MicOff size={16} />}
                <span className="hud-btn-caption">
                  {isListeningMic ? 'Ouvindo' : 'Voz'}
                </span>
              </button>

              {isSpeaking && (
                <button
                  type="button"
                  id="btn-interrupt-speech"
                  className="hud-interrupt-btn"
                  onClick={() => {
                    audioEngineRef.current?.interrupt();
                    setIsSpeaking(false);
                    setReplayingTurnId(null);
                    setGesture('idle');
                  }}
                  title="Interromper Fala do Avatar"
                >
                  <Square size={12} />
                  <span>Parar</span>
                </button>
              )}

              <form
                className="hud-prompt-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
              >
                <input
                  type="text"
                  id="stage-chat-input"
                  className="hud-prompt-input"
                  placeholder={
                    isListeningMic
                      ? `Ouvindo ao vivo... Fale com ${activeAvatar.name}`
                      : isProcessing
                      ? `${activeAvatar.name} está respondendo...`
                      : `Fale com ${activeAvatar.name}...`
                  }
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
                <button
                  type="submit"
                  id="btn-send-message"
                  className="hud-send-btn"
                  disabled={isProcessing || !inputText.trim()}
                  title="Enviar mensagem"
                >
                  <Send size={15} />
                  <span>Enviar</span>
                </button>
              </form>

              <button
                type="button"
                id="btn-toggle-dock-options"
                className={`hud-labeled-btn ${showDockOptions ? 'cam-active' : ''}`}
                onClick={() => setShowDockOptions((prev) => !prev)}
                aria-expanded={showDockOptions}
                title={
                  showDockOptions
                    ? 'Esconder opções adicionais'
                    : 'Expandir opções (Legenda, Histórico, Câmera, Tela, Som, Config)'
                }
              >
                {showDockOptions ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                <span className="hud-btn-caption">Opções</span>
              </button>
            </div>

            {/* LINHA 2 (Mostrada somente quando expandida pelo botão Opções): Botões com Legendas */}
            {showDockOptions && (
              <div className="hud-secondary-options-row" id="stage-dock-options-row">
                <button
                  type="button"
                  id="btn-toggle-subtitles"
                  className={`hud-option-pill ${showSubtitles ? 'cam-active' : ''}`}
                  onClick={() => setShowSubtitles((prev) => !prev)}
                  title={
                    showSubtitles
                      ? 'Desativar legenda em tempo real na tela'
                      : 'Ativar legenda em tempo real na tela'
                  }
                >
                  <Captions size={15} />
                  <span>Legenda</span>
                </button>

                <button
                  type="button"
                  id="btn-toggle-transcript"
                  className={`hud-option-pill ${showTranscript ? 'cam-active' : ''}`}
                  onClick={() => setShowTranscript((prev) => !prev)}
                  title={
                    showTranscript
                      ? 'Ocultar histórico de conversas'
                      : 'Mostrar histórico de conversas (toque nos trechos para ouvir)'
                  }
                >
                  <MessageSquare size={15} />
                  <span>Histórico</span>
                </button>

                <button
                  type="button"
                  id="btn-toggle-mute"
                  className={`hud-option-pill ${isMuted ? 'muted-active' : ''}`}
                  onClick={() => {
                    const next = !isMuted;
                    setIsMuted(next);
                    audioEngineRef.current?.setMuted(next);
                  }}
                  title={isMuted ? 'Ativar áudio do avatar' : 'Silenciar áudio do avatar'}
                >
                  {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  <span>{isMuted ? 'Mudo' : 'Som'}</span>
                </button>

                <button
                  type="button"
                  id="btn-toggle-camera"
                  className={`hud-option-pill ${cameraActive ? 'cam-active' : ''}`}
                  onClick={toggleCamera}
                  title="Compartilhar câmera com o avatar"
                >
                  {cameraActive ? <Video size={15} /> : <VideoOff size={15} />}
                  <span>Câmera</span>
                </button>

                <button
                  type="button"
                  id="btn-toggle-screen"
                  className={`hud-option-pill ${screenActive ? 'cam-active' : ''}`}
                  onClick={toggleScreenShare}
                  title="Compartilhar tela com o avatar"
                >
                  <MonitorUp size={15} />
                  <span>Tela</span>
                </button>

                <button
                  type="button"
                  id="btn-open-admin-studio"
                  className="hud-option-pill"
                  onClick={() => setScreenMode('admin_config')}
                  title="Abrir tela de configuração e estúdio"
                >
                  <Settings size={15} />
                  <span>Config</span>
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ============================================================================
  // TELA 2: AMBIENTE DE ADMINISTRAÇÃO & CALIBRAGEM (TELA DEDICADA DE CONFIG)
  // ============================================================================
  return (
    <div className="app-shell admin-screen-shell">
      <header className="top-command-bar">
        <div className="brand-cluster">
          <div className="brand-orb-indicator" />
          <div>
            <h1 className="brand-title">AMBIENTE DE ADMINISTRAÇÃO // AETHER STUDIO</h1>
            <span className="brand-subtitle">
              CONFIGURAÇÃO DE PERFIS • 4 MOTORES VISUAIS • RAG • GUARDRAILS & GEMINI LIVE
            </span>
          </div>
        </div>

        {/* Troca Rápida do Perfil/Modo em Calibragem */}
        <div className="quick-mode-switcher" role="group" aria-label="Modo Visual do Avatar">
          {(
            [
              { id: '3d', label: '1. 3D (Aria)' },
              { id: '2d', label: '2. 2D (Kael)' },
              { id: 'photorealistic', label: '3. Foto 2.5D (Helena)' },
              { id: 'orb', label: '4. Orbe (NEXUS)' },
            ] as { id: VisualMode; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              className={`quick-mode-btn ${
                activeAvatar.visualMode === item.id ? 'active' : ''
              }`}
              onClick={() => {
                const matchingProfile = avatars.find((a) => a.visualMode === item.id);
                if (matchingProfile && matchingProfile.id !== activeAvatar.id) {
                  handleSelectAvatar(matchingProfile.id);
                } else {
                  handleUpdateAvatar({ ...activeAvatar, visualMode: item.id });
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          id="btn-return-live-stage"
          className="btn-launch-stage"
          onClick={() => setScreenMode('live_stage')}
        >
          <Play size={15} />
          <span>Ir para o Palco Ao Vivo</span>
        </button>
      </header>

      <main className="admin-dedicated-layout">
        {/* Coluna Esquerda do Admin: Monitor de Calibragem & Telemetria do Avatar */}
        <section className="admin-calibration-monitor">
          <div className="calibration-stage-box">
            {renderActiveAvatarStage()}
          </div>

          <div className="calibration-telemetry-bar">
            <div className="telemetry-badges-row">
              <span className="telemetry-pill">
                <Activity size={12} />
                <span>Latência: {liveTelemetry.lastLatencyMs}ms</span>
              </span>
              <button
                type="button"
                className="telemetry-pill"
                style={{
                  cursor: 'pointer',
                  color: 'var(--accent-cyan)',
                  borderColor: 'rgba(0,240,255,0.35)',
                }}
                onClick={() => {
                  setEmotion('happy');
                  setGesture('explain');
                  audioEngineRef.current?.speakWithVisemes(
                    activeAvatar.greetingMessage,
                    activeAvatar.geminiConfig.voiceName,
                    () => {
                      setEmotion('neutral');
                      setGesture('idle');
                    }
                  );
                }}
              >
                <Volume2 size={12} />
                <span>Testar Voz: {activeAvatar.geminiConfig.voiceName}</span>
              </button>
              <span
                className={`telemetry-pill guardrail-${liveTelemetry.guardrailState}`}
              >
                {liveTelemetry.guardrailState === 'blocked' ? (
                  <ShieldAlert size={12} />
                ) : (
                  <ShieldCheck size={12} />
                )}
                <span>
                  {liveTelemetry.guardrailState === 'blocked'
                    ? 'VIOLAÇÃO BLOQUEADA'
                    : liveTelemetry.guardrailState === 'masked'
                    ? 'PII ANONIMIZADO'
                    : 'GUARDRAILS ATIVOS'}
                </span>
              </span>
            </div>

            <div className="expression-quick-bar">
              {(
                [
                  { em: 'neutral', gs: 'idle', label: 'Neutro' },
                  { em: 'happy', gs: 'wave', label: 'Feliz / Acenar' },
                  { em: 'thinking', gs: 'explain', label: 'Pensando' },
                  { em: 'surprised', gs: 'emphasis', label: 'Surpreso' },
                  { em: 'alert', gs: 'emphasis', label: 'Alerta Guardrail' },
                ] as { em: EmotionState; gs: GestureState; label: string }[]
              ).map((btn) => (
                <button
                  key={btn.em}
                  type="button"
                  className={`exp-chip ${emotion === btn.em ? 'active' : ''}`}
                  onClick={() => {
                    setEmotion(btn.em);
                    setGesture(btn.gs);
                  }}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Coluna Direita do Admin: Painel Completo de Configuração (5 Abas) */}
        <AdminStudioPanel
          avatars={avatars}
          activeAvatar={activeAvatar}
          documents={documents}
          auditEvents={auditEvents}
          geminiApiKey={geminiApiKey}
          liveWsStatus={liveWsStatus}
          onSelectAvatar={handleSelectAvatar}
          onUpdateAvatar={handleUpdateAvatar}
          onCreateAvatar={handleCreateAvatar}
          onDeleteAvatar={handleDeleteAvatar}
          onResetDefaults={handleResetDefaults}
          onAddDocument={(doc) => setDocuments((prev) => [doc, ...prev])}
          onUpdateDocument={(doc) =>
            setDocuments((prev) => prev.map((d) => (d.id === doc.id ? doc : d)))
          }
          onDeleteDocument={(docId) =>
            setDocuments((prev) => prev.filter((d) => d.id !== docId))
          }
          onChangeGeminiApiKey={setGeminiApiKey}
          onTestPromptOnStage={(promptText) => handleSendMessage(promptText)}
        />
      </main>
    </div>
  );
}

export default App;
