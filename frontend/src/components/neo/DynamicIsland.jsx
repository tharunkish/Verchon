import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, ShieldAlert, AlertTriangle, Activity, Sparkles, ChevronDown, Zap, Globe2, Compass, RotateCcw } from 'lucide-react';
import NumberTicker from './NumberTicker';

export default function DynamicIsland({
  regime,
  loadingScan,
  scanElapsed,
  loadingAI,
  aiElapsed,
  openPositionsCount = 0,
  unrealizedPnl = 0,
  onOpenSettings,
  onOpenRestartModal,
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const regimeName = regime?.regime || 'SUPPORTIVE';
  const regimeScore = regime?.regime_score ?? 85;
  const niftyPrice = regime?.current_price || 24850.5;

  const getRegimeTheme = () => {
    switch (regimeName) {
      case 'SUPPORTIVE':
        return {
          glow: 'from-emerald-500/20 to-teal-500/10',
          border: 'border-emerald-400/40 shadow-[0_0_25px_rgba(16,185,129,0.25)]',
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          text: 'text-emerald-400',
          dot: 'bg-emerald-400',
          icon: ShieldCheck,
        };
      case 'HOSTILE':
        return {
          glow: 'from-rose-500/20 to-red-500/10',
          border: 'border-rose-400/40 shadow-[0_0_25px_rgba(244,63,94,0.25)]',
          badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          text: 'text-rose-400',
          dot: 'bg-rose-400',
          icon: ShieldAlert,
        };
      case 'CAUTION':
        return {
          glow: 'from-amber-500/20 to-yellow-500/10',
          border: 'border-amber-400/40 shadow-[0_0_25px_rgba(245,158,11,0.25)]',
          badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          text: 'text-amber-400',
          dot: 'bg-amber-400',
          icon: AlertTriangle,
        };
      default:
        return {
          glow: 'from-cyan-500/20 to-indigo-500/10',
          border: 'border-cyan-400/40 shadow-[0_0_25px_rgba(6,182,212,0.25)]',
          badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
          text: 'text-cyan-400',
          dot: 'bg-cyan-400',
          icon: Activity,
        };
    }
  };

  const theme = getRegimeTheme();

  return (
    <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2">
      <motion.div
        layout
        onClick={() => setIsExpanded(!isExpanded)}
        transition={{ type: 'spring', damping: 25, stiffness: 320 }}
        className={`cursor-pointer overflow-hidden rounded-full border ${theme.border} bg-[#080d1e]/85 px-5 py-2.5 shadow-2xl backdrop-blur-3xl ring-1 ring-white/10 hover:bg-[#0c142c]/90 transition-colors`}
      >
        <div className="flex items-center space-x-3.5 text-xs">
          {/* 1. Live Orbiting Pulse */}
          <div className="relative flex h-3 w-3 items-center justify-center">
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-80 ${theme.dot}`} />
            <span className={`relative inline-flex h-2 w-2 rounded-full ${theme.dot} shadow-[0_0_10px_currentColor]`} />
          </div>

          {/* 2. Primary Status Label */}
          {loadingScan ? (
            <div className="flex items-center space-x-2 font-mono text-cyan-300">
              <Zap className="h-3.5 w-3.5 animate-bounce text-cyan-400" />
              <span>Scanning Quantum Universe ({scanElapsed}s)</span>
            </div>
          ) : loadingAI ? (
            <div className="flex items-center space-x-2 font-mono text-purple-300">
              <Sparkles className="h-3.5 w-3.5 animate-spin text-purple-400" />
              <span>Synthesizing AI Neural Dossier ({aiElapsed}s)</span>
            </div>
          ) : (
            <div className="flex items-center space-x-3 font-medium">
              <div className="flex items-center space-x-1.5">
                <Globe2 className="h-3.5 w-3.5 text-cyan-400" />
                <span className="font-extrabold tracking-wider text-white">NIFTY 50</span>
              </div>
              <span className="font-mono text-zinc-300">₹{niftyPrice.toLocaleString('en-IN')}</span>
              <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-extrabold ${theme.badge}`}>
                {regimeName} · {regimeScore}/100
              </span>
            </div>
          )}

          {/* 3. Live Vault Summary Pill */}
          {openPositionsCount > 0 && !loadingScan && !loadingAI && (
            <div className="flex items-center space-x-2 border-l border-white/15 pl-3 font-mono text-[11px]">
              <span className="text-zinc-400">{openPositionsCount} Active:</span>
              <span className={unrealizedPnl >= 0 ? 'text-emerald-400 font-extrabold shadow-sm' : 'text-rose-400 font-extrabold'}>
                {unrealizedPnl >= 0 ? '+' : ''}₹{unrealizedPnl.toFixed(1)}
              </span>
            </div>
          )}

          <ChevronDown className={`h-3.5 w-3.5 text-zinc-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
        </div>

        {/* Expanded Telemetry Drawer */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3.5 border-t border-white/10 pt-3 text-xs"
            >
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-2.5">
                  <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Trend vs 50D</div>
                  <div className="font-mono font-extrabold text-cyan-300 mt-1">
                    {regime?.trend?.price_vs_50dma != null ? `${regime.trend.price_vs_50dma > 0 ? '+' : ''}${regime.trend.price_vs_50dma}%` : '+1.4%'}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-2.5">
                  <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">20D Volatility</div>
                  <div className="font-mono font-extrabold text-purple-300 mt-1">
                    {regime?.volatility?.realized_vol_20d != null ? `${regime.volatility.realized_vol_20d}%` : '12.4%'}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-2.5">
                  <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Core Engine</div>
                  <div className="font-mono font-extrabold text-emerald-400 mt-1">HYPER-8000</div>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenRestartModal) onOpenRestartModal();
                }}
                className="mt-2.5 flex w-full items-center justify-center space-x-1.5 rounded-xl border border-rose-500/30 bg-rose-950/40 py-1.5 font-mono text-[11px] text-rose-300 hover:bg-rose-900/60 hover:border-rose-500/60 transition"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Restart Verchon System & AI</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

