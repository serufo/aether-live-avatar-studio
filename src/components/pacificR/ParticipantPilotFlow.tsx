import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  FileCheck2,
  HeartHandshake,
  Info,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { EmotionState, GestureState, VisemeWeights } from '../../types/avatar';
import {
  PacificGovernanceConfig,
  PacificInterfaceCondition,
  PacificKnowledgeDoc,
  PacificPostQuestionnaire,
  PacificRagMode,
  PacificSessionMetricRecord,
  PacificTurn,
} from '../../types/pacificR';
import {
  buildPacificRAvatarProfile,
  CONDITION_LABELS,
  DEFAULT_PACIFIC_SCENARIOS,
  EXPERIENCE_QUESTIONS_PT_BR,
  SUS_QUESTIONS_PT_BR,
} from '../../data/pacificRDefaults';
import { processPacificRTurn } from '../../services/pacificR/ragEngine';
import {
  computeAverage,
  computeMedian,
  computePercentile,
  computeSusScore,
} from '../../services/pacificR/metricsAndExport';
import { RealtimeAudioVisemeEngine } from '../../services/audioAndGeminiLive';
import { AvatarEngine3D } from '../stage/AvatarEngine3D';
import { AvatarEngine2D } from '../stage/AvatarEngine2D';
import { AvatarEnginePhotorealistic } from '../stage/AvatarEnginePhotorealistic';
import { AvatarEngineOrb } from '../stage/AvatarEngineOrb';
import { VoiceWaveformVisualizer } from './VoiceWaveformVisualizer';

type PilotStep = 'consent' | 'session' | 'questionnaire' | 'complete';

interface Props {
  governance: PacificGovernanceConfig;
  documents: PacificKnowledgeDoc[];
  geminiApiKey: string;
  initialCondition?: PacificInterfaceCondition;
  initialRagMode?: PacificRagMode;
  initialParticipantCode?: string;
  lockedByResearcherLink?: boolean;
  onOpenSupportModal: () => void;
  onSaveSessionRecord: (record: PacificSessionMetricRecord) => Promise<void>;
  onDeleteSessionRecord: (sessionId: string) => Promise<void>;
}

function generateAnonymousCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'PAC-';
  for (let i = 0; i < 4; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export const ParticipantPilotFlow: React.FC<Props> = ({
  governance,
  documents,
  geminiApiKey,
  initialCondition,
  initialRagMode,
  initialParticipantCode,
  lockedByResearcherLink = false,
  onOpenSupportModal,
  onSaveSessionRecord,
  onDeleteSessionRecord,
}) => {
  const [step, setStep] = useState<PilotStep>('consent');
  const [sessionId, setSessionId] = useState<string>(() => `pac-sess-${Date.now()}`);
  const [participantCode, setParticipantCode] = useState<string>(
    () => initialParticipantCode || generateAnonymousCode()
  );
  const [interfaceCondition, setInterfaceCondition] = useState<PacificInterfaceCondition>(
    initialCondition || 'voice_with_avatar'
  );
  const [ragMode, setRagMode] = useState<PacificRagMode>(initialRagMode || 'with_rag');

  // Etapa 1: Checkboxes de Consentimento (TCLE)
  const [confirmAdult, setConfirmAdult] = useState(false);
  const [confirmLimits, setConfirmLimits] = useState(false);
  const [confirmConsent, setConfirmConsent] = useState(false);
  const [consentAcceptedAt, setConsentAcceptedAt] = useState<string>('');

  // Etapa 2: Estado Efêmero da Conversa (NÃO persistido no servidor — minimização LGPD)
  const [turns, setTurns] = useState<PacificTurn[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListeningMic, setIsListeningMic] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [expandedCitations, setExpandedCitations] = useState<Record<string, boolean>>({});
  const [emotion, setEmotion] = useState<EmotionState>('neutral');
  const [gesture, setGesture] = useState<GestureState>('idle');

  // Telemetria Minimizada da Sessão
  const [ttftMsList, setTtftMsList] = useState<number[]>([]);
  const [totalSpeechMsList, setTotalSpeechMsList] = useState<number[]>([]);
  const [failureCount, setFailureCount] = useState(0);
  const [interruptionCount, setInterruptionCount] = useState(0);
  const [ragGroundedTurns, setRagGroundedTurns] = useState(0);
  const [abstentionTurns, setAbstentionTurns] = useState(0);
  const [relevanceScores, setRelevanceScores] = useState<number[]>([]);
  const [safetyTriggers, setSafetyTriggers] = useState({
    crisis: 0,
    clinicalLimit: 0,
    promptInjection: 0,
    piiMasked: 0,
  });
  const [scenariosAttempted, setScenariosAttempted] = useState<string[]>([]);
  const [sessionStatus, setSessionStatus] = useState<'in_progress' | 'completed' | 'withdrawn'>(
    'in_progress'
  );
  const [dataDeletedByUser, setDataDeletedByUser] = useState(false);

  // Etapa 3: Questionário Pós-Uso (SUS + Aceitabilidade/Experiência)
  const [susResponses, setSusResponses] = useState<number[]>(Array(10).fill(3));
  const [expResponses, setExpResponses] = useState({
    comfort: 4,
    perceivedUtility: 4,
    usageIntention: 4,
    calibratedTrust: 4,
    limitsClarity: 5,
    socialPresence: 4,
    responseQuality: 4,
  });
  const [preferredCondition, setPreferredCondition] = useState<
    PacificInterfaceCondition | 'indiferente'
  >(initialCondition || 'voice_with_avatar');
  const [voluntaryComment, setVoluntaryComment] = useState('');

  const audioEngineRef = useRef<RealtimeAudioVisemeEngine | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const dialogueEndRef = useRef<HTMLDivElement | null>(null);
  const createdAtRef = useRef<string>(new Date().toISOString());

  if (!audioEngineRef.current) {
    audioEngineRef.current = new RealtimeAudioVisemeEngine();
  }

  const pacificAvatar = useMemo(
    () =>
      buildPacificRAvatarProfile(
        governance.avatarVisualMode,
        governance.avatarVoiceName
      ),
    [governance.avatarVisualMode, governance.avatarVoiceName]
  );

  useEffect(() => {
    const audio = audioEngineRef.current;
    if (audio && geminiApiKey) {
      audio.setApiKey(geminiApiKey);
    }
  }, [geminiApiKey]);

  useEffect(() => {
    const timer = setInterval(() => {
      const audio = audioEngineRef.current;
      if (audio) {
        setIsSpeaking(audio.getIsSpeaking());
      }
    }, 120);
    return () => {
      clearInterval(timer);
      audioEngineRef.current?.interrupt();
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore
      }
    };
  }, []);

  useEffect(() => {
    dialogueEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  const getVisemes = useCallback((dt: number): VisemeWeights => {
    return (
      audioEngineRef.current?.sampleVisemes(dt) || {
        jawOpen: 0,
        mouthSmile: 0.14,
        mouthRound: 0,
        mouthWide: 0.08,
        browLift: 0,
        eyeBlink: 0,
        energy: 0,
        pitchHz: 0,
        dominantBand: 'silent',
      }
    );
  }, []);

  const buildCurrentMetricRecord = useCallback(
    (
      overrideStatus?: 'in_progress' | 'completed' | 'withdrawn',
      questionnaire?: PacificPostQuestionnaire
    ): PacificSessionMetricRecord => {
      const finalStatus = overrideStatus || sessionStatus;
      return {
        sessionId,
        participantCode,
        createdAt: createdAtRef.current,
        completedAt:
          finalStatus === 'completed' || finalStatus === 'withdrawn'
            ? new Date().toISOString()
            : undefined,
        status: finalStatus,
        isPrototypeSandbox: governance.cepStatus !== 'approved',
        interfaceCondition,
        ragMode,
        providerUsed: governance.providerMode,
        consentAcceptedAt: consentAcceptedAt || new Date().toISOString(),
        turnCount: ttftMsList.length,
        ttftMsList,
        totalSpeechMsList,
        medianTtftMs: computeMedian(ttftMsList),
        p95TtftMs: computePercentile(ttftMsList, 95),
        avgSpeechMs: Math.round(computeAverage(totalSpeechMsList)),
        failureCount,
        interruptionCount,
        ragGroundedTurns,
        abstentionTurns,
        avgRelevanceScore: computeAverage(relevanceScores),
        safetyTriggers,
        scenariosAttempted,
        questionnaire,
      };
    },
    [
      abstentionTurns,
      consentAcceptedAt,
      failureCount,
      governance.cepStatus,
      governance.providerMode,
      interfaceCondition,
      interruptionCount,
      participantCode,
      ragGroundedTurns,
      ragMode,
      relevanceScores,
      safetyTriggers,
      scenariosAttempted,
      sessionId,
      sessionStatus,
      totalSpeechMsList,
      ttftMsList,
    ]
  );

  const handleStartSession = () => {
    const nowIso = new Date().toISOString();
    createdAtRef.current = nowIso;
    setConsentAcceptedAt(nowIso);
    setSessionStatus('in_progress');
    setDataDeletedByUser(false);
    setTurns([
      {
        id: 'pr-welcome',
        timestamp: new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        speaker: 'assistant',
        text: pacificAvatar.greetingMessage,
        emotion: 'empathetic',
        gesture: 'wave',
      },
    ]);
    setStep('session');

    if (interfaceCondition !== 'text_only' && !isMuted) {
      audioEngineRef.current?.initAudioContext();
      setEmotion('empathetic');
      setGesture('wave');
      void audioEngineRef.current?.speakWithVisemes(
        pacificAvatar.greetingMessage,
        governance.avatarVoiceName,
        () => {
          setEmotion('neutral');
          setGesture('idle');
        }
      );
    }
  };

  const handleInterruptSpeech = () => {
    audioEngineRef.current?.interrupt();
    setIsSpeaking(false);
    setEmotion('neutral');
    setGesture('idle');
    setInterruptionCount((c) => c + 1);
  };

  const handleSendMessage = async (overrideText?: string, scenarioCode?: string) => {
    const raw = (overrideText ?? inputText).trim();
    if (!raw || isProcessing) return;
    if (!overrideText) setInputText('');

    if (scenarioCode) {
      setScenariosAttempted((prev) =>
        prev.includes(scenarioCode) ? prev : [...prev, scenarioCode]
      );
    }

    if (isSpeaking) {
      handleInterruptSpeech();
    }

    const nowTime = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    setTurns((prev) => [
      ...prev,
      {
        id: `pr-u-${Date.now()}`,
        timestamp: nowTime,
        speaker: 'participant',
        text: raw,
      },
    ]);

    setIsProcessing(true);
    setEmotion('thinking');
    setGesture('nod');

    try {
      const result = await processPacificRTurn({
        userText: raw,
        ragMode,
        governance,
        documents,
        geminiApiKey,
      });

      setTtftMsList((prev) => [...prev, result.ttftMs]);
      if (result.failed) setFailureCount((c) => c + 1);
      if (result.citations.length > 0) {
        setRagGroundedTurns((c) => c + 1);
        setRelevanceScores((prev) => [...prev, result.topRelevanceScore]);
      }
      if (result.abstained) {
        setAbstentionTurns((c) => c + 1);
      }
      if (result.safetyVerdict === 'crisis_contingency') {
        setSafetyTriggers((s) => ({ ...s, crisis: s.crisis + 1 }));
      } else if (result.safetyVerdict === 'clinical_limit_refusal') {
        setSafetyTriggers((s) => ({ ...s, clinicalLimit: s.clinicalLimit + 1 }));
      } else if (result.safetyVerdict === 'prompt_injection_blocked') {
        setSafetyTriggers((s) => ({ ...s, promptInjection: s.promptInjection + 1 }));
      } else if (result.safetyVerdict === 'pii_masked') {
        setSafetyTriggers((s) => ({ ...s, piiMasked: s.piiMasked + 1 }));
      }

      const assistantTurnId = `pr-a-${Date.now()}`;
      setTurns((prev) => [
        ...prev,
        {
          id: assistantTurnId,
          timestamp: new Date().toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          speaker: 'assistant',
          text: result.replyText,
          citations: result.citations,
          abstained: result.abstained,
          safetyVerdict: result.safetyVerdict,
          safetyNote: result.safetyNote,
          ttftMs: result.ttftMs,
          providerUsed: result.providerUsed,
          ragUsed: result.ragUsed,
          topRelevanceScore: result.topRelevanceScore,
          emotion: result.emotion,
          gesture: result.gesture,
        },
      ]);

      setEmotion(result.emotion);
      setGesture(result.gesture);
      setIsProcessing(false);

      // Condições com voz (B: voz sem avatar, C: voz com avatar)
      if (interfaceCondition !== 'text_only' && !isMuted) {
        const audio = audioEngineRef.current;
        if (audio) {
          audio.initAudioContext();
          const speechStart = performance.now();
          await audio.speakWithVisemes(
            result.replyText,
            governance.avatarVoiceName,
            () => {
              const speechDurationMs = Math.max(200, Math.round(performance.now() - speechStart));
              setTotalSpeechMsList((prev) => [...prev, speechDurationMs]);
              setTurns((prev) =>
                prev.map((t) =>
                  t.id === assistantTurnId ? { ...t, totalSpeechMs: speechDurationMs } : t
                )
              );
              setEmotion('neutral');
              setGesture('idle');
            }
          );
        }
      }
    } catch {
      setFailureCount((c) => c + 1);
      setIsProcessing(false);
      setEmotion('neutral');
      setGesture('idle');
    }
  };

  const toggleVoiceMic = () => {
    if (isListeningMic) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore
      }
      setIsListeningMic(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert(
        'Reconhecimento de voz não suportado neste navegador. Você pode utilizar a entrada textual normalmente (acessibilidade garantida).'
      );
      return;
    }

    const rec = new SpeechRec();
    rec.lang = 'pt-BR';
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setIsListeningMic(true);
      if (isSpeaking) handleInterruptSpeech();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (ev: any) => {
      let interim = '';
      let finalText = '';
      for (let i = ev.resultIndex || 0; i < (ev.results?.length || 0); i++) {
        const res = ev.results[i];
        const txt = res?.[0]?.transcript || '';
        if (res.isFinal) finalText += txt;
        else interim += txt;
      }
      if (interim.trim()) setInputText(interim);
      if (finalText.trim()) {
        setInputText('');
        try {
          rec.stop();
        } catch {
          // Ignore
        }
        void handleSendMessage(finalText.trim());
      }
    };

    rec.onerror = () => setIsListeningMic(false);
    rec.onend = () => setIsListeningMic(false);
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      setIsListeningMic(false);
    }
  };

  const handleWithdrawNow = async () => {
    audioEngineRef.current?.interrupt();
    setSessionStatus('withdrawn');
    const record = buildCurrentMetricRecord('withdrawn');
    await onSaveSessionRecord(record);
    // Limpa imediatamente o histórico efêmero em memória
    setTurns([]);
    setStep('complete');
  };

  const handleSubmitQuestionnaire = async (e: React.FormEvent) => {
    e.preventDefault();
    const susScore = computeSusScore(susResponses);
    const questionnaire: PacificPostQuestionnaire = {
      susResponses,
      susScore,
      ...expResponses,
      preferredCondition,
      voluntaryComment: voluntaryComment.trim(),
      submittedAt: new Date().toISOString(),
    };
    setSessionStatus('completed');
    const record = buildCurrentMetricRecord('completed', questionnaire);
    await onSaveSessionRecord(record);
    // Descarta a transcrição efêmera da memória após concluir (LGPD)
    setTurns([]);
    setStep('complete');
  };

  const handleDeleteMySessionData = async () => {
    await onDeleteSessionRecord(sessionId);
    setDataDeletedByUser(true);
  };

  const handleResetNewSession = () => {
    audioEngineRef.current?.interrupt();
    setSessionId(`pac-sess-${Date.now()}`);
    if (!lockedByResearcherLink) {
      setParticipantCode(generateAnonymousCode());
    }
    setTurns([]);
    setTtftMsList([]);
    setTotalSpeechMsList([]);
    setFailureCount(0);
    setInterruptionCount(0);
    setRagGroundedTurns(0);
    setAbstentionTurns(0);
    setRelevanceScores([]);
    setSafetyTriggers({ crisis: 0, clinicalLimit: 0, promptInjection: 0, piiMasked: 0 });
    setScenariosAttempted([]);
    setSusResponses(Array(10).fill(3));
    setVoluntaryComment('');
    setConfirmAdult(false);
    setConfirmLimits(false);
    setConfirmConsent(false);
    setDataDeletedByUser(false);
    setSessionStatus('in_progress');
    setStep('consent');
  };

  const renderPacificAvatar = () => {
    switch (pacificAvatar.visualMode) {
      case '3d':
        return (
          <AvatarEngine3D
            avatar={pacificAvatar}
            emotion={emotion}
            gesture={gesture}
            getVisemes={getVisemes}
          />
        );
      case '2d':
        return (
          <AvatarEngine2D
            avatar={pacificAvatar}
            emotion={emotion}
            gesture={gesture}
            getVisemes={getVisemes}
          />
        );
      case 'orb':
        return (
          <AvatarEngineOrb
            avatar={pacificAvatar}
            emotion={emotion}
            gesture={gesture}
            getVisemes={getVisemes}
          />
        );
      case 'photorealistic':
      default:
        return (
          <AvatarEnginePhotorealistic
            avatar={pacificAvatar}
            emotion={emotion}
            gesture={gesture}
            getVisemes={getVisemes}
          />
        );
    }
  };

  const latestAssistantTurn = [...turns].reverse().find((t) => t.speaker === 'assistant');

  return (
    <div>
      {/* Indicador de Etapas da Sessão Piloto */}
      <nav className="pr-stepper" aria-label="Etapas da sessão piloto PACIFIC-R">
        {[
          { id: 'consent', num: '1', label: 'Informações e TCLE' },
          { id: 'session', num: '2', label: 'Sessão com Cenários' },
          { id: 'questionnaire', num: '3', label: 'Questionário Pós-Uso (SUS)' },
          { id: 'complete', num: '4', label: 'Encerramento e LGPD' },
        ].map((item, idx) => {
          const order: PilotStep[] = ['consent', 'session', 'questionnaire', 'complete'];
          const currentIdx = order.indexOf(step);
          const cls =
            idx === currentIdx ? 'active' : idx < currentIdx ? 'done' : '';
          return (
            <div key={item.id} className={`pr-step-pill ${cls}`}>
              <span>{idx < currentIdx ? '✓' : item.num}</span>
              <span>{item.label}</span>
            </div>
          );
        })}
      </nav>

      {/* ================================================================
          ETAPA 1: BOAS-VINDAS, TRANSPARÊNCIA, LIMITES E TCLE DIGITAL
         ================================================================ */}
      {step === 'consent' && (
        <div className="pr-consent-grid">
          <section className="pr-card">
            <h2 className="pr-card-title">
              <FileCheck2 size={20} color="#0f6260" />
              <span>Termo de Informações e Consentimento (TCLE — Protótipo PACIFIC-R)</span>
            </h2>
            <p className="pr-card-desc">
              Você está convidado(a) a testar um protótipo de pesquisa aplicada em Ciência da
              Computação ({governance.icexUnit}) voltado à psicoeducação e ao bem-estar emocional.
              Antes de começar, leia com atenção os pontos abaixo:
            </p>

            <div className="pr-tcle-list">
              <div className="pr-tcle-item">
                <Info size={18} color="#0f6260" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Interação com Inteligência Artificial (sem vínculo clínico):</strong> você
                  interagirá com um sistema de IA. Ele <strong>não é terapeuta</strong>, não possui
                  sentimentos humanos, não realiza diagnóstico, não prescreve medicamentos e não
                  substitui atendimento psicológico ou psiquiátrico.
                </div>
              </div>
              <div className="pr-tcle-item">
                <BookOpen size={18} color="#0f6260" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Cenários padronizados (sem relato pessoal obrigatório):</strong> a sessão
                  é curta e baseada em cenários educativos padronizados. Você <strong>não precisa</strong>{' '}
                  compartilhar histórias pessoais ou sofrimento emocional.
                </div>
              </div>
              <div className="pr-tcle-item">
                <ShieldCheck size={18} color="#0f6260" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Privacidade e Minimização LGPD ({governance.ethicalFramework}):</strong> sua
                  sessão usa o código anônimo <strong>{participantCode}</strong>. Apenas métricas
                  técnicas (tempo de resposta, citações) e o questionário pós-uso são registrados.
                  O texto livre da sua conversa <strong>não é gravado no servidor</strong>.
                </div>
              </div>
              <div className="pr-tcle-item">
                <HeartHandshake size={18} color="#b42318" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Participação voluntária e desistência livre:</strong> a participação não
                  tem vínculo com notas ou avaliação acadêmica. Você pode encerrar a sessão a
                  qualquer momento, excluir seus dados ao final e acessar o botão{' '}
                  <strong>Apoio Humano</strong> em caso de dúvida ou desconforto.
                </div>
              </div>
            </div>

            <label className="pr-checkbox-row">
              <input
                type="checkbox"
                checked={confirmAdult}
                onChange={(e) => setConfirmAdult(e.target.checked)}
              />
              <span>
                Declaro ter 18 anos ou mais e participar de forma totalmente voluntária, ciente de
                que posso desistir a qualquer momento sem qualquer penalidade.
              </span>
            </label>

            <label className="pr-checkbox-row">
              <input
                type="checkbox"
                checked={confirmLimits}
                onChange={(e) => setConfirmLimits(e.target.checked)}
              />
              <span>
                Compreendo que o PACIFIC-R é uma Inteligência Artificial de caráter informativo e
                psicoeducativo, sem finalidade diagnóstica, prescritiva ou terapêutica.
              </span>
            </label>

            <label className="pr-checkbox-row">
              <input
                type="checkbox"
                checked={confirmConsent}
                onChange={(e) => setConfirmConsent(e.target.checked)}
              />
              <span>
                Concordo com o registro minimizado e anônimo das métricas técnicas desta sessão e do
                questionário pós-uso para fins de pesquisa acadêmica, sob o código{' '}
                <strong>{participantCode}</strong>.
              </span>
            </label>

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="pr-btn pr-btn-primary"
                disabled={!confirmAdult || !confirmLimits || !confirmConsent}
                onClick={handleStartSession}
              >
                <CheckCircle2 size={16} />
                <span>Concordo e Iniciar Sessão</span>
              </button>
              <button
                type="button"
                className="pr-btn pr-btn-help"
                onClick={onOpenSupportModal}
              >
                <HeartHandshake size={16} />
                <span>Ver Canais de Apoio Humano</span>
              </button>
            </div>
          </section>

          <aside className="pr-card">
            <h3 className="pr-card-title">
              <Sparkles size={18} color="#0f6260" />
              <span>Configuração Experimental da Sessão</span>
            </h3>
            <p className="pr-card-desc">
              {lockedByResearcherLink
                ? 'Condição experimental atribuída automaticamente pelo link do pesquisador (H1 / H5).'
                : 'Modo de demonstração / teste: selecione a condição experimental (H1 e H5) para avaliação.'}
            </p>

            <div className="pr-field" style={{ marginBottom: '12px' }}>
              <label htmlFor="pr-participant-code">Código Anônimo do Participante</label>
              <input
                id="pr-participant-code"
                type="text"
                className="pr-input"
                value={participantCode}
                disabled={lockedByResearcherLink}
                onChange={(e) => setParticipantCode(e.target.value.toUpperCase())}
              />
            </div>

            <div className="pr-field" style={{ marginBottom: '12px' }}>
              <label>Modalidade de Interface (Hipótese H5)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(['text_only', 'voice_no_avatar', 'voice_with_avatar'] as PacificInterfaceCondition[]).map(
                  (cond) => {
                    const info = CONDITION_LABELS[cond];
                    const disabled = lockedByResearcherLink || !governance.allowDemoConditionSelector;
                    return (
                      <button
                        key={cond}
                        type="button"
                        disabled={disabled && interfaceCondition !== cond}
                        className={`pr-cond-option ${interfaceCondition === cond ? 'selected' : ''}`}
                        onClick={() => {
                          if (!disabled) {
                            setInterfaceCondition(cond);
                            setPreferredCondition(cond);
                          }
                        }}
                      >
                        <span className="pr-cond-option-title">{info.full}</span>
                        <span className="pr-cond-option-desc">{info.description}</span>
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            <div className="pr-field">
              <label>Condição Documental RAG (Hipótese H1)</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={
                    (lockedByResearcherLink || !governance.allowDemoConditionSelector) &&
                    ragMode !== 'with_rag'
                  }
                  className={`pr-btn pr-btn-sm ${ragMode === 'with_rag' ? 'pr-btn-primary' : ''}`}
                  onClick={() => {
                    if (!lockedByResearcherLink && governance.allowDemoConditionSelector) {
                      setRagMode('with_rag');
                    }
                  }}
                >
                  Com RAG + Citações Verificáveis
                </button>
                <button
                  type="button"
                  disabled={
                    (lockedByResearcherLink || !governance.allowDemoConditionSelector) &&
                    ragMode !== 'without_rag'
                  }
                  className={`pr-btn pr-btn-sm ${ragMode === 'without_rag' ? 'pr-btn-primary' : ''}`}
                  onClick={() => {
                    if (!lockedByResearcherLink && governance.allowDemoConditionSelector) {
                      setRagMode('without_rag');
                    }
                  }}
                >
                  Sem RAG (Controle H1)
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ================================================================
          ETAPA 2: SESSÃO INTERATIVA COM CENÁRIOS PADRONIZADOS
         ================================================================ */}
      {step === 'session' && (
        <div className="pr-session-grid">
          <section className="pr-stage-card" aria-label="Área de interação PACIFIC-R">
            {/* Cabeçalho de Transparência Permanente */}
            <div className="pr-stage-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span className="pr-badge pr-badge-teal">
                  IA de Psicoeducação • Não é terapeuta
                </span>
                <span className="pr-badge pr-badge-slate">
                  {CONDITION_LABELS[interfaceCondition].short}
                </span>
                <span
                  className={`pr-badge ${
                    ragMode === 'with_rag' ? 'pr-badge-green' : 'pr-badge-amber'
                  }`}
                >
                  {ragMode === 'with_rag' ? 'RAG Documental Ativo' : 'Controle sem RAG (H1)'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                {interfaceCondition !== 'text_only' && (
                  <>
                    <button
                      type="button"
                      className="pr-btn pr-btn-sm"
                      onClick={() => setShowCaptions((v) => !v)}
                      title="Alternar legendas ao vivo"
                    >
                      <span>{showCaptions ? 'Legendas: ON' : 'Legendas: OFF'}</span>
                    </button>
                    <button
                      type="button"
                      className="pr-btn pr-btn-sm"
                      onClick={() => {
                        const next = !isMuted;
                        setIsMuted(next);
                        audioEngineRef.current?.setMuted(next);
                      }}
                    >
                      {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                      <span>{isMuted ? 'Mudo' : 'Áudio'}</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="pr-btn pr-btn-sm pr-btn-help"
                  onClick={onOpenSupportModal}
                >
                  <HeartHandshake size={14} />
                  <span>Apoio Humano</span>
                </button>
              </div>
            </div>

            {/* Palco Adaptativo conforme a Condição Experimental (H5) */}
            {interfaceCondition === 'voice_with_avatar' && (
              <div className="pr-avatar-stage-box">
                {renderPacificAvatar()}
                {showCaptions && latestAssistantTurn && (
                  <div className="pr-live-caption-bar" aria-live="polite">
                    <strong>Clara (IA): </strong>
                    {latestAssistantTurn.text}
                  </div>
                )}
              </div>
            )}

            {interfaceCondition === 'voice_no_avatar' && (
              <VoiceWaveformVisualizer
                isSpeaking={isSpeaking}
                isListening={isListeningMic}
                isProcessing={isProcessing}
                getVisemes={getVisemes}
              />
            )}

            {/* Fluxo Conversacional Efêmero com Citações Verificáveis */}
            <div
              className={`pr-dialogue-list ${interfaceCondition === 'text_only' ? 'tall' : ''}`}
              role="log"
              aria-live="polite"
            >
              {turns.map((turn) => {
                const isCrisis = turn.safetyVerdict === 'crisis_contingency';
                const isAbstained = Boolean(turn.abstained);

                return (
                  <article
                    key={turn.id}
                    className={`pr-turn ${turn.speaker} ${
                      isCrisis ? 'crisis' : isAbstained ? 'abstained' : ''
                    }`}
                  >
                    <div className="pr-turn-meta">
                      <span>
                        <strong>
                          {turn.speaker === 'participant'
                            ? `Você (${participantCode})`
                            : 'Clara (IA PACIFIC-R)'}
                        </strong>{' '}
                        • {turn.timestamp}
                      </span>
                      {turn.speaker === 'assistant' && turn.ttftMs !== undefined && (
                        <span>
                          Início: {turn.ttftMs} ms
                          {turn.totalSpeechMs ? ` • Fala total: ${(turn.totalSpeechMs / 1000).toFixed(1)}s` : ''}
                        </span>
                      )}
                    </div>

                    <div>{turn.text}</div>

                    {/* Aviso de Contingência de Crise / Limite Clínico */}
                    {isCrisis && (
                      <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="pr-btn pr-btn-sm pr-btn-danger"
                          onClick={onOpenSupportModal}
                        >
                          <HeartHandshake size={14} />
                          <span>Abrir Contatos de Apoio Humano (CVV 188 / SAMU 192 / CAPS)</span>
                        </button>
                      </div>
                    )}

                    {/* Selo de Abstenção Documental */}
                    {isAbstained && (
                      <div style={{ marginTop: '8px' }}>
                        <span className="pr-badge pr-badge-amber">
                          <AlertTriangle size={12} />
                          <span>Abstenção explícita — sem evidência suficiente na base aprovada</span>
                        </span>
                      </div>
                    )}

                    {/* Citações Verificáveis (Documento + Seção + Versão + Trecho Expansível) */}
                    {turn.citations && turn.citations.length > 0 && (
                      <div className="pr-citations-box">
                        <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#435b57' }}>
                          FONTES CONSULTADAS ({turn.citations.length})
                        </div>
                        {turn.citations.map((cit) => {
                          const key = `${turn.id}-${cit.chunkId}`;
                          const open = Boolean(expandedCitations[key]);
                          return (
                            <div key={key} className="pr-citation-item">
                              <div className="pr-citation-head">
                                <span>
                                  {cit.docTitle} — {cit.section} ({cit.version})
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span
                                    className={`pr-badge ${
                                      cit.docStatus === 'clinically_approved'
                                        ? 'pr-badge-green'
                                        : 'pr-badge-amber'
                                    }`}
                                  >
                                    {cit.docStatus === 'clinically_approved'
                                      ? 'Revisado'
                                      : 'Rascunho • Pendente revisão especializada'}
                                  </span>
                                  <span className="pr-badge pr-badge-slate">
                                    Relevância {Math.round(cit.score * 100)}%
                                  </span>
                                  <button
                                    type="button"
                                    className="pr-btn pr-btn-sm"
                                    onClick={() =>
                                      setExpandedCitations((prev) => ({
                                        ...prev,
                                        [key]: !prev[key],
                                      }))
                                    }
                                  >
                                    {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                    <span>{open ? 'Ocultar trecho' : 'Ver trecho'}</span>
                                  </button>
                                </div>
                              </div>
                              {open && <div className="pr-citation-excerpt">{cit.excerpt}</div>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
              <div ref={dialogueEndRef} />
            </div>

            {/* Barra de Entrada (Texto + Voz quando habilitado + Interromper) */}
            <form
              className="pr-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSendMessage();
              }}
            >
              {interfaceCondition !== 'text_only' && (
                <button
                  type="button"
                  className={`pr-btn ${isListeningMic ? 'pr-btn-primary' : ''}`}
                  onClick={toggleVoiceMic}
                  title="Falar pelo microfone"
                >
                  {isListeningMic ? <Mic size={16} /> : <MicOff size={16} />}
                  <span>{isListeningMic ? 'Ouvindo...' : 'Falar'}</span>
                </button>
              )}

              {isSpeaking && (
                <button
                  type="button"
                  className="pr-btn pr-btn-help"
                  onClick={handleInterruptSpeech}
                  title="Interromper fala imediatamente"
                >
                  <Square size={14} />
                  <span>Interromper</span>
                </button>
              )}

              <input
                type="text"
                className="pr-input"
                aria-label="Digite sua mensagem educativa"
                placeholder={
                  isProcessing
                    ? 'Processando resposta fundamentada...'
                    : 'Digite sua pergunta ou escolha um cenário padronizado ao lado...'
                }
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />

              <button
                type="submit"
                className="pr-btn pr-btn-primary"
                disabled={isProcessing || !inputText.trim()}
              >
                <Send size={15} />
                <span>Enviar</span>
              </button>
            </form>
          </section>

          {/* Coluna Direita: Roteiro de Cenários Padronizados & Controles da Sessão */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="pr-card">
              <h3 className="pr-card-title">
                <MessageSquare size={18} color="#0f6260" />
                <span>Cenários Padronizados ({scenariosAttempted.length}/4)</span>
              </h3>
              <p className="pr-card-desc">
                Utilize os cenários abaixo para testar o sistema sem precisar compartilhar relatos
                pessoais de sofrimento.
              </p>

              {DEFAULT_PACIFIC_SCENARIOS.map((scen) => {
                const done = scenariosAttempted.includes(scen.code);
                return (
                  <div
                    key={scen.id}
                    className={`pr-scenario-card ${done ? 'completed' : ''}`}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px',
                      }}
                    >
                      <strong style={{ fontSize: '0.84rem' }}>
                        {scen.code} • {scen.title}
                      </strong>
                      {done && <span className="pr-badge pr-badge-green">Testado</span>}
                    </div>
                    <p style={{ fontSize: '0.76rem', color: '#435b57', marginTop: '4px' }}>
                      {scen.description}
                    </p>
                    {scen.samplePrompts.map((prompt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="pr-prompt-chip"
                        disabled={isProcessing}
                        onClick={() => void handleSendMessage(prompt, scen.code)}
                      >
                        “{prompt}”
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>

            <div className="pr-card">
              <h3 className="pr-card-title">
                <ClipboardCheck size={18} color="#0f6260" />
                <span>Concluir ou Encerrar Sessão</span>
              </h3>
              <p className="pr-card-desc">
                Quando concluir os testes desejados, avance para o questionário pós-uso (SUS e
                aceitabilidade) ou encerre agora sem penalidade.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  type="button"
                  className="pr-btn pr-btn-primary"
                  onClick={() => {
                    audioEngineRef.current?.interrupt();
                    setStep('questionnaire');
                  }}
                >
                  <ClipboardCheck size={16} />
                  <span>Ir para Questionário Pós-Uso</span>
                </button>
                <button
                  type="button"
                  className="pr-btn"
                  onClick={() => void handleWithdrawNow()}
                >
                  <LogOut size={15} />
                  <span>Desistir / Encerrar Agora (sem penalidade)</span>
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ================================================================
          ETAPA 3: QUESTIONÁRIO PÓS-USO (SUS 10 ITENS + ACEITABILIDADE)
         ================================================================ */}
      {step === 'questionnaire' && (
        <form className="pr-card" onSubmit={(e) => void handleSubmitQuestionnaire(e)}>
          <h2 className="pr-card-title">
            <ClipboardCheck size={20} color="#0f6260" />
            <span>Questionário Pós-Uso — Usabilidade (SUS) e Aceitabilidade</span>
          </h2>
          <p className="pr-card-desc">
            Avalie sua experiência na condição testada (
            <strong>{CONDITION_LABELS[interfaceCondition].full}</strong>). Escala de 1 (Discordo
            totalmente) a 5 (Concordo totalmente). Respostas registradas sob o código anônimo{' '}
            <strong>{participantCode}</strong>.
          </p>

          <h3 style={{ fontSize: '0.94rem', fontWeight: 700, margin: '14px 0 10px', color: '#0f6260' }}>
            Parte A — Escala de Usabilidade do Sistema (SUS • 10 itens)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
            {SUS_QUESTIONS_PT_BR.map((question, idx) => (
              <div key={idx} className="pr-likert-row">
                <span style={{ fontSize: '0.84rem', flex: 1, minWidth: '240px' }}>{question}</span>
                <div className="pr-likert-scale" role="radiogroup" aria-label={question}>
                  {[1, 2, 3, 4, 5].map((val) => (
                    <button
                      key={val}
                      type="button"
                      className={`pr-likert-btn ${susResponses[idx] === val ? 'selected' : ''}`}
                      onClick={() =>
                        setSusResponses((prev) => prev.map((v, i) => (i === idx ? val : v)))
                      }
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: '0.94rem', fontWeight: 700, margin: '18px 0 10px', color: '#0f6260' }}>
            Parte B — Aceitabilidade, Confiança Calibrada, Limites e Presença Social
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
            {EXPERIENCE_QUESTIONS_PT_BR.map((item) => (
              <div key={item.key} className="pr-likert-row">
                <div style={{ flex: 1, minWidth: '240px' }}>
                  <span className="pr-badge pr-badge-slate" style={{ marginBottom: '4px' }}>
                    {item.dimension}
                  </span>
                  <div style={{ fontSize: '0.84rem' }}>{item.label}</div>
                </div>
                <div className="pr-likert-scale">
                  {[1, 2, 3, 4, 5].map((val) => (
                    <button
                      key={val}
                      type="button"
                      className={`pr-likert-btn ${expResponses[item.key] === val ? 'selected' : ''}`}
                      onClick={() =>
                        setExpResponses((prev) => ({ ...prev, [item.key]: val }))
                      }
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="pr-form-grid" style={{ marginBottom: '16px' }}>
            <div className="pr-field">
              <label htmlFor="pr-pref-cond">Qual modalidade você preferiria usar neste contexto?</label>
              <select
                id="pr-pref-cond"
                className="pr-select"
                value={preferredCondition}
                onChange={(e) =>
                  setPreferredCondition(
                    e.target.value as PacificInterfaceCondition | 'indiferente'
                  )
                }
              >
                <option value="text_only">Interface Textual (somente texto)</option>
                <option value="voice_no_avatar">Voz sem Avatar</option>
                <option value="voice_with_avatar">Voz com Avatar</option>
                <option value="indiferente">Indiferente / Sem preferência</option>
              </select>
            </div>
          </div>

          <div className="pr-field" style={{ marginBottom: '18px' }}>
            <label htmlFor="pr-vol-comment">
              Comentários voluntários (opcional — evite informar dados pessoais ou relatos clínicos)
            </label>
            <textarea
              id="pr-vol-comment"
              rows={3}
              className="pr-textarea"
              placeholder="Sugestões sobre clareza das respostas, latência, conforto, citações ou problemas técnicos observados..."
              value={voluntaryComment}
              onChange={(e) => setVoluntaryComment(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="submit" className="pr-btn pr-btn-primary">
              <CheckCircle2 size={16} />
              <span>Enviar Questionário e Encerrar</span>
            </button>
            <button
              type="button"
              className="pr-btn"
              onClick={() => setStep('session')}
            >
              Voltar à Sessão
            </button>
          </div>
        </form>
      )}

      {/* ================================================================
          ETAPA 4: ENCERRAMENTO, CONTATOS DE APOIO E DIREITO LGPD DE EXCLUSÃO
         ================================================================ */}
      {step === 'complete' && (
        <div className="pr-card" style={{ maxWidth: '780px', margin: '0 auto' }}>
          <h2 className="pr-card-title">
            <CheckCircle2 size={22} color="#166534" />
            <span>
              {sessionStatus === 'withdrawn'
                ? 'Sessão Encerrada por Desistência Voluntária'
                : 'Sessão Piloto Concluída — Obrigado pela Participação'}
            </span>
          </h2>
          <p className="pr-card-desc">
            Agradecemos sua colaboração com a pesquisa aplicada <strong>PACIFIC-R</strong>. O texto
            livre da sua conversa foi descartado da memória e <strong>não foi gravado</strong> no
            servidor.
          </p>

          <div className="pr-tcle-list">
            <div className="pr-tcle-item">
              <ShieldCheck size={18} color="#0f6260" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Resumo de privacidade (LGPD):</strong> código anônimo{' '}
                <strong>{participantCode}</strong> • condição{' '}
                <strong>{CONDITION_LABELS[interfaceCondition].short}</strong> •{' '}
                {dataDeletedByUser
                  ? 'Todos os registros desta sessão foram excluídos permanentemente a seu pedido.'
                  : 'Foram salvas apenas métricas técnicas minimizadas (latência, citações, segurança) e as pontuações do questionário pós-uso.'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
            {!dataDeletedByUser ? (
              <button
                type="button"
                className="pr-btn pr-btn-help"
                onClick={() => void handleDeleteMySessionData()}
              >
                <Trash2 size={15} />
                <span>Excluir Dados Desta Sessão (LGPD)</span>
              </button>
            ) : (
              <span className="pr-badge pr-badge-green">
                ✓ Dados da sessão excluídos com sucesso
              </span>
            )}

            <button
              type="button"
              className="pr-btn"
              onClick={onOpenSupportModal}
            >
              <HeartHandshake size={15} />
              <span>Canais de Apoio Humano e Dúvidas</span>
            </button>

            <button
              type="button"
              className="pr-btn pr-btn-primary"
              onClick={handleResetNewSession}
            >
              <span>Iniciar Nova Sessão</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
