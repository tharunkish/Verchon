import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, 
  Shield, 
  AlertTriangle, 
  ArrowUpRight, 
  ArrowDownRight, 
  Briefcase, 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Layers, 
  Compass, 
  Clock, 
  Lock, 
  PieChart, 
  Scale, 
  DollarSign, 
  Percent, 
  Info, 
  ExternalLink, 
  Calendar, 
  ChevronRight, 
  Play, 
  Maximize2, 
  RefreshCw, 
  MessageSquare, 
  Send, 
  Zap, 
  Eye, 
  EyeOff,
  Copy,
  Check,
  Building,
  Activity,
  BarChart2,
  FileText
} from 'lucide-react';
import CanvasChart from '../../components/CanvasChart';
import RuleChecklist from '../../components/RuleChecklist';
import AIDossierCard from '../../components/AIDossierCard';
import CorporateRadarCard from '../../components/CorporateRadarCard';
import PortfolioRiskBridgeCard from '../../components/PortfolioRiskBridgeCard';
import { normalizeTicker } from '../../App';

// Curated Bluechip Specimen Benchmark list for rapid switching
const BENCHMARK_SPECIMENS = [
  { ticker: 'ICICIBANK.NS', name: 'ICICI Bank', sector: 'Financials' },
  { ticker: 'TCS.NS', name: 'Tata Consultancy', sector: 'Information Tech' },
  { ticker: 'RELIANCE.NS', name: 'Reliance Industries', sector: 'Energy & Retail' },
  { ticker: 'HDFCBANK.NS', name: 'HDFC Bank', sector: 'Financials' },
  { ticker: 'INFY.NS', name: 'Infosys', sector: 'Information Tech' },
  { ticker: 'BHARTIARTL.NS', name: 'Bharti Airtel', sector: 'Telecom' },
  { ticker: 'SBIN.NS', name: 'State Bank of India', sector: 'Financials' },
  { ticker: 'LT.NS', name: 'Larsen & Toubro', sector: 'Capital Goods' },
  { ticker: 'TATAMOTORS.NS', name: 'Tata Motors', sector: 'Automobile' },
  { ticker: 'KOTAKBANK.NS', name: 'Kotak Mahindra', sector: 'Financials' },
  { ticker: 'MARUTI.NS', name: 'Maruti Suzuki', sector: 'Automobile' },
];

export default function AppleDeepDiveTab({ 
  selectedTicker, 
  onSelectTicker, 
  onLogPaperTrade, 
  onOpenTradeModal, 
  themeMode,
  candidates = [],
  regime = null
}) {
  const [tickerInput, setTickerInput] = useState(selectedTicker || 'ICICIBANK.NS');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // AI Dossier state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiDiagnostics, setAiDiagnostics] = useState([]);
  const [aiStreamingText, setAiStreamingText] = useState('');
  const abortControllerRef = useRef(null);

  // Portfolio impact state
  const [portfolioImpact, setPortfolioImpact] = useState(null);
  const [loadingImpact, setLoadingImpact] = useState(false);

  // Active section view filter (The Analytical Chambers)
  const [activeChamber, setActiveChamber] = useState('ALL'); // 'ALL' | 'CHART' | 'RUNWAY' | 'SOLVENCY' | 'RADAR_AI'
  const [copiedTicker, setCopiedTicker] = useState(false);

  const fetchPortfolioImpact = async (sym) => {
    if (!sym) return;
    const cleanSym = normalizeTicker(sym);
    setLoadingImpact(true);
    try {
      const res = await fetch(`/api/paper-trades/portfolio-impact?ticker=${encodeURIComponent(cleanSym)}`);
      if (res.ok) {
        const json = await res.json();
        setPortfolioImpact(json);
      }
    } catch {
      // Ignore background error
    } finally {
      setLoadingImpact(false);
    }
  };

  const fetchDossier = async (sym) => {
    if (!sym) return;
    const cleanSym = normalizeTicker(sym);
    setLoading(true);
    setError(null);
    setAiError(null);
    setAiStreamingText('');
    setPortfolioImpact(null);
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
      fetchPortfolioImpact(json.ticker || cleanSym);
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
    setAiStreamingText('');
    setAiError('Generation cancelled by user.');
  };

  const handleGenerateStockDossier = async () => {
    if (!data?.ticker) return;
    setAiLoading(true);
    setAiError(null);
    setAiStreamingText('');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`/api/ai-dossier/${encodeURIComponent(data.ticker)}/stream`, {
        method: 'POST',
        signal: controller.signal,
      });

      if (!res.ok) {
        const errDetail = await res.text();
        throw new Error(`AI Dossier generation failed (${res.status}: ${errDetail || res.statusText})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let streamBuffer = '';
      let accumulatedTokens = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        streamBuffer += decoder.decode(value, { stream: true });
        const lines = streamBuffer.split('\n\n');
        streamBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const payload = JSON.parse(trimmed.slice(6));
              if (payload.type === 'token') {
                accumulatedTokens += payload.content;
                setAiStreamingText(accumulatedTokens);
              } else if (payload.type === 'done') {
                const updatedDiagnostics = payload.diagnostics || [];
                setData((prev) => ({
                  ...prev,
                  ai_dossier: {
                    ...payload.dossier,
                    diagnostics: updatedDiagnostics,
                  },
                }));
                if (updatedDiagnostics.length > 0) {
                  setAiDiagnostics(updatedDiagnostics);
                }
                setAiStreamingText('');
              } else if (payload.type === 'error') {
                throw new Error(payload.error || 'Stream error');
              }
            } catch (parseErr) {
              // Ignore single malformed chunk
            }
          }
        }
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

  const handleSwitchSpecimen = (sym) => {
    const clean = normalizeTicker(sym);
    setTickerInput(clean);
    onSelectTicker(clean);
    fetchDossier(clean);
  };

  const handleCopyTicker = () => {
    if (!data?.ticker) return;
    navigator.clipboard.writeText(data.ticker);
    setCopiedTicker(true);
    setTimeout(() => setCopiedTicker(false), 2000);
  };

  // Dossier extracted data models
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

  // Runway mathematical points
  const currentPrice = trend.Current_Price || (data?.chart?.candles?.slice(-1)[0]?.close) || 0;
  const stopPrice = activeStrat.stop_price || (currentPrice > 0 ? currentPrice * 0.95 : 0);
  const target1 = activeStrat.target_1 || (currentPrice > 0 ? currentPrice + (currentPrice - stopPrice) * 2 : 0);
  const target2 = activeStrat.target_2 || (currentPrice > 0 ? currentPrice + (currentPrice - stopPrice) * 3 : 0);

  const stopLossDistance = currentPrice > 0 ? currentPrice - stopPrice : 0;
  const stopLossPct = currentPrice > 0 ? ((stopLossDistance / currentPrice) * 100) : 0;
  const target1Pct = currentPrice > 0 ? (((target1 - currentPrice) / currentPrice) * 100) : 0;
  const target2Pct = currentPrice > 0 ? (((target2 - currentPrice) / currentPrice) * 100) : 0;
  const riskReward1 = stopLossDistance > 0 ? ((target1 - currentPrice) / stopLossDistance).toFixed(1) : '2.0';
  const riskReward2 = stopLossDistance > 0 ? ((target2 - currentPrice) / stopLossDistance).toFixed(1) : '3.0';

  // Capital sizing calculation (based on default 10L capital or portfolio account)
  const baseAccountCapital = 1000000;
  const riskPerTradePct = 1.0; // 1% risk rule
  const riskBudget = baseAccountCapital * (riskPerTradePct / 100); // ₹10,000 risk
  const recommendedShares = stopLossDistance > 0 ? Math.max(1, Math.floor(riskBudget / stopLossDistance)) : 25;
  const positionCapital = Math.round(recommendedShares * currentPrice);
  const capitalAtRisk = Math.round(recommendedShares * stopLossDistance);

  // Statutory friction estimate
  const estSTT = Math.round(positionCapital * 0.001); // 0.1% delivery
  const estExchange = Math.round(positionCapital * 0.000035);
  const estStampDuty = Math.round(positionCapital * 0.00015);
  const estGST = Math.round((estExchange + 20) * 0.18);
  const estTotalCharges = estSTT + estExchange + estStampDuty + estGST + 40; // ₹40 flat brokerage roundtrip

  // 52-week range calculation (from chart data or historical fallback)
  const candles = data?.chart?.candles || [];
  const candleHighs = candles.map(c => c.high);
  const candleLows = candles.map(c => c.low);
  const yearHigh = candleHighs.length > 0 ? Math.max(...candleHighs) : (currentPrice * 1.25);
  const yearLow = candleLows.length > 0 ? Math.min(...candleLows) : (currentPrice * 0.75);
  const rangeSpan = yearHigh - yearLow;
  const priceAltitudePct = rangeSpan > 0 ? Math.min(100, Math.max(0, ((currentPrice - yearLow) / rangeSpan) * 100)) : 50;

  // Composite priority classification
  const priority = dossier.priority || 'EVALUATING';
  const isTriggered = priority === 'SIGNAL TRIGGERED' || activeStrat.signal_triggered;
  const isAvoid = priority === 'AVOID / FILTERED OUT' || dossier.overall_score < 40;
  const priorityReason = dossier.priority_reason || activeStrat.reason || 'Under standard multi-factor underwriting review.';

  return (
    <div className="min-h-[calc(100vh-100px)] p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* =========================================================================
          1. SPECIMEN REEL & RAPID DISCOVERY CAROUSEL
         ========================================================================= */}
      <div className="rounded-3xl border border-black/[0.08] dark:border-white/[0.08] bg-white/70 dark:bg-[#0c0d12]/80 p-4 shadow-xl backdrop-blur-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="flex items-center space-x-2 shrink-0">
            <div className="relative group">
              <Search className="absolute top-2.5 left-3.5 h-4 w-4 text-zinc-400 group-focus-within:text-rose-500 transition-colors" />
              <input
                type="text"
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value)}
                placeholder="Enter symbol (e.g. TCS, RELIANCE, SBIN)..."
                className="w-64 sm:w-80 rounded-2xl border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.03] dark:bg-white/[0.04] py-2 pr-4 pl-10 text-xs font-semibold text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none transition focus:border-rose-500/80 focus:bg-white dark:focus:bg-black/40 focus:ring-4 focus:ring-rose-500/10"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-bold text-white dark:text-zinc-900 shadow-md transition hover:bg-zinc-800 dark:hover:bg-zinc-200 active:scale-95 disabled:opacity-50"
            >
              {loading ? 'Examining...' : 'Open Dossier'}
            </button>
          </form>

          {/* Horizontal Specimen Reel */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 shrink-0 mr-1 flex items-center">
              <Compass className="h-3 w-3 mr-1" /> Specimen Reel:
            </span>

            {/* Candidates from Scanner (if available) */}
            {candidates && candidates.length > 0 ? (
              candidates.slice(0, 8).map((cand) => {
                const cSym = cand.ticker || cand.name;
                const isSelected = normalizeTicker(cSym) === normalizeTicker(data?.ticker || selectedTicker);
                return (
                  <button
                    key={cSym}
                    onClick={() => handleSwitchSpecimen(cSym)}
                    className={`group flex items-center space-x-2 rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all border ${
                      isSelected
                        ? 'border-rose-500/80 bg-rose-500/10 text-rose-700 dark:text-rose-300 shadow-sm'
                        : 'border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.03] text-zinc-600 dark:text-zinc-400 hover:border-black/[0.15] dark:hover:border-white/[0.15] hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    <span>{cSym.replace('.NS', '')}</span>
                    {cand.overall_score && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        cand.overall_score >= 75 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-zinc-500/20 text-zinc-500'
                      }`}>
                        {cand.overall_score}
                      </span>
                    )}
                  </button>
                );
              })
            ) : (
              /* Curated Bluechip Fallback Carousel */
              BENCHMARK_SPECIMENS.map((spec) => {
                const isSelected = normalizeTicker(spec.ticker) === normalizeTicker(data?.ticker || selectedTicker);
                return (
                  <button
                    key={spec.ticker}
                    onClick={() => handleSwitchSpecimen(spec.ticker)}
                    className={`flex items-center space-x-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all border ${
                      isSelected
                        ? 'border-rose-500/80 bg-rose-500/10 text-rose-700 dark:text-rose-300 shadow-sm ring-1 ring-rose-500/20'
                        : 'border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.03] text-zinc-600 dark:text-zinc-400 hover:border-black/[0.15] dark:hover:border-white/[0.15] hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    <span>{spec.ticker.replace('.NS', '')}</span>
                    <span className="text-[10px] text-zinc-400">· {spec.sector}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-5 text-xs font-medium text-rose-700 dark:text-rose-300 shadow-lg backdrop-blur-xl flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />
            <div>
              <p className="font-bold">Dossier Examination Interrupted</p>
              <p className="text-zinc-600 dark:text-zinc-400">{error}</p>
            </div>
          </div>
          <button
            onClick={() => fetchDossier(tickerInput)}
            className="rounded-xl bg-rose-500 text-white px-3 py-1.5 font-bold hover:bg-rose-600 transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !data && (
        <div className="rounded-3xl border border-black/[0.08] dark:border-white/[0.08] bg-white/70 dark:bg-[#0c0d12]/80 p-12 text-center backdrop-blur-2xl animate-pulse space-y-4">
          <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-2xl mx-auto" />
          <div className="h-4 w-96 bg-zinc-200 dark:bg-zinc-800 rounded-xl mx-auto" />
          <p className="text-xs font-semibold text-zinc-500">
            Synthesizing 1-Year OHLCV candlestick geometry, 7-pillar solvency ratios, and corporate filings...
          </p>
        </div>
      )}

      {data && (
        <div className="space-y-6">

          {/* =========================================================================
              2. THE EDITORIAL MASTHEAD (THE DOSSIER HERO)
             ========================================================================= */}
          <div className="relative overflow-hidden rounded-3xl border border-black/[0.08] dark:border-white/[0.08] bg-white/80 dark:bg-[#0c0d12]/90 p-6 sm:p-8 shadow-2xl backdrop-blur-3xl">
            {/* Ambient Background Aura */}
            <div className={`absolute -right-20 -top-20 h-72 w-72 rounded-full blur-3xl opacity-20 pointer-events-none ${
              isTriggered ? 'bg-emerald-500' : isAvoid ? 'bg-rose-500' : 'bg-blue-500'
            }`} />

            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              
              {/* Left Identity Column */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1 text-xs font-black tracking-wider uppercase">
                    NSE : {data.ticker.replace('.NS', '')}
                  </span>
                  
                  <span className="rounded-full border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.03] dark:bg-white/[0.05] px-3 py-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    {dossier.name || 'NSE Equity'}
                  </span>

                  {f.company_type && (
                    <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
                      {f.company_type}
                    </span>
                  )}

                  <button
                    onClick={handleCopyTicker}
                    title="Copy full symbol"
                    className="p-1.5 rounded-full hover:bg-black/[0.05] dark:hover:bg-white/[0.05] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
                  >
                    {copiedTicker ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4">
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-zinc-900 dark:text-white">
                    ₹{currentPrice > 0 ? currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}
                  </h1>

                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-bold ${
                      trend['Dist_50_DMA_%'] >= 0
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                    }`}>
                      {trend['Dist_50_DMA_%'] >= 0 ? <ArrowUpRight className="h-3.5 w-3.5 mr-1" /> : <ArrowDownRight className="h-3.5 w-3.5 mr-1" />}
                      {trend['Dist_50_DMA_%'] != null ? `${trend['Dist_50_DMA_%'] > 0 ? '+' : ''}${trend['Dist_50_DMA_%']}% vs 50 DMA` : 'N/A'}
                    </span>

                    <span className="text-xs font-medium text-zinc-400">
                      200 DMA: ₹{trend['200_DMA'] ? trend['200_DMA'].toFixed(1) : '---'}
                    </span>
                  </div>
                </div>

                {/* 52-Week Range Bar with visual altitude needle */}
                <div className="pt-1 max-w-md space-y-1">
                  <div className="flex justify-between text-[11px] font-semibold text-zinc-400">
                    <span>52W Low: ₹{yearLow.toFixed(1)}</span>
                    <span className="font-bold text-zinc-700 dark:text-zinc-300">Altitude: {priceAltitudePct.toFixed(0)}%</span>
                    <span>52W High: ₹{yearHigh.toFixed(1)}</span>
                  </div>
                  <div className="relative h-2 w-full rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
                    <div 
                      className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-rose-500 transition-all duration-700"
                      style={{ width: `${priceAltitudePct}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Right Verdict & Action Cluster */}
              <div className="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end justify-between gap-4 border-t lg:border-t-0 border-black/[0.06] dark:border-white/[0.06] pt-4 lg:pt-0">
                
                {/* Composite Health Dial & Status Badge */}
                <div className="text-left lg:text-right space-y-1.5">
                  <div className="flex items-center lg:justify-end space-x-2">
                    <div className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border shadow-sm ${
                      isTriggered
                        ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : isAvoid
                        ? 'border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                        : 'border-zinc-500/30 bg-zinc-500/15 text-zinc-700 dark:text-zinc-300'
                    }`}>
                      {priority}
                    </div>

                    <div className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-xs font-black text-zinc-800 dark:text-zinc-200">
                      <span>Score:</span>
                      <span className="text-rose-600 dark:text-rose-400">{dossier.overall_score || 0}</span>
                      <span className="text-[10px] text-zinc-400">/100</span>
                    </div>
                  </div>

                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 max-w-sm line-clamp-2">
                    {priorityReason}
                  </p>
                </div>

                {/* Primary Action Buttons */}
                <div className="flex items-center space-x-3 w-full sm:w-auto">
                  <button
                    onClick={() => {
                      if (onOpenTradeModal) {
                        onOpenTradeModal(data.ticker, strat.primary_strategy || 'MANUAL_ENTRY');
                      } else if (onLogPaperTrade) {
                        onLogPaperTrade({
                          ticker: data.ticker,
                          entry_price: currentPrice,
                          stop_price: stopPrice,
                          quantity: recommendedShares,
                          strategy_name: strat.primary_strategy || 'MANUAL_ENTRY',
                        });
                      }
                    }}
                    className="flex-1 sm:flex-initial flex items-center justify-center space-x-2 rounded-2xl bg-gradient-to-r from-rose-600 via-rose-500 to-pink-600 px-6 py-3 text-xs font-black text-white shadow-xl shadow-rose-500/25 transition-all hover:shadow-rose-500/40 hover:scale-[1.02] active:scale-95"
                  >
                    <Briefcase className="h-4 w-4" />
                    <span>Deploy Paper Trade</span>
                  </button>

                  <button
                    onClick={handleGenerateStockDossier}
                    disabled={aiLoading}
                    className="flex items-center space-x-2 rounded-2xl border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.04] px-4 py-3 text-xs font-bold text-zinc-800 dark:text-zinc-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition active:scale-95 disabled:opacity-50"
                  >
                    <Sparkles className="h-4 w-4 text-purple-500 animate-pulse" />
                    <span>{aiLoading ? 'Streaming...' : 'AI Dossier'}</span>
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* =========================================================================
              3. TACTILE CHAMBER SWITCHER (VIEW MODES)
             ========================================================================= */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'ALL', label: '🧭 Unified Dossier' },
              { id: 'CHART', label: '📈 Price Geometry & Chart' },
              { id: 'RUNWAY', label: '🛡️ Trade Runway & Friction' },
              { id: 'SOLVENCY', label: '🏛️ Solvency & 7-Pillars' },
              { id: 'RADAR_AI', label: '🧠 Radar & AI Intelligence' },
            ].map((chamber) => (
              <button
                key={chamber.id}
                onClick={() => setActiveChamber(chamber.id)}
                className={`rounded-2xl px-4 py-2 text-xs font-bold whitespace-nowrap transition-all shadow-sm ${
                  activeChamber === chamber.id
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-md scale-[1.02]'
                    : 'border border-black/[0.06] dark:border-white/[0.06] bg-white/70 dark:bg-[#0c0d12]/80 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                {chamber.label}
              </button>
            ))}
          </div>

          {/* =========================================================================
              4. CHAMBER: LIVING CHART PAVILION & MULTI-HORIZON ALPHA MATRIX
             ========================================================================= */}
          {(activeChamber === 'ALL' || activeChamber === 'CHART') && (
            <div className="space-y-4">
              
              {/* Interactive TradingView Canvas Chart */}
              <div className="overflow-hidden rounded-3xl border border-black/[0.08] dark:border-white/[0.08] bg-white/70 dark:bg-[#0c0d12]/80 p-5 shadow-xl backdrop-blur-2xl">
                <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] pb-3 mb-4">
                  <div className="flex items-center space-x-2">
                    <Activity className="h-4 w-4 text-rose-500" />
                    <span className="text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                      Living Price Geometry & 1-Year Daily OHLCV
                    </span>
                  </div>

                  <div className="flex items-center space-x-3 text-xs font-semibold">
                    <span className="flex items-center text-blue-600 dark:text-blue-400">
                      <span className="h-2 w-2 rounded-full bg-blue-500 mr-1.5" /> 50 DMA: ₹{trend['50_DMA'] ? trend['50_DMA'].toFixed(1) : '---'}
                    </span>
                    <span className="flex items-center text-amber-600 dark:text-amber-400">
                      <span className="h-2 w-2 rounded-full bg-amber-500 mr-1.5" /> 200 DMA: ₹{trend['200_DMA'] ? trend['200_DMA'].toFixed(1) : '---'}
                    </span>
                  </div>
                </div>

                <CanvasChart
                  candles={data.chart?.candles || []}
                  dma50={data.chart?.dma_50 || []}
                  dma200={data.chart?.dma_200 || []}
                  stopPrice={activeStrat.stop_price}
                  ticker={data.ticker}
                  markers={data.chart?.markers || []}
                />
              </div>

              {/* Multi-Horizon Relative Strength Alpha Matrix & Volume Telemetry */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* 1. Relative Strength vs Nifty 50 */}
                <div className="rounded-3xl border border-black/[0.08] dark:border-white/[0.08] bg-white/70 dark:bg-[#0c0d12]/80 p-5 shadow-lg backdrop-blur-2xl space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-500">
                    <span>ALPHA VS NIFTY 50</span>
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  </div>
                  
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    {['1M', '3M', '6M', '1Y'].map((h) => {
                      const alpha = momo['Relative_Strength_Alpha_%']?.[h];
                      const isPos = alpha != null && alpha > 0;
                      return (
                        <div key={h} className="rounded-2xl border border-black/[0.04] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.03] p-2">
                          <div className="text-[10px] font-bold text-zinc-400">{h}</div>
                          <div className={`text-xs font-black ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {alpha != null ? `${alpha > 0 ? '+' : ''}${alpha.toFixed(1)}%` : '---'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-zinc-400 text-center">
                    {momo['Relative_Strength_Alpha_%']?.['3M'] > 0 ? '🚀 Beating benchmark index' : '⚠️ Lagging broader market'}
                  </p>
                </div>

                {/* 2. Volume & Accumulation Dynamics */}
                <div className="rounded-3xl border border-black/[0.08] dark:border-white/[0.08] bg-white/70 dark:bg-[#0c0d12]/80 p-5 shadow-lg backdrop-blur-2xl space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-500">
                    <span>VOLUME DYNAMICS</span>
                    <BarChart2 className="h-4 w-4 text-blue-500" />
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                      {vol.Volume_Classification || 'Normal Liquidity'}
                    </div>
                    <div className="flex justify-between text-xs text-zinc-500 font-semibold">
                      <span>Expansion Ratio:</span>
                      <span className="text-zinc-800 dark:text-zinc-200 font-bold">{vol.Volume_Expansion_Ratio ? `${vol.Volume_Expansion_Ratio}x` : '1.0x'}</span>
                    </div>
                    <div className="flex justify-between text-xs text-zinc-500 font-semibold">
                      <span>Up/Down Ratio:</span>
                      <span className="text-zinc-800 dark:text-zinc-200 font-bold">{vol.Up_Down_Volume_Ratio ? `${vol.Up_Down_Volume_Ratio}x` : '1.0x'}</span>
                    </div>
                  </div>
                </div>

                {/* 3. Momentum & RSI Oscillator */}
                <div className="rounded-3xl border border-black/[0.08] dark:border-white/[0.08] bg-white/70 dark:bg-[#0c0d12]/80 p-5 shadow-lg backdrop-blur-2xl space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-500">
                    <span>MOMENTUM OSCILLATOR</span>
                    <Zap className="h-4 w-4 text-amber-500" />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-black text-zinc-900 dark:text-white">
                        {momo.RSI != null ? momo.RSI.toFixed(1) : (momo.RSI_14 != null ? momo.RSI_14.toFixed(1) : '54.0')}
                      </span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        (momo.RSI || 50) > 70 ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400' :
                        (momo.RSI || 50) < 30 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                        'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                      }`}>
                        {(momo.RSI || 50) > 70 ? 'Overbought' : (momo.RSI || 50) < 30 ? 'Oversold Reversal' : 'Neutral Momentum'}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-black/[0.05] dark:bg-white/[0.08] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-500 via-blue-500 to-rose-500" 
                        style={{ width: `${Math.min(100, Math.max(0, momo.RSI || 54))}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Moving Average Geometry */}
                <div className="rounded-3xl border border-black/[0.08] dark:border-white/[0.08] bg-white/70 dark:bg-[#0c0d12]/80 p-5 shadow-lg backdrop-blur-2xl space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-500">
                    <span>TREND GEOMETRY</span>
                    <Compass className="h-4 w-4 text-purple-500" />
                  </div>

                  <div className="space-y-1 text-xs font-semibold text-zinc-500">
                    <div className="flex justify-between">
                      <span>50 DMA Slope:</span>
                      <span className={trend['50_DMA_Slope_5d'] > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                        {trend['50_DMA_Slope_5d'] ? `${trend['50_DMA_Slope_5d'] > 0 ? '+' : ''}${trend['50_DMA_Slope_5d'].toFixed(2)}` : 'Flat'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Distance vs 50D:</span>
                      <span className={trend['Dist_50_DMA_%'] >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                        {trend['Dist_50_DMA_%'] != null ? `${trend['Dist_50_DMA_%']}%` : '---'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Distance vs 200D:</span>
                      <span className={trend['Dist_200_DMA_%'] >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                        {trend['Dist_200_DMA_%'] != null ? `${trend['Dist_200_DMA_%']}%` : '---'}
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* =========================================================================
              5. CHAMBER: THE TACTILE TRADE RUNWAY & STATUTORY FRICTION STUDIO
             ========================================================================= */}
          {(activeChamber === 'ALL' || activeChamber === 'RUNWAY') && (
            <div className="space-y-6">
              
              {/* Sovereign 4-Point Trade Runway Card */}
              <div className="overflow-hidden rounded-3xl border border-black/[0.08] dark:border-white/[0.08] bg-white/80 dark:bg-[#0c0d12]/90 p-6 sm:p-8 shadow-xl backdrop-blur-3xl space-y-6">
                
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] dark:border-white/[0.06] pb-4">
                  <div className="flex items-center space-x-2">
                    <Target className="h-5 w-5 text-rose-500" />
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-wider text-zinc-900 dark:text-white">
                        Algorithmic Execution Runway & Target Spectrum
                      </h3>
                      <p className="text-xs text-zinc-500">
                        Setup: {strat.primary_strategy || 'SYSTEM_DEFAULT'} · Asymmetric R-Multiples
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-zinc-400">ATR-14 Volatility Buffer:</span>
                    <span className="rounded-xl bg-black/[0.04] dark:bg-white/[0.06] px-2.5 py-1 text-xs font-black text-zinc-800 dark:text-zinc-200">
                      ₹{t.Volatility_Analysis?.ATR_14 ? t.Volatility_Analysis.ATR_14.toFixed(1) : (currentPrice * 0.02).toFixed(1)}
                    </span>
                  </div>
                </div>

                {/* The 4-Way Flight Strip Visual Runway */}
                <div className="relative pt-6 pb-4">
                  {/* Connecting Gradient Track */}
                  <div className="absolute top-1/2 left-0 right-0 h-1.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-rose-500 via-blue-500 to-emerald-500 opacity-30 dark:opacity-40" />

                  <div className="relative grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    
                    {/* Node 1: Protective Stop */}
                    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 backdrop-blur-xl space-y-1">
                      <div className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                        🛑 Stop Loss (1R)
                      </div>
                      <div className="text-xl font-black text-rose-600 dark:text-rose-400">
                        ₹{stopPrice.toFixed(2)}
                      </div>
                      <div className="text-[11px] font-bold text-rose-600/80">
                        -{stopLossPct.toFixed(2)}% Distance
                      </div>
                    </div>

                    {/* Node 2: Entry Price */}
                    <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 backdrop-blur-xl space-y-1">
                      <div className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        🎯 Proposed Entry
                      </div>
                      <div className="text-xl font-black text-blue-600 dark:text-blue-400">
                        ₹{currentPrice.toFixed(2)}
                      </div>
                      <div className="text-[11px] font-bold text-blue-600/80">
                        Market Baseline
                      </div>
                    </div>

                    {/* Node 3: Target 1 (2R) */}
                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 backdrop-blur-xl space-y-1">
                      <div className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        🚀 Target 1 (2R Scale-Out)
                      </div>
                      <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                        ₹{target1.toFixed(2)}
                      </div>
                      <div className="text-[11px] font-bold text-emerald-600/80">
                        +{target1Pct.toFixed(2)}% (+{riskReward1}R)
                      </div>
                    </div>

                    {/* Node 4: Target 2 (3R) */}
                    <div className="rounded-2xl border border-purple-500/30 bg-purple-500/10 p-4 backdrop-blur-xl space-y-1">
                      <div className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">
                        ✨ Target 2 (3R Runner)
                      </div>
                      <div className="text-xl font-black text-purple-600 dark:text-purple-400">
                        ₹{target2.toFixed(2)}
                      </div>
                      <div className="text-[11px] font-bold text-purple-600/80">
                        +{target2Pct.toFixed(2)}% (+{riskReward2}R)
                      </div>
                    </div>

                  </div>
                </div>

                {/* Sizing & Statutory Friction Itemizer */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-black/[0.06] dark:border-white/[0.06] pt-6">
                  
                  {/* Left: Position Sizing Studio */}
                  <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] p-4 space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-zinc-500">
                      <span>CAPITAL SIZING MODEL (1% RISK ON ₹10,00,000)</span>
                      <Scale className="h-4 w-4 text-zinc-400" />
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-white dark:bg-black/30 p-2.5 border border-black/[0.04] dark:border-white/[0.06]">
                        <div className="text-[10px] font-bold text-zinc-400">SHARES</div>
                        <div className="text-sm font-black text-zinc-900 dark:text-white">{recommendedShares} qty</div>
                      </div>
                      <div className="rounded-xl bg-white dark:bg-black/30 p-2.5 border border-black/[0.04] dark:border-white/[0.06]">
                        <div className="text-[10px] font-bold text-zinc-400">CAPITAL NEEDED</div>
                        <div className="text-sm font-black text-zinc-900 dark:text-white">₹{positionCapital.toLocaleString('en-IN')}</div>
                      </div>
                      <div className="rounded-xl bg-white dark:bg-black/30 p-2.5 border border-black/[0.04] dark:border-white/[0.06]">
                        <div className="text-[10px] font-bold text-zinc-400">NET RISK AT STOP</div>
                        <div className="text-sm font-black text-rose-600 dark:text-rose-400">₹{capitalAtRisk.toLocaleString('en-IN')}</div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Statutory Fee Breakdown */}
                  <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-zinc-500">
                      <span>ESTIMATED STATUTORY FRICTION (ROUND TRIP)</span>
                      <span className="text-zinc-800 dark:text-zinc-200 font-black">₹{estTotalCharges} total</span>
                    </div>

                    <div className="grid grid-cols-4 gap-1 text-[11px] text-zinc-500">
                      <div>STT: <span className="font-bold text-zinc-700 dark:text-zinc-300">₹{estSTT}</span></div>
                      <div>Stamp: <span className="font-bold text-zinc-700 dark:text-zinc-300">₹{estStampDuty}</span></div>
                      <div>Exchange: <span className="font-bold text-zinc-700 dark:text-zinc-300">₹{estExchange}</span></div>
                      <div>GST: <span className="font-bold text-zinc-700 dark:text-zinc-300">₹{estGST}</span></div>
                    </div>

                    <p className="text-[10px] text-zinc-400 pt-1">
                      Includes 0.1% STT on delivery turnover, exchange turnover fee, SEBI charges, stamp duty & 18% GST.
                    </p>
                  </div>

                </div>

              </div>

              {/* Institutional Portfolio Risk Bridge */}
              <PortfolioRiskBridgeCard
                portfolioImpact={portfolioImpact}
                loading={loadingImpact}
                onOpenTradeModal={onOpenTradeModal}
              />

              {/* Strategy Rules Pass/Fail Checklist */}
              <div className="overflow-hidden rounded-3xl border border-black/[0.08] dark:border-white/[0.08] bg-white/70 dark:bg-[#0c0d12]/80 p-6 shadow-xl backdrop-blur-2xl">
                <RuleChecklist rules={data.rule_breakdown || []} />
              </div>

            </div>
          )}

          {/* =========================================================================
              6. CHAMBER: BALANCE SHEET & SOLVENCY 7-PILLARS VAULT
             ========================================================================= */}
          {(activeChamber === 'ALL' || activeChamber === 'SOLVENCY') && (
            <div className="space-y-6">
              
              {/* 7-Pillars Card Header */}
              <div className="overflow-hidden rounded-3xl border border-black/[0.08] dark:border-white/[0.08] bg-white/80 dark:bg-[#0c0d12]/90 p-6 sm:p-8 shadow-xl backdrop-blur-3xl space-y-6">
                
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-black/[0.06] dark:border-white/[0.06] pb-4">
                  <div className="flex items-center space-x-3">
                    <Building className="h-6 w-6 text-blue-500" />
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-wider text-zinc-900 dark:text-white">
                        Financial Health & Solvency Fortress (7 Pillars)
                      </h3>
                      <p className="text-xs text-zinc-500">
                        Fundamental Quality Score: {f.fundamental_score || 0}/100 · Completeness: {f.data_completeness || 90}%
                      </p>
                    </div>
                  </div>

                  {/* Valuation Median Callout Pill */}
                  <div className="flex items-center space-x-2 rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300">
                    <span>Valuation: {val.category || 'Fair'}</span>
                    <span>· Current P/E: {val.pe ? `${val.pe}x` : 'N/A'}</span>
                    {val.historical_pe_median_5y && (
                      <span className="text-[11px] text-zinc-400">({val.historical_pe_median_5y}x 5Y Median)</span>
                    )}
                  </div>
                </div>

                {/* 7 Pillars Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(comps).map(([name, comp]) => {
                    const score = comp.score != null ? comp.score : 70;
                    return (
                      <div 
                        key={name}
                        className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-zinc-800 dark:text-zinc-200">{name}</span>
                          <span className={`font-black px-2 py-0.5 rounded-full ${
                            score >= 75 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                            score >= 50 ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' :
                            'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                          }`}>
                            {score}/100
                          </span>
                        </div>

                        {/* Progress Meter */}
                        <div className="h-1.5 w-full bg-black/[0.05] dark:bg-white/[0.08] rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${
                              score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-blue-500' : 'bg-rose-500'
                            }`}
                            style={{ width: `${score}%` }}
                          />
                        </div>

                        <p className="text-[11px] text-zinc-500 leading-relaxed">
                          {comp.assessment || 'Meets institutional quality thresholds.'}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Business Advantages vs Red Flags Columns */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-black/[0.06] dark:border-white/[0.06]">
                  
                  {/* Green Advantages */}
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-3">
                    <div className="flex items-center space-x-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Business Strengths & Competitive Moat</span>
                    </div>

                    <ul className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
                      {f.positives && f.positives.length > 0 ? (
                        f.positives.map((pos, i) => (
                          <li key={i} className="flex items-start space-x-2">
                            <span className="mt-0.5 font-black text-emerald-500">•</span>
                            <span>{pos}</span>
                          </li>
                        ))
                      ) : (
                        <li className="text-zinc-500 italic">No exceptional business moat flagged.</li>
                      )}
                    </ul>
                  </div>

                  {/* Red Flags & Risks */}
                  <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5 space-y-3">
                    <div className="flex items-center space-x-2 text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Warning Signs & Critical Red Flags</span>
                    </div>

                    <ul className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
                      {f.red_flags && f.red_flags.length > 0 ? (
                        f.red_flags.map((flag, i) => (
                          <li key={i} className="flex items-start space-x-2">
                            <span className="mt-0.5 font-black text-rose-500">•</span>
                            <span>
                              <strong className="text-zinc-900 dark:text-zinc-100">[{flag.severity}] {flag.name}:</strong> {flag.explanation}
                            </span>
                          </li>
                        ))
                      ) : (
                        <li className="text-zinc-500 italic">Clean record. Zero critical red flags identified.</li>
                      )}
                    </ul>
                  </div>

                </div>

              </div>
            </div>
          )}

          {/* =========================================================================
              7. CHAMBER: CORPORATE EVENT RADAR & STREAMING AI DOSSIER
             ========================================================================= */}
          {(activeChamber === 'ALL' || activeChamber === 'RADAR_AI') && (
            <div className="space-y-6">
              
              {/* Institutional Corporate Radar */}
              {data && data.corporate_radar && (
                <CorporateRadarCard radar={data.corporate_radar} />
              )}

              {/* Streaming Gemini / Qwen AI Research Dossier */}
              <AIDossierCard
                ticker={data.ticker}
                aiDossier={data.ai_dossier}
                candidateData={data.dossier || data}
                loading={aiLoading}
                streamingText={aiStreamingText}
                onGenerateDossier={handleGenerateStockDossier}
                onCancel={handleCancelDossier}
                diagnostics={data.ai_dossier?.diagnostics || aiDiagnostics}
                errorMessage={aiError}
              />

            </div>
          )}

        </div>
      )}

    </div>
  );
}
