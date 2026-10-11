import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Play, Sparkles, Filter, ChevronRight, X, AlertCircle, ShieldAlert, ShieldCheck, Clock } from 'lucide-react';

export default function ScannerTab({
  candidates,
  loadingScan,
  onRunScan,
  onSelectCandidate,
  onOpenTradeModal,
  aiReport,
  loadingAI,
  onGenerateAIReport,
}) {
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [universeSelect, setUniverseSelect] = useState('fast3');
  const [limitCount, setLimitCount] = useState(3);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [scanElapsed, setScanElapsed] = useState(0);
  const [aiElapsed, setAiElapsed] = useState(0);

  // Live timer during scanning
  useEffect(() => {
    let timer;
    if (loadingScan) {
      setScanElapsed(0);
      timer = setInterval(() => {
        setScanElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      setScanElapsed(0);
    }
    return () => clearInterval(timer);
  }, [loadingScan]);

  // Live timer during AI Report synthesis
  useEffect(() => {
    let timer;
    if (loadingAI) {
      setAiElapsed(0);
      timer = setInterval(() => {
        setAiElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      setAiElapsed(0);
    }
    return () => clearInterval(timer);
  }, [loadingAI]);

  const filteredCandidates = candidates.filter((c) => {
    if (filterPriority === 'ALL') return true;
    return c.priority === filterPriority;
  });

  const handleScanSubmit = () => {
    if (universeSelect === 'fast3') {
      onRunScan({ tickers: ['ICICIBANK.NS', 'TCS.NS', 'IDEA.NS'], limit: 3 });
    } else {
      onRunScan({ universe: universeSelect, limit: Number(limitCount) });
    }
  };

  const getPriorityStyle = (priority) => {
    switch (priority) {
      case 'SIGNAL TRIGGERED':
        return 'border-emerald-600/60 bg-emerald-950/40 text-emerald-300';
      case 'HIGH PRIORITY':
        return 'border-rose-600/70 bg-rose-950/50 text-rose-300 shadow-sm shadow-rose-950/50';
      case 'WATCHLIST':
        return 'border-zinc-700 bg-zinc-900/80 text-zinc-300';
      case 'AVOID / FILTERED OUT':
        return 'border-zinc-800 bg-zinc-950/60 text-zinc-500';
      default:
        return 'border-zinc-800 bg-zinc-900 text-zinc-400';
    }
  };

  return (
    <div className="min-h-[calc(100vh-100px)] p-6">
      {/* 1. Control Toolbar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-[#0c0c10]/80 p-4 shadow-xl backdrop-blur-xl">
        {/* Left: Scan Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="mb-1 block font-mono text-[10px] text-zinc-400">UNIVERSE</label>
            <select
              value={universeSelect}
              onChange={(e) => {
                const val = e.target.value;
                setUniverseSelect(val);
                if (val === 'fast3') {
                  setLimitCount(3);
                }
              }}
              className="rounded-lg border border-zinc-800 bg-zinc-900/90 px-3 py-1.5 font-mono text-xs text-zinc-200 outline-none hover:border-zinc-700 focus:border-rose-500"
            >
              <option value="fast3">⚡ 3-Stock Fast Test (ICICI, TCS, IDEA)</option>
              <option value="nifty100">Nifty 100 Index</option>
              <option value="nifty50">Nifty 50 Index</option>
              <option value="niftymidcap100">Nifty Midcap 100</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] text-zinc-400">CANDIDATE LIMIT</label>
            <select
              value={universeSelect === 'fast3' ? 3 : limitCount}
              onChange={(e) => setLimitCount(e.target.value)}
              disabled={universeSelect === 'fast3'}
              title={universeSelect === 'fast3' ? 'Fast Test universe is locked to 3 stocks' : 'Select candidate limit'}
              className={`rounded-lg border border-zinc-800 bg-zinc-900/90 px-3 py-1.5 font-mono text-xs text-zinc-200 outline-none hover:border-zinc-700 focus:border-rose-500 ${
                universeSelect === 'fast3' ? 'cursor-not-allowed opacity-50' : ''
              }`}
            >
              <option value="3">3 Stocks (Fast)</option>
              <option value="10">10 Stocks</option>
              <option value="25">25 Stocks</option>
              <option value="50">50 Stocks</option>
              <option value="100">100 Stocks (Full Universe)</option>
            </select>
          </div>

          <div className="self-end">
            <button
              onClick={handleScanSubmit}
              disabled={loadingScan}
              className="flex items-center space-x-2 rounded-lg bg-gradient-to-r from-[#c9183b] to-[#a1112e] px-4 py-1.5 font-mono text-xs font-bold text-white shadow-lg shadow-rose-950/60 transition hover:from-[#e11d48] hover:to-[#be123c] active:scale-95 disabled:opacity-50"
            >
              <Play className={`h-3.5 w-3.5 fill-current ${loadingScan ? 'animate-pulse' : ''}`} />
              <span>{loadingScan ? `Screening Universe (${scanElapsed}s)...` : 'Run Deterministic Scan'}</span>
            </button>
          </div>
        </div>

        {/* Right: AI Synthesis Trigger */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              if (candidates.length > 0) {
                onGenerateAIReport(candidates.map((c) => c.ticker));
                setIsDrawerOpen(true);
              }
            }}
            disabled={loadingAI || candidates.length === 0}
            className="flex items-center space-x-2 rounded-lg border border-rose-500/40 bg-rose-950/30 px-4 py-1.5 font-mono text-xs font-semibold text-rose-300 transition hover:bg-rose-900/40 disabled:opacity-40"
          >
            <Sparkles className={`h-3.5 w-3.5 ${loadingAI ? 'animate-spin' : ''}`} />
            <span>{loadingAI ? `Synthesizing Report (${aiElapsed}s)...` : 'Generate AI Research Report'}</span>
          </button>

          {aiReport && (
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-300 hover:border-zinc-700"
            >
              View Report
            </button>
          )}
        </div>
      </div>

      {/* 2. Priority Filter Bar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Filter className="h-3.5 w-3.5 text-zinc-500" />
          <span className="font-mono text-xs text-zinc-500">FILTER BY PRIORITY:</span>
          {['ALL', 'SIGNAL TRIGGERED', 'HIGH PRIORITY', 'WATCHLIST', 'AVOID / FILTERED OUT'].map((p) => (
            <button
              key={p}
              onClick={() => setFilterPriority(p)}
              className={`rounded-full px-3 py-1 font-mono text-[11px] transition ${
                filterPriority === p
                  ? 'bg-zinc-200 font-semibold text-zinc-900'
                  : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <span className="font-mono text-xs text-zinc-500">
          Showing {filteredCandidates.length} of {candidates.length} candidates
        </span>
      </div>

      {/* 3. Candidate Grid */}
      {loadingScan ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-[#0c0c10]/80 p-16 text-center shadow-2xl backdrop-blur-xl">
          <div className="relative mb-4 flex h-14 w-14 items-center justify-center">
            <div className="absolute inset-0 animate-ping rounded-full bg-rose-500/20" />
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-rose-500/40 bg-rose-950/50 text-rose-400">
              <Play className="ml-0.5 h-5 w-5 fill-current animate-pulse" />
            </div>
          </div>
          <div className="font-mono text-sm font-semibold text-zinc-100">
            Screening Universe: {universeSelect === 'fast3' ? 'Fast Test (3 Stocks)' : universeSelect.toUpperCase()}
          </div>
          <div className="mt-1.5 font-mono text-xs text-rose-400 font-semibold">
            Elapsed: {scanElapsed}s · Deterministic multi-factor qualification
          </div>
          <p className="mt-2 max-w-md text-xs text-zinc-400">
            Extracting historical OHLCV, calculating swing indicators (50/200 DMA, ATR, RSI), auditing fundamentals, and qualifying active setups.
          </p>
          <div className="mt-5 flex items-center space-x-2 font-mono text-[11px] text-zinc-500">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            <span>Base Calculation Engine Running (Zero AI Latency)</span>
          </div>
        </div>
      ) : filteredCandidates.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredCandidates.map((c) => {
            const f = c.fundamentals || {};
            const t = c.technicals || {};
            const val = f.valuation || {};
            const trend = t.Trend_Analysis || {};

            return (
              <div
                key={c.ticker}
                onClick={() => onSelectCandidate(c.ticker)}
                className="group relative flex cursor-pointer flex-col justify-between rounded-xl border border-white/[0.07] bg-[#0c0c10]/75 p-5 backdrop-blur-lg transition-all duration-300 hover:border-rose-500/40 hover:bg-[#121218]/90 hover:shadow-[0_0_24px_rgba(201,24,59,0.14)]"
              >
                <div>
                  {/* Top Bar: Ticker + Priority Badge */}
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-base font-bold text-zinc-100 transition-colors group-hover:text-rose-400">
                          {c.ticker}
                        </span>
                        <span className="rounded border border-zinc-800 bg-zinc-900/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                          {f.company_type || 'GENERAL'}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-400">
                        {c.name} · {c.sector}
                      </div>
                    </div>
                    <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold ${getPriorityStyle(c.priority)}`}>
                      {c.priority}
                    </span>
                  </div>

                  {/* Score Badges */}
                  <div className="mb-4 grid grid-cols-3 gap-2 rounded-lg border border-zinc-800/60 bg-zinc-900/50 p-2.5 text-center font-mono">
                    <div>
                      <div className="text-[10px] text-zinc-500">TOTAL SCORE</div>
                      <div className="text-sm font-bold text-zinc-100">
                        {c.overall_score ?? 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500">FINANCES (60%)</div>
                      <div className="text-sm font-bold text-zinc-300">
                        {f.fundamental_score ?? 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500">CHART (40%)</div>
                      <div className="text-sm font-bold text-zinc-300">
                        {t.Scoring_Summary?.Technical_Score ?? 'N/A'}
                      </div>
                    </div>
                  </div>

                  {/* Valuation & Technical Highlights */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span>Valuation (P/E & P/B):</span>
                      <span className="font-mono text-zinc-200">
                        P/E {val.pe ? `${val.pe}x` : 'N/A'} | P/B {val.pb ? `${val.pb}x` : 'N/A'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-zinc-400">
                      <span>Distance to 50-Day Avg:</span>
                      <span className={`font-mono ${trend['Dist_50_DMA_%'] >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {trend['Dist_50_DMA_%'] != null ? `${trend['Dist_50_DMA_%']}%` : 'N/A'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-zinc-400">
                      <span>Chart Pattern:</span>
                      <span className="font-mono text-zinc-300">
                        {c.strategy?.primary_strategy || t.Strategy_Evaluation?.primary_strategy || 'No active setup'}
                      </span>
                    </div>
                  </div>

                  {/* Rejection / Filter Reason Banner */}
                  {c.priority_reason && (
                    <div className={`mt-3 rounded-lg border px-2.5 py-1.5 text-[11px] leading-relaxed ${
                      c.priority === 'AVOID / FILTERED OUT'
                        ? 'border-rose-900/50 bg-rose-950/40 text-rose-300'
                        : c.priority === 'SIGNAL TRIGGERED'
                        ? 'border-emerald-800/40 bg-emerald-950/30 text-emerald-300'
                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-400'
                    }`}>
                      <span className="font-semibold">{c.priority === 'AVOID / FILTERED OUT' ? 'Why Filtered:' : 'Status Note:'}</span> {c.priority_reason}
                    </div>
                  )}
                </div>

                {/* Card Footer */}
                <div className="mt-4 flex items-center justify-between border-t border-zinc-900/80 pt-3 text-[11px] text-zinc-500 group-hover:text-zinc-300">
                  <span>Click to view Deep Dive</span>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenTradeModal) {
                          onOpenTradeModal(c.ticker, c.strategy?.primary_strategy || t.Strategy_Evaluation?.primary_strategy);
                        }
                      }}
                      className="rounded border border-rose-800/80 bg-rose-950/60 px-2 py-0.5 font-mono text-[10px] font-bold text-rose-300 hover:bg-rose-900/60 transition"
                    >
                      ⚡ Trade
                    </button>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 p-16 text-center">
          <AlertCircle className="mb-3 h-8 w-8 text-zinc-600" />
          <div className="font-mono text-sm font-medium text-zinc-300">No candidates available</div>
          <div className="mt-1 text-xs text-zinc-500">
            Click "Run Deterministic Scan" above to screen the selected stock universe.
          </div>
        </div>
      )}

      {/* 4. Slide-Over AI Report Drawer (Executive Briefing Mode) */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
          <div className="relative h-full w-full max-w-4xl overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            {/* Header */}
            <div className="sticky top-0 mb-5 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/95 pb-3 backdrop-blur z-10">
              <div className="flex items-center space-x-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/20 text-purple-400">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div>
                  <div className="font-mono text-[10px] font-bold text-purple-400 tracking-wider">
                    VERCHON VECTOR · EXECUTIVE BRIEFING
                  </div>
                  <h2 className="text-base font-bold text-zinc-100">
                    Multi-Factor Candidate Synthesis
                  </h2>
                </div>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="rounded-lg border border-zinc-800 p-2 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loadingAI ? (
              <div className="py-20 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-purple-500/40 bg-purple-950/40 text-purple-400">
                  <Sparkles className="h-6 w-6 animate-pulse" />
                </div>
                <div className="mt-4 font-mono text-sm font-bold text-zinc-100">
                  Synthesizing Multi-Factor Research Briefing
                </div>
                <div className="mt-1 font-mono text-xs text-purple-400">
                  Elapsed: {aiElapsed}s · Querying Gemini 2.5 Flash
                </div>
                <p className="mx-auto mt-2 max-w-md text-xs text-zinc-400">
                  Auditing candidate fundamentals against current market regime backdrop, structuring trade invalidation levels, and formulating critical research queries.
                </p>
                <div className="mt-6 flex items-center justify-center space-x-2 font-mono text-[11px] text-zinc-500">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-purple-400" />
                  <span>Institutional synthesis in progress</span>
                </div>
              </div>
            ) : aiReport ? (
              <div className="space-y-5">
                {/* Macro Context Banner */}
                {typeof aiReport === 'object' && aiReport.structured?.macro_backdrop && (
                  <div className="rounded-lg border border-purple-900/40 bg-purple-950/20 p-4 font-mono text-xs text-purple-200">
                    <div className="text-[10px] font-bold text-purple-400 mb-1">MACRO REGIME CONTEXT</div>
                    <div className="leading-relaxed text-zinc-300">
                      {aiReport.structured.macro_backdrop}
                    </div>
                  </div>
                )}

                {/* Candidate Quick Tabs & Summaries */}
                {typeof aiReport === 'object' && aiReport.structured?.dossiers && Object.keys(aiReport.structured.dossiers).length > 0 ? (
                  <div>
                    <div className="mb-3 font-mono text-xs font-semibold text-zinc-400">
                      CANDIDATE INTELLIGENCE DOSSIERS ({Object.keys(aiReport.structured.dossiers).filter(k => !k.endsWith('.NS')).length})
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {Object.entries(aiReport.structured.dossiers)
                        .filter(([tick]) => !tick.endsWith('.NS'))
                        .map(([tick, d]) => (
                          <div key={tick} className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 transition hover:border-zinc-700">
                            <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
                              <span className="font-mono text-sm font-bold text-rose-400">{tick}</span>
                              <button
                                onClick={() => {
                                  setIsDrawerOpen(false);
                                  onSelectCandidate(`${tick}.NS`);
                                }}
                                className="flex items-center space-x-1 rounded bg-zinc-100 px-2.5 py-1 font-mono text-[11px] font-bold text-zinc-900 hover:bg-zinc-300"
                              >
                                <span>Inspect in Deep Dive</span>
                                <ChevronRight className="h-3 w-3" />
                              </button>
                            </div>

                            {/* Thesis Points */}
                            <div className="mb-2.5">
                              <span className="font-mono text-[10px] font-bold text-emerald-400">SHORTLIST THESIS:</span>
                              <ul className="mt-1 space-y-1 text-xs text-zinc-300">
                                {d.thesis?.map((pt, i) => (
                                  <li key={i} className="flex items-start space-x-1.5">
                                    <span className="text-emerald-400 font-bold">•</span>
                                    <span>{pt}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Invalidation Trigger */}
                            {d.risks?.setup_invalidation && (
                              <div className="rounded bg-rose-950/20 border border-rose-900/30 p-2 text-xs font-mono text-rose-300">
                                <span className="font-bold text-rose-400 text-[10px]">KILL SWITCH: </span>
                                <span>{d.risks.setup_invalidation}</span>
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                ) : null}

                {/* Full Synthesis Report Collapsible */}
                <details className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 text-xs font-mono">
                  <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">
                    ▸ View Full Institutional Research Report (Markdown Log)
                  </summary>
                  <div className="prose prose-invert max-w-none font-sans text-xs leading-relaxed text-zinc-300 mt-4 pt-4 border-t border-zinc-800">
                    <ReactMarkdown>
                      {typeof aiReport === 'object' ? aiReport.report_markdown : aiReport}
                    </ReactMarkdown>
                  </div>
                </details>
              </div>
            ) : (
              <div className="py-20 text-center font-mono text-xs text-zinc-500">
                No AI report generated yet. Click "Generate AI Research Report" to run synthesis.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
