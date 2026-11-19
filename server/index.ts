import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const SECRETS_PATH = path.join(DATA_DIR, 'secrets.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'aether-live-avatar-backend',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/key', (_req, res) => {
  try {
    if (fs.existsSync(SECRETS_PATH)) {
      const raw = JSON.parse(fs.readFileSync(SECRETS_PATH, 'utf-8'));
      res.json({ geminiApiKey: raw.geminiApiKey || '' });
      return;
    }
    res.json({ geminiApiKey: process.env.GEMINI_API_KEY || '' });
  } catch {
    res.json({ geminiApiKey: '' });
  }
});

app.post('/api/key', (req, res) => {
  try {
    const geminiApiKey = String(req.body?.geminiApiKey || '').trim();
    fs.writeFileSync(
      SECRETS_PATH,
      JSON.stringify({ geminiApiKey, updatedAt: new Date().toISOString() }, null, 2),
      { encoding: 'utf-8', mode: 0o600 }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/state', (_req, res) => {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      res.json(JSON.parse(raw));
      return;
    }
    res.json({ initialized: false });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/state', (req, res) => {
  try {
    const payload = {
      ...req.body,
      initialized: true,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(payload, null, 2), 'utf-8');
    res.json({ ok: true, updatedAt: payload.updatedAt });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const PACIFIC_R_STORE_PATH = path.join(DATA_DIR, 'pacific-r.json');

interface RawPacificStore {
  initialized?: boolean;
  governance?: Record<string, unknown>;
  documents?: unknown[];
  safetyTestRuns?: unknown[];
  sessions?: Array<Record<string, unknown>>;
  updatedAt?: string;
}

function readPacificStore(): RawPacificStore {
  try {
    if (fs.existsSync(PACIFIC_R_STORE_PATH)) {
      return JSON.parse(fs.readFileSync(PACIFIC_R_STORE_PATH, 'utf-8'));
    }
  } catch {
    // Return empty fallback
  }
  return { initialized: false, sessions: [] };
}

function writePacificStore(data: RawPacificStore) {
  const payload = {
    ...data,
    initialized: true,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(PACIFIC_R_STORE_PATH, JSON.stringify(payload, null, 2), 'utf-8');
  return payload;
}

function isAllowedLocalOllamaUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
}

/**
 * Sanitização LGPD no servidor (defense-in-depth):
 * Mantém estritamente os campos minimizados de telemetria técnica e questionário anônimo,
 * descartando qualquer campo de transcrição livre caso enviado acidentalmente.
 */
function pickMinimizedSessionFields(body: Record<string, unknown>): Record<string, unknown> {
  return {
    sessionId: String(body.sessionId || `pac-sess-${Date.now()}`),
    participantCode: String(body.participantCode || 'PAC-ANON'),
    createdAt: String(body.createdAt || new Date().toISOString()),
    completedAt: body.completedAt ? String(body.completedAt) : undefined,
    status: body.status === 'completed' || body.status === 'withdrawn' ? body.status : 'in_progress',
    isPrototypeSandbox: Boolean(body.isPrototypeSandbox),
    interfaceCondition: String(body.interfaceCondition || 'voice_with_avatar'),
    ragMode: body.ragMode === 'without_rag' ? 'without_rag' : 'with_rag',
    providerUsed: String(body.providerUsed || 'local_rag_engine'),
    consentAcceptedAt: String(body.consentAcceptedAt || new Date().toISOString()),
    turnCount: Number(body.turnCount || 0),
    ttftMsList: Array.isArray(body.ttftMsList) ? body.ttftMsList.map(Number) : [],
    totalSpeechMsList: Array.isArray(body.totalSpeechMsList)
      ? body.totalSpeechMsList.map(Number)
      : [],
    medianTtftMs: Number(body.medianTtftMs || 0),
    p95TtftMs: Number(body.p95TtftMs || 0),
    avgSpeechMs: Number(body.avgSpeechMs || 0),
    failureCount: Number(body.failureCount || 0),
    interruptionCount: Number(body.interruptionCount || 0),
    ragGroundedTurns: Number(body.ragGroundedTurns || 0),
    abstentionTurns: Number(body.abstentionTurns || 0),
    avgRelevanceScore: Number(body.avgRelevanceScore || 0),
    safetyTriggers:
      body.safetyTriggers && typeof body.safetyTriggers === 'object'
        ? {
            crisis: Number((body.safetyTriggers as Record<string, unknown>).crisis || 0),
            clinicalLimit: Number(
              (body.safetyTriggers as Record<string, unknown>).clinicalLimit || 0
            ),
            promptInjection: Number(
              (body.safetyTriggers as Record<string, unknown>).promptInjection || 0
            ),
            piiMasked: Number((body.safetyTriggers as Record<string, unknown>).piiMasked || 0),
          }
        : { crisis: 0, clinicalLimit: 0, promptInjection: 0, piiMasked: 0 },
    scenariosAttempted: Array.isArray(body.scenariosAttempted)
      ? body.scenariosAttempted.map(String)
      : [],
    questionnaire: body.questionnaire || undefined,
  };
}

app.get('/api/pacific-r/state', (_req, res) => {
  try {
    res.json(readPacificStore());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.put('/api/pacific-r/state', (req, res) => {
  try {
    const existing = readPacificStore();
    const nextSessions = Array.isArray(req.body?.sessions)
      ? req.body.sessions.map((s: Record<string, unknown>) => pickMinimizedSessionFields(s))
      : existing.sessions || [];
    const saved = writePacificStore({
      governance: req.body?.governance ?? existing.governance,
      documents: req.body?.documents ?? existing.documents,
      safetyTestRuns: req.body?.safetyTestRuns ?? existing.safetyTestRuns,
      sessions: nextSessions,
    });
    res.json({ ok: true, updatedAt: saved.updatedAt });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/pacific-r/sessions', (req, res) => {
  try {
    const store = readPacificStore();
    const minimized = pickMinimizedSessionFields(req.body || {});
    const sessions = Array.isArray(store.sessions) ? [...store.sessions] : [];
    const existingIdx = sessions.findIndex((s) => s.sessionId === minimized.sessionId);
    if (existingIdx >= 0) {
      sessions[existingIdx] = minimized;
    } else {
      sessions.unshift(minimized);
    }
    const saved = writePacificStore({ ...store, sessions });
    res.json({ ok: true, session: minimized, updatedAt: saved.updatedAt });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/pacific-r/sessions/:sessionId', (req, res) => {
  try {
    const store = readPacificStore();
    const targetId = String(req.params.sessionId || '');
    const sessions = (store.sessions || []).filter((s) => s.sessionId !== targetId);
    const saved = writePacificStore({ ...store, sessions });
    res.json({ ok: true, remaining: sessions.length, updatedAt: saved.updatedAt });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/pacific-r/sessions', (_req, res) => {
  try {
    const store = readPacificStore();
    const saved = writePacificStore({ ...store, sessions: [] });
    res.json({ ok: true, remaining: 0, updatedAt: saved.updatedAt });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/pacific-r/ollama/health', async (req, res) => {
  const baseUrl = String(req.query.baseUrl || 'http://localhost:11434').replace(/\/$/, '');
  if (!isAllowedLocalOllamaUrl(baseUrl)) {
    res.status(400).json({
      reachable: false,
      error: 'Apenas endpoints locais (localhost / 127.0.0.1) são permitidos para o conector Ollama.',
    });
    return;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const resp = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) {
      res.json({ reachable: false, error: `HTTP ${resp.status}` });
      return;
    }
    const data = (await resp.json()) as { models?: Array<{ name: string }> };
    res.json({
      reachable: true,
      models: (data.models || []).map((m) => m.name),
    });
  } catch {
    res.json({
      reachable: false,
      models: [],
      error: 'Ollama não detectado neste endereço local. O fallback local determinístico permanecerá ativo.',
    });
  }
});

app.post('/api/pacific-r/ollama/chat', async (req, res) => {
  const baseUrl = String(req.body?.baseUrl || 'http://localhost:11434').replace(/\/$/, '');
  const model = String(req.body?.model || 'llama3.1:8b');
  const systemPrompt = String(req.body?.systemPrompt || '');
  const userPrompt = String(req.body?.userPrompt || '');

  if (!isAllowedLocalOllamaUrl(baseUrl)) {
    res.status(400).json({ error: 'Endpoint Ollama deve ser local (localhost ou 127.0.0.1).' });
    return;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const resp = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature: 0.25 },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    clearTimeout(timer);
    if (!resp.ok) {
      res.status(502).json({ error: `Ollama retornou HTTP ${resp.status}` });
      return;
    }
    const data = (await resp.json()) as { message?: { content?: string } };
    res.json({
      ok: true,
      reply: data?.message?.content || '',
      model,
    });
  } catch (err) {
    res.status(503).json({
      error: err instanceof Error ? err.message : 'Ollama indisponível',
    });
  }
});

const PORT = Number(process.env.API_PORT || 3001);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Aether Live API] Servidor persistente ativo em http://localhost:${PORT}`);
});
