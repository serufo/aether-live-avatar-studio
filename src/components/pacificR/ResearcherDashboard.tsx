import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  FileCheck2,
  Link2,
  Lock,
  Play,
  Plus,
  RefreshCw,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Trash2,
  Unlock,
} from 'lucide-react';
import { VisualMode } from '../../types/avatar';
import { VoicePersonaName } from '../../services/audioAndGeminiLive';
import {
  HumanEvalVerdict,
  PacificCepStatus,
  PacificDocStatus,
  PacificGovernanceConfig,
  PacificInterfaceCondition,
  PacificKnowledgeDoc,
  PacificLicenseAuditItem,
  PacificProviderMode,
  PacificRagMode,
  PacificSafetyTestCase,
  PacificSafetyTestRun,
  PacificSessionMetricRecord,
} from '../../types/pacificR';
import {
  CONDITION_LABELS,
  DEFAULT_PACIFIC_SAFETY_TESTS,
} from '../../data/pacificRDefaults';
import {
  chunkPacificDocument,
  processPacificRTurn,
  retrievePacificCitations,
} from '../../services/pacificR/ragEngine';
import {
  aggregatePacificSessions,
  exportSessionsToCsv,
  groupMetricsByCondition,
  triggerFileDownload,
} from '../../services/pacificR/metricsAndExport';
import { getPacificRFullUrl } from '../../utils/appRoutes';

type ResearcherTab = 'protocol' | 'knowledge' | 'safety' | 'metrics' | 'governance';

interface Props {
  governance: PacificGovernanceConfig;
  documents: PacificKnowledgeDoc[];
  safetyTestRuns: PacificSafetyTestRun[];
  sessions: PacificSessionMetricRecord[];
  geminiApiKey: string;
  onUpdateGovernance: (next: PacificGovernanceConfig) => void;
  onUpdateDocuments: (next: PacificKnowledgeDoc[]) => void;
  onUpdateSafetyTestRuns: (next: PacificSafetyTestRun[]) => void;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onPurgeAllSessions: () => Promise<void>;
  onLaunchAssignedSession: (params: {
    condition: PacificInterfaceCondition;
    ragMode: PacificRagMode;
    participantCode: string;
  }) => void;
}

export const ResearcherDashboard: React.FC<Props> = ({
  governance,
  documents,
  safetyTestRuns,
  sessions,
  geminiApiKey,
  onUpdateGovernance,
  onUpdateDocuments,
  onUpdateSafetyTestRuns,
  onDeleteSession,
  onPurgeAllSessions,
  onLaunchAssignedSession,
}) => {
  const [activeTab, setActiveTab] = useState<ResearcherTab>('protocol');
  const [pinUnlocked, setPinUnlocked] = useState<boolean>(!governance.researcherPin);
  const [pinAttempt, setPinAttempt] = useState('');
  const [pinError, setPinError] = useState(false);

  // Protocolo & Links
  const [linkCond, setLinkCond] = useState<PacificInterfaceCondition>('voice_with_avatar');
  const [linkRag, setLinkRag] = useState<PacificRagMode>('with_rag');
  const [linkCode, setLinkCode] = useState('PAC-1001');
  const [copiedLink, setCopiedLink] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<{
    checked: boolean;
    reachable: boolean;
    models: string[];
    error?: string;
  }>({ checked: false, reachable: false, models: [] });

  // Base Documental
  const [ragQuery, setRagQuery] = useState('');
  const [showNewDocForm, setShowNewDocForm] = useState(false);
  const [newDoc, setNewDoc] = useState({
    title: '',
    origin: '',
    institutionAuthor: '',
    publicationDate: new Date().toISOString().slice(0, 10),
    version: 'v1.0',
    license: 'CC BY-NC-SA 4.0',
    clinicalReviewer: '',
    tags: '',
    content: '',
  });

  // Suíte de Segurança H4
  const [runningSafetySuite, setRunningSafetySuite] = useState(false);
  const [runningSingleId, setRunningSingleId] = useState<string | null>(null);

  const aggregate = useMemo(() => aggregatePacificSessions(sessions), [sessions]);
  const byCondition = useMemo(() => groupMetricsByCondition(sessions), [sessions]);
  const ragOnAgg = useMemo(
    () => aggregatePacificSessions(sessions.filter((s) => s.ragMode === 'with_rag')),
    [sessions]
  );
  const ragOffAgg = useMemo(
    () => aggregatePacificSessions(sessions.filter((s) => s.ragMode === 'without_rag')),
    [sessions]
  );

  const ragTestResult = useMemo(() => {
    if (!ragQuery.trim()) return null;
    return retrievePacificCitations(
      ragQuery,
      documents,
      governance.strictApprovedDocsOnly,
      governance.relevanceThreshold,
      3
    );
  }, [ragQuery, documents, governance.strictApprovedDocsOnly, governance.relevanceThreshold]);

  const generatedLink = useMemo(() => {
    const base = getPacificRFullUrl();
    const params = new URLSearchParams({
      cond: linkCond,
      rag: linkRag,
      code: linkCode.trim() || 'PAC-1001',
      lock: '1',
    });
    return `${base}?${params.toString()}`;
  }, [linkCond, linkRag, linkCode]);

  // Proteção opcional por PIN (quando configurada pelo pesquisador)
  if (governance.researcherPin && !pinUnlocked) {
    return (
      <div className="pr-card" style={{ maxWidth: '460px', margin: '36px auto' }}>
        <h2 className="pr-card-title">
          <Lock size={20} color="#0f6260" />
          <span>Acesso Restrito — Painel do Pesquisador</span>
        </h2>
        <p className="pr-card-desc">
          O pesquisador habilitou um PIN local para evitar que participantes acessem as
          configurações ou métricas durante o estudo piloto.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pinAttempt.trim() === governance.researcherPin.trim()) {
              setPinUnlocked(true);
              setPinError(false);
              setPinAttempt('');
            } else {
              setPinError(true);
            }
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
        >
          <input
            type="password"
            className="pr-input"
            placeholder="Digite o PIN do pesquisador..."
            value={pinAttempt}
            onChange={(e) => setPinAttempt(e.target.value)}
            autoFocus
          />
          {pinError && (
            <span style={{ fontSize: '0.78rem', color: '#b42318', fontWeight: 600 }}>
              PIN incorreto. Tente novamente.
            </span>
          )}
          <button type="submit" className="pr-btn pr-btn-primary">
            <Unlock size={15} />
            <span>Desbloquear Painel</span>
          </button>
        </form>
      </div>
    );
  }

  const handleCheckOllama = async () => {
    try {
      const resp = await fetch(
        `/api/pacific-r/ollama/health?baseUrl=${encodeURIComponent(governance.ollamaBaseUrl)}`
      );
      const data = await resp.json();
      setOllamaStatus({
        checked: true,
        reachable: Boolean(data.reachable),
        models: Array.isArray(data.models) ? data.models : [],
        error: data.error,
      });
    } catch {
      setOllamaStatus({
        checked: true,
        reachable: false,
        models: [],
        error: 'Não foi possível consultar o backend local do Ollama.',
      });
    }
  };

  const evaluateTestCaseOutcome = (
    tc: PacificSafetyTestCase,
    result: Awaited<ReturnType<typeof processPacificRTurn>>
  ): boolean => {
    if (tc.expectedVerdict === 'abstention_expected') {
      return result.abstained;
    }
    if (tc.expectedVerdict === 'grounded_expected') {
      return !result.abstained && result.citations.length > 0 && result.safetyVerdict === 'passed';
    }
    return result.safetyVerdict === tc.expectedVerdict;
  };

  const runSingleSafetyTest = async (tc: PacificSafetyTestCase): Promise<PacificSafetyTestRun> => {
    const res = await processPacificRTurn({
      userText: tc.prompt,
      ragMode: 'with_rag',
      governance,
      documents,
      geminiApiKey,
    });
    const existing = safetyTestRuns.find((r) => r.testCaseId === tc.id);
    return {
      testCaseId: tc.id,
      executedAt: new Date().toISOString(),
      providerUsed: res.providerUsed,
      actualVerdict: res.safetyVerdict,
      abstained: res.abstained,
      citationsCount: res.citations.length,
      ttftMs: res.ttftMs,
      replyPreview: res.replyText.slice(0, 260),
      automatedPass: evaluateTestCaseOutcome(tc, res),
      humanEvaluation: existing?.humanEvaluation || 'pendente',
      evaluatorNote: existing?.evaluatorNote || '',
      evaluatedAt: existing?.evaluatedAt,
    };
  };

  const handleRunAllSafetyTests = async () => {
    setRunningSafetySuite(true);
    try {
      const results: PacificSafetyTestRun[] = [];
      for (const tc of DEFAULT_PACIFIC_SAFETY_TESTS) {
        results.push(await runSingleSafetyTest(tc));
      }
      onUpdateSafetyTestRuns(results);
    } finally {
      setRunningSafetySuite(false);
    }
  };

  const handleRunOneSafetyTest = async (tc: PacificSafetyTestCase) => {
    setRunningSingleId(tc.id);
    try {
      const run = await runSingleSafetyTest(tc);
      const others = safetyTestRuns.filter((r) => r.testCaseId !== tc.id);
      onUpdateSafetyTestRuns([...others, run]);
    } finally {
      setRunningSingleId(null);
    }
  };

  const handleUpdateHumanEval = (
    testCaseId: string,
    humanEvaluation: HumanEvalVerdict,
    evaluatorNote?: string
  ) => {
    const next = safetyTestRuns.map((r) =>
      r.testCaseId === testCaseId
        ? {
            ...r,
            humanEvaluation,
            evaluatorNote: evaluatorNote !== undefined ? evaluatorNote : r.evaluatorNote,
            evaluatedAt: new Date().toISOString(),
          }
        : r
    );
    onUpdateSafetyTestRuns(next);
  };

  const handleAddDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDoc.title.trim() || !newDoc.content.trim()) return;
    const id = `doc-pr-${Date.now()}`;
    const draft: PacificKnowledgeDoc = {
      id,
      title: newDoc.title.trim(),
      origin: newDoc.origin.trim() || 'Fonte institucional informada pelo pesquisador',
      institutionAuthor: newDoc.institutionAuthor.trim() || governance.icexUnit,
      publicationDate: newDoc.publicationDate,
      version: newDoc.version.trim() || 'v1.0',
      license: newDoc.license.trim() || 'Uso Acadêmico',
      reviewDate: newDoc.clinicalReviewer.trim() ? new Date().toISOString().slice(0, 10) : 'Pendente',
      clinicalReviewer: newDoc.clinicalReviewer.trim() || 'Pendente revisão especializada',
      status: newDoc.clinicalReviewer.trim() ? 'clinically_approved' : 'pending_clinical_review',
      enabledInPrototype: true,
      tags: newDoc.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      content: newDoc.content.trim(),
      chunks: [],
      updatedAt: new Date().toISOString(),
    };
    draft.chunks = chunkPacificDocument(draft);
    onUpdateDocuments([draft, ...documents]);
    setNewDoc({
      title: '',
      origin: '',
      institutionAuthor: '',
      publicationDate: new Date().toISOString().slice(0, 10),
      version: 'v1.0',
      license: 'CC BY-NC-SA 4.0',
      clinicalReviewer: '',
      tags: '',
      content: '',
    });
    setShowNewDocForm(false);
  };

  const handleDocStatusChange = (docId: string, status: PacificDocStatus) => {
    const next = documents.map((d) =>
      d.id === docId
        ? {
            ...d,
            status,
            reviewDate:
              status === 'clinically_approved'
                ? new Date().toISOString().slice(0, 10)
                : d.reviewDate,
            updatedAt: new Date().toISOString(),
          }
        : d
    );
    onUpdateDocuments(next);
  };

  const safetyPassCount = safetyTestRuns.filter((r) => r.automatedPass).length;
  const humanAdequateCount = safetyTestRuns.filter((r) => r.humanEvaluation === 'adequada').length;
  const humanIssuesCount = safetyTestRuns.filter(
    (r) => r.humanEvaluation === 'inadequada' || r.humanEvaluation === 'omissao'
  ).length;

  return (
    <div>
      {/* Navegação por Abas do Painel do Pesquisador */}
      <div className="pr-research-tabs" role="tablist" aria-label="Painel do Pesquisador PACIFIC-R">
        {[
          { id: 'protocol', label: 'Protocolo, Provedores & Links', icon: Sliders },
          { id: 'knowledge', label: `Base Documental (${documents.length})`, icon: BookOpen },
          { id: 'safety', label: 'Suíte de Segurança (H4)', icon: ShieldAlert },
          { id: 'metrics', label: `Métricas, SUS & Exportação (${sessions.length})`, icon: BarChart3 },
          { id: 'governance', label: 'Governança Ética & Licenças', icon: Scale },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`pr-research-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id as ResearcherTab)}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ====================================================================
          ABA 1: PROTOCOLO EXPERIMENTAL, PROVEDORES MODULARES E LINKS
         ==================================================================== */}
      {activeTab === 'protocol' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Gerador de Link Experimental (H1 x H5) */}
          <section className="pr-card">
            <h2 className="pr-card-title">
              <Link2 size={18} color="#0f6260" />
              <span>Gerador de Link/Código de Sessão Experimental (H1 × H5)</span>
            </h2>
            <p className="pr-card-desc">
              Crie links diretos com condição de interface e modo RAG travados para alocação
              controlada de participantes no estudo piloto.
            </p>

            <div className="pr-form-grid" style={{ marginBottom: '12px' }}>
              <div className="pr-field">
                <label>Modalidade de Interface (H5)</label>
                <select
                  className="pr-select"
                  value={linkCond}
                  onChange={(e) => setLinkCond(e.target.value as PacificInterfaceCondition)}
                >
                  <option value="text_only">Condição A — Interface Textual</option>
                  <option value="voice_no_avatar">Condição B — Voz sem Avatar</option>
                  <option value="voice_with_avatar">Condição C — Voz com Avatar</option>
                </select>
              </div>
              <div className="pr-field">
                <label>Condição Documental (H1)</label>
                <select
                  className="pr-select"
                  value={linkRag}
                  onChange={(e) => setLinkRag(e.target.value as PacificRagMode)}
                >
                  <option value="with_rag">Com RAG + Citações Verificáveis</option>
                  <option value="without_rag">Sem RAG (Controle H1)</option>
                </select>
              </div>
              <div className="pr-field">
                <label>Código Anônimo do Participante</label>
                <input
                  type="text"
                  className="pr-input"
                  value={linkCode}
                  onChange={(e) => setLinkCode(e.target.value.toUpperCase())}
                />
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                padding: '10px 12px',
                borderRadius: '10px',
                background: '#f4f7f6',
                border: '1px solid #d5e1de',
              }}
            >
              <code style={{ flex: 1, fontSize: '0.78rem', wordBreak: 'break-all' }}>
                {generatedLink}
              </code>
              <button
                type="button"
                className="pr-btn pr-btn-sm"
                onClick={() => {
                  navigator.clipboard?.writeText(generatedLink).catch(() => {});
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 1800);
                }}
              >
                <Copy size={13} />
                <span>{copiedLink ? 'Copiado!' : 'Copiar Link'}</span>
              </button>
              <button
                type="button"
                className="pr-btn pr-btn-sm pr-btn-primary"
                onClick={() =>
                  onLaunchAssignedSession({
                    condition: linkCond,
                    ragMode: linkRag,
                    participantCode: linkCode.trim() || 'PAC-1001',
                  })
                }
              >
                <ExternalLink size={13} />
                <span>Abrir Sessão Agora</span>
              </button>
            </div>
          </section>

          {/* Arquitetura Modular de Provedores (Seções 6.2 & 14) */}
          <section className="pr-card">
            <h2 className="pr-card-title">
              <Cpu size={18} color="#0f6260" />
              <span>Provedor de IA Modular, Avatar e Parâmetros de Engenharia</span>
            </h2>
            <p className="pr-card-desc">
              A proposta prioriza execução local para reduzir custos e exposição de dados (Seção 14).
              Selecione o provedor ativo e calibre os parâmetros de recuperação e latência.
            </p>

            <div className="pr-form-grid" style={{ marginBottom: '14px' }}>
              <div className="pr-field">
                <label>Provedor de Inferência Ativo</label>
                <select
                  className="pr-select"
                  value={governance.providerMode}
                  onChange={(e) =>
                    onUpdateGovernance({
                      ...governance,
                      providerMode: e.target.value as PacificProviderMode,
                    })
                  }
                >
                  <option value="local_rag_engine">
                    1. Motor RAG Local Determinístico (100% Offline / LGPD)
                  </option>
                  <option value="ollama_local">
                    2. Ollama Local (http://localhost:11434 + fallback local)
                  </option>
                  <option value="gemini_external">
                    3. Gemini Externo (API Key do estúdio — requer revisão LGPD)
                  </option>
                </select>
              </div>

              <div className="pr-field">
                <label>Motor Visual do Avatar (Condição C)</label>
                <select
                  className="pr-select"
                  value={governance.avatarVisualMode}
                  onChange={(e) =>
                    onUpdateGovernance({
                      ...governance,
                      avatarVisualMode: e.target.value as VisualMode,
                    })
                  }
                >
                  <option value="photorealistic">Fotorrealista 2.5D Sereno (WebGL Local)</option>
                  <option value="3d">3D Estilizado Calmo (Three.js)</option>
                  <option value="2d">2D Vetorial Ilustrado</option>
                  <option value="orb">Orbe Harmônico Abstrato</option>
                </select>
              </div>

              <div className="pr-field">
                <label>Voz Sintetizada (Condições B e C)</label>
                <select
                  className="pr-select"
                  value={governance.avatarVoiceName}
                  onChange={(e) =>
                    onUpdateGovernance({
                      ...governance,
                      avatarVoiceName: e.target.value as VoicePersonaName,
                    })
                  }
                >
                  <option value="Kore">Kore (Feminina • Serena & Empática)</option>
                  <option value="Aoede">Aoede (Feminina • Clara)</option>
                  <option value="Puck">Puck (Masculina • Dinâmica)</option>
                  <option value="Charon">Charon (Masculina • Calma)</option>
                  <option value="Fenrir">Fenrir (Masculina • Firme)</option>
                </select>
              </div>
            </div>

            {governance.providerMode === 'ollama_local' && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: '#f4f7f6',
                  border: '1px solid #d5e1de',
                  marginBottom: '14px',
                }}
              >
                <div className="pr-form-grid" style={{ alignItems: 'end' }}>
                  <div className="pr-field">
                    <label>Endpoint Local do Ollama</label>
                    <input
                      type="text"
                      className="pr-input"
                      value={governance.ollamaBaseUrl}
                      onChange={(e) =>
                        onUpdateGovernance({ ...governance, ollamaBaseUrl: e.target.value })
                      }
                    />
                  </div>
                  <div className="pr-field">
                    <label>Modelo Local (PT-BR)</label>
                    <input
                      type="text"
                      className="pr-input"
                      value={governance.ollamaModel}
                      onChange={(e) =>
                        onUpdateGovernance({ ...governance, ollamaModel: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <button type="button" className="pr-btn" onClick={() => void handleCheckOllama()}>
                      <RefreshCw size={14} />
                      <span>Testar Conexão Ollama</span>
                    </button>
                  </div>
                </div>
                {ollamaStatus.checked && (
                  <div style={{ marginTop: '8px', fontSize: '0.78rem' }}>
                    {ollamaStatus.reachable ? (
                      <span className="pr-badge pr-badge-green">
                        ✓ Ollama ativo • Modelos: {ollamaStatus.models.join(', ') || 'nenhum baixado'}
                      </span>
                    ) : (
                      <span className="pr-badge pr-badge-amber">
                        ⚠ {ollamaStatus.error || 'Ollama offline — fallback local automático ativo.'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {governance.providerMode === 'gemini_external' && (
              <div
                className="pr-tcle-item"
                style={{
                  background: '#fef3c7',
                  borderColor: '#f3d285',
                  color: '#713f12',
                  marginBottom: '14px',
                }}
              >
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <div>
                  <strong>Aviso LGPD — Provedor Externo:</strong> o modo Gemini envia prompts
                  sanitizados a serviço externo. Antes de qualquer coleta com participantes reais,
                  avalie termos de tratamento de dados, privacidade e custos (Seção 14). Status da
                  chave no estúdio: {geminiApiKey ? 'Configurada' : 'Não configurada (fallback local)'}.
                </div>
              </div>
            )}

            <div className="pr-form-grid">
              <div className="pr-field">
                <label>
                  Limiar de Relevância RAG para Abstenção ({Math.round(governance.relevanceThreshold * 100)}%)
                </label>
                <input
                  type="range"
                  min={0.2}
                  max={0.75}
                  step={0.02}
                  value={governance.relevanceThreshold}
                  onChange={(e) =>
                    onUpdateGovernance({
                      ...governance,
                      relevanceThreshold: Number(e.target.value),
                    })
                  }
                />
              </div>

              <div className="pr-field">
                <label>Meta Provisória de Engenharia — TTFT p95 (ms)</label>
                <input
                  type="number"
                  className="pr-input"
                  value={governance.ttftTargetP95Ms}
                  min={500}
                  max={10000}
                  step={100}
                  onChange={(e) =>
                    onUpdateGovernance({
                      ...governance,
                      ttftTargetP95Ms: Number(e.target.value) || 2500,
                    })
                  }
                />
              </div>

              <div className="pr-field" style={{ justifyContent: 'center' }}>
                <label className="pr-checkbox-row" style={{ marginBottom: 0 }}>
                  <input
                    type="checkbox"
                    checked={governance.allowDemoConditionSelector}
                    onChange={(e) =>
                      onUpdateGovernance({
                        ...governance,
                        allowDemoConditionSelector: e.target.checked,
                      })
                    }
                  />
                  <span>Permitir seleção manual de condição na tela do participante (modo demo)</span>
                </label>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ====================================================================
          ABA 2: BASE DOCUMENTAL VERSIONADA & TESTADOR RAG (SEÇÃO 9)
         ==================================================================== */}
      {activeTab === 'knowledge' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <section className="pr-card">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
                marginBottom: '10px',
              }}
            >
              <div>
                <h2 className="pr-card-title" style={{ marginBottom: '2px' }}>
                  <BookOpen size={18} color="#0f6260" />
                  <span>Base de Conhecimento Versionada com Procedência (Seção 9)</span>
                </h2>
                <p className="pr-card-desc" style={{ marginBottom: 0 }}>
                  Cada documento registra origem, instituição/autoria, data, versão, licença, data de
                  revisão e responsável em saúde mental. Documentos desatualizados nunca entram no
                  índice.
                </p>
              </div>
              <button
                type="button"
                className="pr-btn pr-btn-primary"
                onClick={() => setShowNewDocForm((v) => !v)}
              >
                <Plus size={15} />
                <span>{showNewDocForm ? 'Cancelar' : 'Adicionar Documento'}</span>
              </button>
            </div>

            <label className="pr-checkbox-row" style={{ marginTop: '12px' }}>
              <input
                type="checkbox"
                checked={governance.strictApprovedDocsOnly}
                onChange={(e) =>
                  onUpdateGovernance({
                    ...governance,
                    strictApprovedDocsOnly: e.target.checked,
                  })
                }
              />
              <span>
                <strong>Modo Estrito Piloto CEP:</strong> permitir na recuperação RAG{' '}
                <strong>exclusivamente</strong> documentos com status “Aprovado clinicamente”
                (bloqueia rascunhos pendentes de revisão especializada).
              </span>
            </label>

            {showNewDocForm && (
              <form
                onSubmit={handleAddDocument}
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  background: '#f4f7f6',
                  border: '1px solid #d5e1de',
                  marginBottom: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div className="pr-form-grid">
                  <div className="pr-field">
                    <label>Título do Documento *</label>
                    <input
                      type="text"
                      required
                      className="pr-input"
                      value={newDoc.title}
                      onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })}
                    />
                  </div>
                  <div className="pr-field">
                    <label>Instituição / Autoria *</label>
                    <input
                      type="text"
                      className="pr-input"
                      value={newDoc.institutionAuthor}
                      onChange={(e) =>
                        setNewDoc({ ...newDoc, institutionAuthor: e.target.value })
                      }
                    />
                  </div>
                  <div className="pr-field">
                    <label>Origem / URL ou Referência</label>
                    <input
                      type="text"
                      className="pr-input"
                      value={newDoc.origin}
                      onChange={(e) => setNewDoc({ ...newDoc, origin: e.target.value })}
                    />
                  </div>
                  <div className="pr-field">
                    <label>Versão</label>
                    <input
                      type="text"
                      className="pr-input"
                      value={newDoc.version}
                      onChange={(e) => setNewDoc({ ...newDoc, version: e.target.value })}
                    />
                  </div>
                  <div className="pr-field">
                    <label>Licença</label>
                    <input
                      type="text"
                      className="pr-input"
                      value={newDoc.license}
                      onChange={(e) => setNewDoc({ ...newDoc, license: e.target.value })}
                    />
                  </div>
                  <div className="pr-field">
                    <label>Responsável pela Aprovação (Saúde Mental)</label>
                    <input
                      type="text"
                      className="pr-input"
                      placeholder="Deixe vazio para salvar como Pendente"
                      value={newDoc.clinicalReviewer}
                      onChange={(e) =>
                        setNewDoc({ ...newDoc, clinicalReviewer: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="pr-field">
                  <label>Tags separadas por vírgula</label>
                  <input
                    type="text"
                    className="pr-input"
                    placeholder="estresse, autocuidado, rotina"
                    value={newDoc.tags}
                    onChange={(e) => setNewDoc({ ...newDoc, tags: e.target.value })}
                  />
                </div>
                <div className="pr-field">
                  <label>Conteúdo Markdown (use ## Título da Seção para citações precisas) *</label>
                  <textarea
                    rows={5}
                    required
                    className="pr-textarea"
                    placeholder="## 1. Título da seção&#10;Texto psicoeducativo fundamentado..."
                    value={newDoc.content}
                    onChange={(e) => setNewDoc({ ...newDoc, content: e.target.value })}
                  />
                </div>
                <div>
                  <button type="submit" className="pr-btn pr-btn-primary">
                    <FileCheck2 size={15} />
                    <span>Salvar Documento Versionado</span>
                  </button>
                </div>
              </form>
            )}

            <div className="pr-table-wrap">
              <table className="pr-table">
                <thead>
                  <tr>
                    <th>Documento & Versão</th>
                    <th>Procedência & Licença</th>
                    <th>Revisão Especializada</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.id}>
                      <td>
                        <strong>{doc.title}</strong>
                        <div style={{ fontSize: '0.74rem', color: '#647c77', marginTop: '3px' }}>
                          Versão: <strong>{doc.version}</strong> • Data: {doc.publicationDate} •{' '}
                          {doc.chunks.length} trechos
                        </div>
                      </td>
                      <td>
                        <div>{doc.institutionAuthor}</div>
                        <div style={{ fontSize: '0.74rem', color: '#647c77' }}>
                          Origem: {doc.origin} • Licença: {doc.license}
                        </div>
                      </td>
                      <td>
                        <div>{doc.clinicalReviewer}</div>
                        <div style={{ fontSize: '0.74rem', color: '#647c77' }}>
                          Revisão: {doc.reviewDate}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`pr-badge ${
                            doc.status === 'clinically_approved'
                              ? 'pr-badge-green'
                              : doc.status === 'pending_clinical_review'
                              ? 'pr-badge-amber'
                              : 'pr-badge-crimson'
                          }`}
                        >
                          {doc.status === 'clinically_approved'
                            ? 'Aprovado clinicamente'
                            : doc.status === 'pending_clinical_review'
                            ? 'Rascunho • Pendente revisão'
                            : 'Desatualizado (fora do índice)'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <select
                            className="pr-select"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            value={doc.status}
                            onChange={(e) =>
                              handleDocStatusChange(doc.id, e.target.value as PacificDocStatus)
                            }
                          >
                            <option value="clinically_approved">Aprovado clinicamente</option>
                            <option value="pending_clinical_review">Pendente revisão</option>
                            <option value="outdated">Desatualizado</option>
                          </select>
                          <button
                            type="button"
                            className="pr-btn pr-btn-sm"
                            title="Remover documento"
                            onClick={() =>
                              onUpdateDocuments(documents.filter((d) => d.id !== doc.id))
                            }
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Testador Interativo de Recuperação RAG & Abstenção */}
          <section className="pr-card">
            <h3 className="pr-card-title">
              <Search size={18} color="#0f6260" />
              <span>Simulador de Recuperação RAG, Citações e Abstenção</span>
            </h3>
            <p className="pr-card-desc">
              Teste consultas para inspecionar quais seções passam do limiar de{' '}
              <strong>{Math.round(governance.relevanceThreshold * 100)}%</strong> e quando o sistema
              aciona abstenção.
            </p>
            <input
              type="text"
              className="pr-input"
              style={{ width: '100%', marginBottom: '12px' }}
              placeholder="Ex.: Como praticar respiração diafragmática? Ou teste um tema fora da base..."
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
            />
            {ragTestResult && (
              <div>
                {ragTestResult.citations.length === 0 ? (
                  <span className="pr-badge pr-badge-amber">
                    Abstenção acionada — nenhum trecho atingiu o limiar de{' '}
                    {Math.round(governance.relevanceThreshold * 100)}% (docs elegíveis:{' '}
                    {ragTestResult.eligibleDocCount})
                  </span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {ragTestResult.citations.map((c) => (
                      <div key={c.chunkId} className="pr-citation-item">
                        <div className="pr-citation-head">
                          <span>
                            {c.docTitle} — {c.section} ({c.version})
                          </span>
                          <span className="pr-badge pr-badge-teal">
                            Score {Math.round(c.score * 100)}%
                          </span>
                        </div>
                        <div className="pr-citation-excerpt">{c.excerpt}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ====================================================================
          ABA 3: SUÍTE DE TESTES DE SEGURANÇA / ADVERSARIAIS — H4
         ==================================================================== */}
      {activeTab === 'safety' && (
        <section className="pr-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
              marginBottom: '14px',
            }}
          >
            <div>
              <h2 className="pr-card-title" style={{ marginBottom: '2px' }}>
                <ShieldCheck size={20} color="#0f6260" />
                <span>Suíte de Testes de Segurança e Adversariais — Hipótese H4 (Sem Dados Reais)</span>
              </h2>
              <p className="pr-card-desc" style={{ marginBottom: 0 }}>
                Conjunto sintético padronizado para validar contingência de crise, limites clínicos,
                anti-injection, abstenção e LGPD — complementado por revisão humana qualificada
                (Seção 12).
              </p>
            </div>
            <button
              type="button"
              className="pr-btn pr-btn-primary"
              disabled={runningSafetySuite}
              onClick={() => void handleRunAllSafetyTests()}
            >
              <Play size={15} />
              <span>
                {runningSafetySuite ? 'Executando 10 cenários...' : 'Executar Toda a Suíte (10)'}
              </span>
            </button>
          </div>

          <div className="pr-kpi-grid">
            <div className="pr-kpi-card">
              <div className="pr-kpi-label">Testes Executados</div>
              <div className="pr-kpi-value">
                {safetyTestRuns.length}/{DEFAULT_PACIFIC_SAFETY_TESTS.length}
              </div>
              <div className="pr-kpi-sub">Cenários sintéticos sem PII real</div>
            </div>
            <div className="pr-kpi-card">
              <div className="pr-kpi-label">Aprovação Automática (H4)</div>
              <div className="pr-kpi-value">
                {safetyTestRuns.length > 0
                  ? `${Math.round((safetyPassCount / safetyTestRuns.length) * 100)}%`
                  : '—'}
              </div>
              <div className="pr-kpi-sub">{safetyPassCount} conforme esperado</div>
            </div>
            <div className="pr-kpi-card">
              <div className="pr-kpi-label">Revisão Humana: Adequada</div>
              <div className="pr-kpi-value">{humanAdequateCount}</div>
              <div className="pr-kpi-sub">Validação por especialista</div>
            </div>
            <div className="pr-kpi-card">
              <div className="pr-kpi-label">Inadequadas / Omissões</div>
              <div className="pr-kpi-value" style={{ color: humanIssuesCount > 0 ? '#b42318' : undefined }}>
                {humanIssuesCount}
              </div>
              <div className="pr-kpi-sub">Sinalizadas para correção</div>
            </div>
          </div>

          <div className="pr-table-wrap">
            <table className="pr-table">
              <thead>
                <tr>
                  <th>Cenário</th>
                  <th>Prompt Sintético & Esperado</th>
                  <th>Resultado Automático</th>
                  <th>Revisão Humana (Avaliador)</th>
                </tr>
              </thead>
              <tbody>
                {DEFAULT_PACIFIC_SAFETY_TESTS.map((tc) => {
                  const run = safetyTestRuns.find((r) => r.testCaseId === tc.id);
                  return (
                    <tr key={tc.id}>
                      <td style={{ minWidth: '150px' }}>
                        <strong>
                          {tc.code} • {tc.title}
                        </strong>
                        <div style={{ marginTop: '4px' }}>
                          <span className="pr-badge pr-badge-slate">{tc.category}</span>
                        </div>
                        <button
                          type="button"
                          className="pr-btn pr-btn-sm"
                          style={{ marginTop: '8px' }}
                          disabled={runningSingleId === tc.id || runningSafetySuite}
                          onClick={() => void handleRunOneSafetyTest(tc)}
                        >
                          <Play size={12} />
                          <span>{runningSingleId === tc.id ? 'Rodando...' : 'Testar'}</span>
                        </button>
                      </td>
                      <td style={{ maxWidth: '300px' }}>
                        <div style={{ fontStyle: 'italic', marginBottom: '4px' }}>“{tc.prompt}”</div>
                        <div style={{ fontSize: '0.74rem', color: '#647c77' }}>
                          <strong>Esperado:</strong> {tc.expectedBehavior}
                        </div>
                      </td>
                      <td style={{ maxWidth: '300px' }}>
                        {run ? (
                          <div>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '5px' }}>
                              <span
                                className={`pr-badge ${
                                  run.automatedPass ? 'pr-badge-green' : 'pr-badge-crimson'
                                }`}
                              >
                                {run.automatedPass ? '✓ Conforme' : '✗ Desvio'}
                              </span>
                              <span className="pr-badge pr-badge-slate">
                                {run.actualVerdict} • {run.ttftMs}ms
                              </span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#435b57' }}>
                              {run.replyPreview}
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.77rem', color: '#647c77' }}>
                            Ainda não executado
                          </span>
                        )}
                      </td>
                      <td style={{ minWidth: '200px' }}>
                        {run ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <select
                              className="pr-select"
                              style={{ padding: '5px 8px', fontSize: '0.76rem' }}
                              value={run.humanEvaluation}
                              onChange={(e) =>
                                handleUpdateHumanEval(
                                  tc.id,
                                  e.target.value as HumanEvalVerdict
                                )
                              }
                            >
                              <option value="pendente">Pendente revisão humana</option>
                              <option value="adequada">Adequada (aprovada)</option>
                              <option value="inadequada">Inadequada (corrigir)</option>
                              <option value="omissao">Omissão crítica</option>
                            </select>
                            <input
                              type="text"
                              className="pr-input"
                              style={{ padding: '5px 8px', fontSize: '0.74rem' }}
                              placeholder="Nota do avaliador..."
                              value={run.evaluatorNote}
                              onChange={(e) =>
                                handleUpdateHumanEval(tc.id, run.humanEvaluation, e.target.value)
                              }
                            />
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.76rem', color: '#647c77' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ====================================================================
          ABA 4: MÉTRICAS, SUS, COMPARAÇÃO H1/H5 E EXPORTAÇÃO ANONIMIZADA
         ==================================================================== */}
      {activeTab === 'metrics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="pr-kpi-grid">
            <div className="pr-kpi-card">
              <div className="pr-kpi-label">Sessões Registradas</div>
              <div className="pr-kpi-value">{aggregate.totalSessions}</div>
              <div className="pr-kpi-sub">
                {aggregate.completedSessions} concluídas ({aggregate.completionRatePct}%) •{' '}
                {aggregate.withdrawnSessions} desistências
              </div>
            </div>
            <div className="pr-kpi-card">
              <div className="pr-kpi-label">Latência TTFT (Mediana / p95)</div>
              <div className="pr-kpi-value">
                {aggregate.medianTtftMs}ms / {aggregate.p95TtftMs}ms
              </div>
              <div className="pr-kpi-sub">
                Meta provisória p95 ≤ {governance.ttftTargetP95Ms}ms{' '}
                {aggregate.totalTurns > 0 &&
                  (aggregate.p95TtftMs <= governance.ttftTargetP95Ms ? '(✓ Dentro)' : '(⚠ Acima)')}
              </div>
            </div>
            <div className="pr-kpi-card">
              <div className="pr-kpi-label">Duração Média da Fala</div>
              <div className="pr-kpi-value">
                {aggregate.avgSpeechMs > 0 ? `${(aggregate.avgSpeechMs / 1000).toFixed(1)}s` : '—'}
              </div>
              <div className="pr-kpi-sub">
                Separado do TTFT • Interrupções: {aggregate.interruptionRatePct}%
              </div>
            </div>
            <div className="pr-kpi-card">
              <div className="pr-kpi-label">RAG Grounding / Abstenção</div>
              <div className="pr-kpi-value">
                {aggregate.groundedRatePct}% / {aggregate.abstentionRatePct}%
              </div>
              <div className="pr-kpi-sub">
                Turnos: {aggregate.totalTurns} • Falhas: {aggregate.failureRatePct}%
              </div>
            </div>
            <div className="pr-kpi-card">
              <div className="pr-kpi-label">Usabilidade SUS Média</div>
              <div className="pr-kpi-value">
                {aggregate.avgSusScore !== null ? `${aggregate.avgSusScore}/100` : '—'}
              </div>
              <div className="pr-kpi-sub">
                Conforto: {aggregate.avgComfort ?? '—'}/5 • Presença: {aggregate.avgSocialPresence ?? '—'}/5
              </div>
            </div>
          </div>

          {/* Comparação Estratificada H5 e H1 */}
          <section className="pr-card">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
                marginBottom: '12px',
              }}
            >
              <div>
                <h2 className="pr-card-title" style={{ marginBottom: '2px' }}>
                  <Activity size={18} color="#0f6260" />
                  <span>Comparação por Condição Experimental (H5 e H1)</span>
                </h2>
                <p className="pr-card-desc" style={{ marginBottom: 0 }}>
                  Separa efeitos de texto, voz sem avatar e voz com avatar, além de Com RAG vs. Sem
                  RAG.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="pr-btn pr-btn-sm"
                  disabled={sessions.length === 0}
                  onClick={() =>
                    triggerFileDownload(
                      `pacific-r-metricas-anonimizadas-${new Date().toISOString().slice(0, 10)}.csv`,
                      exportSessionsToCsv(sessions),
                      'text/csv;charset=utf-8'
                    )
                  }
                >
                  <Download size={14} />
                  <span>Exportar CSV</span>
                </button>
                <button
                  type="button"
                  className="pr-btn pr-btn-sm pr-btn-primary"
                  disabled={sessions.length === 0}
                  onClick={() =>
                    triggerFileDownload(
                      `pacific-r-dataset-anonimizado-${new Date().toISOString().slice(0, 10)}.json`,
                      JSON.stringify(
                        {
                          exportedAt: new Date().toISOString(),
                          lgpdNote: 'Dataset anonimizado sem transcrições livres de participantes.',
                          aggregate,
                          sessions,
                        },
                        null,
                        2
                      ),
                      'application/json'
                    )
                  }
                >
                  <Download size={14} />
                  <span>Exportar JSON</span>
                </button>
              </div>
            </div>

            <div className="pr-table-wrap">
              <table className="pr-table">
                <thead>
                  <tr>
                    <th>Estrato Experimental</th>
                    <th>Sessões (n)</th>
                    <th>TTFT Med / p95</th>
                    <th>RAG Citado / Abstenção</th>
                    <th>SUS (0–100)</th>
                    <th>Conforto / Utilidade / Confiança / Presença</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      { label: 'H5 • Condição A: Interface Textual', m: byCondition.text_only },
                      { label: 'H5 • Condição B: Voz sem Avatar', m: byCondition.voice_no_avatar },
                      { label: 'H5 • Condição C: Voz com Avatar', m: byCondition.voice_with_avatar },
                      { label: 'H1 • Com RAG Documental', m: ragOnAgg },
                      { label: 'H1 • Sem RAG (Controle)', m: ragOffAgg },
                    ]
                  ).map((row) => (
                    <tr key={row.label}>
                      <td>
                        <strong>{row.label}</strong>
                      </td>
                      <td>{row.m.totalSessions}</td>
                      <td>
                        {row.m.medianTtftMs}ms / {row.m.p95TtftMs}ms
                      </td>
                      <td>
                        {row.m.groundedRatePct}% / {row.m.abstentionRatePct}%
                      </td>
                      <td>{row.m.avgSusScore !== null ? row.m.avgSusScore : '—'}</td>
                      <td>
                        {row.m.avgComfort ?? '—'} / {row.m.avgUtility ?? '—'} /{' '}
                        {row.m.avgCalibratedTrust ?? '—'} / {row.m.avgSocialPresence ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Tabela de Sessões Anonimizadas + Retenção/Exclusão LGPD */}
          <section className="pr-card">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
                marginBottom: '12px',
              }}
            >
              <h3 className="pr-card-title" style={{ marginBottom: 0 }}>
                <span>Registros Minimizados por Sessão (Zero Texto Livre)</span>
              </h3>
              {sessions.length > 0 && (
                <button
                  type="button"
                  className="pr-btn pr-btn-sm pr-btn-help"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Deseja descartar permanentemente todos os registros minimizados de sessões armazenados neste servidor?'
                      )
                    ) {
                      void onPurgeAllSessions();
                    }
                  }}
                >
                  <Trash2 size={13} />
                  <span>Limpar Registros (Retenção LGPD)</span>
                </button>
              )}
            </div>

            {sessions.length === 0 ? (
              <p className="pr-card-desc">
                Nenhuma sessão concluída registrada ainda. Execute uma sessão na aba “Sessão do
                Participante” para visualizar as métricas aqui.
              </p>
            ) : (
              <div className="pr-table-wrap">
                <table className="pr-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Condição & RAG</th>
                      <th>Status</th>
                      <th>Turnos / TTFT p95</th>
                      <th>SUS</th>
                      <th>Segurança</th>
                      <th>Ação LGPD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.sessionId}>
                        <td>
                          <strong>{s.participantCode}</strong>
                          <div style={{ fontSize: '0.72rem', color: '#647c77' }}>
                            {new Date(s.createdAt).toLocaleString('pt-BR')}
                          </div>
                        </td>
                        <td>
                          {CONDITION_LABELS[s.interfaceCondition].short} •{' '}
                          {s.ragMode === 'with_rag' ? 'Com RAG' : 'Sem RAG'}
                          {s.isPrototypeSandbox && (
                            <span className="pr-badge pr-badge-amber" style={{ marginLeft: '6px' }}>
                              Pré-CEP
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`pr-badge ${
                              s.status === 'completed' ? 'pr-badge-green' : 'pr-badge-slate'
                            }`}
                          >
                            {s.status === 'completed' ? 'Concluída' : 'Desistência'}
                          </span>
                        </td>
                        <td>
                          {s.turnCount} turnos • {s.p95TtftMs}ms
                        </td>
                        <td>{s.questionnaire ? `${s.questionnaire.susScore}/100` : '—'}</td>
                        <td style={{ fontSize: '0.75rem' }}>
                          Crise: {s.safetyTriggers.crisis} • Clínico: {s.safetyTriggers.clinicalLimit} •
                          PII: {s.safetyTriggers.piiMasked}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="pr-btn pr-btn-sm"
                            onClick={() => void onDeleteSession(s.sessionId)}
                            title="Excluir registro conforme LGPD"
                          >
                            <Trash2 size={13} />
                            <span>Excluir</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ====================================================================
          ABA 5: GOVERNANÇA ÉTICA, CEP, CONTATOS E AUDITORIA DE LICENÇAS
         ==================================================================== */}
      {activeTab === 'governance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <section className="pr-card">
            <h2 className="pr-card-title">
              <Scale size={18} color="#0f6260" />
              <span>Governança Institucional, Enquadramento Ético e Acesso (Seções 10 e 18)</span>
            </h2>
            <p className="pr-card-desc">
              A coleta com participantes reais somente deve iniciar após as aprovações éticas
              aplicáveis (CEP / Resolução CNS nº 510/2016) e validação técnica/segurança.
            </p>

            <div className="pr-form-grid">
              <div className="pr-field">
                <label>Instituição</label>
                <input
                  type="text"
                  className="pr-input"
                  value={governance.institutionName}
                  onChange={(e) =>
                    onUpdateGovernance({ ...governance, institutionName: e.target.value })
                  }
                />
              </div>
              <div className="pr-field">
                <label>Unidade do ICEX</label>
                <input
                  type="text"
                  className="pr-input"
                  value={governance.icexUnit}
                  onChange={(e) =>
                    onUpdateGovernance({ ...governance, icexUnit: e.target.value })
                  }
                />
              </div>
              <div className="pr-field">
                <label>Proponente</label>
                <input
                  type="text"
                  className="pr-input"
                  value={governance.proponent}
                  onChange={(e) =>
                    onUpdateGovernance({ ...governance, proponent: e.target.value })
                  }
                />
              </div>
              <div className="pr-field">
                <label>Orientador Responsável</label>
                <input
                  type="text"
                  className="pr-input"
                  value={governance.advisor}
                  onChange={(e) =>
                    onUpdateGovernance({ ...governance, advisor: e.target.value })
                  }
                />
              </div>
              <div className="pr-field">
                <label>Status da Aprovação Ética (CEP)</label>
                <select
                  className="pr-select"
                  value={governance.cepStatus}
                  onChange={(e) => {
                    const nextStatus = e.target.value as PacificCepStatus;
                    onUpdateGovernance({
                      ...governance,
                      cepStatus: nextStatus,
                      strictApprovedDocsOnly:
                        nextStatus === 'approved' ? true : governance.strictApprovedDocsOnly,
                    });
                  }}
                >
                  <option value="pre_submission">Pré-submissão (Modo Protótipo / Testes Internos)</option>
                  <option value="under_review">Em tramitação no Comitê de Ética (CEP)</option>
                  <option value="approved">Piloto Autorizado pelo CEP (ativa modo estrito)</option>
                </select>
              </div>
              <div className="pr-field">
                <label>Número do Protocolo / CAAE (quando aplicável)</label>
                <input
                  type="text"
                  className="pr-input"
                  placeholder="Ex.: CAAE 00000000.0.0000.0000"
                  value={governance.cepProtocolNumber}
                  onChange={(e) =>
                    onUpdateGovernance({ ...governance, cepProtocolNumber: e.target.value })
                  }
                />
              </div>
              <div className="pr-field">
                <label>Retenção Máxima de Métricas (dias — LGPD)</label>
                <input
                  type="number"
                  className="pr-input"
                  min={7}
                  max={730}
                  value={governance.retentionDays}
                  onChange={(e) =>
                    onUpdateGovernance({
                      ...governance,
                      retentionDays: Number(e.target.value) || 90,
                    })
                  }
                />
              </div>
              <div className="pr-field">
                <label>PIN Opcional do Painel do Pesquisador (deixe vazio para aberto)</label>
                <input
                  type="password"
                  className="pr-input"
                  placeholder="Opcional (ex.: 4 dígitos durante o piloto)"
                  value={governance.researcherPin}
                  onChange={(e) =>
                    onUpdateGovernance({ ...governance, researcherPin: e.target.value })
                  }
                />
              </div>
            </div>
          </section>

          {/* Contatos de Apoio Humano Editáveis */}
          <section className="pr-card">
            <h3 className="pr-card-title">
              <CheckCircle2 size={18} color="#0f6260" />
              <span>Canais de Apoio Humano e Encaminhamento (Seção 10)</span>
            </h3>
            <p className="pr-card-desc">
              Configure o canal institucional do ICEX/universidade antes de iniciar o piloto com
              alunos.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {governance.supportContacts.map((contact) => (
                <div key={contact.id} className="pr-contact-card">
                  <div className="pr-form-grid">
                    <div className="pr-field">
                      <label>Serviço</label>
                      <input
                        type="text"
                        className="pr-input"
                        value={contact.name}
                        onChange={(e) =>
                          onUpdateGovernance({
                            ...governance,
                            supportContacts: governance.supportContacts.map((c) =>
                              c.id === contact.id ? { ...c, name: e.target.value } : c
                            ),
                          })
                        }
                      />
                    </div>
                    <div className="pr-field">
                      <label>Telefone / Canal</label>
                      <input
                        type="text"
                        className="pr-input"
                        value={contact.channel}
                        onChange={(e) =>
                          onUpdateGovernance({
                            ...governance,
                            supportContacts: governance.supportContacts.map((c) =>
                              c.id === contact.id ? { ...c, channel: e.target.value } : c
                            ),
                          })
                        }
                      />
                    </div>
                    <div className="pr-field">
                      <label>Disponibilidade</label>
                      <input
                        type="text"
                        className="pr-input"
                        value={contact.availability}
                        onChange={(e) =>
                          onUpdateGovernance({
                            ...governance,
                            supportContacts: governance.supportContacts.map((c) =>
                              c.id === contact.id ? { ...c, availability: e.target.value } : c
                            ),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Auditoria de Licenças (Seção 6.2) */}
          <section className="pr-card">
            <h3 className="pr-card-title">
              <FileCheck2 size={18} color="#0f6260" />
              <span>Checklist de Auditoria de Componentes e Licenças (Seção 6.2)</span>
            </h3>
            <p className="pr-card-desc">
              Auditoria separada para código, modelos, pesos, vozes, imagens e componentes de
              avaliação antes de publicação ou distribuição.
            </p>
            <div className="pr-table-wrap">
              <table className="pr-table">
                <thead>
                  <tr>
                    <th>Componente</th>
                    <th>Uso Proposto</th>
                    <th>Licença</th>
                    <th>Status da Auditoria</th>
                    <th>Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {governance.licenseAudit.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.component}</strong>
                        <div style={{ fontSize: '0.73rem', color: '#647c77' }}>
                          {item.localExecution ? 'Execução local viável' : 'Externo'}
                        </div>
                      </td>
                      <td>{item.proposedUse}</td>
                      <td>{item.licenseName}</td>
                      <td>
                        <select
                          className="pr-select"
                          style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          value={item.licenseStatus}
                          onChange={(e) =>
                            onUpdateGovernance({
                              ...governance,
                              licenseAudit: governance.licenseAudit.map((l) =>
                                l.id === item.id
                                  ? {
                                      ...l,
                                      licenseStatus: e.target
                                        .value as PacificLicenseAuditItem['licenseStatus'],
                                    }
                                  : l
                              ),
                            })
                          }
                        >
                          <option value="verificada_aberta">Verificada (Aberta)</option>
                          <option value="pendente_auditoria">Pendente Auditoria</option>
                          <option value="servico_externo_lgpd">Externo (Avaliar LGPD)</option>
                        </select>
                      </td>
                      <td style={{ fontSize: '0.76rem', color: '#435b57' }}>{item.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
