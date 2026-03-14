import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

const BLYNK_AUTH_TOKEN = process.env.BLYNK_AUTH_TOKEN || '';
const BLYNK_API_URL = 'https://blynk.cloud/external/api';

/**
 * ───────────────────────────────────────────────────────
 * ESP32 Virtual Pin Mapping  (from your Arduino code)
 * ───────────────────────────────────────────────────────
 *  V1  →  Water Level %       (ESP32 WRITES — we READ)
 *  V2  →  Distance in cm      (ESP32 WRITES — we READ)
 *  V3  →  Mode  1=AUTO 0=MAN  (ESP32 READS  — we WRITE)
 *  V4  →  Relay 1=ON   0=OFF  (ESP32 READS  — we WRITE)
 * ───────────────────────────────────────────────────────
 */

function isBlynkConfigured(): boolean {
  return !!BLYNK_AUTH_TOKEN && BLYNK_AUTH_TOKEN !== 'YOUR_BLYNK_AUTH_TOKEN';
}

// Real-time state
let currentState = {
  waterLevel: 0,
  distance: 0,
  motorStatus: 0,
  mode: 'AUTO' as 'AUTO' | 'MANUAL',
  lastUpdate: new Date().toISOString(),
  source: 'none' as 'blynk' | 'none'
};

// Broadcast to all WS clients
function broadcast(data: any) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

// ── Fetch real sensor data from Blynk Cloud ──────────────────────────────────
async function fetchBlynkState() {
  if (!isBlynkConfigured()) return null;

  try {
    // Read all 4 virtual pins in parallel
    const [levelRes, distRes, modeRes, relayRes] = await Promise.all([
      fetch(`${BLYNK_API_URL}/get?token=${BLYNK_AUTH_TOKEN}&V1`),   // Water Level %
      fetch(`${BLYNK_API_URL}/get?token=${BLYNK_AUTH_TOKEN}&V2`),   // Distance cm
      fetch(`${BLYNK_API_URL}/get?token=${BLYNK_AUTH_TOKEN}&V3`),   // Mode
      fetch(`${BLYNK_API_URL}/get?token=${BLYNK_AUTH_TOKEN}&V4`),   // Relay
    ]);

    const levelText = await levelRes.text();
    const distText  = await distRes.text();
    const modeText  = await modeRes.text();
    const relayText = await relayRes.text();

    // Blynk returns JSON arrays like ["42"] — parse the first element
    const parseVal = (raw: string): number => {
      try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? parseFloat(arr[0]) : parseFloat(raw);
      } catch {
        return parseFloat(raw) || 0;
      }
    };

    const waterLevel  = Math.max(0, Math.min(100, parseVal(levelText)));
    const distance    = parseVal(distText);
    const modeVal     = parseVal(modeText);       // 1 = AUTO, 0 = MANUAL
    const relayVal    = parseVal(relayText);       // 1 = ON,   0 = OFF

    currentState = {
      waterLevel: Math.round(waterLevel),
      distance:   parseFloat(distance.toFixed(1)),
      motorStatus: relayVal === 1 ? 1 : 0,
      mode:       modeVal === 1 ? 'AUTO' : 'MANUAL',
      lastUpdate: new Date().toISOString(),
      source:     'blynk'
    };

    return currentState;
  } catch (error) {
    console.error('[Blynk] Fetch error:', error);
    return null;
  }
}

// ── Send command to Blynk hardware ───────────────────────────────────────────
async function sendBlynkCommand(pin: string, value: number | string): Promise<boolean> {
  if (!isBlynkConfigured()) {
    console.log(`[Mock] Would send ${pin}=${value} to Blynk`);
    return true;
  }

  try {
    const res = await fetch(`${BLYNK_API_URL}/update?token=${BLYNK_AUTH_TOKEN}&${pin}=${value}`);
    if (!res.ok) {
      console.error(`[Blynk] Command failed: ${res.status} ${res.statusText}`);
      return false;
    }
    console.log(`[Blynk] ✅ Sent ${pin}=${value}`);
    return true;
  } catch (error) {
    console.error('[Blynk] Command error:', error);
    return false;
  }
}

// ── Polling loop ─────────────────────────────────────────────────────────────
let pollingInterval: NodeJS.Timeout | null = null;

function startPolling() {
  if (pollingInterval) return;

  pollingInterval = setInterval(async () => {
    const state = await fetchBlynkState();
    if (state) {
      broadcast({ type: 'BLYNK_STATE', payload: state });
    }
  }, 3000); // Every 3 seconds — matches ESP32's 1s measure + network latency

  console.log('[Server] Blynk polling started (every 3s)');
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log('[Server] Blynk polling stopped');
  }
}

// ── WebSocket connection ─────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  console.log('[WS] Client connected. Total:', wss.clients.size);

  // Send current state immediately
  ws.send(JSON.stringify({ type: 'BLYNK_STATE', payload: currentState }));
  ws.send(JSON.stringify({ type: 'CONNECTION_STATUS', payload: { blynkConfigured: isBlynkConfigured() } }));

  if (isBlynkConfigured()) startPolling();

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'CONTROL') {
        const { pin, value } = data.payload;
        sendBlynkCommand(pin, value).then(success => {
          ws.send(JSON.stringify({ type: 'CONTROL_RESULT', payload: { pin, value, success } }));
        });
      }
    } catch (err) {
      console.error('[WS] Message parse error:', err);
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected. Total:', wss.clients.size);
    if (wss.clients.size === 0) stopPolling();
  });
});

// ===== REST API Routes =====

app.get('/api/state', (req, res) => {
  res.json({
    ...currentState,
    blynkConfigured: isBlynkConfigured(),
    connectedClients: wss.clients.size
  });
});

/**
 * POST /api/control
 * Body: { pin: "V3" | "V4", value: 0 | 1 }
 *
 *   V3 = Mode    → 1 = AUTO,  0 = MANUAL
 *   V4 = Relay   → 1 = ON,    0 = OFF
 */
app.post('/api/control', async (req, res) => {
  const { pin, value } = req.body;

  if (!pin) {
    return res.status(400).json({ error: 'Missing pin parameter' });
  }

  const success = await sendBlynkCommand(pin, value);

  if (success) {
    // Update local state for immediate UI feedback
    if (pin === 'V4') currentState.motorStatus = value === 1 ? 1 : 0;
    if (pin === 'V3') currentState.mode = value === 1 ? 'AUTO' : 'MANUAL';

    broadcast({ type: 'BLYNK_STATE', payload: currentState });
    res.json({ success: true });
  } else {
    res.status(503).json({ error: 'Failed to send command to hardware' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    blynkConfigured: isBlynkConfigured(),
    connectedClients: wss.clients.size,
    lastUpdate: currentState.lastUpdate
  });
});

app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// ===== Vite Integration =====

if (process.env.NODE_ENV !== 'production') {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

const PORT = parseInt(process.env.PORT || '3000', 10);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌊 AquaSphere Server running on http://localhost:${PORT}`);
  console.log(`   Blynk: ${isBlynkConfigured() ? '✅ Configured' : '⚠️ Not configured (simulation mode)'}`);
  console.log(`   Pin Map: V1=Level%, V2=Distance, V3=Mode, V4=Relay`);
  console.log(`   Mode: ${process.env.NODE_ENV || 'development'}\n`);
});
