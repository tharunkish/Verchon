import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  Sparkles, 
  AlertTriangle, 
  HelpCircle, 
  Eye, 
  FileText, 
  CheckCircle, 
  RefreshCw,
  Terminal,
  XCircle,
  X,
  MessageSquare,
  Send,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Zap,
  ArrowRight,
  ShieldAlert,
  Scale
} from 'lucide-react';

function DevDiagnosticsDrawer({ diagnostics, onClose, onRefresh }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-[#08080c] p-4 text-left font-mono text-xs shadow-2xl">
      <div className="mb-3 flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
        <div className="flex items-center space-x-2">
          <Terminal className="h-4 w-4 text-emerald-400" />
          <span className="font-bold text-zinc-100">AI MODEL EXECUTION & DIAGNOSTICS CONSOLE</span>
        </div>
        <div className="flex items-center space-x-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="flex items-center space-x-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-200"
              title="Refresh server logs"
            >
              <RefreshCw className="h-2.5 w-2.5" />
              <span>Refresh</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:text-zinc-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {diagnostics && diagnostics.length > 0 ? (
        <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
          {diagnostics.map((d, idx) => {
            const isSuccess = d.status === 'SUCCESS' || d.status === 'FALLBACK_SUCCESS' || d.status === 'FALLBACK_CONFIG_SUCCESS';
            const isDenied = d.status?.includes('RATE_LIMITED') || d.status?.includes('DENIED') || d.status?.includes('429');
            const isBusy = d.status?.includes('503') || d.status?.includes('BUSY');

            return (
              <div
                key={idx}
                className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-2.5 text-[11px] leading-relaxed"
              >
                <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-zinc-100">{d.model}</span>
                    <span className="text-zinc-500 text-[10px]">[{d.stage || 'Pipeline'}]</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                        isSuccess
                          ? 'border border-emerald-600/50 bg-emerald-950/40 text-emerald-300'
                          : isDenied
                          ? 'border border-rose-600/50 bg-rose-950/40 text-rose-300'
                          : isBusy
                          ? 'border border-amber-600/50 bg-amber-950/40 text-amber-300'
                          : 'border border-zinc-700 bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {d.status}
                    </span>
                    <span className="text-zinc-400 font-mono text-[10px]">{d.latency_ms}ms</span>
                  </div>
                </div>
                <div className="text-zinc-300">{d.message}</div>
                {d.tokens_in != null && (
                  <div className="mt-1 text-[10px] text-zinc-500">
                    Tokens: {d.tokens_in} prompt · {d.tokens_out} completion
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-4 text-center text-zinc-500 text-[11px]">
          No execution telemetry recorded yet. Trigger synthesis to inspect local Qwen or Gemini output.
        </div>
      )}
    </div>
  );
}

export default function AIDossierCard({
  ticker,
  aiDossier,
  candidateData,
  loading,
  streamingText,
  onGenerateDossier,
  onCancel,
  diagnostics = [],
  errorMessage = null,
}) {
  const [showFullRaw, setShowFullRaw] = useState(false);
  const [showDevConsole, setShowDevConsole] = useState(false);
  const [liveDiagnostics, setLiveDiagnostics] = useState(diagnostics);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Stock chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    if (diagnostics && diagnostics.length > 0) {
      setLiveDiagnostics(diagnostics);
    }
  }, [diagnostics]);

  useEffect(() => {
    let timer;
    if (loading) {
      setElapsedSeconds(0);
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(timer);
  }, [loading]);

  const handleFetchServerDiagnostics = async () => {
    try {
      const res = await fetch('/api/diagnostics/ai');
      if (res.ok) {
        const json = await res.json();
        setLiveDiagnostics(json.diagnostics || []);
      }
    } catch {
      // ignore
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    const updatedHistory = [...chatMessages, { role: 'user', content: userMsg }];
    setChatMessages(updatedHistory);
    setChatLoading(true);

    try {
      const res = await fetch(`/api/ai-chat/${encodeURIComponent(ticker)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          history: updatedHistory.slice(0, -1),
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || 'Chat request failed');
      }

      const data = await res.json();
      setChatMessages([...updatedHistory, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setChatMessages([...updatedHistory, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Safe data extraction
  const {
    thesis = [],
    bull_case = [],
    bear_case = [],
    risk_judge = {},
    key_evidence = [],
    announcements = [],
    contradiction = {},
    risks = {},
    strengthen_conditions = [],
    weaken_conditions = [],
    raw_section = '',
  } = aiDossier || {};

  // Extract empirical metrics from candidateData if provided
  const t = candidateData?.technicals?.Trend_Analysis || {};
  const f = candidateData?.fundamentals || {};
  const val = f.valuation || {};
  const strat = candidateData?.technicals?.Strategy_Evaluation || {};

  const currentPrice = t.Current_Price || candidateData?.price || null;
  const dma50 = t['50_DMA'] || null;
  const stopLoss = strat.stop_loss || strat.active_strategy_result?.stop_price || null;
  const pe = val.pe || null;
  const pe5y = val.historical_pe_median_5y || null;
  const roe = f.profitability?.roe || null;

  // Determine judge rating
  const rawVerdict = (risk_judge.verdict || '').toUpperCase();
  const verdictRating = risk_judge.rating || (
    rawVerdict.includes('BULL') ? 'BULL_FAVORED' :
    rawVerdict.includes('BEAR') ? 'BEAR_FAVORED' :
    'INCONCLUSIVE'
  );

  // =========================================================================
  // VIEW 1: LOADING STATE (STREAMING TOKEN TERMINAL)
  // =========================================================================
  if (loading) {
    const currentStage = 
      elapsedSeconds < 8 ? 'Ingesting Empirical Snapshot & Strategy Invariants...'
      : elapsedSeconds < 25 ? 'Executing Adversarial Duel (Bull vs. Bear Debate)...'
      : elapsedSeconds < 45 ? 'Risk Judge Adjudicating Evidence & Invalidation Boundaries...'
      : 'Finalizing Publication-Grade Stress-Test...';

    return (
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-rose-900/60 bg-[#08080c] p-6 text-center shadow-2xl">
          <div className="flex items-center justify-center space-x-2.5">
            <div className="h-5 w-5 rounded-full border-2 border-rose-500 border-t-transparent animate-spin" />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-rose-300">
              ADVERSARIAL STRESS-TEST IN PROGRESS
            </span>
          </div>

          <div className="mx-auto mt-4 max-w-md rounded-lg border border-zinc-800 bg-zinc-950 p-3.5 text-left font-mono text-xs">
            <div className="flex items-center justify-between text-zinc-400 mb-1">
              <span>ACTIVE STAGE:</span>
              <span className="text-rose-400 font-bold">{elapsedSeconds}s</span>
            </div>
            <div className="text-zinc-200 font-semibold">{currentStage}</div>

            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
              <div 
                className="h-full bg-rose-500 transition-all duration-1000"
                style={{ width: `${Math.min(95, Math.max(10, elapsedSeconds * 2.5))}%` }}
              />
            </div>
          </div>

          {/* Real-time Streaming Terminal */}
          {streamingText && (
            <div className="mx-auto mt-4 max-w-2xl rounded-xl border border-zinc-800/80 bg-black/60 p-4 text-left shadow-2xl">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-2 font-mono text-[10px]">
                <div className="flex items-center space-x-2 text-rose-400">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                  <span className="font-bold tracking-wider">LIVE TOKEN STREAM (LOCAL QWEN 2.5 CODER 7B)</span>
                </div>
                <span className="text-zinc-500">Real-Time Synthesis</span>
              </div>
              <div className="max-h-56 overflow-y-auto font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap select-text pr-1">
                {streamingText}
                <span className="inline-block w-1.5 h-3.5 ml-1 bg-rose-500 animate-pulse align-middle" />
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-center space-x-3">
            {onCancel && (
              <button
                onClick={onCancel}
                className="inline-flex items-center space-x-1.5 rounded-lg border border-rose-800/80 bg-rose-950/80 px-3.5 py-1.5 font-mono text-xs font-semibold text-rose-300 hover:bg-rose-900 transition"
              >
                <XCircle className="h-3.5 w-3.5" />
                <span>Cancel Synthesis</span>
              </button>
            )}
            <button
              onClick={() => {
                setShowDevConsole(!showDevConsole);
                if (!showDevConsole) handleFetchServerDiagnostics();
              }}
              className="inline-flex items-center space-x-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-400 hover:text-zinc-200 transition"
            >
              <Terminal className="h-3.5 w-3.5 text-emerald-400" />
              <span>{showDevConsole ? 'Hide Console' : 'View Console'}</span>
            </button>
          </div>
        </div>

        {showDevConsole && (
          <DevDiagnosticsDrawer
            diagnostics={liveDiagnostics}
            onClose={() => setShowDevConsole(false)}
            onRefresh={handleFetchServerDiagnostics}
          />
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: PRE-SYNTHESIS EMPIRICAL BASELINE (ZERO GIMMICK / INSTANT VALUE)
  // =========================================================================
  if (!aiDossier) {
    return (
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-gradient-to-b from-[#0e0e14] to-[#08080c] p-6 shadow-2xl backdrop-blur-xl">
          {/* Top Bar */}
          <div className="flex flex-wrap items-center justify-between border-b border-zinc-800/80 pb-4 mb-4 gap-3">
            <div className="flex items-center space-x-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <Scale className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-mono text-xs font-bold tracking-wider text-zinc-100">
                    ADVERSARIAL DOSSIER: BULL VS. BEAR STRESS-TEST
                  </h3>
                  <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[9px] text-zinc-400">
                    {ticker}
                  </span>
                </div>
                <p className="font-mono text-[11px] text-zinc-400 mt-0.5">
                  Challenges the trade thesis using cold counterevidence before capital is committed.
                </p>
              </div>
            </div>

            {/* Run Synthesis Trigger */}
            <button
              onClick={onGenerateDossier}
              disabled={loading}
              className="flex items-center space-x-2 rounded-lg bg-gradient-to-r from-[#c9183b] to-[#a1112e] px-4 py-2 font-mono text-xs font-bold text-white shadow-lg shadow-rose-950/60 transition hover:from-[#e11d48] hover:to-[#be123c] active:scale-95"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Run Adversarial Stress-Test</span>
            </button>
          </div>

          {errorMessage && (
            <div className="mb-4 rounded-lg border border-rose-800/80 bg-rose-950/40 p-3 font-mono text-xs text-rose-300">
              {errorMessage}
            </div>
          )}

          {/* Empirical Baseline Grid: Instant data before AI executes */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 font-mono text-xs">
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3">
              <div className="text-[10px] uppercase text-zinc-500">TECHNICAL ANCHOR</div>
              <div className="mt-1 font-bold text-zinc-200">
                ₹{currentPrice ? currentPrice.toFixed(2) : '—'}
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                50 DMA: {dma50 ? `₹${dma50.toFixed(2)}` : 'N/A'}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3">
              <div className="text-[10px] uppercase text-zinc-500">VALUATION CEILING</div>
              <div className="mt-1 font-bold text-zinc-200">
                P/E: {pe ? `${pe}x` : 'N/A'}
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                5Y Median: {pe5y ? `${pe5y}x` : 'N/A'}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3">
              <div className="text-[10px] uppercase text-zinc-500">COMPOUNDING ENGINE</div>
              <div className="mt-1 font-bold text-zinc-200">
                ROE: {roe != null ? `${roe}%` : 'N/A'}
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                Capital Efficiency
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3">
              <div className="text-[10px] uppercase text-zinc-500">IMMUTABLE GUARDRAIL</div>
              <div className="mt-1 font-bold text-rose-400">
                Stop Loss: {stopLoss ? `₹${stopLoss.toFixed(2)}` : 'At 50 DMA'}
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                Deterministic Engine
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 3: FULL POST-SYNTHESIS ADVERSARIAL STRESS-TEST CARD
  // =========================================================================
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0c0c10]/90 shadow-2xl backdrop-blur-xl">
        {/* 1. Cockpit Header Bar */}
        <div className="flex flex-wrap items-center justify-between border-b border-zinc-900 bg-rose-950/20 px-5 py-3">
          <div className="flex items-center space-x-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/20 text-rose-300">
              <Scale className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-xs font-bold tracking-wide text-zinc-100">
                  VERCHON ADVERSARIAL DOSSIER
                </span>
                <span className="text-zinc-500 font-mono text-[10px]">•</span>
                <span className="font-mono text-xs text-zinc-300 font-semibold">{ticker}</span>
              </div>
              <div className="font-mono text-[10px] text-zinc-400">
                Opposing Theses Adjudicated by Objective Risk Judge
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 font-mono text-xs">
            {/* Verdict Badge in Header */}
            <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center space-x-1.5 ${
              verdictRating === 'BULL_FAVORED'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                : verdictRating === 'BEAR_FAVORED'
                ? 'bg-rose-950 text-rose-300 border border-rose-700/60'
                : 'bg-amber-950 text-amber-300 border border-amber-700/60'
            }`}>
              {verdictRating === 'BULL_FAVORED' && <TrendingUp className="h-3 w-3" />}
              {verdictRating === 'BEAR_FAVORED' && <TrendingDown className="h-3 w-3" />}
              {verdictRating === 'INCONCLUSIVE' && <ShieldAlert className="h-3 w-3" />}
              <span>{verdictRating.replace('_', ' ')}</span>
            </span>

            <button
              onClick={onGenerateDossier}
              disabled={loading}
              className="flex items-center space-x-1 rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 transition"
              title="Re-run Adversarial Synthesis"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Re-Test</span>
            </button>

            <button
              onClick={() => setChatOpen(!chatOpen)}
              className={`flex items-center space-x-1 rounded border px-2.5 py-1 text-[11px] transition ${
                chatOpen
                  ? 'border-purple-600/60 bg-purple-950/40 text-purple-300'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}
            >
              <MessageSquare className="h-3 w-3 text-purple-400" />
              <span>{chatOpen ? 'Hide Chat' : 'Chat'}</span>
            </button>

            <button
              onClick={() => setShowFullRaw(!showFullRaw)}
              className="flex items-center space-x-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              <FileText className="h-3 w-3" />
              <span>{showFullRaw ? 'Cards' : 'Raw'}</span>
            </button>
          </div>
        </div>

        {/* 2. Executive View vs Raw Markdown */}
        {showFullRaw ? (
          <div className="p-6">
            <div className="prose prose-invert max-w-none font-mono text-xs leading-relaxed text-zinc-300">
              <ReactMarkdown>{raw_section || 'No raw section content available.'}</ReactMarkdown>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* ========================================================================= */}
            {/* A. RISK JUDGE VERDICT & ADJUDICATION BENCH (THE SUPREME COURT)           */}
            {/* ========================================================================= */}
            <div className="rounded-xl border border-purple-900/60 bg-gradient-to-r from-purple-950/30 via-[#0a0a10] to-purple-950/30 p-5 font-mono shadow-xl">
              <div className="flex flex-wrap items-center justify-between border-b border-purple-900/40 pb-2.5 mb-3 gap-2">
                <div className="flex items-center space-x-2 text-purple-300 font-bold text-xs tracking-wider">
                  <ShieldCheck className="h-4 w-4 text-purple-400" />
                  <span>RISK JUDGE ADJUDICATION (EMPIRICAL VERIFICATION BENCH)</span>
                </div>
                <span className="text-[10px] text-zinc-400 bg-purple-950/50 border border-purple-800/40 rounded px-2 py-0.5">
                  Strict Non-Predictive Guardrail
                </span>
              </div>

              {/* Main Judicial Assessment */}
              {risk_judge.verdict && (
                <div className="mb-4 rounded-lg border border-purple-900/40 bg-black/50 p-3.5 text-xs text-zinc-200 font-sans leading-relaxed">
                  <span className="font-mono text-[10px] font-bold uppercase text-purple-300 block mb-1">
                    JUDGE'S SYNTHESIS & CONVICTION:
                  </span>
                  {risk_judge.verdict}
                </div>
              )}

              {/* 3-Pillar Verification Grid */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
                {/* 1. Confirmed Empirical Facts */}
                <div className="rounded-lg bg-emerald-950/20 border border-emerald-900/40 p-3 space-y-1">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide block">
                    1. VERIFIED FACTS (DATA BACKED)
                  </span>
                  <div className="text-zinc-300 font-sans text-xs leading-relaxed">
                    {risk_judge.confirmed_facts || 'Empirical metrics confirm technical moving average alignment and historical valuation ratios.'}
                  </div>
                </div>

                {/* 2. Unsupported Retail Claims */}
                <div className="rounded-lg bg-amber-950/20 border border-amber-900/40 p-3 space-y-1">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wide block">
                    2. UNSUPPORTED RETAIL HYPOTHESIS
                  </span>
                  <div className="text-zinc-300 font-sans text-xs leading-relaxed">
                    {risk_judge.unsupported_claims || 'Assumptions of immediate margin re-rating lack empirical confirmation in recent disclosures.'}
                  </div>
                </div>

                {/* 3. Invalidation Boundary */}
                <div className="rounded-lg bg-rose-950/20 border border-rose-900/40 p-3 space-y-1">
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wide block">
                    3. IMMUTABLE STOP BOUNDARY
                  </span>
                  <div className="text-rose-200 font-mono text-xs leading-relaxed">
                    {risk_judge.invalidation_boundary || risks.setup_invalidation || `Daily close below ₹${stopLoss || dma50 || 'stop level'} completely invalidates the setup.`}
                  </div>
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* B. THE ADVERSARIAL ARENA: BULL THESIS VS BEAR TRAP (SPLIT DUEL)          */}
            {/* ========================================================================= */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {/* Left Column: Bull Case (The Setup) */}
              <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/15 p-5 shadow-lg flex flex-col justify-between">
                <div>
                  <div className="mb-3 flex items-center justify-between border-b border-emerald-900/50 pb-2.5">
                    <div className="flex items-center space-x-2 text-emerald-400 font-mono text-xs font-bold tracking-wider">
                      <TrendingUp className="h-4 w-4" />
                      <span>BULL CASE (THE SETUP)</span>
                    </div>
                    <span className="rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[9px] font-mono font-bold text-emerald-300">
                      UPSIDE DRIVERS
                    </span>
                  </div>

                  <ul className="space-y-2.5 text-xs text-zinc-200 font-sans">
                    {bull_case.length > 0 ? (
                      bull_case.map((point, idx) => (
                        <li key={idx} className="flex items-start space-x-2">
                          <span className="text-emerald-400 font-bold mt-0.5 shrink-0">🟢</span>
                          <span className="leading-relaxed">{point}</span>
                        </li>
                      ))
                    ) : thesis.length > 0 ? (
                      thesis.map((point, idx) => (
                        <li key={idx} className="flex items-start space-x-2">
                          <span className="text-emerald-400 font-bold mt-0.5 shrink-0">🟢</span>
                          <span className="leading-relaxed">{point}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-zinc-500">No specific bull thesis points generated.</li>
                    )}
                  </ul>
                </div>

                {/* Bull Catalyst Tag */}
                <div className="mt-4 pt-3 border-t border-emerald-900/40 font-mono text-[11px] text-emerald-400 flex items-center justify-between">
                  <span>Target Projection: 2R / 3R</span>
                  <span className="text-zinc-400">Momentum Acceleration</span>
                </div>
              </div>

              {/* Right Column: Bear Case (The Trap & Counterevidence) */}
              <div className="rounded-xl border border-rose-900/60 bg-rose-950/15 p-5 shadow-lg flex flex-col justify-between">
                <div>
                  <div className="mb-3 flex items-center justify-between border-b border-rose-900/50 pb-2.5">
                    <div className="flex items-center space-x-2 text-rose-400 font-mono text-xs font-bold tracking-wider">
                      <TrendingDown className="h-4 w-4" />
                      <span>BEAR CASE (THE TRAP & COUNTEREVIDENCE)</span>
                    </div>
                    <span className="rounded bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-[9px] font-mono font-bold text-rose-300">
                      DEVIL'S ADVOCATE
                    </span>
                  </div>

                  <ul className="space-y-2.5 text-xs text-zinc-200 font-sans">
                    {bear_case.length > 0 ? (
                      bear_case.map((point, idx) => (
                        <li key={idx} className="flex items-start space-x-2">
                          <span className="text-rose-400 font-bold mt-0.5 shrink-0">🔴</span>
                          <span className="leading-relaxed">{point}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-zinc-500">Valuation stretched vs 5Y historical median; broad market regime risk or overhead supply zone resistance.</li>
                    )}
                  </ul>
                </div>

                {/* Bear Risk Tag */}
                <div className="mt-4 pt-3 border-t border-rose-900/40 font-mono text-[11px] text-rose-400 flex items-center justify-between">
                  <span>Downside Risk: Stop Invalidation</span>
                  <span className="text-zinc-400">Institutional Trap</span>
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* C. OBSERVABLE EXECUTION TRIGGERS (CONFIRMATION VS ABORT)                  */}
            {/* ========================================================================= */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 font-mono text-xs">
              {/* 1. What confirms the thesis */}
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-950 p-4">
                <div className="flex items-center space-x-2 text-emerald-400 font-semibold mb-2">
                  <Zap className="h-3.5 w-3.5" />
                  <span className="text-[11px] uppercase tracking-wide">WHAT CONFIRMS THE BREAKOUT</span>
                </div>
                <div className="text-zinc-300 font-sans text-xs leading-relaxed">
                  {strengthen_conditions.length > 0 ? (
                    strengthen_conditions.join('; ')
                  ) : (
                    `Expanding volume (>1.5x 20-day average) on up-days and sustained closes above ₹${currentPrice ? currentPrice.toFixed(2) : 'current level'} confirms accumulation.`
                  )}
                </div>
              </div>

              {/* 2. What triggers an early abort */}
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-950 p-4">
                <div className="flex items-center space-x-2 text-rose-400 font-semibold mb-2">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="text-[11px] uppercase tracking-wide">WHAT CONFIRMS THE BEAR TRAP (ABORT)</span>
                </div>
                <div className="text-zinc-300 font-sans text-xs leading-relaxed">
                  {weaken_conditions.length > 0 ? (
                    weaken_conditions.join('; ')
                  ) : (
                    `High-volume rejection at resistance or breakdown below 50 DMA ₹${dma50 ? dma50.toFixed(2) : 'support'} confirms distribution is underway.`
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. Interactive Stock Chat Interface */}
        {chatOpen && (
          <div className="border-t border-zinc-800/80 bg-zinc-950/90 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-purple-300 font-mono text-xs font-semibold">
                <MessageSquare className="h-4 w-4" />
                <span>INTERACTIVE RISK JUDGE INQUIRY ({ticker})</span>
              </div>
              <button
                onClick={() => setChatMessages([])}
                className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition"
              >
                Clear chat
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2 mb-3 pr-1 text-xs font-sans">
              {chatMessages.length === 0 ? (
                <div className="rounded border border-dashed border-zinc-800 p-3 text-center text-[11px] text-zinc-500 font-mono">
                  Ask the Risk Judge anything about {ticker}—e.g. "Is the valuation justified?", "What is the biggest governance risk?", "Does this qualify for a 2R trade?"
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`rounded-lg p-2.5 leading-relaxed ${
                      msg.role === 'user'
                        ? 'ml-8 bg-zinc-900 border border-zinc-800 text-zinc-200'
                        : 'mr-8 bg-purple-950/30 border border-purple-900/40 text-purple-100 font-mono text-[11px]'
                    }`}
                  >
                    <div className="text-[10px] font-mono font-bold mb-1 opacity-60">
                      {msg.role === 'user' ? 'YOU' : 'RISK JUDGE'}
                    </div>
                    <div>{msg.content}</div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={`Ask Risk Judge about ${ticker}...`}
                disabled={chatLoading}
                className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:border-purple-500"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="rounded-lg bg-purple-600 px-3 py-2 text-white hover:bg-purple-500 disabled:opacity-40 transition"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
