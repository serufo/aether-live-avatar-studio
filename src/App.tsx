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
  Sliders,
  MessageSquareText,
  Sparkles,
  BookOpen,
  Layers,
  LayoutTemplate,
  Maximize2,
  Activity,
} from 'lucide-react';

type WorkspaceViewMode = 'stage_only' | 'studio_split' | 'embed_preview';

const STORAGE_KEY = 'aether_live_studio_state_v1';

export function App() {
  // Estado Principal Persistente (LocalStorage + API Backend Express)
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
      return localStorage.getItem('aether_gemini_api_key') || '';
    } catch {
      return '';
    }
  });

  const activeAvatar =
    avatars.find((a) => a.id === activeAvatarId) || avatars[0];

  // Modos de Visão da Interface
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>('studio_split');
  const [showTranscriptDrawer, setShowTranscriptDrawer] = useState<boolean>(true);

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
    detail: 'Motor Neural RAG + Sincronia de Visemas Ativo (Pronto para Voz e Texto)',
  });

  // Histórico de Diálogo em Tempo Real
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

  // Motores Singletons de Áudio/Visemas e Sessão Gemini Live
  const audioEngineRef = useRef<RealtimeAudioVisemeEngine | null>(null);
  const geminiManagerRef = useRef<GeminiLiveSessionManager | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

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
            text: `[CORTE DE ÁUDIO EM TEMPO REAL — ${reason}]: ${fallbackText}`,
            emotion: 'alert',
          },
        ]);
      },
    });

    return () => {
      manager.disconnect();
    };
  }, [geminiApiKey, activeAvatar.id]);

  // Telemetria de Visemas para o HUD a cada 120ms
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

  // Callback passado aos 4 motores visuais a 60 FPS
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

  // Captura snapshot JPEG da câmera ou tela caso esteja ativa para visão multimodal
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

  // Executa um turno completo (Voz ou Texto) com RAG + Guardrails 3 Níveis + Fala Sincronizada
  const handleSendMessage = async (overrideText?: string) => {
    const rawText = (overrideText ?? inputText).trim();
    if (!rawText || isProcessing) return;
    if (!overrideText) setInputText('');

    const audio = audioEngineRef.current;
    const manager = geminiManagerRef.current;
    if (!audio || !manager) return;

    audio.initAudioContext();

    // 1. Verifica Guardrail Nível 2 na entrada do usuário
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
      });

      // Juiz Semântico Nível 3 Pós-Turno
      if (activeAvatar.guardrails.enableSemanticJudge) {
        const judgeEvent = evaluateSemanticJudge(
          rawText,
          result.replyText,
          result.citations,
          activeAvatar
        );
        setAuditEvents((prev) => [judgeEvent, ...prev]);
      }

      setEmotion(result.emotion);
      setGesture(result.gesture);
      setLiveTelemetry((prev) => ({
        ...prev,
        lastLatencyMs: result.latencyMs,
        guardrailState: result.wasBlocked
          ? 'blocked'
          : inputGuard.action === 'masked_pii'
          ? 'masked'
          : 'nominal',
      }));

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

      audio.speakWithVisemes(
        result.replyText,
        activeAvatar.geminiConfig.voiceName,
        () => {
          setEmotion('neutral');
          setGesture('idle');
        }
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Reconhecimento de Voz em Tempo Real (Microfone do Navegador)
  const toggleMicrophone = () => {
    if (isListeningMic) {
      recognitionRef.current?.stop();
      setIsListeningMic(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      handleSendMessage('Olá! Demonstre sua sincronia labial e cite os dados da base de conhecimento.');
      return;
    }

    const rec = new SpeechRec();
    rec.lang = 'pt-BR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setIsListeningMic(true);
      audioEngineRef.current?.interrupt();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (ev: any) => {
      const transcript = ev.results?.[0]?.[0]?.transcript;
      if (transcript) {
        handleSendMessage(transcript);
      }
    };

    rec.onerror = () => {
      setIsListeningMic(false);
    };

    rec.onend = () => {
      setIsListeningMic(false);
    };

    recognitionRef.current = rec;
    rec.start();
  };

  // Alternar Webcam Ao Vivo para Visão do Avatar
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

  // Alternar Compartilhamento de Tela para Visão do Avatar
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

  const handleSelectAvatar = (id: string) => {
    audioEngineRef.current?.interrupt();
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
    setAvatars((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  };

  const handleCreateAvatar = () => {
    const newId = `avatar-custom-${Date.now()}`;
    const clone: AvatarProfile = {
      ...activeAvatar,
      id: newId,
      name: `Agente Custom #${avatars.length + 1}`,
      roleTitle: 'Especialista Configurável em Tempo Real',
      greetingMessage:
        'Olá! Sou um novo perfil de avatar configurado pelo ambiente de administração.',
    };
    setAvatars((prev) => [...prev, clone]);
    setActiveAvatarId(newId);
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

  // Renderiza o Motor Visual correspondente à escolha atual (1 das 4 opções)
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

  return (
    <div className="app-shell">
      {/* BARRA DE COMANDO SUPERIOR */}
      <header className="top-command-bar">
        <div className="brand-cluster">
          <div className="brand-orb-indicator" />
          <div>
            <h1 className="brand-title">AETHER LIVE STUDIO</h1>
            <span className="brand-subtitle">
              GEMINI LIVE API • 4 MOTORES VISUAIS • GUARDRAILS & RAG
            </span>
          </div>
        </div>

        {/* Troca Rápida dos 4 Modos Visuais direto no Topo */}
        <div className="quick-mode-switcher" role="group" aria-label="Modo Visual do Avatar">
          {(
            [
              { id: '3d', label: '1. 3D Estilizado' },
              { id: '2d', label: '2. 2D LiveRig' },
              { id: 'photorealistic', label: '3. Fotorrealista 2.5D' },
              { id: 'orb', label: '4. Orbe Partículas' },
            ] as { id: VisualMode; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              id={`top-mode-btn-${item.id}`}
              className={`quick-mode-btn ${
                activeAvatar.visualMode === item.id ? 'active' : ''
              }`}
              onClick={() =>
                handleUpdateAvatar({ ...activeAvatar, visualMode: item.id })
              }
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Seletor de Visão (Palco Puro / Studio + Admin / Preview Widget Embed) */}
        <div className="workspace-view-controls">
          <button
            type="button"
            id="view-mode-stage"
            className={`view-pill-btn ${viewMode === 'stage_only' ? 'active' : ''}`}
            onClick={() => setViewMode('stage_only')}
            title="Palco Imersivo em Tela Cheia"
          >
            <Maximize2 size={14} />
            <span>Palco Ao Vivo</span>
          </button>
          <button
            type="button"
            id="view-mode-studio"
            className={`view-pill-btn ${viewMode === 'studio_split' ? 'active' : ''}`}
            onClick={() => setViewMode('studio_split')}
            title="Estúdio Completo com Painel Admin"
          >
            <Sliders size={14} />
            <span>Studio + Admin</span>
          </button>
          <button
            type="button"
            id="view-mode-embed"
            className={`view-pill-btn ${viewMode === 'embed_preview' ? 'active' : ''}`}
            onClick={() => setViewMode('embed_preview')}
            title="Simular Widget Incorporado em Portal Externo"
          >
            <LayoutTemplate size={14} />
            <span>Widget Embed</span>
          </button>
        </div>
      </header>

      {/* CORPO PRINCIPAL DA PLATAFORMA */}
      <main className={`workspace-main mode-${viewMode}`}>
        {/* PALCO INTERATIVO EM TEMPO REAL */}
        <section className="interactive-stage" aria-label="Palco do Avatar Interativo">
          {/* Renderizador 60 FPS (3D / 2D / Fotorrealista / Orbe) */}
          {renderActiveAvatarStage()}

          {/* Seletor Rápido de Perfis & Telemetria (Canto Superior Esquerdo do Palco) */}
          <div className="stage-top-left-hud">
            <div className="active-avatar-card-glass">
              <div className="avatar-selector-row">
                <Layers size={15} className="cyan-icon" />
                <select
                  id="stage-avatar-profile-select"
                  className="stage-profile-select"
                  value={activeAvatar.id}
                  onChange={(e) => handleSelectAvatar(e.target.value)}
                >
                  {avatars.map((av) => (
                    <option key={av.id} value={av.id}>
                      {av.name} ({av.visualMode.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>
              <span className="stage-avatar-role">{activeAvatar.roleTitle}</span>

              <div className="telemetry-badges-row">
                <span className="telemetry-pill">
                  <Activity size={12} />
                  <span>{liveTelemetry.lastLatencyMs}ms</span>
                </span>
                <span className="telemetry-pill">
                  <span>Voz: {activeAvatar.geminiConfig.voiceName}</span>
                </span>
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
                      : 'GUARDRAILS 3-NÍVEIS OK'}
                  </span>
                </span>
              </div>

              {/* Barra de Energia Vocal e Visemas em Tempo Real */}
              <div className="viseme-meter-row">
                <span className="mono-label">
                  VISEMA: {isSpeaking ? liveTelemetry.band.toUpperCase() : 'IDLE'}
                </span>
                <div className="viseme-bar-track">
                  <div
                    className="viseme-bar-fill"
                    style={{ width: `${Math.min(100, liveTelemetry.jaw)}%` }}
                  />
                </div>
                <span className="mono-label">{liveTelemetry.jaw}%</span>
              </div>

              {/* Botões Rápidos de Expressão e Gesto em Tempo Real */}
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

            {/* Picture-in-Picture de Webcam / Screen Share quando ativo */}
            {(cameraActive || screenActive) && (
              <div className="vision-pip-card">
                <div className="vision-pip-header">
                  <span className="status-dot-live" />
                  <span>
                    {cameraActive
                      ? 'VISÃO WEBCAM GEMINI LIVE'
                      : 'VISÃO DE TELA COMPARTILHADA'}
                  </span>
                </div>
                <video
                  ref={videoPreviewRef}
                  autoPlay
                  playsInline
                  muted
                  className="vision-pip-video"
                />
              </div>
            )}
          </div>

          {/* GAVETA FLUTUANTE DE TRANSCRIÇÃO, CITAÇÕES RAG E PROMPTS SUGERIDOS */}
          {showTranscriptDrawer && (
            <div className="stage-transcript-drawer" id="stage-transcript-drawer">
              <div className="transcript-drawer-header">
                <div className="transcript-header-title">
                  <MessageSquareText size={15} />
                  <span>Diálogo em Tempo Real & Citações RAG</span>
                </div>
                <button
                  type="button"
                  className="btn-ghost-xs"
                  onClick={() => setShowTranscriptDrawer(false)}
                >
                  Ocultar
                </button>
              </div>

              <div className="transcript-messages-list">
                {turns.map((turn) => (
                  <div
                    key={turn.id}
                    className={`turn-bubble speaker-${turn.speaker} ${
                      turn.emotion === 'alert' ? 'turn-alert' : ''
                    }`}
                  >
                    <div className="turn-meta">
                      <strong>
                        {turn.speaker === 'user'
                          ? 'Você'
                          : turn.speaker === 'avatar'
                          ? activeAvatar.name
                          : 'Guardrail Interceptor'}
                      </strong>
                      <span>
                        {turn.timestamp}
                        {turn.latencyMs ? ` • ${turn.latencyMs}ms` : ''}
                      </span>
                    </div>
                    <p className="turn-text">{turn.text}</p>

                    {/* Citações da Base de Conhecimento (RAG) */}
                    {turn.citations && turn.citations.length > 0 && (
                      <div className="turn-citations">
                        {turn.citations.map((cit) => (
                          <div key={cit.chunkId} className="citation-chip">
                            <BookOpen size={12} />
                            <span>
                              Fonte RAG: <strong>{cit.docTitle}</strong> (
                              {Math.round(cit.score * 100)}% match)
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Alerta de Guardrail Acionado no Turno */}
                    {turn.guardrailEvent && turn.guardrailEvent.action !== 'passed' && (
                      <div className="turn-guardrail-banner">
                        <ShieldAlert size={13} />
                        <span>{turn.guardrailEvent.ruleTriggered}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Sugestões de Teste Rápido (RAG + Guardrails) */}
              <div className="suggested-prompts-bar">
                <span className="sub-eyebrow">
                  <Sparkles size={11} /> TESTAR DIÁLOGO, RAG OU GUARDRAILS:
                </span>
                <div className="suggested-chips-scroll">
                  {activeAvatar.suggestedPrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="suggested-prompt-chip"
                      onClick={() => handleSendMessage(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* DOCK FLUTUANTE INFERIOR DE CONTROLE MULTIMODAL */}
          <div className="stage-bottom-hud-dock">
            <div className="hud-controls-cluster">
              <button
                type="button"
                id="btn-toggle-mic"
                className={`hud-round-btn ${isListeningMic ? 'mic-active' : ''}`}
                onClick={toggleMicrophone}
                title="Falar pelo Microfone em Tempo Real"
              >
                {isListeningMic ? <Mic size={18} /> : <MicOff size={18} />}
              </button>

              <button
                type="button"
                id="btn-toggle-camera"
                className={`hud-round-btn ${cameraActive ? 'cam-active' : ''}`}
                onClick={toggleCamera}
                title="Compartilhar Webcam com o Avatar (Gemini Live Vision)"
              >
                {cameraActive ? <Video size={18} /> : <VideoOff size={18} />}
              </button>

              <button
                type="button"
                id="btn-toggle-screen"
                className={`hud-round-btn ${screenActive ? 'cam-active' : ''}`}
                onClick={toggleScreenShare}
                title="Compartilhar Tela com o Avatar"
              >
                <MonitorUp size={18} />
              </button>

              <button
                type="button"
                id="btn-toggle-mute"
                className={`hud-round-btn ${isMuted ? 'muted-active' : ''}`}
                onClick={() => {
                  const next = !isMuted;
                  setIsMuted(next);
                  audioEngineRef.current?.setMuted(next);
                }}
                title={isMuted ? 'Ativar Voz do Avatar' : 'Silenciar Voz do Avatar'}
              >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>

              {isSpeaking && (
                <button
                  type="button"
                  id="btn-interrupt-speech"
                  className="hud-interrupt-btn"
                  onClick={() => {
                    audioEngineRef.current?.interrupt();
                    setIsSpeaking(false);
                    setGesture('idle');
                  }}
                  title="Cortar a fala do avatar imediatamente (Interrupt)"
                >
                  <Square size={13} />
                  <span>Cortar Fala</span>
                </button>
              )}
            </div>

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
                placeholder={`Converse com ${activeAvatar.name} em tempo real (voz ou texto)...`}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
              <button
                type="submit"
                id="btn-send-message"
                className="hud-send-btn"
                disabled={isProcessing || !inputText.trim()}
              >
                <Send size={16} />
                <span>Enviar</span>
              </button>
            </form>

            {!showTranscriptDrawer && (
              <button
                type="button"
                className="hud-round-btn"
                onClick={() => setShowTranscriptDrawer(true)}
                title="Abrir Transcrição e Citações RAG"
              >
                <MessageSquareText size={18} />
              </button>
            )}
          </div>

          {/* MODO PREVIEW DE PORTAL EXTERNO (WIDGET EMBED) */}
          {viewMode === 'embed_preview' && (
            <div className="embed-portal-backdrop">
              <div className="embed-portal-mockup">
                <span className="admin-eyebrow">SIMULAÇÃO DE PORTAL CORPORATIVO DO CLIENTE</span>
                <h2>Portal Institucional Integrado ao Widget Aether Live</h2>
                <p>
                  No modo <strong>Widget Embed</strong>, seu avatar configurado no Admin (
                  <strong>{activeAvatar.name}</strong> • modo{' '}
                  <code>{activeAvatar.visualMode.toUpperCase()}</code>) opera com a mesma
                  Base de Conhecimento RAG e os mesmos 3 níveis de Guardrails dentro de
                  qualquer site externo.
                </p>
                <div className="embed-metrics-cards">
                  <div className="embed-metric">
                    <strong>4 Motores</strong>
                    <span>3D, 2D, Foto 2.5D e Orbe prontos no mesmo SDK</span>
                  </div>
                  <div className="embed-metric">
                    <strong>Guardrails 3-Tier</strong>
                    <span>Proteção ativa contra PII e Prompt Injection</span>
                  </div>
                  <div className="embed-metric">
                    <strong>RAG Nativo</strong>
                    <span>Documentos sincronizados em tempo real pelo Admin</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-accent-sm"
                  onClick={() => setViewMode('studio_split')}
                >
                  Voltar ao Estúdio + Admin Completo
                </button>
              </div>
            </div>
          )}
        </section>

        {/* PAINEL DE ADMINISTRAÇÃO LATERAL (QUANDO EM STUDIO SPLIT) */}
        {viewMode === 'studio_split' && (
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
        )}
      </main>
    </div>
  );
}

export default App;
