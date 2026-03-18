import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Droplets,
  Activity,
  Brain,
  Bell,
  Settings as SettingsIcon,
  Power,
  Zap,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TankState {
  waterLevel: number;
  distance: number;
  motorStatus: number;
  mode: 'AUTO' | 'MANUAL';
  lastUpdate: string;
}

interface HistoryEntry {
  id: string;
  water_level: number;
  timestamp: string;
}

interface AlertEntry {
  id: string;
  alert_type: string;
  description: string;
  timestamp: string;
}

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

// ─── Components ───────────────────────────────────────────────────────────────

const Toast = ({ message, type, onClose }: { message: string; type: 'success' | 'error' | 'info'; onClose: () => void }) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const t = setTimeout(() => onCloseRef.current(), 3000);
    return () => clearTimeout(t);
  }, [message]); // re-arm timer when message changes, stable ref avoids dep loop

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.9 }}
      className={cn(
        'fixed bottom-28 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-xl backdrop-blur-md',
        type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
          type === 'error' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
            'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
      )}
    >
      {type === 'success' ? <CheckCircle size={18} /> : type === 'error' ? <XCircle size={18} /> : <AlertTriangle size={18} />}
      <span className="text-xs font-bold">{message}</span>
    </motion.div>
  );
};

const TankVisual = ({ level }: { level: number }) => {
  // Stable bubble config — generated once per mount, not per render
  const bubblesRef = useRef<Array<{ width: number; height: number; left: string; x: number; duration: number; delay: number }> | null>(null);
  if (!bubblesRef.current) {
    bubblesRef.current = [...Array(12)].map(() => ({
      width: Math.random() * 6 + 2,
      height: Math.random() * 6 + 2,
      left: `${Math.random() * 100}%`,
      x: (Math.random() - 0.5) * 40,
      duration: Math.random() * 4 + 4,
      delay: Math.random() * 6,
    }));
  }
  const bubbles = bubblesRef.current;

  return (
    <div className="relative w-52 h-72 bg-slate-950/80 rounded-[3rem] border-[6px] border-slate-900 overflow-hidden shadow-[0_0_80px_-20px_rgba(6,182,212,0.4)]">
      <motion.div
        className="absolute bottom-0 w-full bg-gradient-to-t from-cyan-700 via-cyan-500 to-cyan-300"
        initial={{ height: 0 }}
        animate={{ height: `${level}%` }}
        transition={{ type: 'spring', stiffness: 30, damping: 12 }}
      >
        <div className="absolute top-0 left-0 w-[200%] h-12 -translate-y-6 opacity-40">
          <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full fill-cyan-300 wave-animation">
            <path d="M0,50 C150,100 350,0 500,50 C650,100 850,0 1000,50 L1000,100 L0,100 Z" />
          </svg>
        </div>
        <div className="absolute top-0 left-0 w-[200%] h-12 -translate-y-4 opacity-30 scale-x-[-1]">
          <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full fill-cyan-200 wave-animation" style={{ animationDelay: '-4s' }}>
            <path d="M0,50 C150,100 350,0 500,50 C650,100 850,0 1000,50 L1000,100 L0,100 Z" />
          </svg>
        </div>
        <div className="absolute top-0 left-0 w-full h-1.5 bg-white/50 shadow-[0_0_20px_rgba(255,255,255,0.6)] z-10" />
        {bubbles.map((b, i) => (
          <motion.div
            key={i}
            className="absolute bg-white/20 rounded-full blur-[0.5px]"
            style={{ width: b.width, height: b.height, left: b.left }}
            animate={{ y: [-20, -300], opacity: [0, 0.8, 0], x: [0, b.x] }}
            transition={{ duration: b.duration, repeat: Infinity, delay: b.delay, ease: 'easeInOut' }}
          />
        ))}
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute top-0 left-1/4 w-1/2 h-full bg-gradient-to-r from-transparent via-white/[0.03] to-transparent skew-x-[-20deg] pointer-events-none" />
      <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
        <div className="relative">
          <span className="text-6xl font-black text-white drop-shadow-[0_0_20px_rgba(0,0,0,0.8)] tracking-tighter text-glow-cyan">{level}</span>
          <span className="text-2xl font-bold text-cyan-200/80 ml-0.5">%</span>
        </div>
        <span className="text-[9px] font-black text-cyan-200/40 uppercase tracking-[0.3em] mt-2">Volume Level</span>
      </div>
    </div>
  );
};

const Card = ({ children, className, title, icon: Icon }: { children: React.ReactNode; className?: string; title?: string; icon?: any }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className={cn('glass rounded-[2.5rem] p-7 relative overflow-hidden group/card', className)}
  >
    <div className="absolute -top-12 -right-12 w-24 h-24 bg-cyan-500/10 blur-[40px] group-hover/card:bg-cyan-500/20 transition-colors duration-700" />
    {title && (
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 rounded-xl group-hover/card:scale-110 transition-transform duration-500">
            {Icon && <Icon size={18} className="text-cyan-400" />}
          </div>
          <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-[0.2em]">{title}</h3>
        </div>
        <div className="flex gap-1">
          <div className="w-1 h-1 rounded-full bg-cyan-500/20" />
          <div className="w-1 h-1 rounded-full bg-cyan-500/40" />
          <div className="w-1 h-1 rounded-full bg-cyan-500/60" />
        </div>
      </div>
    )}
    <div className="relative z-10">{children}</div>
  </motion.div>
);

const NavItem = ({ active, icon: Icon, label, onClick }: { active: boolean; icon: any; label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn('relative flex flex-col items-center justify-center gap-2 px-5 py-2 transition-all duration-700', active ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300')}
  >
    <div className={cn('p-2.5 rounded-2xl transition-all duration-700 relative overflow-hidden', active ? 'bg-cyan-500/15 shadow-[0_0_30px_rgba(6,182,212,0.3)]' : 'bg-transparent')}>
      <Icon size={24} strokeWidth={active ? 2.5 : 2} className="relative z-10" />
      {active && <motion.div layoutId="nav-bg" className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-indigo-500/20" />}
    </div>
    <span className={cn('text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-700', active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2')}>{label}</span>
    {active && <motion.div layoutId="nav-glow" className="absolute -bottom-5 w-10 h-1.5 bg-cyan-500 blur-[6px] rounded-full" />}
  </button>
);

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [wsConnected, setWsConnected] = useState(false);
  const [state, setState] = useState<TankState>({ waterLevel: 0, distance: 0, motorStatus: 0, mode: 'AUTO', lastUpdate: '' });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [prediction, setPrediction] = useState<any>(null);
  const [aiInsight, setAiInsight] = useState<AiInsight | null>(null);
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [tankCapacity, setTankCapacity] = useState(1000);
  const [sensorOffset, setSensorOffset] = useState(5);
  const [notifications, setNotifications] = useState([
    { id: 'empty', label: 'Tank Empty Alert', enabled: true },
    { id: 'full', label: 'Tank Full Alert', enabled: true },
    { id: 'runtime', label: 'Motor Runtime Warning', enabled: false },
    { id: 'ai', label: 'AI Refill Reminders', enabled: true },
  ]);

  const lastAlerts = useRef({ empty: 0, full: 0 });
  const simRef = useRef(state);
  simRef.current = state;
  const wsRef = useRef<WebSocket | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => setToast({ message, type });

  const addHistory = (level: number) => {
    const entry: HistoryEntry = { id: Date.now().toString(), water_level: parseFloat(level.toFixed(1)), timestamp: new Date().toISOString() };
    setHistory(prev => [entry, ...prev].slice(0, 100));
  };

  const evalAlerts = (level: number) => {
    const now = Date.now();
    const COOLDOWN = 5 * 60 * 1000;
    if (level < 10 && now - lastAlerts.current.empty > COOLDOWN) {
      setAlerts(prev => [{ id: Date.now().toString(), alert_type: 'Tank Empty', description: 'Water level critically low (<10%)', timestamp: new Date().toISOString() }, ...prev].slice(0, 50));
      lastAlerts.current.empty = now;
      showToast('⚠️ Tank Empty Alert triggered', 'error');
    }
    if (level > 95 && now - lastAlerts.current.full > COOLDOWN) {
      setAlerts(prev => [{ id: Date.now().toString(), alert_type: 'Tank Full', description: 'Water level near capacity (>95%)', timestamp: new Date().toISOString() }, ...prev].slice(0, 50));
      lastAlerts.current.full = now;
      showToast('ℹ️ Tank Full Alert triggered', 'info');
    }
  };

  // ── AI Predictions ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (history.length < 5) return;
    const reversed = [...history].reverse();
    const n = reversed.length;
    const startTime = new Date(reversed[0].timestamp).getTime();
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    reversed.forEach(d => {
      const x = (new Date(d.timestamp).getTime() - startTime) / 60000;
      const y = d.water_level;
      sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
    });
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return;
    const slope = (n * sumXY - sumX * sumY) / denom;
    let predictedEmptyTime = null;
    if (slope < -0.01) {
      const minutesToEmpty = reversed[n - 1].water_level / Math.abs(slope);
      predictedEmptyTime = new Date(Date.now() + minutesToEmpty * 60000).toISOString();
    }
    setPrediction({ slope, predictedEmptyTime, usageRate: Math.abs(slope).toFixed(2) + '%/min' });
  }, [history]);

  // ── Simulation Mode ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSimulating) return;
    const interval = setInterval(() => {
      setState(prev => {
        let newLevel = prev.motorStatus === 1 ? Math.min(100, prev.waterLevel + 1.5) : Math.max(0, prev.waterLevel - 0.3);
        let newMotor = prev.motorStatus;
        if (prev.mode === 'AUTO') {
          if (newLevel < 20) newMotor = 1;
          if (newLevel > 95) newMotor = 0;
        }
        const next: TankState = { ...prev, waterLevel: parseFloat(newLevel.toFixed(1)), motorStatus: newMotor, lastUpdate: new Date().toISOString() };
        // evalAlerts must be called outside setState to avoid stale closure — schedule via microtask
        setTimeout(() => evalAlerts(next.waterLevel), 0);
        return next;
      });
    }, 2000);

    const histInterval = setInterval(() => {
      addHistory(simRef.current.waterLevel);
    }, 10000);

    return () => { clearInterval(interval); clearInterval(histInterval); };
  }, [isSimulating]);

  // ── WebSocket (real Blynk data + AI insights) ──────────────────────────────
  useEffect(() => {
    if (isSimulating) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws: WebSocket | null = null;
    let reconnect: any = null;
    let mounted = true;

    const connect = () => {
      if (!mounted) return;
      ws = new WebSocket(`${protocol}//${window.location.host}`);
      wsRef.current = ws;
      ws.onopen = () => { if (mounted) { setWsConnected(true); console.log('WS connected'); } };
      ws.onmessage = (e) => {
        if (!mounted) return;
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'BLYNK_STATE') {
            const p = data.payload;
            setState({
              waterLevel: p.waterLevel,
              distance: p.distance || 0,
              motorStatus: p.motorStatus,
              mode: p.mode,
              lastUpdate: new Date().toISOString()
            });
            addHistory(p.waterLevel);
            evalAlerts(p.waterLevel);
          }
          if (data.type === 'AI_INSIGHT') {
            setAiInsight(data.payload);
            setAiRefreshing(false);
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => { wsRef.current = null; if (mounted) { setWsConnected(false); reconnect = setTimeout(connect, 3000); } };
      ws.onerror = () => ws?.close();
    };

    connect();
    return () => { mounted = false; ws?.close(); wsRef.current = null; if (reconnect) clearTimeout(reconnect); };
  }, [isSimulating]);

  // ── Request fresh AI insight on demand ─────────────────────────────────────
  const requestAiRefresh = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setAiRefreshing(true);
      wsRef.current.send(JSON.stringify({ type: 'REQUEST_AI' }));
    } else {
      // Fallback: REST call
      setAiRefreshing(true);
      fetch('/api/ai/analyze', { method: 'POST' })
        .then(r => r.json())
        .then(insight => { setAiInsight(insight); setAiRefreshing(false); })
        .catch(() => setAiRefreshing(false));
    }
  }, []);

  // ── Motor & Mode controls ───────────────────────────────────────────────────
  const toggleMotor = async () => {
    if (actionLoading) return;
    const newVal = state.motorStatus === 1 ? 0 : 1;
    if (isSimulating) {
      setState(prev => ({ ...prev, motorStatus: newVal }));
      showToast(newVal === 1 ? 'Motor started' : 'Motor stopped', 'success');
      return;
    }
    setActionLoading(true);
    try {
      // V4 = Relay pin on ESP32
      const res = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: 'V4', value: newVal }) });
      if (!res.ok) throw new Error('Hardware control failed');
      setState(prev => ({ ...prev, motorStatus: newVal }));
      showToast(newVal === 1 ? 'Motor started' : 'Motor stopped', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const setMode = async (mode: 'AUTO' | 'MANUAL') => {
    if (actionLoading) return;
    if (isSimulating) {
      setState(prev => ({ ...prev, mode }));
      showToast(`Switched to ${mode} mode`, 'success');
      return;
    }
    setActionLoading(true);
    try {
      // V3 = Mode pin on ESP32 (1=AUTO, 0=MANUAL)
      const res = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: 'V3', value: mode === 'AUTO' ? 1 : 0 }) });
      if (!res.ok) throw new Error('Hardware control failed');
      setState(prev => ({ ...prev, mode }));
      showToast(`Switched to ${mode} mode`, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const saveSettings = () => {
    localStorage.setItem('aquasphere_settings', JSON.stringify({ tankCapacity, sensorOffset }));
    showToast('Settings saved', 'success');
  };

  // Load settings on mount
  useEffect(() => {
    const saved = localStorage.getItem('aquasphere_settings');
    if (saved) {
      const { tankCapacity: c, sensorOffset: o } = JSON.parse(saved);
      setTankCapacity(c ?? 1000);
      setSensorOffset(o ?? 5);
    }
  }, []);

  // ── Analytics ───────────────────────────────────────────────────────────────
  const dailyAvg = history.length > 0 ? Math.round(history.reduce((a, c) => a + c.water_level, 0) / history.length) : 0;
  const peakTime = history.length > 0
    ? format(new Date([...history].sort((a, b) => b.water_level - a.water_level)[0].timestamp), 'HH:mm')
    : '--:--';

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 font-sans selection:bg-cyan-500/30 bg-mesh">
      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>

      {/* Background glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-cyan-600/10 blur-[150px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[150px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 px-8 py-6 bg-[#020617]/40 backdrop-blur-3xl border-b border-white/[0.05] flex items-center justify-between">
        <div className="flex items-center gap-5">
          <div className="relative group">
            <div className="p-3 bg-gradient-to-br from-cyan-500 to-indigo-600 rounded-2xl shadow-[0_0_30px_-5px_rgba(6,182,212,0.6)] group-hover:scale-110 transition-transform duration-500">
              <Droplets className="text-white" size={24} />
            </div>
            <div className={cn('absolute -bottom-1 -right-1 w-4 h-4 border-[3px] border-[#020617] rounded-full shadow-lg', wsConnected || isSimulating ? 'bg-emerald-500' : 'bg-rose-500')} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-white">Aqua<span className="text-cyan-400">Sphere</span></h1>
            <div className="flex items-center gap-2">
              <div className={cn('w-2 h-2 rounded-full', wsConnected || isSimulating ? 'bg-cyan-500 animate-pulse shadow-[0_0_10px_rgba(6,182,212,0.8)]' : 'bg-rose-500')} />
              <p className="text-[10px] text-slate-500 uppercase tracking-[0.3em] font-black">
                {isSimulating ? 'Simulation Active' : wsConnected ? 'System Online' : 'Link Severed'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-3 px-5 py-2.5 glass rounded-2xl border border-white/[0.05]">
            <div className={cn('w-2.5 h-2.5 rounded-full', state.motorStatus === 1 ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.6)] animate-pulse' : 'bg-slate-700')} />
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">{state.motorStatus === 1 ? 'Motor Active' : 'System Idle'}</span>
          </div>
          <button className="p-3 glass rounded-2xl border border-white/[0.05] text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-all duration-500 group">
            <Bell size={22} className="group-hover:rotate-12 transition-transform" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-6 pt-6 pb-32 max-w-4xl mx-auto">
        <AnimatePresence mode="wait">

          {/* ── Dashboard ── */}
          {activeTab === 'dashboard' && (
            <motion.div key="dashboard" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Tank Visual */}
                <Card className="flex flex-col items-center justify-center py-12 relative">
                  <div className="absolute top-6 right-6">
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-cyan-500/10 rounded-full border border-cyan-500/20">
                      <div className="w-1 h-1 rounded-full bg-cyan-500 animate-pulse" />
                      <span className="text-[8px] font-black text-cyan-400 uppercase tracking-widest">Real-time</span>
                    </div>
                  </div>
                  <TankVisual level={state.waterLevel} />
                  <div className="mt-10 text-center">
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Current Capacity</p>
                    <div className="flex items-baseline justify-center gap-1">
                      <h2 className="text-6xl font-black text-white tracking-tighter text-glow-cyan">{state.waterLevel}</h2>
                      <span className="text-2xl font-bold text-slate-600">%</span>
                    </div>
                  </div>
                </Card>

                {/* Controls */}
                <div className="space-y-6">
                  <Card title="Quick Controls" icon={Zap}>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="relative group">
                        <button
                          onClick={toggleMotor}
                          disabled={state.mode === 'AUTO' || actionLoading}
                          className={cn(
                            'w-full flex flex-col items-center justify-center p-8 rounded-[2rem] border transition-all duration-500',
                            state.mode === 'AUTO' ? 'bg-slate-900/50 border-white/5 text-slate-600 cursor-not-allowed' :
                              state.motorStatus === 1 ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20' :
                                'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                          )}
                        >
                          <div className={cn('p-4 rounded-2xl mb-3', state.motorStatus === 1 ? 'bg-red-500/20' : 'bg-emerald-500/20')}>
                            {actionLoading ? <RefreshCw className="animate-spin" size={32} /> : <Power size={32} />}
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-[0.2em]">
                            {state.mode === 'AUTO' ? 'Auto Mode Active' : state.motorStatus === 1 ? 'Stop Motor' : 'Start Motor'}
                          </span>
                        </button>
                        {state.mode === 'AUTO' && (
                          <div className="absolute -top-2 -right-2 bg-cyan-500 text-[8px] font-black text-white px-2 py-1 rounded-lg shadow-lg animate-bounce uppercase tracking-widest">AI Active</div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => setMode('AUTO')} className={cn('flex flex-col items-center justify-center p-6 rounded-[2rem] border transition-all duration-500', state.mode === 'AUTO' ? 'bg-cyan-600/10 border-cyan-500/30 text-cyan-400' : 'bg-slate-900/50 border-white/5 text-slate-500 hover:bg-white/5')}>
                          <div className={cn('p-3 rounded-2xl mb-3', state.mode === 'AUTO' ? 'bg-cyan-500/20' : 'bg-slate-800')}><Brain size={24} /></div>
                          <span className="text-[9px] font-black uppercase tracking-[0.15em]">Automatic</span>
                        </button>
                        <button onClick={() => setMode('MANUAL')} className={cn('flex flex-col items-center justify-center p-6 rounded-[2rem] border transition-all duration-500', state.mode === 'MANUAL' ? 'bg-indigo-600/10 border-indigo-500/30 text-indigo-400' : 'bg-slate-900/50 border-white/5 text-slate-500 hover:bg-white/5')}>
                          <div className={cn('p-3 rounded-2xl mb-3', state.mode === 'MANUAL' ? 'bg-indigo-500/20' : 'bg-slate-800')}><Zap size={24} /></div>
                          <span className="text-[9px] font-black uppercase tracking-[0.15em]">Manual</span>
                        </button>
                      </div>
                    </div>
                  </Card>

                  <Card title="Status Overview" icon={Activity}>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-4 bg-white/[0.03] rounded-2xl border border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-cyan-500/10 rounded-xl"><Activity className="text-cyan-400" size={16} /></div>
                          <span className="text-xs font-bold text-slate-300">Tracking Status</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={cn('w-1.5 h-1.5 rounded-full', isSimulating || wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500')} />
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isSimulating ? 'Simulating' : wsConnected ? 'Live' : 'Idle'}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-white/[0.03] rounded-2xl border border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-amber-500/10 rounded-xl"><Bell className="text-amber-400" size={16} /></div>
                          <span className="text-xs font-bold text-slate-300">Active Alerts</span>
                        </div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{alerts.length} Total</span>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card title="Live Tracking Feed" icon={Activity}>
                  <div className="space-y-4 mt-2 max-h-[280px] overflow-y-auto pr-2 custom-scrollbar">
                    {history.length === 0 ? (
                      <div className="text-center py-10 text-slate-600 text-[10px] font-black uppercase tracking-widest">Waiting for data...</div>
                    ) : history.slice(0, 8).map((entry, i) => (
                      <motion.div key={entry.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl border border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
                          <span className="text-xs font-bold text-slate-300">{entry.water_level}%</span>
                        </div>
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{format(new Date(entry.timestamp), 'HH:mm:ss')}</span>
                      </motion.div>
                    ))}
                  </div>
                </Card>

                <Card title="Recent Usage Trend" icon={TrendingUp}>
                  <div className="h-64 w-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={[...history].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).slice(-20)}>
                        <defs>
                          <linearGradient id="colorLevel" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                        <XAxis dataKey="timestamp" hide />
                        <YAxis domain={[0, 100]} hide />
                        <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #ffffff10', borderRadius: '16px', fontSize: '10px', fontWeight: 'bold' }} itemStyle={{ color: '#06b6d4' }} />
                        <Area type="monotone" dataKey="water_level" stroke="#06b6d4" strokeWidth={4} fillOpacity={1} fill="url(#colorLevel)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
            </motion.div>
          )}

          {/* ── Analytics ── */}
          {activeTab === 'analytics' && (
            <motion.div key="analytics" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <Card title="Historical Water Level (%)">
                <div className="h-80 w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={[...history].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).slice(-50)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                      <XAxis dataKey="timestamp" tickFormatter={t => format(new Date(t), 'HH:mm')} stroke="#64748b" fontSize={10} />
                      <YAxis stroke="#64748b" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff10', borderRadius: '12px' }} />
                      <Line type="monotone" dataKey="water_level" stroke="#06b6d4" strokeWidth={2} dot={false} animationDuration={1500} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <div className="grid grid-cols-2 gap-6">
                <Card title="Daily Avg">
                  <div className="text-center py-4">
                    <h4 className="text-3xl font-bold">{dailyAvg}%</h4>
                    <p className="text-xs text-slate-500 mt-1">Session Average</p>
                  </div>
                </Card>
                <Card title="Peak Usage">
                  <div className="text-center py-4">
                    <h4 className="text-3xl font-bold text-cyan-400">{peakTime}</h4>
                    <p className="text-xs text-slate-500 mt-1">Lowest level time</p>
                  </div>
                </Card>
              </div>
            </motion.div>
          )}

          {/* ── AI ── */}
          {activeTab === 'ai' && (
            <motion.div key="ai" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">

              {/* ── Header card ── */}
              <Card className="bg-gradient-to-br from-indigo-600/10 to-cyan-600/10 border-cyan-500/20 relative overflow-hidden">
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-cyan-500/10 blur-[80px] rounded-full" />
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-5">
                    <div className="relative">
                      <div className="p-4 bg-gradient-to-br from-cyan-500 to-indigo-600 rounded-[1.5rem] shadow-xl shadow-cyan-500/20">
                        <Brain className="text-white" size={28} />
                      </div>
                      {aiInsight && (
                        <div className={cn('absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#020617]',
                          aiInsight.status === 'critical' ? 'bg-rose-500 animate-pulse' :
                            aiInsight.status === 'warning' ? 'bg-amber-500 animate-pulse' :
                              'bg-emerald-500'
                        )} />
                      )}
                    </div>
                    <div>
                      <h2 className="text-2xl font-black tracking-tight">Gemini AI Insights</h2>
                      <p className="text-[10px] text-cyan-400 font-black uppercase tracking-[0.2em]">Real-time Predictive Intelligence</p>
                    </div>
                  </div>
                  <button
                    onClick={requestAiRefresh}
                    disabled={aiRefreshing}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl text-cyan-400 text-[10px] font-black uppercase tracking-widest hover:bg-cyan-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <RefreshCw size={14} className={aiRefreshing ? 'animate-spin' : ''} />
                    {aiRefreshing ? 'Analyzing…' : 'Refresh AI'}
                  </button>
                </div>

                {/* Source badge + last updated */}
                {aiInsight && (
                  <div className="flex items-center gap-3 mt-4 mb-6">
                    <div className={cn('flex items-center gap-1.5 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest',
                      aiInsight.source === 'gemini'
                        ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                        : 'bg-slate-700/30 border-slate-600/30 text-slate-400'
                    )}>
                      <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                      {aiInsight.source === 'gemini' ? 'Gemini 2.0 Flash' : 'Fallback Analysis'}
                    </div>
                    <div className={cn('flex items-center gap-1.5 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest',
                      aiInsight.confidence === 'high' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                        aiInsight.confidence === 'medium' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                          'bg-slate-700/30 border-slate-600/30 text-slate-400'
                    )}>
                      Confidence: {aiInsight.confidence}
                    </div>
                    <span className="text-[9px] text-slate-600 font-bold ml-auto">Updated {(() => { try { return format(new Date(aiInsight.generatedAt), 'HH:mm:ss'); } catch { return '—'; } })()}</span>
                  </div>
                )}

                {/* Status + Headline */}
                {aiInsight ? (
                  <div className={cn('p-6 rounded-[2rem] border mb-6',
                    aiInsight.status === 'critical' ? 'bg-rose-500/5 border-rose-500/20' :
                      aiInsight.status === 'warning' ? 'bg-amber-500/5 border-amber-500/20' :
                        'bg-emerald-500/5 border-emerald-500/20'
                  )}>
                    <div className="flex items-start gap-4">
                      <div className={cn('p-3 rounded-2xl mt-1',
                        aiInsight.status === 'critical' ? 'bg-rose-500/20' :
                          aiInsight.status === 'warning' ? 'bg-amber-500/20' :
                            'bg-emerald-500/20'
                      )}>
                        {aiInsight.status === 'critical' ? <XCircle className="text-rose-400" size={22} /> :
                          aiInsight.status === 'warning' ? <AlertTriangle className="text-amber-400" size={22} /> :
                            <CheckCircle className="text-emerald-400" size={22} />}
                      </div>
                      <div className="flex-1">
                        <div className={cn('text-[10px] font-black uppercase tracking-[0.2em] mb-1',
                          aiInsight.status === 'critical' ? 'text-rose-400' :
                            aiInsight.status === 'warning' ? 'text-amber-400' :
                              'text-emerald-400'
                        )}>{aiInsight.statusLabel}</div>
                        <p className="text-white font-bold text-sm leading-relaxed">{aiInsight.headline}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-black/20 rounded-[2rem] border border-white/5 mb-6 flex items-center justify-center">
                    <div className="flex items-center gap-3 text-slate-500">
                      <RefreshCw size={18} className="animate-spin" />
                      <span className="text-sm font-bold">Waiting for first AI analysis…</span>
                    </div>
                  </div>
                )}

                {/* Metrics row */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="p-6 bg-black/20 rounded-[2rem] border border-white/5">
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-3">Estimated Empty Time</p>
                    {aiInsight?.predictedEmptyTime ? (
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-black text-white tracking-tighter text-glow-cyan">
                          {format(new Date(aiInsight.predictedEmptyTime), 'HH:mm')}
                        </span>
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">Today</span>
                      </div>
                    ) : (
                      <span className="text-lg font-bold text-slate-500">
                        {aiInsight ? (state.motorStatus === 1 ? 'Filling ↑' : 'Stable') : '——'}
                      </span>
                    )}
                    <div className="mt-4 flex items-center gap-2 text-amber-400/80 bg-amber-400/5 w-fit px-3 py-1.5 rounded-full border border-amber-400/10">
                      <TrendingDown size={12} />
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        {aiInsight ? `${aiInsight.drainRatePerMin}% / min` : '—'}
                      </span>
                    </div>
                  </div>
                  <div className="p-6 bg-black/20 rounded-[2rem] border border-white/5">
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-3">Drain Rate</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-cyan-400 tracking-tighter text-glow-cyan">
                        {aiInsight ? `${aiInsight.drainRatePerMin > 0 ? '-' : '+'}${aiInsight.drainRatePerMin}` : '—'}
                      </span>
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">%/min</span>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-emerald-400/80 bg-emerald-400/5 w-fit px-3 py-1.5 rounded-full border border-emerald-400/10">
                      <TrendingUp size={12} />
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        {aiInsight ? (aiInsight.drainRatePerMin > 0 ? 'Draining' : 'Filling / Stable') : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Recommendation */}
                {aiInsight?.recommendation && (
                  <div className="p-6 bg-indigo-500/5 rounded-[2rem] border border-indigo-500/20 mb-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">AI Recommendation</h4>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed font-medium">{aiInsight.recommendation}</p>
                  </div>
                )}

                {/* Tips */}
                {aiInsight?.tips && aiInsight.tips.length > 0 && (
                  <div className="p-6 bg-white/[0.02] rounded-[2rem] border border-white/5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Smart Tips</h4>
                    </div>
                    <div className="space-y-3">
                      {aiInsight.tips.map((tip, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="flex items-start gap-3 p-3 bg-cyan-500/5 rounded-2xl border border-cyan-500/10"
                        >
                          <div className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-[9px] font-black text-cyan-400">{i + 1}</span>
                          </div>
                          <p className="text-xs text-slate-300 font-medium leading-relaxed">{tip}</p>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Simulation warning */}
                {isSimulating && (
                  <div className="mt-4 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={14} className="text-amber-400" />
                      <p className="text-[10px] text-amber-400 font-bold uppercase tracking-widest">
                        Simulation mode — AI uses simulated data. Disable for real hardware insights.
                      </p>
                    </div>
                  </div>
                )}
              </Card>

              {/* Math prediction card (kept as supplemental) */}
              {prediction && (
                <Card title="Statistical Trend Analysis" icon={TrendingDown}>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                      <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">Slope (linear)</p>
                      <span className="text-2xl font-black text-cyan-400">
                        {(prediction.slope > 0 ? '+' : '') + prediction.slope.toFixed(3)}
                      </span>
                      <span className="text-xs text-slate-600 ml-1">%/min</span>
                    </div>
                    <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                      <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">Data Points</p>
                      <span className="text-2xl font-black text-white">{history.length}</span>
                      <span className="text-xs text-slate-600 ml-1">readings</span>
                    </div>
                  </div>
                </Card>
              )}

            </motion.div>
          )}

          {/* ── Alerts ── */}
          {activeTab === 'alerts' && (
            <motion.div key="alerts" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                  <Bell size={48} className="mb-4 opacity-20" />
                  <p>No active alerts</p>
                </div>
              ) : alerts.map(alert => (
                <div key={alert.id}>
                  <Card className="border-l-4 border-l-amber-500">
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-amber-500/10 rounded-lg"><AlertTriangle className="text-amber-500" size={20} /></div>
                      <div>
                        <h4 className="font-bold text-slate-200">{alert.alert_type}</h4>
                        <p className="text-sm text-slate-400 mt-1">{alert.description}</p>
                        <p className="text-[10px] text-slate-600 mt-2 uppercase font-bold">{(() => { try { return format(new Date(alert.timestamp), 'MMM d, HH:mm'); } catch { return 'Unknown time'; } })()}</p>
                      </div>
                    </div>
                  </Card>
                </div>
              ))}
            </motion.div>
          )}

          {/* ── Settings ── */}
          {activeTab === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <Card title="Device Configuration" icon={SettingsIcon}>
                <div className="space-y-6">
                  {/* Simulation toggle */}
                  <div className="flex items-center justify-between p-4 bg-cyan-500/5 rounded-2xl border border-cyan-500/20">
                    <div>
                      <h4 className="text-sm font-bold text-white">Simulation Mode</h4>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Simulate real-time tracking</p>
                    </div>
                    <button
                      onClick={() => setIsSimulating(p => !p)}
                      className={cn('w-12 h-6 rounded-full relative transition-all duration-500 flex items-center px-1 border', isSimulating ? 'bg-cyan-500/20 border-cyan-500/40' : 'bg-slate-900 border-white/5')}
                    >
                      <motion.div animate={{ x: isSimulating ? 24 : 0 }} className={cn('w-4 h-4 rounded-full', isSimulating ? 'bg-cyan-400' : 'bg-slate-700')} />
                    </button>
                  </div>

                  {/* Blynk token (read-only display) */}
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 block">Blynk Auth Token</label>
                    <div className="relative group">
                      <input type="password" value="••••••••••••••••" readOnly className="w-full bg-black/20 border border-white/5 rounded-2xl px-5 py-4 text-sm focus:outline-none" />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">
                        <RefreshCw size={14} className="text-slate-400" />
                      </div>
                    </div>
                  </div>

                  {/* Settings inputs */}
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 block">Tank Capacity (L)</label>
                      <input type="number" value={tankCapacity} onChange={e => setTankCapacity(Number(e.target.value))} className="w-full bg-black/20 border border-white/5 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-cyan-500/50 transition-all" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 block">Sensor Offset (cm)</label>
                      <input type="number" value={sensorOffset} onChange={e => setSensorOffset(Number(e.target.value))} className="w-full bg-black/20 border border-white/5 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-cyan-500/50 transition-all" />
                    </div>
                  </div>
                  <button onClick={saveSettings} className="w-full py-4 bg-cyan-500/10 text-cyan-400 font-black uppercase tracking-[0.2em] text-[10px] rounded-2xl hover:bg-cyan-500/20 transition-all active:scale-95 border border-cyan-500/30">
                    Save Settings
                  </button>
                </div>
              </Card>

              <Card title="Notifications" icon={Bell}>
                <div className="space-y-6">
                  {notifications.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-4 rounded-3xl hover:bg-white/[0.02] transition-colors duration-500">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-200">{item.label}</span>
                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-1">{item.enabled ? 'Enabled' : 'Muted'}</span>
                      </div>
                      <button
                        onClick={() => setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, enabled: !n.enabled } : n))}
                        className={cn('w-16 h-8 rounded-full relative transition-all duration-700 flex items-center px-2 border', item.enabled ? 'bg-cyan-500/20 border-cyan-500/40' : 'bg-slate-900 border-white/[0.05]')}
                      >
                        <span className={cn('text-[9px] font-black absolute transition-all duration-700', item.enabled ? 'left-3 opacity-100 text-cyan-400' : 'left-5 opacity-0')}>ON</span>
                        <span className={cn('text-[9px] font-black absolute transition-all duration-700', item.enabled ? 'right-5 opacity-0' : 'right-3 opacity-100 text-slate-600')}>OFF</span>
                        <motion.div animate={{ x: item.enabled ? 32 : 0 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }} className={cn('w-5 h-5 rounded-full shadow-xl z-10', item.enabled ? 'bg-cyan-400 shadow-cyan-500/50' : 'bg-slate-700')} />
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-lg glass rounded-[2.5rem] px-8 py-4 flex items-center justify-between z-50 border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
        <NavItem active={activeTab === 'dashboard'} icon={Droplets} label="Home" onClick={() => setActiveTab('dashboard')} />
        <NavItem active={activeTab === 'analytics'} icon={Activity} label="Stats" onClick={() => setActiveTab('analytics')} />
        <NavItem active={activeTab === 'ai'} icon={Brain} label="AI" onClick={() => setActiveTab('ai')} />
        <NavItem active={activeTab === 'alerts'} icon={Bell} label="Alerts" onClick={() => setActiveTab('alerts')} />
        <NavItem active={activeTab === 'settings'} icon={SettingsIcon} label="Config" onClick={() => setActiveTab('settings')} />
      </nav>
    </div>
  );
}
