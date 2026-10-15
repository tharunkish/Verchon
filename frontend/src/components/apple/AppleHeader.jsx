import React from 'react';
import { Search, Command, Settings, RotateCcw, Sun, Moon, Compass, PieChart, LineChart, Newspaper, ShieldAlert, ShieldCheck, AlertCircle } from 'lucide-react';

export default function AppleHeader({
  regime,
  activeTab,
  setActiveTab,
  onOpenCommandK,
  onOpenSettings,
  onOpenRestartModal,
  colorMode = 'dark',
  setColorMode,
}) {
  const regimeName = regime?.regime || 'EVALUATING';
  const regimeScore = regime?.regime_score ?? '—';
  const price = regime?.current_price ? `₹${Number(regime.current_price).toLocaleString('en-IN')}` : '—';
  const trend = regime?.trend || {};

  const getRegimePresentation = () => {
    switch (regimeName) {
      case 'SUPPORTIVE':
        return {
          label: 'Market Supportive',
          dot: 'bg-emerald-500',
          badge: 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
          icon: ShieldCheck,
        };
      case 'HOSTILE':
        return {
          label: 'Caution: Downdraft',
          dot: 'bg-rose-500',
          badge: 'text-rose-700 dark:text-rose-400 bg-rose-500/10 border-rose-500/20',
          icon: ShieldAlert,
        };
      case 'CAUTION':
        return {
          label: 'Market Uncertain',
          dot: 'bg-amber-500',
          badge: 'text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
          icon: AlertCircle,
        };
      default:
        return {
          label: 'Evaluating Market',
          dot: 'bg-zinc-400',
          badge: 'text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
          icon: Compass,
        };
    }
  };

  const reg = getRegimePresentation();

  const toggleColorMode = () => {
    if (setColorMode) {
      setColorMode(colorMode === 'dark' ? 'light' : 'dark');
    }
  };

  const navItems = [
    { id: 'scanner', label: 'Market Scanner', icon: Compass },
    { id: 'portfolio', label: 'Paper Portfolio', icon: PieChart },
    { id: 'deepdive', label: 'Stock Deep Dive', icon: LineChart },
    { id: 'news', label: 'Corporate Radar', icon: Newspaper },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-black/[0.06] dark:border-white/[0.07] bg-white/80 dark:bg-[#0c0d12]/80 backdrop-blur-2xl transition-colors duration-200">
      {/* Top Bar: Brand & System Pulse */}
      <div className="flex h-14 items-center justify-between px-5 sm:px-8 max-w-7xl mx-auto">
        {/* Left: Warm Crafted Monogram */}
        <div className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-b from-zinc-800 to-zinc-950 dark:from-zinc-100 dark:to-zinc-300 text-white dark:text-zinc-950 font-semibold text-sm shadow-sm">
            V
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              VERCHON
            </span>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
              Swing Trading Journal
            </span>
          </div>
        </div>

        {/* Center: Calm Market Advisory Pill */}
        <div className={`hidden md:flex items-center space-x-2.5 rounded-full border px-4 py-1 text-xs backdrop-blur-md transition-colors ${reg.badge}`}>
          <span className={`h-2 w-2 rounded-full ${reg.dot}`} />
          <span className="font-semibold">{reg.label}</span>
          <span className="opacity-40">·</span>
          <span className="font-medium">Nifty 50 {price}</span>
          <span className="opacity-40">·</span>
          <span className="font-medium text-[11px] opacity-80">Health {regimeScore}/100</span>
        </div>

        {/* Right: Search & Tactile Actions */}
        <div className="flex items-center space-x-2">
          {/* Search Trigger */}
          <button
            onClick={onOpenCommandK}
            className="flex items-center space-x-2 rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.03] dark:bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-[11px]">Search Ticker</span>
            <kbd className="hidden sm:inline-block rounded border border-black/[0.1] dark:border-white/[0.15] bg-white dark:bg-zinc-800 px-1 font-mono text-[9px] text-zinc-500">
              ⌘K
            </kbd>
          </button>

          {/* 1-Click Appearance Switcher */}
          <button
            onClick={toggleColorMode}
            title={`Switch to ${colorMode === 'dark' ? 'Light' : 'Dark'} Mode`}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.03] dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
          >
            {colorMode === 'dark' ? (
              <Sun className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <Moon className="h-3.5 w-3.5 text-blue-500" />
            )}
          </button>

          {/* Preferences */}
          <button
            onClick={onOpenSettings}
            title="Preferences"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.03] dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>

          {/* System Restart */}
          <button
            onClick={onOpenRestartModal}
            title="Restart System & Local AI"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Segmented Apple Navigation Tabs */}
      <div className="flex h-11 items-center px-5 sm:px-8 max-w-7xl mx-auto overflow-x-auto no-scrollbar">
        <div className="flex items-center space-x-1 p-0.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.05]">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center space-x-2 rounded-lg px-3.5 py-1 text-xs transition-all duration-150 ${
                  isActive
                    ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 font-semibold shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-blue-500' : 'text-zinc-400 dark:text-zinc-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
