import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AvatarProfile,
  ConversationTurn,
  ConversationUserProfile,
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
  createEmptyUserProfile,
  updateConversationProfile,
} from './services/conversationMemory';
import {
  GeminiLiveSessionManager,
  RealtimeAudioVisemeEngine,
} from './services/audioAndGeminiLive';
import { AvatarEngine3D } from './components/stage/AvatarEngine3D';
import { AvatarEngine2D } from './components/stage/AvatarEngine2D';
import { AvatarEnginePhotorealistic } from './components/stage/AvatarEnginePhotorealistic';
import { AvatarEngineOrb } from './components/stage/AvatarEngineOrb';
import { AdminStudioPanel } from './components/admin/AdminStudioPanel';
import { AetherSplashScreen } from './components/splash/AetherSplashScreen';
import { APP_DEV_VERSION_LABEL } from './config/version';
import { PacificRWorkspace } from './components/pacificR/PacificRWorkspace';
import {
  getAppBasePath,
  getPacificRPath,
  isPacificRRoute,
} from './utils/appRoutes';
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
  Users,
  FlaskConical,
  Sun,
  Moon,
} from 'lucide-react';

type ScreenMode = 'live_stage' | 'admin_config' | 'pacific_r';
type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'aether_live_studio_state_v4';
const THEME_STORAGE_KEY = 'aether_ui_theme';

const PREVIOUS_SAMIA_DEFAULT_GREETINGS = new Set([
  'Olá, eu sou a Sâmia, psicóloga clínica e educacional. Este é um espaço seguro e confidencial para você falar no seu ritmo sobre como tem vivido a universidade ou o que estiver pesando hoje.',
  'Olá, eu sou a Sâmia, vou lhe ajudar a fazer a ponte psicológica, clínica e educacional. Este é um espaço seguro e confidencial para você falar no seu ritmo sobre como tem vivido a universidade ou o que estiver pensando hoje.',
]);

function getPersonaQuickMeta(av: AvatarProfile): { shortName: string; specialty: string } {
  const role = av.roleTitle.toLowerCase();
  if (av.id === 'avatar-samia-photo' || role.includes('psicólog')) {
    return { shortName: av.name, specialty: 'Psicologia' };
  }
  if (av.id === 'avatar-rafael-uro-photo' || role.includes('urolog')) {
    return { shortName: 'Dr. Rafael', specialty: 'Urologia' };
  }
  if (av.id === 'avatar-beatriz-geriatria-photo' || role.includes('geriatr')) {
    return { shortName: 'Dra. Beatriz', specialty: 'Geriatria' };
  }
  if (av.id === 'avatar-eduardo-nefro-photo' || role.includes('nefrolog')) {
    return { shortName: 'Dr. Eduardo', specialty: 'Nefrologia' };
  }
  if (role.includes('governança clínica') || role.includes('lgpd')) {
    return { shortName: 'Dra. Helena', specialty: 'Governança' };
  }
  const shortName = av.name.split(' ').slice(0, 2).join(' ');
  const specialty =
    av.visualMode === '3d'
      ? '3D'
      : av.visualMode === '2d'
      ? '2D'
      : av.visualMode === 'orb'
      ? 'Orbe'
      : '2.5D';
  return { shortName, specialty };
}

export function App() {
  // Estado Principal Persistente (com merge não destrutivo mantendo Sâmia como porta de entrada)
  const [avatars, setAvatars] = useState<AvatarProfile[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.avatars) && parsed.avatars.length > 0) {
          const defaultSamia = DEFAULT_AVATARS.find((d) => d.id === 'avatar-samia-photo');
          const savedList = (parsed.avatars as AvatarProfile[]).map((a) => {
            let next = a;
            if (
              next.id === 'avatar-samia-photo' &&
              defaultSamia &&
              PREVIOUS_SAMIA_DEFAULT_GREETINGS.has(next.greetingMessage)
            ) {
              next = { ...next, greetingMessage: defaultSamia.greetingMessage };
            }
            if (next.geminiConfig?.model === 'gemini-2.0-flash-exp') {
              next = {
                ...next,
                geminiConfig: {
                  ...next.geminiConfig,
                  model: 'gemini-2.5-flash-native-audio-preview-12-2025',
                },
              };
            }
            return next;
          });
          const savedIds = new Set(savedList.map((a) => a.id));
          const missingDefaults = DEFAULT_AVATARS.filter((d) => !savedIds.has(d.id));
          const merged =
            missingDefaults.length > 0 ? [...savedList, ...missingDefaults] : savedList;
          // Mantém Sâmia sempre na primeira posição, seguida das especialidades médicas padrão
          const samia = merged.find((a) => a.id === 'avatar-samia-photo');
          if (samia) {
            const medicalOrder = [
              'avatar-rafael-uro-photo',
              'avatar-beatriz-geriatria-photo',
              'avatar-eduardo-nefro-photo',
            ];
            const medicalAvatars = medicalOrder
              .map((id) => merged.find((a) => a.id === id))
              .filter((a): a is AvatarProfile => Boolean(a));
            const medicalSet = new Set(medicalOrder);
            const rest = merged.filter(
              (a) => a.id !== 'avatar-samia-photo' && !medicalSet.has(a.id)
            );
            return [samia, ...medicalAvatars, ...rest];
          }
          return merged;
        }
      }
    } catch {
      // Fallback
    }
    return DEFAULT_AVATARS;
  });

  // Sâmia sempre atua como porta de entrada ao abrir o estúdio
  const [activeAvatarId, setActiveAvatarId] = useState<string>(() => 'avatar-samia-photo');

  const [documents, setDocuments] = useState<KnowledgeDocument[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.documents)) {
          const savedDocs = (parsed.documents as KnowledgeDocument[]).map(ensureDocumentChunks);
          const savedDocIds = new Set(savedDocs.map((d) => d.id));
          const missingDocs = DEFAULT_DOCUMENTS.filter((d) => !savedDocIds.has(d.id)).map(
            ensureDocumentChunks
          );
          return missingDocs.length > 0 ? [...missingDocs, ...savedDocs] : savedDocs;
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

  // Tema Visual (Escuro / Claro) persistente com alternância global instantânea
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // Ignore storage access errors
    }
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage access errors
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Separação clara entre Tela de Splash, Palco Ao Vivo (padrão, limpo), Administração e Área PACIFIC-R (/pacific-r)
  const [showSplash, setShowSplash] = useState<boolean>(() => !isPacificRRoute());
  const [screenMode, setScreenMode] = useState<ScreenMode>(() =>
    isPacificRRoute() ? 'pacific_r' : 'live_stage'
  );

  const navigateScreenMode = useCallback((next: ScreenMode) => {
    setScreenMode(next);
    if (typeof window !== 'undefined') {
      if (next === 'pacific_r') {
        if (!isPacificRRoute()) {
          window.history.pushState({}, '', getPacificRPath());
        }
      } else if (isPacificRRoute()) {
        window.history.pushState({}, '', getAppBasePath());
      }
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setScreenMode(isPacificRRoute() ? 'pacific_r' : 'live_stage');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
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
      text: activeAvatar.greetingMessage || DEFAULT_AVATARS[0].greetingMessage,
      emotion: 'happy',
      gesture: 'wave',
      modeUsed: 'sandbox_neural',
      latencyMs: 140,
    },
  ]);

  // Perfil Vivo da Pessoa + Cadeia de Pensamentos da Sessão Atual (nome, contexto acadêmico, sinais e continuidade)
  const [sessionProfile, setSessionProfile] = useState<ConversationUserProfile>(() =>
    createEmptyUserProfile(activeAvatar.greetingMessage || DEFAULT_AVATARS[0].greetingMessage)
  );
  const turnsRef = useRef<ConversationTurn[]>(turns);
  turnsRef.current = turns;
  const sessionProfileRef = useRef<ConversationUserProfile>(sessionProfile);
  sessionProfileRef.current = sessionProfile;

  // Controle de fala inicial automática ao entrar no aplicativo (com desbloqueio instantâneo caso o navegador bloqueie autoplay)
  const [pendingAutoGreeting, setPendingAutoGreeting] = useState<boolean>(false);
  const initialGreetingHandledRef = useRef<boolean>(false);

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

  // Fala inicial automática ao entrar no aplicativo (força fala imediata; se o navegador bloquear autoplay, libera no primeiro toque/tecla)
  const playInitialGreeting = useCallback(
    (isUnlockRetry = false) => {
      const audio = audioEngineRef.current;
      if (!audio || isMuted) return;

      const greetingText = activeAvatar.greetingMessage?.trim();
      if (!greetingText) return;

      if (geminiApiKey) {
        audio.setApiKey(geminiApiKey);
      }

      if (isUnlockRetry) {
        audio.initAudioContext();
        setPendingAutoGreeting(false);
        initialGreetingHandledRef.current = true;
      }

      audio.speakWithVisemes(
        greetingText,
        activeAvatar.geminiConfig.voiceName,
        () => {
          setEmotion('neutral');
          setGesture('idle');
        },
        () => {
          initialGreetingHandledRef.current = true;
          setPendingAutoGreeting(false);
          setEmotion('happy');
          setGesture('wave');
        },
        isUnlockRetry
          ? undefined
          : () => {
              if (!initialGreetingHandledRef.current) {
                setPendingAutoGreeting(true);
              }
            }
      );
    },
    [activeAvatar.greetingMessage, activeAvatar.geminiConfig.voiceName, geminiApiKey, isMuted]
  );

  // Dispara a fala inicial automaticamente logo que o usuário entra no aplicativo (aguardando saída da tela de splash)
  useEffect(() => {
    if (screenMode !== 'live_stage' || showSplash || initialGreetingHandledRef.current || isMuted) return;
    const timer = window.setTimeout(() => {
      if (!initialGreetingHandledRef.current && !isMuted) {
        playInitialGreeting(false);
      }
    }, 320);
    return () => window.clearTimeout(timer);
    // Executa na entrada do palco (e quando a chave de API terminar de carregar se ainda não tiver falado)
  }, [screenMode, showSplash, playInitialGreeting, isMuted]);

  const handlePreUnlockAudioFromSplash = useCallback(() => {
    audioEngineRef.current?.initAudioContext();
  }, []);

  const handleFinishEnterFromSplash = useCallback(() => {
    setShowSplash(false);
  }, []);

  // Se o navegador bloqueou autoplay antes de interação, desbloqueia e fala no primeiro toque/clique/tecla em qualquer ponto da tela
  useEffect(() => {
    if (!pendingAutoGreeting || initialGreetingHandledRef.current || isMuted) return;

    const unlockAndSpeak = (ev: Event) => {
      const target = ev.target as HTMLElement | null;
      if (target && target.closest('#btn-unlock-initial-greeting')) {
        return;
      }
      // Se o usuário já clicou no campo de texto para digitar ou no botão de microfone/mudo, não interrompe a ação dele
      if (target && target.closest('input, textarea, [data-skip-auto-greeting="true"]')) {
        initialGreetingHandledRef.current = true;
        setPendingAutoGreeting(false);
        return;
      }
      playInitialGreeting(true);
    };

    window.addEventListener('pointerdown', unlockAndSpeak, { once: true, capture: true });
    window.addEventListener('keydown', unlockAndSpeak, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAndSpeak, true);
      window.removeEventListener('keydown', unlockAndSpeak, true);
    };
  }, [pendingAutoGreeting, isMuted, playInitialGreeting]);

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

    initialGreetingHandledRef.current = true;
    setPendingAutoGreeting(false);

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

    const currentTurnsSnapshot = turnsRef.current;
    const currentProfileSnapshot = sessionProfileRef.current;

    // Atualiza perfil vivo da pessoa, registra nome se informado e gera novo passo da cadeia de pensamentos
    const {
      profile: nextProfile,
      justLearnedName,
      isPureNameIntroduction,
    } = updateConversationProfile(
      currentProfileSnapshot,
      inputGuard.sanitizedText,
      currentTurnsSnapshot
    );
    sessionProfileRef.current = nextProfile;
    setSessionProfile(nextProfile);

    const newUserTurn: ConversationTurn = {
      id: `turn-user-${Date.now()}`,
      timestamp: nowStr,
      speaker: 'user',
      text: rawText,
      guardrailEvent:
        inputGuard.action !== 'passed' ? inputGuard.auditEvent : undefined,
      hasVisionFrame: Boolean(visionSnapshot),
    };

    const turnsWithCurrentUser = [...currentTurnsSnapshot, newUserTurn];
    turnsRef.current = turnsWithCurrentUser;
    setTurns(turnsWithCurrentUser);

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
      turnsRef.current = [...turnsWithCurrentUser, blockedTurn];
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
      const handleLiveAudioFinished = () => {
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
      };

      const result = await manager.processConversationTurn({
        userText: rawText,
        avatar: activeAvatar,
        documents,
        visionFrameBase64: visionSnapshot,
        hasActiveCamera: cameraActive,
        hasActiveScreen: screenActive,
        recentTurns: turnsWithCurrentUser.slice(-20),
        sessionProfile: nextProfile,
        justLearnedName,
        isPureNameIntroduction,
        audioEngine: audio,
        onAudioStart: () => {
          setIsProcessing(false);
          setEmotion('happy');
          setGesture('explain');
        },
        onAudioComplete: handleLiveAudioFinished,
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
        turnsRef.current = [...turnsRef.current, avatarTurn];
        setTurns((prev) => [...prev, avatarTurn]);
      };

      // Se o Gemini Live Native Audio já entregou a fala nativa em streaming 24kHz, apenas registra o turno sem repetir TTS
      if (result.audioAlreadyPlayed) {
        commitTurnOnAudioStart();
      } else {
        await audio.speakWithVisemes(
          result.replyText,
          activeAvatar.geminiConfig.voiceName,
          () => {
            commitTurnOnAudioStart();
            handleLiveAudioFinished();
          },
          () => {
            commitTurnOnAudioStart();
          }
        );
      }
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
    initialGreetingHandledRef.current = true;
    setPendingAutoGreeting(false);
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
    if (geminiApiKey) {
      audio.setApiKey(geminiApiKey);
    }

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
    initialGreetingHandledRef.current = true;
    setPendingAutoGreeting(false);
    audioEngineRef.current?.interrupt();
    setReplayingTurnId(null);
    setActiveAvatarId(id);
    const chosen = avatars.find((a) => a.id === id);
    if (chosen) {
      const freshProfile = createEmptyUserProfile(chosen.greetingMessage);
      sessionProfileRef.current = freshProfile;
      setSessionProfile(freshProfile);
      setEmotion('happy');
      setGesture('wave');
      const switchTurn: ConversationTurn = {
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
      };
      turnsRef.current = [...turnsRef.current, switchTurn];
      setTurns((prev) => [...prev, switchTurn]);
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
        'Olá! Sou um novo perfil de avatar configurado pelo ambiente de administração. Como posso te chamar?',
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
    const freshProfile = createEmptyUserProfile(DEFAULT_AVATARS[0].greetingMessage);
    sessionProfileRef.current = freshProfile;
    setSessionProfile(freshProfile);
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

  const renderThemeToggleButton = () => {
    const isLight = theme === 'light';
    return (
      <button
        type="button"
        id="btn-theme-toggle"
        className={`floating-theme-toggle-btn ${isLight ? 'is-light' : 'is-dark'}`}
        onClick={toggleTheme}
        data-skip-auto-greeting="true"
        aria-pressed={isLight}
        aria-label={isLight ? 'Alternar para tema escuro' : 'Alternar para tema claro'}
        title={isLight ? 'Alternar para tema escuro' : 'Alternar para tema claro'}
      >
        {isLight ? <Moon size={15} /> : <Sun size={15} />}
        <span className="floating-theme-toggle-label">
          {isLight ? 'Escuro' : 'Claro'}
        </span>
      </button>
    );
  };

  // ============================================================================
  // TELA 0: ÁREA DEDICADA DO PROJETO DE PESQUISA PACIFIC-R (/pacific-r)
  // ============================================================================
  if (screenMode === 'pacific_r') {
    return (
      <>
        {renderThemeToggleButton()}
        <PacificRWorkspace
          geminiApiKey={geminiApiKey}
          onExitToAetherStudio={() => {
            audioEngineRef.current?.interrupt();
            navigateScreenMode('live_stage');
          }}
        />
      </>
    );
  }

  // ============================================================================
  // TELA 1: PALCO AO VIVO (EXPERIÊNCIA DO USUÁRIO LIMPA: APENAS AVATAR + BARRA)
  // ============================================================================
  if (screenMode === 'live_stage') {
    return (
      <div className="clean-stage-shell">
        {renderThemeToggleButton()}
        {showSplash && (
          <AetherSplashScreen
            onPreUnlockAudio={handlePreUnlockAudioFromSplash}
            onEnter={handleFinishEnterFromSplash}
            durationMs={4000}
            versionLabel={APP_DEV_VERSION_LABEL}
          />
        )}
        <h1 className="sr-only">{activeAvatar.name} — Palco Interativo em Tempo Real</h1>

        {/* Avatar em Tela Cheia 100dvh */}
        <main className="clean-stage-viewport" aria-label="Palco do Avatar Interativo">
          {renderActiveAvatarStage()}

          {/* Aviso discreto exibido SOMENTE se o navegador bloqueou autoplay antes do primeiro toque */}
          {pendingAutoGreeting && !isMuted && (
            <button
              type="button"
              id="btn-unlock-initial-greeting"
              className="stage-unlock-greeting-btn"
              onClick={() => playInitialGreeting(true)}
            >
              <Volume2 size={16} className="stage-unlock-greeting-icon" />
              <span>Toque na tela para ouvir a {activeAvatar.name}</span>
            </button>
          )}

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
                showDockOptions ? 'dock-open' : ''
              } ${
                turns[turns.length - 1].emotion === 'alert' ? 'caption-alert' : ''
              }`}
              style={{
                pointerEvents: 'auto',
                cursor: 'pointer',
              }}
              onClick={() => handleReplayTurnAudio(turns[turns.length - 1])}
              title="Toque na legenda para ouvir este trecho novamente"
            >
              <span className="caption-speaker">
                {turns[turns.length - 1].speaker === 'user'
                  ? `${sessionProfile.userName || 'Você'}: `
                  : `${activeAvatar.name}: `}
              </span>
              <span>{turns[turns.length - 1].text}</span>
              <span className="caption-replay-icon">
                <Volume2 size={12} />
              </span>
            </div>
          )}

          {/* Painel Flutuante de Texto das Conversas (clique em qualquer trecho para reproduzir o áudio novamente) */}
          {showTranscript && (
            <div
              id="stage-transcript-panel"
              className={`stage-transcript-floating ${showDockOptions ? 'dock-open' : ''}`}
            >
              <div className="transcript-panel-header">
                <span>
                  HISTÓRICO ({turns.length})
                  {sessionProfile.userName ? ` • ${sessionProfile.userName.toUpperCase()}` : ''} • TOQUE NO TRECHO PARA OUVIR
                </span>
                <button
                  type="button"
                  onClick={() => setShowTranscript(false)}
                  className="transcript-close-btn"
                  title="Fechar histórico de texto"
                >
                  <X size={15} />
                </button>
              </div>
              {(sessionProfile.userName ||
                sessionProfile.academicStage ||
                sessionProfile.courseOrArea ||
                sessionProfile.campusOrUnit ||
                sessionProfile.emotionalSignals.length > 0 ||
                sessionProfile.thoughtChain.length > 0) && (
                <div id="stage-session-profile-bar" className="stage-session-profile-bar">
                  <div className="profile-tags-row">
                    <span className="profile-bar-label">PERFIL NA SESSÃO:</span>
                    {sessionProfile.userName && (
                      <span className="profile-chip profile-chip-name">
                        Nome: {sessionProfile.userName}
                      </span>
                    )}
                    {sessionProfile.academicStage && (
                      <span className="profile-chip">{sessionProfile.academicStage}</span>
                    )}
                    {sessionProfile.courseOrArea && (
                      <span className="profile-chip">{sessionProfile.courseOrArea}</span>
                    )}
                    {sessionProfile.campusOrUnit && (
                      <span className="profile-chip">{sessionProfile.campusOrUnit}</span>
                    )}
                    {sessionProfile.emotionalSignals.slice(-2).map((sig) => (
                      <span key={sig} className="profile-chip profile-chip-signal">
                        {sig}
                      </span>
                    ))}
                  </div>
                  {sessionProfile.thoughtChain.length > 0 && (
                    <div className="profile-thought-chain">
                      <strong className="profile-thought-label">
                        Cadeia de Pensamento (#{sessionProfile.thoughtChain[sessionProfile.thoughtChain.length - 1].turnIndex}):
                      </strong>{' '}
                      {sessionProfile.thoughtChain[sessionProfile.thoughtChain.length - 1].responseStrategy}
                    </div>
                  )}
                </div>
              )}
              <div className="transcript-turns-list">
                {turns.map((turn) => {
                  const isReplayingThis = replayingTurnId === turn.id && isSpeaking;
                  const speakerClass =
                    turn.speaker === 'user'
                      ? 'turn-user'
                      : turn.emotion === 'alert'
                      ? 'turn-alert'
                      : 'turn-avatar';
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
                      className={`transcript-turn-bubble ${speakerClass} ${
                        isReplayingThis ? 'turn-replaying' : ''
                      }`}
                    >
                      <div className={`transcript-turn-meta ${speakerClass}`}>
                        <span>
                          {turn.speaker === 'user'
                            ? sessionProfile.userName || 'Você'
                            : activeAvatar.name}{' '}
                          <span className="transcript-turn-time">{turn.timestamp}</span>
                        </span>
                        <span
                          className={`transcript-replay-hint ${
                            isReplayingThis ? 'is-active' : ''
                          }`}
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
                    : 'Expandir opções (Legenda, Histórico, Câmera, Tela, Som, Config e Personas)'
                }
              >
                {showDockOptions ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                <span className="hud-btn-caption">Opções</span>
              </button>
            </div>

            {/* LINHA 2 e LINHA 3 (Mostradas somente quando expandidas pelo botão Opções) */}
            {showDockOptions && (
              <>
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
                    onClick={() => navigateScreenMode('admin_config')}
                    title="Abrir tela de configuração e estúdio"
                  >
                    <Settings size={15} />
                    <span>Config</span>
                  </button>

                  <button
                    type="button"
                    id="btn-open-pacific-r"
                    className="hud-option-pill"
                    onClick={() => {
                      audioEngineRef.current?.interrupt();
                      navigateScreenMode('pacific_r');
                    }}
                    title="Abrir área dedicada do projeto de pesquisa PACIFIC-R (ICEX)"
                  >
                    <FlaskConical size={15} />
                    <span>PACIFIC-R</span>
                  </button>
                </div>

                {/* LINHA 3: Seletor Rápido de Personas */}
                <div
                  className="hud-persona-quick-row"
                  id="stage-dock-persona-row"
                  role="group"
                  aria-label="Seletor rápido de personas"
                >
                  <span className="hud-persona-row-label" title="Trocar persona rapidamente">
                    <Users size={13} />
                    <span>Personas</span>
                  </span>
                  <div className="hud-persona-quick-scroll">
                    {avatars.map((av) => {
                      const isCurrent = av.id === activeAvatar.id;
                      const meta = getPersonaQuickMeta(av);
                      return (
                        <button
                          key={av.id}
                          type="button"
                          id={`quick-persona-${av.id}`}
                          className={`hud-persona-chip ${isCurrent ? 'persona-active' : ''}`}
                          onClick={() => {
                            if (!isCurrent) {
                              handleSelectAvatar(av.id);
                            }
                          }}
                          title={`${av.name} — ${av.roleTitle}`}
                        >
                          {av.visualMode === 'photorealistic' && av.visualPhoto.portraitUrl ? (
                            <img
                              src={av.visualPhoto.portraitUrl}
                              alt=""
                              className="hud-persona-avatar-thumb"
                            />
                          ) : (
                            <span
                              className="hud-persona-avatar-dot"
                              style={{ background: av.visual3D.accentColor }}
                            />
                          )}
                          <span className="hud-persona-chip-text">
                            <strong>{meta.shortName}</strong>
                            <small>{meta.specialty}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
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
      {renderThemeToggleButton()}
      <header className="top-command-bar">
        <div className="brand-cluster">
          <div className="brand-orb-indicator" />
          <div>
            <h1 className="brand-title">
              AMBIENTE DE ADMINISTRAÇÃO // AETHER STUDIO
              <button
                type="button"
                id="btn-admin-dev-version"
                className="admin-dev-version-chip"
                onClick={() => {
                  setScreenMode('live_stage');
                  setShowSplash(true);
                }}
                title="Versão de desenvolvimento atual — clique para rever a tela de splash"
              >
                {APP_DEV_VERSION_LABEL}
              </button>
            </h1>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            id="btn-admin-open-pacific-r"
            className="quick-mode-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              borderColor: 'rgba(16, 185, 129, 0.45)',
              color: '#34d399',
            }}
            onClick={() => {
              audioEngineRef.current?.interrupt();
              navigateScreenMode('pacific_r');
            }}
            title="Abrir área dedicada do projeto PACIFIC-R (ICEX)"
          >
            <FlaskConical size={14} />
            <span>Projeto PACIFIC-R</span>
          </button>

          <button
            type="button"
            id="btn-return-live-stage"
            className="btn-launch-stage"
            onClick={() => navigateScreenMode('live_stage')}
          >
            <Play size={15} />
            <span>Ir para o Palco Ao Vivo</span>
          </button>
        </div>
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
