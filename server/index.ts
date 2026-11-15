import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

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

const PORT = Number(process.env.API_PORT || 3001);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Aether Live API] Servidor persistente ativo em http://localhost:${PORT}`);
});
