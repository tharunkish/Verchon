import React from 'react';
import { Activity, ShieldAlert, ShieldCheck, AlertTriangle, Layers, Briefcase, Search, Command, Settings, RotateCcw, Sun, Moon } from 'lucide-react';

export default function Header({
  regime,
  activeTab,
  setActiveTab,
  onOpenCommandK,
  onOpenSettings,
  onOpenRestartModal,
  themeStyle = 'apple',
  colorMode = 'dark',
  setColorMode,
}) {
  const regimeName = regime?.regime || 'LOADING';
  const regimeScore = regime?.regime_score ?? 'N/A';
  const price = regime?.current_price ? `₹${regime.current_price.toLocaleString('en-IN')}` : 'N/A';

  const trend = regime?.trend || {};
  const vol = regime?.volatility || {};

  // Regime style mapping with accessible colors for both Light & Dark modes
  const getRegimeColor = () => {
    switch (regimeName) {
      case 'SUPPORTIVE':
        return {
          pill: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25',
          scoreBadge: 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/30',
          icon: ShieldCheck,
        };
      case 'HOSTILE':
        return {
          pill: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/25',
          scoreBadge: 'bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-500/30',
          icon: ShieldAlert,
        };
      case 'CAUTION':
        return {
          pill: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25',
          scoreBadge: 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/30',
          icon: AlertTriangle,
        };
      default:
        return {
          pill: 'bg-[var(--border-subtle)] text-[var(--text-secondary)] border-[var(--border-subtle)]',
          scoreBadge: 'bg-[var(--border-subtle)] text-[var(--text-primary)] border-[var(--border-subtle)]',
          icon: Activity,
        };
    }
  };

  const currentTheme = getRegimeColor();
  const RegimeIcon = currentTheme.icon;

  const toggleColorMode = () => {
    if (setColorMode) {
      setColorMode(colorMode === 'dark' ? 'light' : 'dark');
    }
  };

  const navItems = [
    { id: 'scanner', label: '1. Market Scanner & AI Dossiers', shortLabel: '1. Scanner', icon: Layers, num: '1' },
    { id: 'portfolio', label: '2. Paper Portfolio & Exit Alerts', shortLabel: '2. Portfolio', icon: Briefcase, num: '2' },
    { id: 'deepdive', label: '3. Stock Deep Dive & Strategy Rules', shortLabel: '3. Deep Dive', icon: Search, num: '3' },
    { id: 'news', label: '4. Corporate Radar & News Hub', shortLabel: '4. News Hub', icon: Activity, num: '4' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/85 backdrop-blur-xl transition-colors duration-200">
      {/* Upper Brand & Market Regime Status Bar */}
      <div className="flex h-14 items-center justify-between px-4 sm:px-6">
        {/* Left: Brand Identity */}
        <div className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500 text-white font-mono text-xs font-black shadow-md shadow-blue-500/20">
            V
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-black tracking-widest text-[var(--text-primary)]">
              VERCHON
            </span>
            <span className="hidden sm:inline-block rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-1.5 py-0.5 font-mono text-[9px] font-medium text-[var(--text-secondary)]">
              DETERMINISTIC ENGINE
            </span>
          </div>
        </div>

        {/* Center: Live Nifty 50 Market Regime Badge */}
        <div className={`hidden md:flex items-center space-x-2.5 rounded-full border px-3.5 py-1 text-xs backdrop-blur-md transition-colors ${currentTheme.pill}`}>
          <RegimeIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="font-semibold tracking-tight">
            NIFTY 50: {regimeName}
          </span>
          <span className="font-mono-num opacity-80 text-[11px]">({price})</span>
          <span className={`rounded-full border px-2 py-0.2 font-mono text-[10px] font-bold ${currentTheme.scoreBadge}`}>
            {regimeScore}/100
          </span>
          {trend.price_vs_50dma != null && (
            <span className="font-mono-num text-[11px] opacity-80">
              50D: <span className={trend.price_vs_50dma >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-rose-600 dark:text-rose-400 font-semibold'}>{trend.price_vs_50dma > 0 ? '+' : ''}{trend.price_vs_50dma}%</span>
            </span>
          )}
          {vol.realized_vol_20d != null && (
            <span className="font-mono-num text-[10px] opacity-70">
              Vol: {vol.realized_vol_20d}%
            </span>
          )}
        </div>

        {/* Right: Actions, Command K, Appearance, Settings */}
        <div className="flex items-center space-x-2">
          {/* Backend Connectivity Status */}
          <div className="hidden lg:flex items-center space-x-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 py-1 font-mono text-[10px]">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${regime ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
            <span className="text-[var(--text-secondary)]">
              {regime ? 'API 8000 CONNECTED' : 'OFFLINE'}
            </span>
          </div>

          {/* Command K Trigger */}
          <button
            onClick={onOpenCommandK}
            className="flex items-center space-x-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] hover:border-black/20 dark:hover:border-white/20"
          >
            <Search className="h-3 w-3" />
            <span className="hidden sm:inline text-[11px]">Search</span>
            <kbd className="flex items-center rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1 font-mono text-[9px] text-[var(--text-muted)]">
              <Command className="mr-0.5 h-2.5 w-2.5" /> K
            </kbd>
          </button>

          {/* Quick Light/Dark Mode Switcher */}
          <button
            onClick={toggleColorMode}
            title={`Switch to ${colorMode === 'dark' ? 'Light' : 'Dark'} Mode`}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-black/20 dark:hover:border-white/20 transition"
          >
            {colorMode === 'dark' ? (
              <Sun className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <Moon className="h-3.5 w-3.5 text-blue-500" />
            )}
          </button>

          {/* Settings Modal Button */}
          <button
            onClick={onOpenSettings}
            title="Workstation Settings"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-black/20 dark:hover:border-white/20 transition"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>

          {/* System Restart Button */}
          <button
            onClick={onOpenRestartModal}
            title="Completely restart server and local AI engine"
            className="flex items-center space-x-1.5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition"
          >
            <RotateCcw className="h-3 w-3" />
            <span className="hidden sm:inline font-mono text-[10px] font-semibold">Restart</span>
          </button>
        </div>
      </div>

      {/* Lower Navigation Tabs (Apple Segmented Style) */}
      <div className="flex h-11 items-center space-x-1 border-t border-[var(--border-subtle)] px-4 sm:px-6 overflow-x-auto no-scrollbar">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center space-x-2 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all duration-150 ${
                isActive
                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]/50'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-blue-500' : 'text-[var(--text-muted)]'}`} />
              <span className="hidden sm:inline">{item.label}</span>
              <span className="sm:hidden">{item.shortLabel}</span>
              <span className={`rounded px-1 text-[9px] font-mono ${
                isActive
                  ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold'
                  : 'bg-[var(--border-subtle)] text-[var(--text-muted)]'
              }`}>
                {item.num}
              </span>
            </button>
          );
        })}
      </div>
    </header>
  );
}
