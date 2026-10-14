import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Power, AlertTriangle, CheckCircle, X, Cpu, Server } from 'lucide-react';

export default function SystemRestartModal({ isOpen, onClose }) {
  const [isRestarting, setIsRestarting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [reconnected, setReconnected] = useState(false);

  useEffect(() => {
    let timer;
    if (isRestarting && !reconnected) {
      timer = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isRestarting, reconnected]);

  const handleTriggerRestart = async () => {
    setIsRestarting(true);
    setElapsed(0);
    setReconnected(false);
    setStatusMessage('Sending restart command to Verchon engine...');

    try {
      await fetch('/api/system/restart', { method: 'POST' });
    } catch {
      // Fetch may fail or abort as the server terminates immediately
    }

    setStatusMessage('Shutting down Local Qwen 3.5 AI & releasing port 8000...');

    // Give server 1.5s to terminate before polling
    setTimeout(() => {
      const startTime = Date.now();
      const pollTimer = setInterval(async () => {
        try {
          const res = await fetch('/api/system/health', { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'online') {
              clearInterval(pollTimer);
              setReconnected(true);
              setStatusMessage('Server back online! Reloading application...');
              setTimeout(() => {
                window.location.reload();
              }, 800);
            }
          }
        } catch {
          const diff = Math.round((Date.now() - startTime) / 1000);
          if (diff >= 2) {
            setStatusMessage(`Waiting for supervisor to bind port 8000... (${diff}s)`);
          }
        }
      }, 700);
    }, 1500);
  };

  const handleUnloadAIOnly = async () => {
    try {
      await fetch('/api/ai/unload', { method: 'POST' });
      onClose();
    } catch (e) {
      console.warn('Failed to unload AI:', e);
    }
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
          className="relative w-full max-w-md overflow-hidden rounded-3xl border border-rose-500/30 bg-zinc-950/95 p-6 shadow-2xl backdrop-blur-2xl ring-1 ring-rose-500/20"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <div className="flex items-center space-x-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/40">
                <Power className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Restart Verchon System</h3>
                <p className="text-[11px] text-zinc-400">1-Click Full Stack & AI Engine Reboot</p>
              </div>
            </div>
            {!isRestarting && (
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200 transition"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Body Content */}
          {!isRestarting ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs leading-relaxed text-amber-200">
                <div className="flex items-center space-x-2 font-semibold text-amber-300 mb-1">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Full Server & Memory Reset</span>
                </div>
                <p className="text-[11px] text-zinc-300">
                  This will cleanly terminate the FastAPI backend, shutdown the local Qwen 3.5 LLM process, release all GPU VRAM, flush in-memory caches, and spawn a fresh server supervisor.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-[11px] font-mono">
                <div className="rounded-lg border border-white/[0.08] bg-zinc-900/50 p-2.5">
                  <div className="flex items-center space-x-1.5 text-zinc-400 mb-1">
                    <Server className="h-3.5 w-3.5 text-cyan-400" />
                    <span>FastAPI Server</span>
                  </div>
                  <div className="text-zinc-200 font-bold">Port 8000 Reset</div>
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-zinc-900/50 p-2.5">
                  <div className="flex items-center space-x-1.5 text-zinc-400 mb-1">
                    <Cpu className="h-3.5 w-3.5 text-purple-400" />
                    <span>Local Qwen LLM</span>
                  </div>
                  <div className="text-zinc-200 font-bold">Free VRAM & Port 8085</div>
                </div>
              </div>

              <p className="text-[11px] text-zinc-400 text-center">
                Your browser will automatically reconnect and refresh the moment the server is back online.
              </p>

              {/* Action Buttons */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleUnloadAIOnly}
                  title="Frees 4.3 GB VRAM immediately while leaving web server running"
                  className="rounded-xl border border-purple-500/40 bg-purple-950/40 px-3 py-2 font-mono text-[11px] font-semibold text-purple-300 hover:bg-purple-900/60 transition flex items-center space-x-1.5"
                >
                  <Cpu className="h-3.5 w-3.5" />
                  <span>Free VRAM Only</span>
                </button>
                <div className="flex items-center space-x-2 ml-auto">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-white/10 bg-zinc-900 px-3.5 py-2 font-mono text-xs text-zinc-300 hover:bg-zinc-800 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleTriggerRestart}
                    className="inline-flex items-center space-x-2 rounded-xl border border-rose-500/50 bg-rose-600 px-4 py-2 font-mono text-xs font-bold text-white shadow-lg shadow-rose-950/60 hover:bg-rose-500 transition"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Restart Everything</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center space-y-4">
              <div className="relative mx-auto flex h-14 w-14 items-center justify-center">
                {reconnected ? (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    <CheckCircle className="h-6 w-6" />
                  </div>
                ) : (
                  <>
                    <div className="absolute inset-0 animate-ping rounded-full bg-rose-500/20" />
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-[0_0_20px_rgba(244,63,94,0.3)]">
                      <RotateCcw className="h-6 w-6 animate-spin" />
                    </div>
                  </>
                )}
              </div>

              <div>
                <h4 className="text-sm font-bold text-zinc-100">
                  {reconnected ? 'SYSTEM REBOOT COMPLETE' : `RESTARTING SYSTEM (${elapsed}s)`}
                </h4>
                <p className="mt-1 text-xs font-mono text-rose-300/90">{statusMessage}</p>
              </div>

              <div className="mx-auto max-w-xs rounded-lg border border-white/[0.08] bg-zinc-900/60 p-2.5 font-mono text-[10px] text-zinc-400">
                <span>Auto-refreshing page upon 200 OK health response...</span>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
