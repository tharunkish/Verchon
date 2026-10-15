import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Terminal, Palette, Zap, Shield, Check, RotateCcw, Sun, Moon, Sparkles, Monitor } from 'lucide-react';

export default function SettingsModal({
  isOpen,
  onClose,
  themeStyle = 'apple',
  setThemeStyle,
  colorMode = 'dark',
  setColorMode,
  themeMode,
  setThemeMode,
  onOpenRestartModal,
}) {
  const activeThemeStyle = themeStyle || themeMode || 'apple';
  const handleSelectThemeStyle = (style) => {
    if (setThemeStyle) setThemeStyle(style);
    if (setThemeMode) setThemeMode(style);
  };

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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 10 }}
          transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-2xl backdrop-blur-2xl transition-colors duration-200"
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
            <div className="flex items-center space-x-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500 dark:bg-blue-500/20 dark:text-blue-400">
                <Palette className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Workstation Preferences</h3>
                <p className="text-[11px] text-[var(--text-secondary)]">Personalize theme design, color appearance, and AI engine.</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--border-subtle)] hover:text-[var(--text-primary)] transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 space-y-5 max-h-[75vh] overflow-y-auto pr-1">
            {/* Appearance Mode: Light vs Dark */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                Color Appearance
              </label>
              <div className="grid grid-cols-2 gap-3">
                {/* Dark Mode */}
                <button
                  type="button"
                  onClick={() => setColorMode && setColorMode('dark')}
                  className={`flex items-center justify-between rounded-2xl border p-3.5 text-left transition-all ${
                    colorMode === 'dark'
                      ? 'border-blue-500 bg-blue-500/10 shadow-sm ring-1 ring-blue-500/30'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-black/20 dark:hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-zinc-100 border border-zinc-700">
                      <Moon className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--text-primary)]">Dark Mode</div>
                      <div className="text-[10px] text-[var(--text-secondary)]">Deep obsidian, high contrast</div>
                    </div>
                  </div>
                  {colorMode === 'dark' && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] text-white">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  )}
                </button>

                {/* Light Mode */}
                <button
                  type="button"
                  onClick={() => setColorMode && setColorMode('light')}
                  className={`flex items-center justify-between rounded-2xl border p-3.5 text-left transition-all ${
                    colorMode === 'light'
                      ? 'border-blue-500 bg-blue-500/10 shadow-sm ring-1 ring-blue-500/30'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-black/20 dark:hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700 border border-amber-300">
                      <Sun className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--text-primary)]">Light Mode</div>
                      <div className="text-[10px] text-[var(--text-secondary)]">Apple canvas, clean & crisp</div>
                    </div>
                  </div>
                  {colorMode === 'light' && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] text-white">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Theme Style: Apple Native vs Terminal Monospace */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                Theme Design Style
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Option 1: Apple Native */}
                <div
                  onClick={() => handleSelectThemeStyle('apple')}
                  className={`group relative cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                    activeThemeStyle === 'apple'
                      ? 'border-blue-500 bg-blue-500/10 shadow-sm ring-1 ring-blue-500/30'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-black/20 dark:hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center space-x-2">
                      <Monitor className="h-4 w-4 text-blue-500" />
                      <span className="text-xs font-bold text-[var(--text-primary)]">Apple Native</span>
                    </div>
                    {activeThemeStyle === 'apple' && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] text-white">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
                    Polished Apple ergonomics. Clean SF Pro typography, tactile spacing, frosted glass, zero bloat.
                  </p>
                  <div className="mt-3 flex items-center space-x-1.5 font-mono text-[9px]">
                    <span className="rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 font-semibold">Recommended</span>
                    <span className="rounded bg-[var(--border-subtle)] text-[var(--text-secondary)] px-1.5 py-0.5">Dual View</span>
                  </div>
                </div>

                {/* Option 2: Terminal Monospace */}
                <div
                  onClick={() => handleSelectThemeStyle('terminal')}
                  className={`group relative cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                    activeThemeStyle === 'terminal'
                      ? 'border-blue-500 bg-blue-500/10 shadow-sm ring-1 ring-blue-500/30'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-black/20 dark:hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center space-x-2">
                      <Terminal className="h-4 w-4 text-zinc-400 group-hover:text-zinc-200 transition" />
                      <span className="font-mono text-xs font-bold text-[var(--text-primary)]">Terminal Monospace</span>
                    </div>
                    {activeThemeStyle === 'terminal' && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] text-white">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-[10px] text-[var(--text-secondary)] leading-relaxed">
                    Deterministic developer monospace layout. High-density data grids and classic terminal vibes.
                  </p>
                  <div className="mt-3 flex items-center space-x-1.5 font-mono text-[9px] text-[var(--text-muted)]">
                    <span className="rounded bg-[var(--border-subtle)] px-1.5 py-0.5">Density</span>
                    <span className="rounded bg-[var(--border-subtle)] px-1.5 py-0.5">Classic</span>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Engine Selection Cards */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                AI Intelligence Engine
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Option 1: Local Qwen 3.5 4B */}
                <div
                  onClick={() => handleSelectProvider('qwen')}
                  className={`group relative cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                    aiProvider === 'qwen'
                      ? 'border-cyan-500/60 bg-cyan-500/10 shadow-sm ring-1 ring-cyan-500/40'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-black/20 dark:hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center space-x-2">
                      <Zap className="h-4 w-4 text-cyan-500 transition" />
                      <span className="text-xs font-bold text-[var(--text-primary)]">Local Qwen 3.5 4B</span>
                    </div>
                    {aiProvider === 'qwen' && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-[10px] text-black font-bold">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
                    Offline local model. Zero rate limits, 100% private, sub-second execution.
                  </p>
                  <div className="mt-3 flex items-center space-x-1.5 font-mono text-[9px]">
                    <span className="rounded bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 px-1.5 py-0.5 font-semibold">Offline</span>
                    <span className="rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 font-semibold">Unlimited</span>
                  </div>
                </div>

                {/* Option 2: Google Gemini Cloud */}
                <div
                  onClick={() => handleSelectProvider('gemini')}
                  className={`group relative cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                    aiProvider === 'gemini'
                      ? 'border-purple-500/60 bg-purple-500/10 shadow-sm ring-1 ring-purple-500/40'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-black/20 dark:hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center space-x-2">
                      <Sparkles className="h-4 w-4 text-purple-500 transition" />
                      <span className="text-xs font-bold text-[var(--text-primary)]">Google Gemini Cloud</span>
                    </div>
                    {aiProvider === 'gemini' && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-purple-500 text-[10px] text-white">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
                    Official 2-stage Gemini Cloud API. Deep comparative cross-examination across candidates.
                  </p>
                  <div className="mt-3 flex items-center space-x-1.5 font-mono text-[9px]">
                    <span className="rounded bg-purple-500/15 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 font-semibold">Cloud Cascade</span>
                    <span className="rounded bg-[var(--border-subtle)] px-1.5 py-0.5 text-[var(--text-secondary)]">Deep Reasoning</span>
                  </div>
                </div>
              </div>
            </div>

            {/* System Info & Persistence Indicator + Quick Reboot */}
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
              <span className="flex items-center space-x-2">
                <Shield className="h-3.5 w-3.5 text-emerald-500" />
                <span>Settings auto-persisted in localStorage & backend</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onOpenRestartModal) onOpenRestartModal();
                }}
                className="flex items-center space-x-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 font-mono text-[10px] text-rose-500 hover:bg-rose-500/20 transition"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Restart System</span>
              </button>
            </div>
          </div>

          {/* Close Action */}
          <div className="mt-5 flex justify-end border-t border-[var(--border-subtle)] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-blue-500 px-6 py-2 text-xs font-semibold text-white shadow-md shadow-blue-500/30 hover:bg-blue-600 active:scale-95 transition"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
