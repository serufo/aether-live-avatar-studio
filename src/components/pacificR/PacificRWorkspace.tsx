import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  FlaskConical,
  HeartHandshake,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import {
  PacificGovernanceConfig,
  PacificInterfaceCondition,
  PacificKnowledgeDoc,
  PacificRagMode,
  PacificSafetyTestRun,
  PacificSessionMetricRecord,
} from '../../types/pacificR';
import {
  DEFAULT_PACIFIC_DOCUMENTS,
  DEFAULT_PACIFIC_GOVERNANCE,
} from '../../data/pacificRDefaults';
import { ensurePacificDocChunks } from '../../services/pacificR/ragEngine';
import { getPacificRPath } from '../../utils/appRoutes';
import { ParticipantPilotFlow } from './ParticipantPilotFlow';
import { ResearcherDashboard } from './ResearcherDashboard';
import { SupportContactsModal } from './SupportContactsModal';
import './pacificR.css';

type PacificSubView = 'participant' | 'researcher';

interface Props {
  geminiApiKey: string;
  onExitToAetherStudio: () => void;
}

const LOCAL_CACHE_KEY = 'pacific_r_workspace_cache_v1';

function parseUrlAllocation(): {
  subView: PacificSubView;
  condition?: PacificInterfaceCondition;
  ragMode?: PacificRagMode;
  participantCode?: string;
  locked: boolean;
} {
  if (typeof window === 'undefined') {
    return { subView: 'participant', locked: false };
  }
  const params = new URLSearchParams(window.location.search);
  const pathIsResearcher = window.location.pathname.includes('/pesquisador');
  const viewParam = params.get('view');
  const subView: PacificSubView =
    pathIsResearcher || viewParam === 'pesquisador' ? 'researcher' : 'participant';

  const rawCond = params.get('cond');
  const condition: PacificInterfaceCondition | undefined =
    rawCond === 'text_only' ||
    rawCond === 'voice_no_avatar' ||
    rawCond === 'voice_with_avatar'
      ? rawCond
      : undefined;

  const rawRag = params.get('rag');
  const ragMode: PacificRagMode | undefined =
    rawRag === 'with_rag' || rawRag === 'without_rag' ? rawRag : undefined;

  const participantCode = params.get('code')?.trim() || undefined;
  const locked = params.get('lock') === '1' || Boolean(condition && participantCode);

  return { subView, condition, ragMode, participantCode, locked };
}

export const PacificRWorkspace: React.FC<Props> = ({
  geminiApiKey,
  onExitToAetherStudio,
}) => {
  const initialAlloc = parseUrlAllocation();

  const [subView, setSubView] = useState<PacificSubView>(initialAlloc.subView);
  const [assignedSession, setAssignedSession] = useState<{
    key: number;
    condition?: PacificInterfaceCondition;
    ragMode?: PacificRagMode;
    participantCode?: string;
    locked: boolean;
  }>({
    key: 1,
    condition: initialAlloc.condition,
    ragMode: initialAlloc.ragMode,
    participantCode: initialAlloc.participantCode,
    locked: initialAlloc.locked,
  });

  const [governance, setGovernance] = useState<PacificGovernanceConfig>(() => {
    try {
      const cached = localStorage.getItem(LOCAL_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.governance) {
          return { ...DEFAULT_PACIFIC_GOVERNANCE, ...parsed.governance };
        }
      }
    } catch {
      // Fallback
    }
    return DEFAULT_PACIFIC_GOVERNANCE;
  });

  const [documents, setDocuments] = useState<PacificKnowledgeDoc[]>(() => {
    try {
      const cached = localStorage.getItem(LOCAL_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed.documents) && parsed.documents.length > 0) {
          return parsed.documents.map(ensurePacificDocChunks);
        }
      }
    } catch {
      // Fallback
    }
    return DEFAULT_PACIFIC_DOCUMENTS.map(ensurePacificDocChunks);
  });

  const [safetyTestRuns, setSafetyTestRuns] = useState<PacificSafetyTestRun[]>(() => {
    try {
      const cached = localStorage.getItem(LOCAL_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed.safetyTestRuns)) return parsed.safetyTestRuns;
      }
    } catch {
      // Fallback
    }
    return [];
  });

  const [sessions, setSessions] = useState<PacificSessionMetricRecord[]>(() => {
    try {
      const cached = localStorage.getItem(LOCAL_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed.sessions)) return parsed.sessions;
      }
    } catch {
      // Fallback
    }
    return [];
  });

  const [hydratedFromServer, setHydratedFromServer] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);

  // Carrega estado isolado do servidor (/api/pacific-r/state)
  useEffect(() => {
    let mounted = true;
    fetch('/api/pacific-r/state')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!mounted) return;
        if (data && data.initialized) {
          if (data.governance) {
            setGovernance({ ...DEFAULT_PACIFIC_GOVERNANCE, ...data.governance });
          }
          if (Array.isArray(data.documents) && data.documents.length > 0) {
            setDocuments(data.documents.map(ensurePacificDocChunks));
          }
          if (Array.isArray(data.safetyTestRuns)) {
            setSafetyTestRuns(data.safetyTestRuns);
          }
          if (Array.isArray(data.sessions)) {
            setSessions(data.sessions);
          }
        }
        setHydratedFromServer(true);
      })
      .catch(() => {
        if (mounted) setHydratedFromServer(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Persiste alterações no cache local e no backend dedicado (/api/pacific-r/state)
  const syncStateToServer = useCallback(
    (
      nextGov: PacificGovernanceConfig,
      nextDocs: PacificKnowledgeDoc[],
      nextRuns: PacificSafetyTestRun[],
      nextSessions: PacificSessionMetricRecord[]
    ) => {
      const payload = {
        governance: nextGov,
        documents: nextDocs,
        safetyTestRuns: nextRuns,
        sessions: nextSessions,
      };
      try {
        localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(payload));
      } catch {
        // Ignore quota error
      }
      if (!hydratedFromServer) return;
      fetch('/api/pacific-r/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    },
    [hydratedFromServer]
  );

  const handleUpdateGovernance = (next: PacificGovernanceConfig) => {
    setGovernance(next);
    syncStateToServer(next, documents, safetyTestRuns, sessions);
  };

  const handleUpdateDocuments = (next: PacificKnowledgeDoc[]) => {
    const chunked = next.map(ensurePacificDocChunks);
    setDocuments(chunked);
    syncStateToServer(governance, chunked, safetyTestRuns, sessions);
  };

  const handleUpdateSafetyTestRuns = (next: PacificSafetyTestRun[]) => {
    setSafetyTestRuns(next);
    syncStateToServer(governance, documents, next, sessions);
  };

  const handleSaveSessionRecord = async (record: PacificSessionMetricRecord) => {
    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.sessionId === record.sessionId);
      const next =
        idx >= 0
          ? prev.map((s) => (s.sessionId === record.sessionId ? record : s))
          : [record, ...prev];
      try {
        localStorage.setItem(
          LOCAL_CACHE_KEY,
          JSON.stringify({ governance, documents, safetyTestRuns, sessions: next })
        );
      } catch {
        // Ignore
      }
      return next;
    });

    try {
      await fetch('/api/pacific-r/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
    } catch {
      // Cache local já preservado
    }
  };

  const handleDeleteSessionRecord = async (sessionId: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.sessionId !== sessionId);
      try {
        localStorage.setItem(
          LOCAL_CACHE_KEY,
          JSON.stringify({ governance, documents, safetyTestRuns, sessions: next })
        );
      } catch {
        // Ignore
      }
      return next;
    });

    try {
      await fetch(`/api/pacific-r/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      });
    } catch {
      // Ignore
    }
  };

  const handlePurgeAllSessions = async () => {
    setSessions([]);
    try {
      localStorage.setItem(
        LOCAL_CACHE_KEY,
        JSON.stringify({ governance, documents, safetyTestRuns, sessions: [] })
      );
    } catch {
      // Ignore
    }
    try {
      await fetch('/api/pacific-r/sessions', { method: 'DELETE' });
    } catch {
      // Ignore
    }
  };

  const handleSwitchSubView = (target: PacificSubView) => {
    setSubView(target);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.pathname = getPacificRPath();
      if (target === 'researcher') {
        url.searchParams.set('view', 'pesquisador');
      } else {
        url.searchParams.delete('view');
      }
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    }
  };

  return (
    <div className="pacific-r-shell">
      {/* Barra Superior Institucional PACIFIC-R */}
      <header className="pr-topbar">
        <div className="pr-brand">
          <div className="pr-brand-mark" aria-hidden="true">
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="pr-brand-title">PACIFIC-R • Psicoeducação & Bem-Estar Emocional</div>
            <span className="pr-brand-subtitle">
              Pesquisa Aplicada ({governance.icexUnit}) • Avatar Interativo com IA e RAG Documental
            </span>
          </div>
        </div>

        <div className="pr-topbar-actions">
          <div className="pr-mode-switch" role="tablist" aria-label="Ambiente PACIFIC-R">
            <button
              type="button"
              role="tab"
              aria-selected={subView === 'participant'}
              className={`pr-mode-tab ${subView === 'participant' ? 'active' : ''}`}
              onClick={() => handleSwitchSubView('participant')}
            >
              <UserCheck size={15} />
              <span>Sessão do Participante</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subView === 'researcher'}
              className={`pr-mode-tab ${subView === 'researcher' ? 'active' : ''}`}
              onClick={() => handleSwitchSubView('researcher')}
            >
              <FlaskConical size={15} />
              <span>Painel do Pesquisador</span>
            </button>
          </div>

          <button
            type="button"
            className="pr-btn pr-btn-help pr-btn-sm"
            onClick={() => setSupportModalOpen(true)}
          >
            <HeartHandshake size={15} />
            <span>Apoio Humano (188 / CAPS)</span>
          </button>

          <button
            type="button"
            className="pr-btn pr-btn-sm"
            onClick={onExitToAetherStudio}
            title="Retornar ao Aether Live Avatar Studio"
          >
            <ArrowLeft size={14} />
            <span>Aether Studio</span>
          </button>
        </div>
      </header>

      {/* Banner Permanente de Enquadramento Ético & Transparência */}
      <div
        className={`pr-status-banner ${
          governance.cepStatus === 'approved' ? 'approved' : 'prototype'
        }`}
      >
        <div>
          {governance.cepStatus === 'approved' ? (
            <span>
              <strong>Piloto Autorizado (CEP)</strong>
              {governance.cepProtocolNumber ? ` • Protocolo: ${governance.cepProtocolNumber}` : ''} —
              Pesquisa aplicada em psicoeducação (sem diagnóstico ou atendimento clínico).
            </span>
          ) : (
            <span>
              <strong>Modo Protótipo / Pré-CEP (Testes Técnicos Internos):</strong> a coleta com
              participantes reais do ICEX está condicionada às aprovações éticas aplicáveis (
              {governance.ethicalFramework}) e à validação técnica e de segurança.
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="pr-badge pr-badge-teal">LGPD: Zero gravação de texto livre</span>
          <span className="pr-badge pr-badge-slate">
            Provedor:{' '}
            {governance.providerMode === 'local_rag_engine'
              ? 'Local Offline'
              : governance.providerMode === 'ollama_local'
              ? `Ollama (${governance.ollamaModel})`
              : 'Gemini Externo'}
          </span>
        </div>
      </div>

      {/* Área Principal */}
      <main className="pr-main">
        {subView === 'participant' ? (
          <ParticipantPilotFlow
            key={assignedSession.key}
            governance={governance}
            documents={documents}
            geminiApiKey={geminiApiKey}
            initialCondition={assignedSession.condition}
            initialRagMode={assignedSession.ragMode}
            initialParticipantCode={assignedSession.participantCode}
            lockedByResearcherLink={assignedSession.locked}
            onOpenSupportModal={() => setSupportModalOpen(true)}
            onSaveSessionRecord={handleSaveSessionRecord}
            onDeleteSessionRecord={handleDeleteSessionRecord}
          />
        ) : (
          <ResearcherDashboard
            governance={governance}
            documents={documents}
            safetyTestRuns={safetyTestRuns}
            sessions={sessions}
            geminiApiKey={geminiApiKey}
            onUpdateGovernance={handleUpdateGovernance}
            onUpdateDocuments={handleUpdateDocuments}
            onUpdateSafetyTestRuns={handleUpdateSafetyTestRuns}
            onDeleteSession={handleDeleteSessionRecord}
            onPurgeAllSessions={handlePurgeAllSessions}
            onLaunchAssignedSession={({ condition, ragMode, participantCode }) => {
              setAssignedSession((prev) => ({
                key: prev.key + 1,
                condition,
                ragMode,
                participantCode,
                locked: true,
              }));
              handleSwitchSubView('participant');
            }}
          />
        )}
      </main>

      <SupportContactsModal
        open={supportModalOpen}
        onClose={() => setSupportModalOpen(false)}
        contacts={governance.supportContacts}
      />
    </div>
  );
};
