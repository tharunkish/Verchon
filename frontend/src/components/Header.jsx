import React from 'react';
import { Activity, ShieldAlert, ShieldCheck, AlertTriangle, Layers, Briefcase, Search, Command, Settings, RotateCcw } from 'lucide-react';

export default function Header({ regime, activeTab, setActiveTab, onOpenCommandK, onOpenSettings, onOpenRestartModal, themeMode }) {
  const regimeName = regime?.regime || 'LOADING';
  const regimeScore = regime?.regime_score ?? 'N/A';
  const price = regime?.current_price ? `₹${regime.current_price.toLocaleString('en-IN')}` : 'N/A';

  const trend = regime?.trend || {};
  const vol = regime?.volatility || {};

  // Regime style mapping
  const getRegimeColor = () => {
    switch (regimeName) {
      case 'SUPPORTIVE':
        return {
          bg: 'bg-emerald-950/60 border-emerald-800/80 text-emerald-400',
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-600/40',
          icon: ShieldCheck,
        };
      case 'HOSTILE':
        return {
          bg: 'bg-rose-950/60 border-rose-800/80 text-rose-400',
          badge: 'bg-rose-500/20 text-rose-300 border-rose-600/40',
          icon: ShieldAlert,
        };
      case 'CAUTION':
        return {
          bg: 'bg-amber-950/60 border-amber-800/80 text-amber-400',
          badge: 'bg-amber-500/20 text-amber-300 border-amber-600/40',
          icon: AlertTriangle,
        };
      default:
        return {
          bg: 'bg-zinc-900 border-zinc-800 text-zinc-400',
          badge: 'bg-zinc-800 text-zinc-300 border-zinc-700',
          icon: Activity,
        };
    }
  };

  const currentTheme = getRegimeColor();
  const RegimeIcon = currentTheme.icon;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.07] bg-[#07070a]/80 backdrop-blur-xl">
      {/* Upper Brand & Market Regime Status Bar */}
      <div className="flex h-14 items-center justify-between px-6">
        {/* Left: Brand Identity */}
        <div className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-500/40 bg-gradient-to-br from-rose-950/80 via-red-950/50 to-zinc-950 font-mono text-xs font-black tracking-wider text-rose-400 shadow-md shadow-rose-950/60 ring-1 ring-rose-500/20">
            V
          </div>
          <div>
            <span className="font-mono text-xs font-extrabold tracking-widest text-zinc-100">
              VERCHON
            </span>
            <span className="ml-2 rounded border border-rose-900/60 bg-rose-950/50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-rose-300">
              VECTOR TERMINAL
            </span>
          </div>
        </div>

        {/* Center: Live Nifty 50 Market Regime Badge */}
        <div className={`flex items-center space-x-3 rounded-full border px-4 py-1 text-xs backdrop-blur-md ${currentTheme.bg}`}>
          <RegimeIcon className="h-3.5 w-3.5" />
          <span className="font-semibold tracking-wide">
            NIFTY 50: {regimeName}
          </span>
          <span className="font-mono-num text-zinc-400">({price})</span>
          <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold ${currentTheme.badge}`}>
            {regimeScore}/100
          </span>
          {trend.price_vs_50dma != null && (
            <span className="font-mono-num text-[11px] text-zinc-400">
              vs 50D: <span className={trend.price_vs_50dma >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{trend.price_vs_50dma > 0 ? '+' : ''}{trend.price_vs_50dma}%</span>
            </span>
          )}
          {vol.realized_vol_20d != null && (
            <span className="font-mono-num text-[11px] text-zinc-500">
              Vol: {vol.realized_vol_20d}%
            </span>
          )}
        </div>

        {/* Right: Connectivity Status, Command K, Settings, and Restart */}
        <div className="flex items-center space-x-2.5">
          <div className="flex items-center space-x-1.5 rounded border border-white/[0.08] bg-zinc-900/60 px-2 py-0.5 font-mono text-[10px]">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${regime ? 'bg-emerald-400' : 'bg-rose-400 animate-pulse'}`} />
            <span className={regime ? 'text-zinc-400' : 'text-rose-400'}>
              {regime ? 'API 8000 CONNECTED' : 'BACKEND OFFLINE'}
            </span>
          </div>

          <button
            onClick={onOpenCommandK}
            className="flex items-center space-x-2 rounded-lg border border-white/[0.08] bg-zinc-900/70 px-2.5 py-1 text-xs text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
          >
            <Search className="h-3 w-3" />
            <span className="font-mono text-[11px]">Search Ticker</span>
            <kbd className="flex items-center rounded border border-zinc-700 bg-zinc-800 px-1 font-mono text-[9px] text-zinc-400">
              <Command className="mr-0.5 h-2.5 w-2.5" /> K
            </kbd>
          </button>

          <button
            onClick={onOpenSettings}
            title="Workstation Settings"
            className="flex items-center space-x-1.5 rounded-lg border border-white/[0.08] bg-zinc-900/70 px-2.5 py-1 text-xs text-zinc-400 hover:border-rose-500/50 hover:text-rose-200 transition"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="font-mono text-[10px]">Theme</span>
          </button>

          <button
            onClick={onOpenRestartModal}
            title="Completely restart server and local AI engine"
            className="flex items-center space-x-1.5 rounded-lg border border-rose-500/30 bg-rose-950/40 px-2.5 py-1 text-xs text-rose-300 hover:border-rose-500/70 hover:bg-rose-900/60 transition shadow-sm"
          >
            <RotateCcw className="h-3 w-3" />
            <span className="font-mono text-[10px] font-semibold">Restart</span>
          </button>
        </div>
      </div>

      {/* Lower Navigation Tabs (Full-Screen Workspace Switcher) */}
      <div className="flex h-11 items-center space-x-1 border-t border-white/[0.06] px-6">
        <button
          onClick={() => setActiveTab('scanner')}
          className={`flex items-center space-x-2 border-b-2 px-4 py-2 font-mono text-xs font-medium transition ${
            activeTab === 'scanner'
              ? 'border-rose-500 text-rose-100 shadow-[0_1px_12px_rgba(225,29,72,0.35)]'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>1. Market Scanner & AI Dossiers</span>
          <span className="rounded border border-zinc-800 bg-zinc-900/80 px-1 text-[9px] text-zinc-500">1</span>
        </button>

        <button
          onClick={() => setActiveTab('portfolio')}
          className={`flex items-center space-x-2 border-b-2 px-4 py-2 font-mono text-xs font-medium transition ${
            activeTab === 'portfolio'
              ? 'border-rose-500 text-rose-100 shadow-[0_1px_12px_rgba(225,29,72,0.35)]'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Briefcase className="h-3.5 w-3.5" />
          <span>2. Paper Portfolio & Exit Alerts</span>
          <span className="rounded border border-zinc-800 bg-zinc-900/80 px-1 text-[9px] text-zinc-500">2</span>
        </button>

        <button
          onClick={() => setActiveTab('deepdive')}
          className={`flex items-center space-x-2 border-b-2 px-4 py-2 font-mono text-xs font-medium transition ${
            activeTab === 'deepdive'
              ? 'border-rose-500 text-rose-100 shadow-[0_1px_12px_rgba(225,29,72,0.35)]'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Search className="h-3.5 w-3.5" />
          <span>3. Stock Deep Dive & Strategy Rules</span>
          <span className="rounded border border-zinc-800 bg-zinc-900/80 px-1 text-[9px] text-zinc-500">3</span>
        </button>

        <button
          onClick={() => setActiveTab('news')}
          className={`flex items-center space-x-2 border-b-2 px-4 py-2 font-mono text-xs font-medium transition ${
            activeTab === 'news'
              ? 'border-rose-500 text-rose-100 shadow-[0_1px_12px_rgba(225,29,72,0.35)]'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Activity className="h-3.5 w-3.5" />
          <span>4. Corporate Radar & News Hub</span>
          <span className="rounded border border-zinc-800 bg-zinc-900/80 px-1 text-[9px] text-zinc-500">4</span>
        </button>
      </div>
    </header>
  );
}
