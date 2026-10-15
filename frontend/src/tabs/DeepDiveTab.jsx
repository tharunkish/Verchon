import React, { useState, useEffect, useRef } from 'react';
import { Search, Shield, AlertTriangle, ArrowUpRight, ArrowDownRight, Briefcase, Sparkles } from 'lucide-react';
import CanvasChart from '../components/CanvasChart';
import RuleChecklist from '../components/RuleChecklist';
import AIDossierCard from '../components/AIDossierCard';
import CorporateRadarCard from '../components/CorporateRadarCard';
import NeoDeepDiveTab from './neo/NeoDeepDiveTab';
import { normalizeTicker } from '../App';

export default function DeepDiveTab({ selectedTicker, onSelectTicker, onLogPaperTrade, onOpenTradeModal, themeMode }) {
  const [tickerInput, setTickerInput] = useState(selectedTicker || 'ICICIBANK.NS');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [aiDiagnostics, setAiDiagnostics] = useState([]);
  const abortControllerRef = useRef(null);

  const fetchDossier = async (sym) => {
    if (!sym) return;
    const cleanSym = normalizeTicker(sym);
    setLoading(true);
    setError(null);
    setAiError(null);
    try {
      const res = await fetch(`/api/stocks/${encodeURIComponent(cleanSym)}`);
      if (!res.ok) {
        throw new Error(`Failed to load stock dossier (${res.statusText})`);
      }
      const json = await res.json();
      setData(json);
      setTickerInput(json.ticker);
      if (json.ai_dossier?.diagnostics) {
        setAiDiagnostics(json.ai_dossier.diagnostics);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelDossier = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setAiLoading(false);
    setAiError('Generation cancelled by user.');
  };

  const handleGenerateStockDossier = async () => {
    if (!data?.ticker) return;
    setAiLoading(true);
    setAiError(null);

    // User-controlled cancellation controller (no hard 60s auto-abort)
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`/api/ai-dossier/${encodeURIComponent(data.ticker)}`, {
        method: 'POST',
        signal: controller.signal,
      });

      if (!res.ok) {
        const errDetail = await res.text();
        throw new Error(`AI Dossier generation failed (${res.status}: ${errDetail || res.statusText})`);
      }
      const resJson = await res.json();
      const updatedDiagnostics = resJson.diagnostics || [];
      setData((prev) => ({
        ...prev,
        ai_dossier: {
          ...resJson.dossier,
          diagnostics: updatedDiagnostics,
        },
      }));
      if (updatedDiagnostics.length > 0) {
        setAiDiagnostics(updatedDiagnostics);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setAiError('Generation cancelled by user.');
      } else {
        setAiError(err.message);
      }
      fetch('/api/ai-diagnostics')
        .then((r) => r.ok ? r.json() : null)
        .then((diagData) => {
          if (diagData?.diagnostics) setAiDiagnostics(diagData.diagnostics);
        })
        .catch(() => {});
    } finally {
      abortControllerRef.current = null;
      setAiLoading(false);
    }
  };


  useEffect(() => {
    if (selectedTicker) {
      fetchDossier(selectedTicker);
    } else {
      fetchDossier('ICICIBANK.NS');
    }
  }, [selectedTicker]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (tickerInput.trim()) {
      const clean = normalizeTicker(tickerInput);
      onSelectTicker(clean);
      fetchDossier(clean);
    }
  };

  const dossier = data?.dossier || {};
  const f = dossier.fundamentals || {};
  const t = dossier.technicals || {};
  const val = f.valuation || {};
  const comps = f.components || {};
  const trend = t.Trend_Analysis || {};
  const momo = t.Momentum_Analysis || {};
  const vol = t.Volume_Analysis || {};
  const strat = t.Strategy_Evaluation || {};
  const activeStrat = strat.active_strategy_result || {};

  if (themeMode === 'neo-vision') {
    return (
      <NeoDeepDiveTab
        ticker={tickerInput}
        setTicker={(sym) => {
          setTickerInput(sym);
          onSelectTicker(sym);
        }}
        data={data}
        loading={loading}
        error={error}
        onFetchData={fetchDossier}
        onOpenTradeModal={onOpenTradeModal}
        onLogPaperTrade={onLogPaperTrade}
        onGenerateStockDossier={handleGenerateStockDossier}
        aiLoading={aiLoading}
        aiDiagnostics={aiDiagnostics}
        aiError={aiError}
        onCancelDossier={handleCancelDossier}
      />
    );
  }

  return (
    <div className="min-h-[calc(100vh-100px)] p-6">
      {/* 1. Ticker Search & Header Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-[#0c0c10]/80 p-4 shadow-xl backdrop-blur-xl">
        <form onSubmit={handleSearchSubmit} className="flex items-center space-x-3">
          <div className="relative">
            <Search className="absolute top-2.5 left-3 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value)}
              placeholder="e.g. sbin, tcs, or divislab"
              className="rounded-lg border border-zinc-800 bg-zinc-900/90 py-2 pr-4 pl-9 font-mono text-xs text-zinc-100 outline-none hover:border-zinc-700 focus:border-rose-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-zinc-100 px-4 py-2 font-mono text-xs font-semibold text-zinc-900 hover:bg-zinc-300 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Deep Dive'}
          </button>
        </form>

        {data && (
          <div className="flex items-center space-x-4">
            <div className="text-right font-mono">
              <div className="text-sm font-bold text-zinc-100">
                ₹{trend.Current_Price?.toFixed(2) || 'N/A'}
              </div>
              <div className="text-[11px] text-zinc-400">
                {dossier.name} · {f.company_type}
              </div>
            </div>

            {/* Quick Paper Trade Trigger */}
            <button
              onClick={() => {
                if (onOpenTradeModal && data?.ticker) {
                  onOpenTradeModal(data.ticker, strat.primary_strategy || 'MANUAL_ENTRY');
                } else if (onLogPaperTrade && data?.ticker) {
                  onLogPaperTrade({
                    ticker: data.ticker,
                    entry_price: trend.Current_Price || 100,
                    stop_price: activeStrat.stop_price || (trend.Current_Price ? trend.Current_Price * 0.95 : 95),
                    quantity: 25,
                    strategy_name: strat.primary_strategy || 'MANUAL_ENTRY',
                  });
                }
              }}
              className="flex items-center space-x-2 rounded-lg bg-gradient-to-r from-[#c9183b] to-[#a1112e] px-4 py-2 font-mono text-xs font-bold text-white shadow-lg shadow-rose-950/60 transition hover:from-[#e11d48] hover:to-[#be123c] active:scale-95"
            >
              <Briefcase className="h-3.5 w-3.5" />
              <span>Paper Trade Setup</span>
            </button>
          </div>
        )}
      </div>

      {/* Rejection / Priority Explanation Banner */}
      {data && dossier.priority && (
        <div className={`mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 font-mono text-xs ${
          dossier.priority === 'AVOID / FILTERED OUT'
            ? 'border-rose-900/60 bg-rose-950/40 text-rose-300'
            : dossier.priority === 'SIGNAL TRIGGERED'
            ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
            : 'border-zinc-800 bg-zinc-900/70 text-zinc-300'
        }`}>
          <div>
            <span className="font-bold tracking-wide">STATUS: {dossier.priority}</span>
            {dossier.priority_reason && (
              <span className="ml-2 font-sans font-medium text-zinc-200">— {dossier.priority_reason}</span>
            )}
          </div>
          <span className="text-[11px] text-zinc-400">Total Score: {dossier.overall_score}/100</span>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-rose-800 bg-rose-950/40 p-4 font-mono text-xs text-rose-300">
          Error: {error}
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* 2. Interactive TradingView Canvas Chart */}
          <CanvasChart
            candles={data.chart?.candles || []}
            dma50={data.chart?.dma_50 || []}
            dma200={data.chart?.dma_200 || []}
            stopPrice={activeStrat.stop_price}
            ticker={data.ticker}
            markers={data.chart?.markers || []}
            signals={data.chart?.signals || []}
            signalStats={data.chart?.stats || {}}
          />

          {/* 3. Integrated Gemini AI Research Dossier Card */}
          <AIDossierCard
            ticker={data.ticker}
            aiDossier={data.ai_dossier}
            loading={aiLoading}
            onGenerateDossier={handleGenerateStockDossier}
            onCancel={handleCancelDossier}
            diagnostics={data.ai_dossier?.diagnostics || aiDiagnostics}
            errorMessage={aiError}
          />

          {/* 4. Institutional Corporate Radar & Earnings Gate */}
          {data && data.corporate_radar && (
            <CorporateRadarCard radar={data.corporate_radar} />
          )}

          {/* 5. Strategy Pass/Fail Rule Breakdown & Technical Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <RuleChecklist rules={data.rule_breakdown || []} />

            {/* Technical Structure Summary Card */}
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-950 p-4">
              <div className="mb-3 flex items-center justify-between border-b border-zinc-900 pb-2">
                <span className="font-mono text-xs font-semibold text-zinc-200">
                  CHART HEALTH & MOMENTUM (VS NIFTY 50)
                </span>
                <span className="font-mono text-xs text-zinc-400">
                  Score: {t.Scoring_Summary?.Technical_Score}/100 ({t.Scoring_Summary?.Technical_Classification})
                </span>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="grid grid-cols-2 gap-2 text-zinc-400">
                  <div>
                    50-Day Avg: <span className="text-zinc-200">₹{trend['50_DMA']}</span>
                    <span className="ml-1 text-[11px] text-zinc-500">({trend['50_DMA_Trend']})</span>
                  </div>
                  <div>
                    200-Day Avg: <span className="text-zinc-200">₹{trend['200_DMA']}</span>
                    <span className="ml-1 text-[11px] text-zinc-500">({trend['200_DMA_Trend']})</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-zinc-400">
                  <div>
                    Price vs 50D: <span className={trend['Dist_50_DMA_%'] >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{trend['Dist_50_DMA_%']}%</span>
                  </div>
                  <div>
                    Price vs 200D: <span className={trend['Dist_200_DMA_%'] >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{trend['Dist_200_DMA_%']}%</span>
                  </div>
                </div>

                <div className="border-t border-zinc-900 pt-2">
                  <div className="mb-1 text-[11px] text-zinc-500">PERFORMANCE VS NIFTY 50 (BEATING THE MARKET)</div>
                  <div className="grid grid-cols-4 gap-1 text-center text-[11px]">
                    {['1M', '3M', '6M', '1Y'].map((h) => {
                      const alpha = momo['Relative_Strength_Alpha_%']?.[h];
                      return (
                        <div key={h} className="rounded border border-zinc-900 bg-zinc-900/50 p-1.5">
                          <div className="text-zinc-500">{h}</div>
                          <div className={`font-bold ${alpha >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {alpha != null ? `${alpha > 0 ? '+' : ''}${alpha}%` : 'N/A'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-zinc-900 pt-2 text-[11px] text-zinc-400">
                  <span>Trading Volume Trend: </span>
                  <span className="font-semibold text-zinc-200">{vol.Volume_Classification}</span>
                  <span className="ml-2 text-zinc-500">(Up/Down Volume: {vol.Up_Down_Volume_Ratio}x · Expansion: {vol.Volume_Expansion_Ratio}x)</span>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Fundamental 7-Pillars Card */}
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-950 p-5">
            <div className="mb-4 flex items-center justify-between border-b border-zinc-900 pb-3">
              <div>
                <span className="font-mono text-xs font-semibold text-zinc-200">
                  COMPANY FINANCIAL HEALTH & SAFETY (7 PILLARS)
                </span>
                <span className="ml-2 rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                  Data Completeness: {f.data_completeness}% ({f.analysis_confidence} Confidence)
                </span>
              </div>
              <span className="font-mono text-sm font-bold text-zinc-100">
                Score: {f.fundamental_score}/100
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {Object.entries(comps).map(([name, comp]) => (
                <div key={name} className="rounded-lg border border-zinc-900 bg-zinc-900/30 p-3 font-mono text-xs">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="font-medium text-zinc-300">{name}</span>
                    <span className="font-bold text-zinc-100">{comp.score != null ? `${comp.score}/100` : 'N/A'}</span>
                  </div>
                  <div className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                    {comp.assessment}
                  </div>
                </div>
              ))}
            </div>

            {/* Valuation Baseline Section */}
            <div className="mt-4 flex flex-wrap items-center justify-between rounded-lg border border-zinc-900 bg-zinc-900/40 p-3 font-mono text-xs">
              <div className="flex items-center space-x-4">
                <span className="text-zinc-400">VALUATION:</span>
                <span className="text-zinc-200">Current P/E: {val.pe ? `${val.pe}x` : 'N/A'}</span>
                <span className="text-zinc-400">5Y Median: {val.historical_pe_median_5y ? `${val.historical_pe_median_5y}x` : 'N/A'}</span>
                <span className="text-zinc-400">P/B: {val.pb ? `${val.pb}x` : 'N/A'}</span>
              </div>
              <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300">
                {val.category} (Risk: {val.risk})
              </span>
            </div>
          </div>

          {/* 5. Positive Drivers vs Red Flags Grid */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-emerald-950/60 bg-emerald-950/10 p-4">
              <div className="mb-2 font-mono text-xs font-semibold text-emerald-400">
                BUSINESS STRENGTHS & ADVANTAGES
              </div>
              <ul className="space-y-1.5 text-xs text-zinc-300">
                {f.positives?.length > 0 ? (
                  f.positives.map((pos, i) => (
                    <li key={i} className="flex items-start space-x-2">
                      <span className="mt-0.5 text-emerald-400 font-bold">+</span>
                      <span>{pos}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-zinc-500">No significant positive signals identified.</li>
                )}
              </ul>
            </div>

            <div className="rounded-lg border border-rose-950/60 bg-rose-950/10 p-4">
              <div className="mb-2 font-mono text-xs font-semibold text-rose-400">
                WARNING SIGNS & RISKS
              </div>
              <ul className="space-y-1.5 text-xs text-zinc-300">
                {f.red_flags?.length > 0 ? (
                  f.red_flags.map((flag, i) => (
                    <li key={i} className="flex items-start space-x-2">
                      <span className="mt-0.5 text-rose-400 font-bold">-</span>
                      <span>
                        <strong className="text-zinc-200">[{flag.severity}] {flag.name}:</strong> {flag.explanation}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="text-zinc-500">No critical red flags identified.</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
