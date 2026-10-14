import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Terminal, Palette, Monitor, Zap, Shield, Check, RotateCcw } from 'lucide-react';

export default function SettingsModal({
  isOpen,
  onClose,
  themeMode,
  setThemeMode,
  onOpenRestartModal,
}) {
  const [aiProvider, setAiProvider] = useState(() => {
    try {
      return localStorage.getItem('verchon_ai_provider') || 'qwen';
    } catch {
      return 'qwen';
    }
  });

  useEffect(() => {
    // Fetch active provider from backend on mount
    fetch('/api/settings/ai-provider')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.provider) {
          setAiProvider(data.provider);
          try {
            localStorage.setItem('verchon_ai_provider', data.provider);
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const handleSelectProvider = (prov) => {
    setAiProvider(prov);
    try {
      localStorage.setItem('verchon_ai_provider', prov);
    } catch {}
    fetch('/api/settings/ai-provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: prov }),
    }).catch((err) => console.warn('Failed to update AI provider on backend:', err));
  };

  if (!isOpen) return null;


  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/90 p-6 shadow-2xl backdrop-blur-2xl ring-1 ring-white/[0.05]"
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <div className="flex items-center space-x-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500/20 to-purple-500/20 text-rose-400 border border-rose-500/30">
                <Palette className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Workstation UI & Theme Engine</h3>
                <p className="text-[11px] text-zinc-400">Switch between distinct visual designs and ergonomics.</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Theme Selection Cards */}
          <div className="mt-5 space-y-3">
            <label className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
              Select Workspace Interface:
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Option A: Terminal Core */}
              <div
                onClick={() => setThemeMode('terminal')}
                className={`group relative cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                  themeMode === 'terminal'
                    ? 'border-rose-500/60 bg-gradient-to-b from-rose-500/10 via-zinc-900 to-zinc-950 shadow-lg shadow-rose-950/40 ring-1 ring-rose-500/30'
                    : 'border-white/[0.08] bg-zinc-900/40 hover:border-white/20 hover:bg-zinc-900/70'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Terminal className="h-4 w-4 text-zinc-400 group-hover:text-rose-400 transition" />
                    <span className="font-mono text-xs font-bold text-zinc-200">Terminal Core</span>
                  </div>
                  {themeMode === 'terminal' && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] text-white">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  )}
                </div>
                <p className="font-mono text-[10px] text-zinc-400 leading-relaxed">
                  Gritty high-density monospace layout. Classic top tabs, developer console, and compact data tables.
                </p>
                <div className="mt-3 flex items-center space-x-1.5 font-mono text-[9px] text-zinc-500">
                  <span className="rounded bg-zinc-800 px-1 py-0.5">Bloomberg Style</span>
                  <span className="rounded bg-zinc-800 px-1 py-0.5">Fast</span>
                </div>
              </div>

              {/* Option B: Neo-Vision OS */}
              <div
                onClick={() => setThemeMode('neo-vision')}
                className={`group relative cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                  themeMode === 'neo-vision'
                    ? 'border-rose-500/60 bg-gradient-to-b from-rose-500/15 via-purple-950/20 to-zinc-950 shadow-lg shadow-rose-950/50 ring-1 ring-rose-500/40'
                    : 'border-white/[0.08] bg-zinc-900/40 hover:border-white/20 hover:bg-zinc-900/70'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="h-4 w-4 text-purple-400 group-hover:text-rose-400 transition" />
                    <span className="font-sans text-xs font-extrabold text-zinc-100">Neo-Vision OS</span>
                  </div>
                  {themeMode === 'neo-vision' && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] text-white">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-zinc-400 leading-relaxed">
                  Ultra-aesthetic Magic UI. Floating magnetic dock, dynamic island, 3D tilt cards, and massive hero prices.
                </p>
                <div className="mt-3 flex items-center space-x-1.5 font-mono text-[9px]">
                  <span className="rounded bg-purple-950/60 text-purple-300 border border-purple-800/40 px-1 py-0.5">3D Bento</span>
                  <span className="rounded bg-rose-950/60 text-rose-300 border border-rose-800/40 px-1 py-0.5">Vegas Ticker</span>
                </div>
              </div>
            </div>
          </div>

          {/* AI Engine Selection Cards */}
          <div className="mt-5 space-y-3">
            <label className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
              AI Intelligence Engine:
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Option 1: Local Qwen 3.5 4B */}
              <div
                onClick={() => handleSelectProvider('qwen')}
                className={`group relative cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                  aiProvider === 'qwen'
                    ? 'border-cyan-500/60 bg-gradient-to-b from-cyan-500/15 via-blue-950/20 to-zinc-950 shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-500/40'
                    : 'border-white/[0.08] bg-zinc-900/40 hover:border-white/20 hover:bg-zinc-900/70'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Zap className="h-4 w-4 text-cyan-400 group-hover:text-cyan-300 transition" />
                    <span className="font-sans text-xs font-extrabold text-zinc-100">Local Qwen 3.5 4B</span>
                  </div>
                  {aiProvider === 'qwen' && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-[10px] text-black font-bold">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-zinc-400 leading-relaxed">
                  Headless local engine in D:\lmmodels. Zero rate limits, 100% offline & private, sub-second latency.
                </p>
                <div className="mt-3 flex items-center space-x-1.5 font-mono text-[9px]">
                  <span className="rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/40 px-1 py-0.5">Offline</span>
                  <span className="rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 px-1 py-0.5">Unlimited</span>
                </div>
              </div>

              {/* Option 2: Google Gemini Cloud */}
              <div
                onClick={() => handleSelectProvider('gemini')}
                className={`group relative cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                  aiProvider === 'gemini'
                    ? 'border-purple-500/60 bg-gradient-to-b from-purple-500/15 via-indigo-950/20 to-zinc-950 shadow-lg shadow-purple-950/40 ring-1 ring-purple-500/40'
                    : 'border-white/[0.08] bg-zinc-900/40 hover:border-white/20 hover:bg-zinc-900/70'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="h-4 w-4 text-purple-400 group-hover:text-purple-300 transition" />
                    <span className="font-sans text-xs font-extrabold text-zinc-100">Google Gemini Cloud</span>
                  </div>
                  {aiProvider === 'gemini' && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-purple-500 text-[10px] text-white">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-zinc-400 leading-relaxed">
                  Official 2-stage Gemini Cloud API. Deep comparative research across candidates (subject to API quota).
                </p>
                <div className="mt-3 flex items-center space-x-1.5 font-mono text-[9px]">
                  <span className="rounded bg-purple-950/60 text-purple-300 border border-purple-800/40 px-1 py-0.5">Cloud Cascade</span>
                  <span className="rounded bg-zinc-800 px-1 py-0.5 text-zinc-400">High Reasoning</span>
                </div>
              </div>
            </div>
          </div>

          {/* System Info & Persistence Indicator + Quick Reboot */}
          <div className="mt-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] text-zinc-400 flex items-center justify-between">
            <span className="flex items-center space-x-2">
              <Shield className="h-3.5 w-3.5 text-emerald-400" />
              <span>Settings auto-persist in localStorage & backend</span>
            </span>
            <button
              onClick={() => {
                onClose();
                if (onOpenRestartModal) onOpenRestartModal();
              }}
              className="flex items-center space-x-1.5 rounded-lg border border-rose-500/30 bg-rose-950/40 px-2.5 py-1 font-mono text-[10px] text-rose-300 hover:bg-rose-900/60 hover:border-rose-500/70 transition"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Restart System</span>
            </button>
          </div>

          {/* Close Action */}
          <div className="mt-5 flex justify-end">
            <button
              onClick={onClose}
              className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-rose-950/60 hover:bg-rose-500 transition"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
