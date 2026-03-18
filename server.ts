import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

const BLYNK_AUTH_TOKEN = process.env.BLYNK_AUTH_TOKEN || '';
const BLYNK_API_URL = 'https://blynk.cloud/external/api';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// ── Startup checks ─────────────────────────────────────────────────────────────
if (BLYNK_AUTH_TOKEN && BLYNK_AUTH_TOKEN !== 'YOUR_BLYNK_AUTH_TOKEN') {
  console.log(`[Blynk]  ✅ Token loaded: ${BLYNK_AUTH_TOKEN.slice(0, 6)}…${BLYNK_AUTH_TOKEN.slice(-4)}`);
} else {
  console.warn('[Blynk]  ⚠️  No valid auth token — running in simulation/mock mode');
}

if (GEMINI_API_KEY && GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
  console.log('[Gemini] ✅ API key loaded');
} else {
  console.warn('[Gemini] ⚠️  No valid Gemini API key — AI insights will use fallback analysis');
}

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
  return !!BLYNK_AUTH_TOKEN
    && BLYNK_AUTH_TOKEN !== 'YOUR_BLYNK_AUTH_TOKEN'
    && BLYNK_AUTH_TOKEN.length > 10;
}

function isGeminiConfigured(): boolean {
  return !!GEMINI_API_KEY && GEMINI_API_KEY !== 'MY_GEMINI_API_KEY';
}

// ── Gemini AI client ──────────────────────────────────────────────────────────
const genai = isGeminiConfigured() ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

// ── Real-time state ───────────────────────────────────────────────────────────
let currentState = {
  waterLevel: 0,
  distance: 0,
  motorStatus: 0,
  mode: 'AUTO' as 'AUTO' | 'MANUAL',
  lastUpdate: new Date().toISOString(),
  source: 'none' as 'blynk' | 'none'
};

// In-memory rolling history for AI context (last 20 readings)
interface HistoryPoint { waterLevel: number; distance: number; motorStatus: number; timestamp: string; }
const sensorHistory: HistoryPoint[] = [];

function pushHistory(state: typeof currentState) {
  sensorHistory.push({
    waterLevel: state.waterLevel,
    distance: state.distance,
    motorStatus: state.motorStatus,
    timestamp: state.lastUpdate,
  });
  if (sensorHistory.length > 20) sensorHistory.shift();
}

// ── Broadcast to all WS clients ───────────────────────────────────────────────
function broadcast(data: any) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

// ── Gemini AI analysis ────────────────────────────────────────────────────────
interface AiInsight {
  status: 'normal' | 'warning' | 'critical';
  statusLabel: string;
  headline: string;
  recommendation: string;
  predictedEmptyTime: string | null;
  drainRatePerMin: number;
  confidence: 'high' | 'medium' | 'low';
  tips: string[];
  generatedAt: string;
  source: 'gemini' | 'fallback';
}

// Fallback: pure math analysis when Gemini unavailable
function fallbackAnalysis(): AiInsight {
  const level = currentState.waterLevel;
  const n = sensorHistory.length;

  let slope = 0;
  if (n >= 2) {
    const first = sensorHistory[0];
    const last  = sensorHistory[n - 1];
    const dtMin = (new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()) / 60000;
    slope = dtMin > 0 ? (last.waterLevel - first.waterLevel) / dtMin : 0;
  }

  let predictedEmptyTime: string | null = null;
  if (slope < -0.005 && level > 0) {
    const minsLeft = level / Math.abs(slope);
    predictedEmptyTime = new Date(Date.now() + minsLeft * 60000).toISOString();
  }

  const status: AiInsight['status'] = level < 10 ? 'critical' : level < 25 ? 'warning' : 'normal';

  return {
    status,
    statusLabel: status === 'critical' ? 'CRITICAL' : status === 'warning' ? 'LOW' : 'NORMAL',
    headline: level < 10
      ? `Tank critically low at ${level}% — immediate action required`
      : level < 25
      ? `Water level low at ${level}% — refill recommended soon`
      : `Tank is at ${level}% — system operating normally`,
    recommendation: currentState.mode === 'AUTO'
      ? 'Auto-mode is active. The system will manage motor control automatically.'
      : level < 20
      ? 'Tank is low and in MANUAL mode — consider switching to AUTO or starting the motor manually.'
      : 'System is in MANUAL mode. Monitor levels periodically.',
    predictedEmptyTime,
    drainRatePerMin: parseFloat(Math.abs(slope).toFixed(3)),
    confidence: n >= 10 ? 'high' : n >= 5 ? 'medium' : 'low',
    tips: [
      level > 90 ? 'Tank is nearly full — motor should stop soon in AUTO mode.' : '',
      level < 20 ? 'Refill the tank or activate the motor.' : '',
      currentState.motorStatus === 1 ? 'Motor is running — water is being pumped in.' : '',
    ].filter(Boolean),
    generatedAt: new Date().toISOString(),
    source: 'fallback',
  };
}

// Gemini-powered analysis
async function geminiAnalysis(): Promise<AiInsight> {
  if (!genai) return fallbackAnalysis();

  const historyStr = sensorHistory.slice(-10).map((h, i) =>
    `  ${i + 1}. Level: ${h.waterLevel}%, Distance: ${h.distance}cm, Motor: ${h.motorStatus === 1 ? 'ON' : 'OFF'}, Time: ${h.timestamp}`
  ).join('\n');

  const prompt = `You are an IoT water tank AI monitoring system. Analyze the following real-time sensor data from an ESP32-controlled water tank and provide actionable insights.

Current State:
- Water Level: ${currentState.waterLevel}%
- Distance (ultrasonic sensor): ${currentState.distance} cm
- Motor/Pump Status: ${currentState.motorStatus === 1 ? 'ON (pumping water in)' : 'OFF'}
- Control Mode: ${currentState.mode}

Recent History (last ${sensorHistory.length} readings every ~3 seconds):
${historyStr || '  No history yet.'}

Respond ONLY with a valid JSON object (no markdown, no extra text) in this exact format:
{
  "status": "normal" | "warning" | "critical",
  "statusLabel": "NORMAL" | "LOW" | "CRITICAL",
  "headline": "one-line summary of the tank situation",
  "recommendation": "specific actionable recommendation for the user",
  "predictedEmptyTime": "ISO8601 timestamp or null",
  "drainRatePerMin": 0.12,
  "confidence": "high" | "medium" | "low",
  "tips": ["tip1", "tip2", "tip3"]
}

Rules:
- status "critical" if level < 10, "warning" if level < 25, else "normal"
- predictedEmptyTime: calculate when tank reaches 0 based on drain trend. null if filling or stable
- drainRatePerMin: positive number representing % lost per minute (0 if filling)
- tips: 2-3 short, specific, practical tips
- confidence: "high" if 8+ history points, "medium" if 3-7, "low" if 0-2
- Be precise and data-driven`;

  try {
    const result = await genai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
    });
    const text = result.text?.trim() ?? '';
    // Strip markdown code fences if present
    const jsonText = text.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(jsonText);
    return { ...parsed, generatedAt: new Date().toISOString(), source: 'gemini' };
  } catch (err) {
    console.error('[Gemini] Analysis failed:', err);
    return fallbackAnalysis();
  }
}

// Throttle: run Gemini at most every 15s to avoid rate limits
let lastGeminiRun = 0;
let lastAiInsight: AiInsight | null = null;

async function runAiInsight(force = false): Promise<AiInsight> {
  const now = Date.now();
  if (!force && lastAiInsight && now - lastGeminiRun < 15000) {
    return lastAiInsight;
  }
  lastGeminiRun = now;
  const insight = await geminiAnalysis();
  lastAiInsight = insight;
  return insight;
}

// ── Fetch real sensor data from Blynk Cloud ───────────────────────────────────
async function fetchBlynkState() {
  if (!isBlynkConfigured()) return null;

  try {
    // Blynk Cloud External API format: /get?token=TOKEN&pin=v1
    const [levelRes, distRes, modeRes, relayRes] = await Promise.all([
      fetch(`${BLYNK_API_URL}/get?token=${BLYNK_AUTH_TOKEN}&pin=v1`),  // Water Level %
      fetch(`${BLYNK_API_URL}/get?token=${BLYNK_AUTH_TOKEN}&pin=v2`),  // Distance cm
      fetch(`${BLYNK_API_URL}/get?token=${BLYNK_AUTH_TOKEN}&pin=v3`),  // Mode
      fetch(`${BLYNK_API_URL}/get?token=${BLYNK_AUTH_TOKEN}&pin=v4`),  // Relay
    ]);

    const levelText = await levelRes.text();
    const distText  = await distRes.text();
    const modeText  = await modeRes.text();
    const relayText = await relayRes.text();

    console.log(`[Blynk] Raw → V1:${levelText} V2:${distText} V3:${modeText} V4:${relayText}`);

    // Check for Blynk error responses
    for (const [pin, text] of [['V1', levelText], ['V2', distText], ['V3', modeText], ['V4', relayText]]) {
      if (text.toLowerCase().includes('invalid') || text.toLowerCase().includes('error')) {
        console.error(`[Blynk] ❌ Error on ${pin}: ${text}`);
      }
    }

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

    pushHistory(currentState);
    return currentState;
  } catch (error) {
    console.error('[Blynk] Fetch error:', error);
    return null;
  }
}

// ── Send command to Blynk hardware ────────────────────────────────────────────
async function sendBlynkCommand(pin: string, value: number | string): Promise<boolean> {
  if (!isBlynkConfigured()) {
    console.log(`[Mock] Would send ${pin}=${value} to Blynk`);
    return true;
  }

  try {
    // Blynk Cloud External API format: /update?token=TOKEN&pin=V3&value=1
    const res = await fetch(`${BLYNK_API_URL}/update?token=${BLYNK_AUTH_TOKEN}&pin=${pin}&value=${value}`);
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

// ── Polling loop ──────────────────────────────────────────────────────────────
let pollingInterval: NodeJS.Timeout | null = null;

function startPolling() {
  if (pollingInterval) return;

  pollingInterval = setInterval(async () => {
    const state = await fetchBlynkState();
    if (state) {
      // Broadcast sensor state
      broadcast({ type: 'BLYNK_STATE', payload: state });

      // Run AI analysis (throttled to every 15s)
      const insight = await runAiInsight();
      broadcast({ type: 'AI_INSIGHT', payload: insight });
    }
  }, 3000); // Every 3 seconds

  console.log('[Server] Blynk polling + AI analysis started (every 3s, AI throttled to 15s)');
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log('[Server] Blynk polling stopped');
  }
}

// ── WebSocket connection ──────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  console.log('[WS] Client connected. Total:', wss.clients.size);

  // Send current state immediately on connect
  ws.send(JSON.stringify({ type: 'BLYNK_STATE', payload: currentState }));
  ws.send(JSON.stringify({ type: 'CONNECTION_STATUS', payload: { blynkConfigured: isBlynkConfigured(), geminiConfigured: isGeminiConfigured() } }));

  // Send last known AI insight immediately if available
  if (lastAiInsight) {
    ws.send(JSON.stringify({ type: 'AI_INSIGHT', payload: lastAiInsight }));
  }

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

      // Allow client to request a fresh AI analysis on demand
      if (data.type === 'REQUEST_AI') {
        runAiInsight(true).then(insight => {
          ws.send(JSON.stringify({ type: 'AI_INSIGHT', payload: insight }));
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

app.post('/api/ai/analyze', async (req, res) => {
  try {
    const insight = await runAiInsight(true);
    res.json(insight);
  } catch (err) {
    res.status(500).json({ error: 'AI analysis failed' });
  }
});

/**
 * POST /api/control
 * Body: { pin: "V3" | "V4", value: 0 | 1 }
 */
app.post('/api/control', async (req, res) => {
  const { pin, value } = req.body;

  if (!pin) {
    return res.status(400).json({ error: 'Missing pin parameter' });
  }

  const success = await sendBlynkCommand(pin, value);

  if (success) {
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
    geminiConfigured: isGeminiConfigured(),
    connectedClients: wss.clients.size,
    lastUpdate: currentState.lastUpdate,
    historyPoints: sensorHistory.length
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
  console.log(`   Blynk:  ${isBlynkConfigured() ? '✅ Configured' : '⚠️ Not configured (simulation mode)'}`);
  console.log(`   Gemini: ${isGeminiConfigured() ? '✅ AI insights active' : '⚠️ Not configured (fallback analysis)'}`);
  console.log(`   Pin Map: V1=Level%, V2=Distance, V3=Mode, V4=Relay`);
  console.log(`   Mode: ${process.env.NODE_ENV || 'development'}\n`);
});
