import React from 'react';
import { motion } from 'framer-motion';
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
          dot: 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]',
          badge: 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25 shadow-sm',
          icon: ShieldCheck,
        };
      case 'HOSTILE':
        return {
          label: 'Caution: Downdraft',
          dot: 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]',
          badge: 'text-rose-700 dark:text-rose-400 bg-rose-500/10 border-rose-500/25 shadow-sm',
          icon: ShieldAlert,
        };
      case 'CAUTION':
        return {
          label: 'Market Uncertain',
          dot: 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]',
          badge: 'text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/25 shadow-sm',
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
    <header className="sticky top-0 z-40 w-full border-b border-[#b8a597] dark:border-[#363c44] bg-[#edd9cc]/90 dark:bg-[#1c232d]/92 backdrop-blur-2xl transition-all duration-300">
      {/* Top Bar: Brand & System Pulse */}
      <div className="flex h-14 items-center justify-between px-5 sm:px-8 max-w-7xl mx-auto">
        {/* Left: Warm Crafted Monogram */}
        <div className="flex items-center space-x-3">
          <motion.div 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#806350] dark:bg-[#222b37] border border-[#806350]/30 dark:border-[#363c44] text-[#edd9cc] dark:text-[#e0d1b9] font-bold text-sm shadow-md cursor-default font-mono"
          >
            V
          </motion.div>
          <div className="flex flex-col">
            <span className="text-xs font-black tracking-tight text-[#2d1f17] dark:text-[#e0d1b9] flex items-center space-x-1.5">
              <span>VERCHON</span>
              <span className="h-1 w-1 rounded-full bg-[#b20808] dark:bg-[#958a7a]" />
            </span>
            <span className="text-[10px] text-[#806350] dark:text-[#958a7a] font-medium">
              Swing Trading Terminal
            </span>
          </div>
        </div>

        {/* Center: Calm Market Advisory Pill */}
        <motion.div 
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className={`hidden md:flex items-center space-x-2.5 rounded-full border px-4 py-1.5 text-xs backdrop-blur-xl transition-all ${reg.badge}`}
        >
          <span className={`h-2 w-2 rounded-full ${reg.dot}`} />
          <span className="font-semibold">{reg.label}</span>
          <span className="opacity-40">·</span>
          <span className="font-semibold font-mono-num">Nifty 50 {price}</span>
          <span className="opacity-40">·</span>
          <span className="font-semibold font-mono-num text-[11px] opacity-90">Health {regimeScore}/100</span>
        </motion.div>

        {/* Right: Search & Tactile Actions */}
        <div className="flex items-center space-x-2">
          {/* Search Trigger */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={onOpenCommandK}
            className="flex items-center space-x-2 rounded-xl border border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#222b37] hover:bg-[#e8dacd] dark:hover:bg-[#283341] px-3.5 py-1.5 text-xs text-[#806350] dark:text-[#958a7a] hover:text-[#2d1f17] hover:dark:text-[#e0d1b9] transition shadow-xs"
          >
            <Search className="h-3.5 w-3.5 opacity-70" />
            <span className="hidden sm:inline text-[11px] font-medium">Search Ticker</span>
            <kbd className="hidden sm:inline-block rounded border border-[#b8a597] dark:border-[#363c44] bg-[#edd9cc] dark:bg-[#1c232d] px-1 font-mono text-[9px] text-[#806350] dark:text-[#958a7a] shadow-2xs">
              ⌘K
            </kbd>
          </motion.button>

          {/* 1-Click Appearance Switcher */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            onClick={toggleColorMode}
            title={`Switch to ${colorMode === 'dark' ? 'Light' : 'Dark'} Mode`}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#222b37] hover:bg-[#e8dacd] dark:hover:bg-[#283341] text-[#806350] dark:text-[#958a7a] hover:text-[#2d1f17] dark:hover:text-[#e0d1b9] transition shadow-xs"
          >
            {colorMode === 'dark' ? (
              <Sun className="h-3.5 w-3.5 text-[#e0d1b9]" />
            ) : (
              <Moon className="h-3.5 w-3.5 text-[#806350]" />
            )}
          </motion.button>

          {/* Preferences */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            onClick={onOpenSettings}
            title="Preferences"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#222b37] hover:bg-[#e8dacd] dark:hover:bg-[#283341] text-[#806350] dark:text-[#958a7a] hover:text-[#2d1f17] dark:hover:text-[#e0d1b9] transition shadow-xs"
          >
            <Settings className="h-3.5 w-3.5" />
          </motion.button>

          {/* System Restart */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            onClick={onOpenRestartModal}
            title="Restart System & Local AI"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition shadow-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </motion.button>
        </div>
      </div>

      {/* Segmented Apple Navigation Tabs with Fluid Spring Pill */}
      <div className="flex h-12 items-center px-5 sm:px-8 max-w-7xl mx-auto overflow-x-auto no-scrollbar">
        <div className="flex items-center space-x-1 p-1 rounded-2xl apple-dock">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative flex items-center space-x-2 rounded-xl px-4 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                  isActive
                    ? 'text-[#edd9cc] dark:text-[#1c232d]'
                    : 'text-[#806350] dark:text-[#958a7a] hover:text-[#2d1f17] dark:hover:text-[#e0d1b9]'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabPill"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    className="absolute inset-0 rounded-xl bg-[#806350] dark:bg-[#e0d1b9] shadow-sm border border-[#806350]/30 dark:border-transparent"
                  />
                )}
                <span className="relative z-10 flex items-center space-x-2">
                  <Icon className={`h-3.5 w-3.5 transition-colors ${isActive ? 'text-[#edd9cc] dark:text-[#1c232d]' : 'text-[#806350] dark:text-[#958a7a]'}`} />
                  <span>{item.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
