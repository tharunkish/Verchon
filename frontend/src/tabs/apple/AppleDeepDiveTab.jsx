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
  FileText,
  FileCheck,
  Hash,
  Stamp,
  Receipt
} from 'lucide-react';
import CanvasChart from '../../components/CanvasChart';
import RuleChecklist from '../../components/RuleChecklist';
import AIDossierCard from '../../components/AIDossierCard';
import CorporateRadarCard from '../../components/CorporateRadarCard';
import PortfolioRiskBridgeCard from '../../components/PortfolioRiskBridgeCard';
import { normalizeTicker } from '../../App';

// Benchmark Bluechip Specimen ticker list for instant switcher
const BENCHMARK_SPECIMENS = [
  { ticker: 'ICICIBANK.NS', name: 'ICICI Bank', sector: 'Financials' },
  { ticker: 'TCS.NS', name: 'Tata Consultancy', sector: 'IT Services' },
  { ticker: 'RELIANCE.NS', name: 'Reliance Ind.', sector: 'Energy & Retail' },
  { ticker: 'HDFCBANK.NS', name: 'HDFC Bank', sector: 'Financials' },
  { ticker: 'INFY.NS', name: 'Infosys', sector: 'IT Services' },
  { ticker: 'BHARTIARTL.NS', name: 'Bharti Airtel', sector: 'Telecom' },
  { ticker: 'SBIN.NS', name: 'State Bank of India', sector: 'PSU Banking' },
  { ticker: 'LT.NS', name: 'Larsen & Toubro', sector: 'Infrastructure' },
  { ticker: 'TATAMOTORS.NS', name: 'Tata Motors', sector: 'Automobile' },
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

  // Interactive UI state
  const [copiedTicker, setCopiedTicker] = useState(false);
  const [activeTabBay, setActiveTabBay] = useState('DOSSIER'); // 'DOSSIER' | 'RADAR' | 'AI_LAB'

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

  // Extract core domain structures
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

  // Mathematical execution telemetry
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

  // Capital Sizing calculation (₹10L capital, 1% risk rule)
  const baseAccountCapital = 1000000;
  const riskPerTradePct = 1.0;
  const riskBudget = baseAccountCapital * (riskPerTradePct / 100); // ₹10,000 risk
  const recommendedShares = stopLossDistance > 0 ? Math.max(1, Math.floor(riskBudget / stopLossDistance)) : 25;
  const positionCapital = Math.round(recommendedShares * currentPrice);
  const capitalAtRisk = Math.round(recommendedShares * stopLossDistance);

  // Itemized Statutory Friction preview
  const estSTT = Math.round(positionCapital * 0.001); // 0.1% delivery STT
  const estExchange = Math.round(positionCapital * 0.000035);
  const estStampDuty = Math.round(positionCapital * 0.00015);
  const estGST = Math.round((estExchange + 20) * 0.18);
  const estTotalCharges = estSTT + estExchange + estStampDuty + estGST + 40;

  // 52-week vertical altitude calculation
  const candles = data?.chart?.candles || [];
  const candleHighs = candles.map(c => c.high);
  const candleLows = candles.map(c => c.low);
  const yearHigh = candleHighs.length > 0 ? Math.max(...candleHighs) : (currentPrice * 1.25);
  const yearLow = candleLows.length > 0 ? Math.min(...candleLows) : (currentPrice * 0.75);
  const rangeSpan = yearHigh - yearLow;
  const altitudePct = rangeSpan > 0 ? Math.min(100, Math.max(0, ((currentPrice - yearLow) / rangeSpan) * 100)) : 50;

  // Priority classification
  const priority = dossier.priority || 'EVALUATING';
  const isTriggered = priority === 'SIGNAL TRIGGERED' || activeStrat.signal_triggered;
  const isAvoid = priority === 'AVOID / FILTERED OUT' || dossier.overall_score < 40;
  const priorityReason = dossier.priority_reason || activeStrat.reason || 'Standard multi-factor algorithmic review.';

  return (
    <div className="min-h-[calc(100vh-100px)] p-3 sm:p-5 lg:p-6 space-y-4">
      
      {/* =========================================================================
          TOP: TICKER TAPE RIBBON & CASE FILE SWITCHER
         ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-black/[0.08] dark:border-white/[0.08] pb-3">
        
        {/* Search input with keyboard shortcut feel */}
        <form onSubmit={handleSearchSubmit} className="flex items-center space-x-2 shrink-0">
          <div className="relative group">
            <Search className="absolute top-2.5 left-3 h-3.5 w-3.5 text-zinc-400 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors" />
            <input
              type="text"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value)}
              placeholder="Case search: e.g. TCS, RELIANCE..."
              className="w-56 sm:w-64 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] py-1.5 pr-3 pl-8 text-xs font-semibold text-zinc-900 dark:text-zinc-100 outline-none transition focus:border-zinc-900 dark:focus:border-white focus:bg-white dark:focus:bg-black/50"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-xs font-bold text-white dark:text-zinc-900 transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Examining...' : 'Open File'}
          </button>
        </form>

        {/* Ticker Tape Switcher */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 shrink-0 mr-1 flex items-center">
            <Compass className="h-3 w-3 mr-1" /> Dossier Index:
          </span>

          {candidates && candidates.length > 0 ? (
            candidates.slice(0, 9).map((cand) => {
              const sym = cand.ticker || cand.name;
              const isSelected = normalizeTicker(sym) === normalizeTicker(data?.ticker || selectedTicker);
              return (
                <button
                  key={sym}
                  onClick={() => handleSwitchSpecimen(sym)}
                  className={`flex items-center space-x-1.5 rounded-lg px-2.5 py-1 text-xs font-bold whitespace-nowrap transition-all border ${
                    isSelected
                      ? 'border-zinc-900 dark:border-white bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm'
                      : 'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] text-zinc-600 dark:text-zinc-400 hover:border-black/20 dark:hover:border-white/20'
                  }`}
                >
                  <span>{sym.replace('.NS', '')}</span>
                  {cand.overall_score && (
                    <span className={`text-[10px] px-1 rounded ${
                      cand.overall_score >= 75 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-zinc-500/20 text-zinc-400'
                    }`}>
                      {cand.overall_score}
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            BENCHMARK_SPECIMENS.map((spec) => {
              const isSelected = normalizeTicker(spec.ticker) === normalizeTicker(data?.ticker || selectedTicker);
              return (
                <button
                  key={spec.ticker}
                  onClick={() => handleSwitchSpecimen(spec.ticker)}
                  className={`flex items-center space-x-1.5 rounded-lg px-2.5 py-1 text-xs font-bold whitespace-nowrap transition-all border ${
                    isSelected
                      ? 'border-zinc-900 dark:border-white bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm'
                      : 'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] text-zinc-600 dark:text-zinc-400 hover:border-black/20 dark:hover:border-white/20'
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

      {/* Error state */}
      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs font-medium text-rose-700 dark:text-rose-300 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
            <span>Investigation Error: {error}</span>
          </div>
          <button
            onClick={() => fetchDossier(tickerInput)}
            className="rounded-lg bg-rose-500 text-white px-2.5 py-1 font-bold hover:bg-rose-600 transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !data && (
        <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-white/50 dark:bg-[#0c0d12]/50 p-16 text-center animate-pulse space-y-3">
          <div className="h-7 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-lg mx-auto" />
          <div className="h-4 w-80 bg-zinc-200 dark:bg-zinc-800 rounded mx-auto" />
          <p className="text-xs text-zinc-400">Unfolding forensic stock broadsheet...</p>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          
          {/* =========================================================================
              THE ASYMMETRIC 3-COLUMN FORENSIC BROADSHEET
             ========================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 border border-black/10 dark:border-white/10 rounded-3xl overflow-hidden bg-white/70 dark:bg-[#0b0c10]/90 backdrop-blur-3xl shadow-2xl divide-y lg:divide-y-0 lg:divide-x divide-black/10 dark:divide-white/10">
            
            {/* ---------------------------------------------------------------------
                COLUMN 1: THE MARGINALIA (LEFT FORENSIC COLUMN - 3 COLS)
               --------------------------------------------------------------------- */}
            <div className="lg:col-span-3 p-5 sm:p-6 space-y-6 bg-black/[0.01] dark:bg-white/[0.01]">
              
              {/* Rubber-stamped Verdict Header */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                    EXHIBIT #NSE-{data.ticker.replace('.NS', '')}
                  </span>
                  <button
                    onClick={handleCopyTicker}
                    className="text-[11px] font-mono text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center space-x-1"
                  >
                    {copiedTicker ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedTicker ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                {/* Status Stamp */}
                <div className={`inline-block px-3 py-1 rounded border text-[11px] font-black uppercase tracking-widest ${
                  isTriggered
                    ? 'border-emerald-600 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rotate-[-1deg]'
                    : isAvoid
                    ? 'border-rose-600 bg-rose-500/10 text-rose-700 dark:text-rose-400 rotate-[1deg]'
                    : 'border-zinc-500 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300'
                }`}>
                  {priority}
                </div>

                <div>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900 dark:text-white">
                    {data.ticker.replace('.NS', '')}
                  </h2>
                  <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 line-clamp-1">
                    {dossier.name || 'NSE Equities Market'}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    {f.company_type || 'Industrial / Commercial'}
                  </p>
                </div>

                {/* Price Altitude & Live Quote */}
                <div className="border-t border-black/[0.06] dark:border-white/[0.06] pt-3">
                  <div className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white">
                    ₹{currentPrice > 0 ? currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}
                  </div>
                  <div className="flex items-center space-x-2 text-xs font-bold pt-0.5">
                    <span className={trend['Dist_50_DMA_%'] >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                      {trend['Dist_50_DMA_%'] != null ? `${trend['Dist_50_DMA_%'] > 0 ? '+' : ''}${trend['Dist_50_DMA_%']}%` : '---'}
                    </span>
                    <span className="text-zinc-400">vs 50 DMA</span>
                  </div>
                </div>
              </div>

              {/* Vertical 52-Week Altitude Barometer */}
              <div className="border-t border-black/[0.06] dark:border-white/[0.06] pt-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-zinc-400 uppercase tracking-wider text-[10px]">52-Week Altitude</span>
                  <span className="text-zinc-800 dark:text-zinc-200 font-mono">{altitudePct.toFixed(0)}%</span>
                </div>

                <div className="flex items-center space-x-3">
                  {/* The Vertical Barometer */}
                  <div className="relative h-32 w-3 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden flex flex-col justify-end">
                    <div 
                      className="w-full bg-gradient-to-t from-blue-500 via-indigo-500 to-rose-500 rounded-full transition-all duration-700"
                      style={{ height: `${altitudePct}%` }}
                    />
                  </div>

                  {/* Level Markers */}
                  <div className="flex flex-col justify-between h-32 text-[10px] font-mono text-zinc-400">
                    <div>
                      <span className="text-zinc-500">52W High:</span> <span className="font-bold text-zinc-800 dark:text-zinc-200">₹{yearHigh.toFixed(0)}</span>
                    </div>
                    <div className="py-1">
                      <span className="text-blue-500">50 DMA:</span> ₹{trend['50_DMA'] ? trend['50_DMA'].toFixed(0) : '---'}
                    </div>
                    <div className="py-1">
                      <span className="text-amber-500">200 DMA:</span> ₹{trend['200_DMA'] ? trend['200_DMA'].toFixed(0) : '---'}
                    </div>
                    <div>
                      <span className="text-zinc-500">52W Low:</span> <span className="font-bold text-zinc-800 dark:text-zinc-200">₹{yearLow.toFixed(0)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ratio Speedometer Stack */}
              <div className="border-t border-black/[0.06] dark:border-white/[0.06] pt-4 space-y-2.5">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                  TECHNICAL SPEEDOMETERS
                </span>

                <div className="space-y-2 text-xs font-medium">
                  {/* RSI */}
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">RSI-14 (Momentum):</span>
                    <span className={`font-mono font-bold ${
                      (momo.RSI || 50) > 70 ? 'text-rose-600 dark:text-rose-400' :
                      (momo.RSI || 50) < 30 ? 'text-emerald-600 dark:text-emerald-400' :
                      'text-zinc-800 dark:text-zinc-200'
                    }`}>
                      {momo.RSI != null ? momo.RSI.toFixed(1) : (momo.RSI_14 != null ? momo.RSI_14.toFixed(1) : '54.0')}
                    </span>
                  </div>

                  {/* 50-DMA Slope */}
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">50-DMA Velocity:</span>
                    <span className={`font-mono font-bold ${trend['50_DMA_Slope_5d'] > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {trend['50_DMA_Slope_5d'] ? `${trend['50_DMA_Slope_5d'] > 0 ? '+' : ''}${trend['50_DMA_Slope_5d'].toFixed(2)}/day` : 'Flat'}
                    </span>
                  </div>

                  {/* Daily Volatility (ATR) */}
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">ATR-14 Volatility:</span>
                    <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                      ₹{t.Volatility_Analysis?.ATR_14 ? t.Volatility_Analysis.ATR_14.toFixed(1) : (currentPrice * 0.02).toFixed(1)}
                    </span>
                  </div>

                  {/* Volume Ratio */}
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Volume Surge:</span>
                    <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                      {vol.Volume_Expansion_Ratio ? `${vol.Volume_Expansion_Ratio}x` : '1.0x'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Event Gate Countdown */}
              {data.corporate_radar && (
                <div className="border-t border-black/[0.06] dark:border-white/[0.06] pt-4 space-y-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                    EVENT RADAR GATE
                  </span>
                  <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] p-2.5 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-zinc-800 dark:text-zinc-200">
                        {data.corporate_radar.next_earnings_date || 'No Date Declared'}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-black bg-purple-500/15 text-purple-600 dark:text-purple-400">
                        {data.corporate_radar.days_to_earnings != null ? `${data.corporate_radar.days_to_earnings}D` : 'TBD'}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-400 leading-tight">
                      {data.corporate_radar.event_risk_reason || 'Gate status evaluated for quarterly results.'}
                    </p>
                  </div>
                </div>
              )}

            </div>

            {/* ---------------------------------------------------------------------
                COLUMN 2: THE EXAMINATION THEATER (CENTER CANVAS - 6 COLS)
               --------------------------------------------------------------------- */}
            <div className="lg:col-span-6 p-5 sm:p-6 space-y-5">
              
              {/* Header Ribbon of Center Canvas */}
              <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] pb-3">
                <div className="flex items-center space-x-2">
                  <Activity className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-white">
                    Price Action Geometry & Execution Spectrum
                  </span>
                </div>

                <div className="flex items-center space-x-3 text-[11px] font-mono">
                  <span className="text-blue-500">50D: ₹{trend['50_DMA'] ? trend['50_DMA'].toFixed(1) : '---'}</span>
                  <span className="text-amber-500">200D: ₹{trend['200_DMA'] ? trend['200_DMA'].toFixed(1) : '---'}</span>
                </div>
              </div>

              {/* Seamless Canvas Chart (Integrated directly, no bulky card border) */}
              <div className="rounded-2xl overflow-hidden border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.01]">
                <CanvasChart
                  candles={data.chart?.candles || []}
                  dma50={data.chart?.dma_50 || []}
                  dma200={data.chart?.dma_200 || []}
                  stopPrice={activeStrat.stop_price}
                  ticker={data.ticker}
                  markers={data.chart?.markers || []}
                />
              </div>

              {/* The 4-Point Trade Spectrum Ruler */}
              <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                    THE TRADE SPECTRUM (R-MULTIPLE HORIZON)
                  </span>
                  <span className="font-mono text-[11px] text-zinc-500">
                    Setup: {strat.primary_strategy || 'SYSTEM_DEFAULT'}
                  </span>
                </div>

                {/* Connecting Track */}
                <div className="relative pt-2 pb-1">
                  <div className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-rose-500 via-blue-500 to-emerald-500 opacity-40" />

                  <div className="relative grid grid-cols-4 gap-2 text-center">
                    
                    {/* 1. Stop */}
                    <div className="bg-white dark:bg-black/60 rounded-xl p-2 border border-rose-500/30">
                      <div className="text-[9px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">STOP (1R)</div>
                      <div className="text-xs font-black text-rose-600 dark:text-rose-400 font-mono">₹{stopPrice.toFixed(1)}</div>
                      <div className="text-[10px] text-zinc-400">-{stopLossPct.toFixed(1)}%</div>
                    </div>

                    {/* 2. Entry */}
                    <div className="bg-white dark:bg-black/60 rounded-xl p-2 border border-blue-500/30">
                      <div className="text-[9px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">ENTRY</div>
                      <div className="text-xs font-black text-blue-600 dark:text-blue-400 font-mono">₹{currentPrice.toFixed(1)}</div>
                      <div className="text-[10px] text-zinc-400">Market</div>
                    </div>

                    {/* 3. Target 1 */}
                    <div className="bg-white dark:bg-black/60 rounded-xl p-2 border border-emerald-500/30">
                      <div className="text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">T1 (2R)</div>
                      <div className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono">₹{target1.toFixed(1)}</div>
                      <div className="text-[10px] text-emerald-600/80">+{target1Pct.toFixed(1)}%</div>
                    </div>

                    {/* 4. Target 2 */}
                    <div className="bg-white dark:bg-black/60 rounded-xl p-2 border border-purple-500/30">
                      <div className="text-[9px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">T2 (3R)</div>
                      <div className="text-xs font-black text-purple-600 dark:text-purple-400 font-mono">₹{target2.toFixed(1)}</div>
                      <div className="text-[10px] text-purple-600/80">+{target2Pct.toFixed(1)}%</div>
                    </div>

                  </div>
                </div>
              </div>

              {/* Multi-Horizon Relative Strength Alpha Matrix vs Nifty 50 */}
              <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-500">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">BENCHMARK RELATIVE STRENGTH ALPHA (VS NIFTY 50)</span>
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                </div>

                <div className="grid grid-cols-4 gap-2 text-center">
                  {['1M', '3M', '6M', '1Y'].map((h) => {
                    const alpha = momo['Relative_Strength_Alpha_%']?.[h];
                    const isPos = alpha != null && alpha > 0;
                    return (
                      <div key={h} className="rounded-xl bg-white dark:bg-black/40 border border-black/[0.04] dark:border-white/[0.06] p-2">
                        <div className="text-[10px] font-mono text-zinc-400">{h} ALPHA</div>
                        <div className={`text-xs font-black font-mono ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {alpha != null ? `${alpha > 0 ? '+' : ''}${alpha.toFixed(1)}%` : '---'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Strategy Rules Pass/Fail Checklist */}
              <div className="pt-1">
                <RuleChecklist rules={data.rule_breakdown || []} />
              </div>

            </div>

            {/* ---------------------------------------------------------------------
                COLUMN 3: THE PHYSICAL TRADING TICKET & SOLVENCY LEDGER (3 COLS)
               --------------------------------------------------------------------- */}
            <div className="lg:col-span-3 p-5 sm:p-6 space-y-6 bg-black/[0.01] dark:bg-white/[0.01]">
              
              {/* THE AUTHENTIC PHYSICAL TRADING TICKET */}
              <div className="relative rounded-2xl border-2 border-dashed border-zinc-400/40 dark:border-zinc-700/60 bg-white dark:bg-black/80 p-5 shadow-xl space-y-4">
                
                {/* Perforated Ticket Header */}
                <div className="flex items-center justify-between border-b border-black/[0.08] dark:border-white/[0.08] pb-3 text-zinc-800 dark:text-zinc-200">
                  <div className="flex items-center space-x-2">
                    <Receipt className="h-4 w-4 text-rose-500" />
                    <span className="text-xs font-mono font-black tracking-wider uppercase">
                      EXCHANGE TICKET
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">
                    VOUCHER #{data.ticker.replace('.NS', '').slice(0, 4)}
                  </span>
                </div>

                {/* Sizing Slip Calculation */}
                <div className="space-y-2 text-xs font-medium">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Order Action:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">DELIVERY BUY</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-zinc-500">Calculated Shares:</span>
                    <span className="font-mono font-black text-zinc-900 dark:text-white">{recommendedShares} QTY</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-zinc-500">Total Capital:</span>
                    <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">₹{positionCapital.toLocaleString('en-IN')}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-zinc-500">Risk at Stop:</span>
                    <span className="font-mono font-bold text-rose-600 dark:text-rose-400">₹{capitalAtRisk.toLocaleString('en-IN')} (1%)</span>
                  </div>
                </div>

                {/* Statutory Friction Tear-Off */}
                <div className="border-t border-dashed border-black/10 dark:border-white/10 pt-3 space-y-1.5 text-[11px]">
                  <div className="flex justify-between font-mono text-zinc-400">
                    <span>Friction (Round Trip):</span>
                    <span className="font-bold text-zinc-700 dark:text-zinc-300">₹{estTotalCharges}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-1 text-[10px] text-zinc-400 font-mono">
                    <div>STT: ₹{estSTT}</div>
                    <div>Exchange: ₹{estExchange}</div>
                    <div>Stamp: ₹{estStampDuty}</div>
                    <div>GST: ₹{estGST}</div>
                  </div>
                </div>

                {/* Tactile Stamp & Deploy Button */}
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
                  className="w-full flex items-center justify-center space-x-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 py-3 text-xs font-black uppercase tracking-wider shadow-lg transition hover:opacity-90 active:scale-95"
                >
                  <Briefcase className="h-4 w-4" />
                  <span>Execute Paper Order</span>
                </button>
              </div>

              {/* 7-PILLARS SOLVENCY LEDGER */}
              <div className="space-y-3 border-t border-black/[0.06] dark:border-white/[0.06] pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                    7-PILLARS AUDIT LEDGER
                  </span>
                  <span className="text-xs font-black font-mono text-zinc-900 dark:text-white">
                    {f.fundamental_score || 0}/100
                  </span>
                </div>

                <div className="space-y-2">
                  {Object.entries(comps).slice(0, 5).map(([name, comp]) => {
                    const score = comp.score != null ? comp.score : 70;
                    return (
                      <div key={name} className="space-y-1">
                        <div className="flex justify-between text-[11px] font-medium">
                          <span className="text-zinc-600 dark:text-zinc-400">{name}</span>
                          <span className={`font-mono font-bold ${
                            score >= 75 ? 'text-emerald-600 dark:text-emerald-400' :
                            score >= 50 ? 'text-blue-600 dark:text-blue-400' :
                            'text-rose-600 dark:text-rose-400'
                          }`}>
                            {score}
                          </span>
                        </div>
                        <div className="h-1 w-full bg-black/[0.06] dark:bg-white/[0.08] rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-blue-500' : 'bg-rose-500'}`}
                            style={{ width: `${score}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Valuation vs Median Band */}
                <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] p-2.5 text-[11px] font-medium space-y-1">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">P/E Multiple:</span>
                    <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">{val.pe ? `${val.pe}x` : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">5Y Historical Median:</span>
                    <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">{val.historical_pe_median_5y ? `${val.historical_pe_median_5y}x` : 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* FORENSIC EVIDENCE LOG (STRENGTHS VS WARNING SIGNS) */}
              <div className="space-y-3 border-t border-black/[0.06] dark:border-white/[0.06] pt-4">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                  FORENSIC EVIDENCE LOG
                </span>

                {/* Strengths */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                    Verified Drivers
                  </div>
                  <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
                    {f.positives && f.positives.length > 0 ? (
                      f.positives.slice(0, 2).map((pos, idx) => (
                        <li key={idx} className="flex items-start space-x-1.5 text-[11px]">
                          <span className="text-emerald-500 font-bold">•</span>
                          <span className="line-clamp-2">{pos}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-[11px] text-zinc-400">No notable moat flagged.</li>
                    )}
                  </ul>
                </div>

                {/* Vulnerabilities */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                    Audit Red Flags
                  </div>
                  <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
                    {f.red_flags && f.red_flags.length > 0 ? (
                      f.red_flags.slice(0, 2).map((flag, idx) => (
                        <li key={idx} className="flex items-start space-x-1.5 text-[11px]">
                          <span className="text-rose-500 font-bold">•</span>
                          <span className="line-clamp-2">
                            <strong>[{flag.severity}]</strong> {flag.explanation}
                          </span>
                        </li>
                      ))
                    ) : (
                      <li className="text-[11px] text-zinc-400">Zero critical red flags found.</li>
                    )}
                  </ul>
                </div>

              </div>

            </div>

          </div>

          {/* =========================================================================
              BOTTOM BAY: STREAMING AI INTELLIGENCE & EVENT RADAR
             ========================================================================= */}
          <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-[#0b0c10]/90 backdrop-blur-3xl p-5 sm:p-6 shadow-xl space-y-4">
            
            <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] pb-3">
              <div className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                <span className="text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-white">
                  Investigative Intelligence Lab & Corporate Disclosures
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleGenerateStockDossier}
                  disabled={aiLoading}
                  className="flex items-center space-x-1.5 rounded-xl bg-purple-600 text-white px-3 py-1.5 text-xs font-bold hover:bg-purple-700 transition disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{aiLoading ? 'Streaming...' : 'Run Qualitative AI Audit'}</span>
                </button>
              </div>
            </div>

            {/* AI Dossier Card Embed */}
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

            {/* Corporate Radar Embed if present */}
            {data.corporate_radar && (
              <div className="pt-2">
                <CorporateRadarCard radar={data.corporate_radar} />
              </div>
            )}

            {/* Portfolio Risk Bridge */}
            <PortfolioRiskBridgeCard
              portfolioImpact={portfolioImpact}
              loading={loadingImpact}
              onOpenTradeModal={onOpenTradeModal}
            />

          </div>

        </div>
      )}

    </div>
  );
}
