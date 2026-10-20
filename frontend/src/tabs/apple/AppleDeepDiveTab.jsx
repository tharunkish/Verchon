import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Copy,
  Check,
  Building,
  Activity,
  BarChart2,
  FileText,
  FileCheck,
  Terminal,
  X,
  ChevronDown,
  ChevronUp,
  BookOpen
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import CanvasChart from '../../components/CanvasChart';
import { normalizeTicker } from '../../App';

// Quick Bluechip Watchlist
const QUICK_WATCHLIST = [
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
  
  // AI Research streaming state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiStreamingText, setAiStreamingText] = useState('');
  const [showRawReport, setShowRawReport] = useState(false);
  const abortControllerRef = useRef(null);

  // Text sanitizer for CP1252 / mojibake rupee artifacts
  const cleanText = (str) => {
    if (!str || typeof str !== 'string') return str || '';
    return str
      .replace(/\u00e2\u0082\u00b9|\u00e2\u201a\u00b9|â¹|â‚¹/g, '₹')
      .replace(/â€™/g, "'")
      .replace(/â€œ|â€\x9d/g, '"')
      .replace(/â€”/g, '—');
  };

  // Interactive AI stock chat state
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Portfolio impact state
  const [portfolioImpact, setPortfolioImpact] = useState(null);
  const [loadingImpact, setLoadingImpact] = useState(false);

  // Interactive UI state
  const [copiedTicker, setCopiedTicker] = useState(false);
  const [acknowledgedLockout, setAcknowledgedLockout] = useState(false);

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
    setChatHistory([]);
    setAcknowledgedLockout(false);
    try {
      const res = await fetch(`/api/stocks/${encodeURIComponent(cleanSym)}`);
      if (!res.ok) {
        throw new Error(`Failed to load stock data (${res.statusText})`);
      }
      const json = await res.json();
      setData(json);
      setTickerInput(json.ticker);
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
      const res = await fetch(`/api/ai-dossier/${encodeURIComponent(data.ticker)}/stream?force=true`, {
        method: 'POST',
        signal: controller.signal,
      });

      if (!res.ok) {
        const errDetail = await res.text();
        throw new Error(`AI Research generation failed (${res.status}: ${errDetail || res.statusText})`);
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
                accumulatedTokens += cleanText(payload.content);
                setAiStreamingText(accumulatedTokens);
              } else if (payload.type === 'done') {
                setData((prev) => ({
                  ...prev,
                  ai_dossier: {
                    ...payload.dossier,
                    diagnostics: payload.diagnostics || [],
                  },
                }));
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
    } finally {
      abortControllerRef.current = null;
      setAiLoading(false);
    }
  };

  const handleSendStockChat = async (e) => {
    e.preventDefault();
    if (!chatMessage.trim() || !data?.ticker || chatLoading) return;

    const userMsg = chatMessage.trim();
    setChatMessage('');
    const newHistory = [...chatHistory, { role: 'user', content: userMsg }];
    setChatHistory(newHistory);
    setChatLoading(true);

    try {
      const res = await fetch(`/api/stocks/${encodeURIComponent(data.ticker)}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          history: chatHistory.map(h => ({ role: h.role, message: h.content }))
        })
      });

      if (!res.ok) throw new Error('Failed to query analyst');
      const json = await res.json();
      setChatHistory([...newHistory, { role: 'assistant', content: json.reply || 'Analysis complete.' }]);
    } catch (err) {
      setChatHistory([...newHistory, { role: 'assistant', content: `[!] Error: ${err.message}` }]);
    } finally {
      setChatLoading(false);
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

  const handleSelectSymbol = (sym) => {
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

  // Data domain extraction
  const dossier = data?.dossier || {};
  const f = dossier.fundamentals || {};
  const dq = f.data_quality || {};
  const t = dossier.technicals || {};
  const val = f.valuation || {};
  const comps = f.components || {};
  const trend = t.Trend_Analysis || {};
  const momo = t.Momentum_Analysis || {};
  const vol = t.Volume_Analysis || {};
  const strat = t.Strategy_Evaluation || {};
  const activeStrat = strat.active_strategy_result || {};

  // Mathematical execution points
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

  // Capital Sizing (₹10L capital, 1% risk)
  const baseAccountCapital = 1000000;
  const riskPerTradePct = 1.0;
  const riskBudget = baseAccountCapital * (riskPerTradePct / 100);
  const recommendedShares = stopLossDistance > 0 ? Math.max(1, Math.floor(riskBudget / stopLossDistance)) : 25;
  const positionCapital = Math.round(recommendedShares * currentPrice);
  const capitalAtRisk = Math.round(recommendedShares * stopLossDistance);

  // Statutory friction estimate
  const estSTT = Math.round(positionCapital * 0.001);
  const estExchange = Math.round(positionCapital * 0.000035);
  const estStampDuty = Math.round(positionCapital * 0.00015);
  const estGST = Math.round((estExchange + 20) * 0.18);
  const estTotalCharges = estSTT + estExchange + estStampDuty + estGST + 40;

  // 52-week horizontal range calculation (Google Finance style)
  const candles = data?.chart?.candles || [];
  const candleHighs = candles.map(c => c.high);
  const candleLows = candles.map(c => c.low);
  const yearHigh = candleHighs.length > 0 ? Math.max(...candleHighs) : (currentPrice * 1.25);
  const yearLow = candleLows.length > 0 ? Math.min(...candleLows) : (currentPrice * 0.75);
  const rangeSpan = yearHigh - yearLow;
  const rangePct = rangeSpan > 0 ? Math.min(100, Math.max(0, ((currentPrice - yearLow) / rangeSpan) * 100)) : 50;

  // Priority classification
  const priority = dossier.priority || 'EVALUATING';
  const isTriggered = priority === 'SIGNAL TRIGGERED' || activeStrat.signal_triggered;
  const isAvoid = priority === 'AVOID / FILTERED OUT' || dossier.overall_score < 40;
  const priorityReason = dossier.priority_reason || activeStrat.reason || 'Underwriting multi-factor review in progress.';

  const getLetterGrade = (score) => {
    if (score >= 90) return { grade: 'A+', color: 'text-emerald-700 bg-emerald-600/10 border-emerald-600/30 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/30' };
    if (score >= 80) return { grade: 'A', color: 'text-emerald-700 bg-emerald-600/10 border-emerald-600/20 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20' };
    if (score >= 70) return { grade: 'B+', color: 'text-blue-700 bg-blue-600/10 border-blue-600/20 dark:text-blue-400 dark:bg-blue-500/10 dark:border-blue-500/20' };
    if (score >= 60) return { grade: 'B', color: 'text-amber-700 bg-amber-600/10 border-amber-600/20 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20' };
    if (score >= 50) return { grade: 'C', color: 'text-orange-700 bg-orange-600/10 border-orange-600/20 dark:text-orange-400 dark:bg-orange-500/10 dark:border-orange-500/20' };
    return { grade: 'D', color: 'text-[#8b0909] bg-[#8b0909]/10 border-[#8b0909]/30 dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/30' };
  };

  return (
    <div className="min-h-[calc(100vh-100px)] p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-[#2d1f17] dark:text-[#e0d1b9]">
      
      {/* 1. Header Toolbar & Quick Watchlist */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#b8a597] dark:border-[#363c44] pb-4">
        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="flex items-center space-x-2 shrink-0">
          <div className="relative">
            <Search className="absolute top-2.5 left-3 h-3.5 w-3.5 text-[#806350] dark:text-[#958a7a]" />
            <input
              type="text"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value)}
              placeholder="Search ticker: e.g. TCS, SBIN..."
              className="w-56 sm:w-64 rounded-lg border border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#1c232d] py-1.5 pr-3 pl-8 text-xs font-semibold text-[#2d1f17] dark:text-[#e0d1b9] outline-none transition focus:border-[#806350] dark:focus:border-[#e0d1b9] placeholder-[#806350]/60 dark:placeholder-[#958a7a]/60"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-[#806350] hover:bg-[#6c5342] text-[#edd9cc] dark:bg-[#e0d1b9] dark:hover:bg-[#e0d1b9]/90 dark:text-[#1c232d] px-3.5 py-1.5 text-xs font-bold transition disabled:opacity-50"
          >
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </form>

        {/* Quick Symbol Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#806350] dark:text-[#958a7a] shrink-0 mr-1">
            Quick Watchlist:
          </span>

          {candidates && candidates.length > 0 ? (
            candidates.slice(0, 8).map((cand) => {
              const sym = cand.ticker || cand.name;
              const isSelected = normalizeTicker(sym) === normalizeTicker(data?.ticker || selectedTicker);
              return (
                <button
                  key={sym}
                  onClick={() => handleSelectSymbol(sym)}
                  className={`flex items-center space-x-1 rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition border ${
                    isSelected
                      ? 'border-[#806350] bg-[#edd9cc] text-[#2d1f17] dark:border-[#e0d1b9] dark:bg-[#222b37] dark:text-[#e0d1b9]'
                      : 'border-[#b8a597] bg-[#f7ede5] text-[#806350] hover:text-[#2d1f17] dark:border-[#363c44] dark:bg-[#1c232d] dark:text-[#958a7a] hover:dark:text-[#e0d1b9]'
                  }`}
                >
                  <span>{sym.replace('.NS', '')}</span>
                  {cand.overall_score && (
                    <span className="text-[10px] text-[#806350] dark:text-[#958a7a]">
                      · {cand.overall_score}
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            QUICK_WATCHLIST.map((spec) => {
              const isSelected = normalizeTicker(spec.ticker) === normalizeTicker(data?.ticker || selectedTicker);
              return (
                <button
                  key={spec.ticker}
                  onClick={() => handleSelectSymbol(spec.ticker)}
                  className={`flex items-center space-x-1 rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition border ${
                    isSelected
                      ? 'border-[#806350] bg-[#edd9cc] text-[#2d1f17] dark:border-[#e0d1b9] dark:bg-[#222b37] dark:text-[#e0d1b9]'
                      : 'border-[#b8a597] bg-[#f7ede5] text-[#806350] hover:text-[#2d1f17] dark:border-[#363c44] dark:bg-[#1c232d] dark:text-[#958a7a] hover:dark:text-[#e0d1b9]'
                  }`}
                >
                  <span>{spec.ticker.replace('.NS', '')}</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-[#b20808]/30 bg-[#b20808]/10 p-4 text-xs font-medium text-[#8b0909] dark:text-rose-300 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 text-[#b20808] dark:text-rose-400 shrink-0" />
            <span>Analysis Error: {error}</span>
          </div>
          <button
            onClick={() => fetchDossier(tickerInput)}
            className="rounded bg-[#8b0909] text-white px-2.5 py-1 font-bold hover:bg-[#8b0909]/90 transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !data && (
        <div className="rounded-2xl border border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#1c232d] p-16 text-center animate-pulse space-y-3">
          <div className="h-7 w-48 bg-[#edd9cc] dark:bg-[#222b37] rounded-md mx-auto" />
          <div className="h-4 w-72 bg-[#edd9cc] dark:bg-[#222b37] rounded mx-auto" />
          <p className="text-xs text-[#806350] dark:text-[#958a7a]">Loading equity telemetry and valuation models...</p>
        </div>
      )}

      {data && (
        <div className="space-y-6">
          
          {/* 2. Stock Overview Hero Header (Google Finance style) */}
          <div className="rounded-2xl border border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#1c232d] p-6 shadow-md">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              
              {/* Left: Ticker, Name, Sector & Badges */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded border border-[#b8a597] dark:border-[#363c44] bg-[#edd9cc] dark:bg-[#222b37] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#806350] dark:text-[#958a7a]">
                    NSE
                  </span>
                  <span className="text-[#b8a597] dark:text-[#363c44]">·</span>
                  <span className="text-xs text-[#806350] dark:text-[#958a7a] font-medium">
                    {f.company_type || 'Core Equities'}
                  </span>
                  <span className="text-[#b8a597] dark:text-[#363c44]">·</span>
                  <button
                    onClick={handleCopyTicker}
                    className="text-xs font-mono text-[#806350] dark:text-[#958a7a] hover:text-[#2d1f17] dark:hover:text-[#e0d1b9] flex items-center space-x-1"
                  >
                    {copiedTicker ? <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedTicker ? 'Copied' : 'Copy'}</span>
                  </button>
                  <span className="text-[#b8a597] dark:text-[#363c44]">·</span>
                  {/* Data Telemetry Indicator */}
                  <span 
                    title={dq.is_fallback ? 'Live screener.in timed out; safely using last cached fundamental snapshot.' : dq.scraped_at ? `Scraped: ${new Date(dq.scraped_at).toLocaleDateString()}` : 'Live Scrape Telemetry'}
                    className={`inline-flex items-center space-x-1 font-mono text-[10px] px-2 py-0.5 rounded border ${
                      dq.is_fallback
                        ? 'border-amber-600/30 bg-amber-600/10 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400'
                        : dq.cached
                        ? 'border-[#b8a597]/60 bg-[#edd9cc]/60 text-[#806350] dark:border-[#363c44] dark:bg-[#222b37] dark:text-[#958a7a]'
                        : 'border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      dq.is_fallback ? 'bg-amber-600 dark:bg-amber-400 animate-pulse' : dq.cached ? 'bg-[#806350] dark:bg-[#958a7a]' : 'bg-emerald-600 dark:bg-emerald-400'
                    }`} />
                    <span>
                      {dq.is_fallback
                        ? 'Fallback Cache'
                        : dq.cached
                        ? `Cached (${dq.cache_age_seconds ? `${Math.round(dq.cache_age_seconds / 3600)}h` : 'Snapshot'})`
                        : 'Live Scraped'}
                    </span>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#2d1f17] dark:text-[#e0d1b9]">
                    {data.ticker.replace('.NS', '')}
                  </h1>
                  <span className={`px-2.5 py-0.5 rounded text-xs font-semibold border ${
                    isTriggered
                      ? 'border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400'
                      : isAvoid
                      ? 'border-[#b20808]/30 bg-[#b20808]/10 text-[#8b0909] dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400'
                      : 'border-[#b8a597] bg-[#edd9cc] text-[#806350] dark:border-[#363c44] dark:bg-[#222b37] dark:text-[#958a7a]'
                  }`}>
                    {priority}
                  </span>
                </div>

                <p className="text-xs text-[#806350] dark:text-[#958a7a] font-medium">
                  {dossier.name || 'National Stock Exchange of India'}
                </p>
              </div>

              {/* Center/Right: Price & 52-Week Range Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-6 lg:gap-10">
                {/* Live Price */}
                <div>
                  <div className="text-[11px] font-mono text-[#806350] dark:text-[#958a7a] uppercase tracking-wider">Market Price</div>
                  <div className="text-3xl font-bold text-[#2d1f17] dark:text-[#e0d1b9] font-mono mt-0.5">
                    ₹{currentPrice > 0 ? currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                  </div>
                  <div className="flex items-center space-x-2 text-xs font-semibold pt-0.5 font-mono">
                    <span className={trend['Dist_50_DMA_%'] >= 0 ? 'text-[#2d6a4f] dark:text-emerald-400' : 'text-[#b20808] dark:text-rose-400'}>
                      {trend['Dist_50_DMA_%'] != null ? `${trend['Dist_50_DMA_%'] > 0 ? '+' : ''}${trend['Dist_50_DMA_%']}%` : '—'}
                    </span>
                    <span className="text-[#806350] dark:text-[#958a7a]">vs 50 DMA</span>
                  </div>
                </div>

                {/* 52-Week Range Bar (Clean Google Finance style) */}
                <div className="w-56 space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between text-[#806350] dark:text-[#958a7a] text-[10px]">
                    <span>52W Low: ₹{yearLow.toFixed(0)}</span>
                    <span>52W High: ₹{yearHigh.toFixed(0)}</span>
                  </div>
                  <div className="relative h-1.5 w-full rounded bg-[#edd9cc] dark:bg-[#222b37] overflow-hidden">
                    <div 
                      className="absolute top-0 bottom-0 left-0 bg-[#806350] dark:bg-[#e0d1b9]"
                      style={{ width: `${rangePct}%` }}
                    />
                  </div>
                  <div className="text-right text-[10px] text-[#806350] dark:text-[#958a7a]">
                    Range Position: <span className="text-[#2d1f17] dark:text-[#e0d1b9] font-bold">{rangePct.toFixed(0)}%</span>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* 3. Main Workstation (2-Column Financial Grid) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* =========================================================================
                LEFT COLUMN: INTERACTIVE CHART & TECHNICAL AUDIT (8 COLS)
               ========================================================================= */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* Chart Card */}
              <div className="rounded-2xl border border-[#b8a597] dark:border-[#2d3642] bg-[#f7ede5] dark:bg-[#1c232d] p-5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-[#b8a597] dark:border-[#2d3642] pb-3">
                  <div className="flex items-center space-x-2">
                    <Activity className="h-4 w-4 text-[#806350] dark:text-[#e0d1b9]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[#2d1f17] dark:text-[#e0d1b9]">
                      Multi-Timeframe Technical & Volume Workstation
                    </span>
                  </div>

                  <div className="flex items-center space-x-3 text-xs font-mono">
                    <span className="text-amber-700 dark:text-amber-400 font-semibold">20 EMA: ₹{trend['20_EMA'] || (data.chart?.ema_20?.slice(-1)[0]?.value ? data.chart?.ema_20?.slice(-1)[0]?.value.toFixed(1) : '—')}</span>
                    <span className="text-[#806350] dark:text-blue-400 font-semibold">50 DMA: ₹{trend['50_DMA'] ? trend['50_DMA'].toFixed(1) : '—'}</span>
                    <span className="text-[#8b0909] dark:text-purple-400 font-semibold">200 DMA: ₹{trend['200_DMA'] ? trend['200_DMA'].toFixed(1) : '—'}</span>
                  </div>
                </div>

                {/* Canvas Chart */}
                <CanvasChart
                  candles={data.chart?.candles || []}
                  ema20={data.chart?.ema_20 || []}
                  dma50={data.chart?.dma_50 || []}
                  dma200={data.chart?.dma_200 || []}
                  volMa={data.chart?.vol_ma_20 || []}
                  weekly={data.chart?.weekly || null}
                  entryPrice={currentPrice}
                  stopPrice={stopPrice}
                  target1={target1}
                  target2={target2}
                  ticker={data.ticker}
                  markers={data.chart?.markers || []}
                />
              </div>

              {/* Trade Execution Matrix */}
              <div className="rounded-2xl border border-[#b8a597] dark:border-[#2d3642] bg-[#f7ede5] dark:bg-[#1c232d] p-5 space-y-3 shadow-sm">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-[10px] font-mono tracking-wider text-[#806350] dark:text-[#958a7a] uppercase font-bold">
                    Execution Targets & Risk Sizing
                  </span>
                  <span className="font-mono text-xs text-[#806350] dark:text-[#958a7a]">
                    Setup: <span className="text-[#2d1f17] dark:text-[#e0d1b9] font-bold">{strat.primary_strategy || 'SYSTEM_DEFAULT'}</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono">
                  {/* Stop */}
                  <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-2.5 border border-[#b20808]/30 dark:border-rose-500/20">
                    <div className="text-[10px] font-bold text-[#b20808] dark:text-rose-400 uppercase tracking-wider">Stop Loss (1R)</div>
                    <div className="text-sm font-bold text-[#b20808] dark:text-rose-400 mt-0.5">₹{stopPrice.toFixed(1)}</div>
                    <div className="text-[10px] text-[#806350] dark:text-[#958a7a]">-{stopLossPct.toFixed(1)}%</div>
                  </div>

                  {/* Entry */}
                  <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-2.5 border border-[#b8a597] dark:border-[#2d3642]">
                    <div className="text-[10px] font-bold text-[#2d1f17] dark:text-[#e0d1b9] uppercase tracking-wider">Observed Entry</div>
                    <div className="text-sm font-bold text-[#2d1f17] dark:text-[#e0d1b9] mt-0.5">₹{currentPrice.toFixed(1)}</div>
                    <div className="text-[10px] text-[#806350] dark:text-[#958a7a]">Market Price</div>
                  </div>

                  {/* Target 1 */}
                  <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-2.5 border border-emerald-600/30 dark:border-emerald-500/20">
                    <div className="text-[10px] font-bold text-[#2d6a4f] dark:text-emerald-400 uppercase tracking-wider">Target 1 (2R)</div>
                    <div className="text-sm font-bold text-[#2d6a4f] dark:text-emerald-400 mt-0.5">₹{target1.toFixed(1)}</div>
                    <div className="text-[10px] text-[#806350] dark:text-[#958a7a]">+{target1Pct.toFixed(1)}%</div>
                  </div>

                  {/* Target 2 */}
                  <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-2.5 border border-indigo-600/30 dark:border-indigo-500/20">
                    <div className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">Target 2 (3R)</div>
                    <div className="text-sm font-bold text-indigo-700 dark:text-indigo-400 mt-0.5">₹{target2.toFixed(1)}</div>
                    <div className="text-[10px] text-[#806350] dark:text-[#958a7a]">+{target2Pct.toFixed(1)}%</div>
                  </div>
                </div>
              </div>

              {/* Key Technical & Volume Indicators */}
              <div className="rounded-2xl border border-[#b8a597] dark:border-[#2d3642] bg-[#f7ede5] dark:bg-[#1c232d] p-5 space-y-3 shadow-sm">
                <span className="text-[10px] font-mono tracking-widest text-[#806350] dark:text-[#958a7a] uppercase font-bold">
                  Key Technical & Volume Indicators
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-center">
                  <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-2.5 border border-[#b8a597] dark:border-[#2d3642]">
                    <div className="text-[9px] text-[#806350] dark:text-[#958a7a] uppercase font-bold">RSI (14)</div>
                    <div className="text-sm font-bold text-[#2d1f17] dark:text-[#e0d1b9] mt-0.5">
                      {momo.RSI != null ? momo.RSI.toFixed(1) : (momo.RSI_14 != null ? momo.RSI_14.toFixed(1) : '54.0')}
                    </div>
                  </div>

                  <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-2.5 border border-[#b8a597] dark:border-[#2d3642]">
                    <div className="text-[9px] text-[#806350] dark:text-[#958a7a] uppercase font-bold">50-DMA Velocity</div>
                    <div className={`text-sm font-bold mt-0.5 ${trend['50_DMA_Slope_5d'] > 0 ? 'text-[#2d6a4f] dark:text-emerald-400' : 'text-[#b20808] dark:text-rose-400'}`}>
                      {trend['50_DMA_Slope_5d'] ? `${trend['50_DMA_Slope_5d'] > 0 ? '+' : ''}${trend['50_DMA_Slope_5d'].toFixed(2)}/d` : 'Flat'}
                    </div>
                  </div>

                  <div className="rounded-lg bg-[#edd9cc] dark:bg-[#222b37] p-2.5 border border-[#b8a597] dark:border-[#363c44]">
                    <div className="text-[9px] text-[#806350] dark:text-[#958a7a] uppercase">ATR (14)</div>
                    <div className="text-sm font-bold text-[#2d1f17] dark:text-[#e0d1b9] mt-0.5">
                      ₹{t.Volatility_Analysis?.ATR_14 ? t.Volatility_Analysis.ATR_14.toFixed(1) : (currentPrice * 0.02).toFixed(1)}
                    </div>
                  </div>

                  <div className="rounded-lg bg-[#edd9cc] dark:bg-[#222b37] p-2.5 border border-[#b8a597] dark:border-[#363c44]">
                    <div className="text-[9px] text-[#806350] dark:text-[#958a7a] uppercase">RVOL Expansion</div>
                    <div className="text-sm font-bold text-[#2d1f17] dark:text-[#e0d1b9] mt-0.5">
                      {vol.Volume_Expansion_Ratio ? `${vol.Volume_Expansion_Ratio}x` : '1.0x'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Relative Strength Alpha vs Nifty 50 */}
              <div className="rounded-2xl border border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#1c232d] p-5 space-y-3 shadow-md">
                <div className="flex items-center justify-between text-xs font-bold text-[#806350] dark:text-[#958a7a]">
                  <span className="text-[10px] font-mono tracking-wider uppercase">Relative Strength Alpha (vs Nifty 50)</span>
                  <TrendingUp className="h-3.5 w-3.5 text-[#2d6a4f] dark:text-emerald-400" />
                </div>

                <div className="grid grid-cols-4 gap-2 text-center font-mono">
                  {['1M', '3M', '6M', '1Y'].map((h) => {
                    const alpha = momo['Relative_Strength_Alpha_%']?.[h];
                    const isPos = alpha != null && alpha > 0;
                    return (
                      <div key={h} className="rounded-lg bg-[#edd9cc] dark:bg-[#222b37] border border-[#b8a597] dark:border-[#363c44] p-2">
                        <div className="text-[10px] text-[#806350] dark:text-[#958a7a]">{h} Alpha</div>
                        <div className={`text-xs font-bold mt-0.5 ${isPos ? 'text-[#2d6a4f] dark:text-emerald-400' : 'text-[#b20808] dark:text-rose-400'}`}>
                          {alpha != null ? `${alpha > 0 ? '+' : ''}${alpha.toFixed(1)}%` : '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pre-Flight Algorithmic Verification Checklist */}
              <div className="rounded-2xl border border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#1c232d] p-5 space-y-3 shadow-md">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#b8a597] dark:border-[#363c44] pb-3">
                  <div className="flex items-center space-x-2">
                    <FileCheck className="h-4 w-4 text-[#806350] dark:text-[#e0d1b9]" />
                    <span className="text-xs font-bold text-[#2d1f17] dark:text-[#e0d1b9]">
                      Algorithmic Setup Verification Checklist
                    </span>
                  </div>
                  {(() => {
                    const cleared = data.rule_breakdown?.filter(r => r.passed).length || 0;
                    const total = data.rule_breakdown?.length || 0;
                    const isBullish = cleared >= 4;
                    return (
                      <span className={`inline-flex items-center space-x-1.5 rounded px-2.5 py-0.5 text-xs font-mono font-bold border ${
                        isBullish
                          ? 'border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400'
                          : 'border-amber-600/30 bg-amber-600/10 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${isBullish ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-amber-600 dark:bg-amber-400'}`} />
                        <span>{cleared} / {total} Gates Passed</span>
                      </span>
                    );
                  })()}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#b8a597] dark:border-[#363c44] text-[10px] uppercase font-bold text-[#806350] dark:text-[#958a7a]">
                        <th className="py-2 px-2">Condition / Rule</th>
                        <th className="py-2 px-2 text-right">Verification Telemetry</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#b8a597]/60 dark:divide-[#363c44]">
                      {(data.rule_breakdown || []).map((rule, idx) => (
                        <tr key={idx} className="hover:bg-[#edd9cc]/60 dark:hover:bg-[#222b37]/40 transition">
                          <td className="py-2.5 px-2">
                            <div className="flex items-center space-x-2">
                              <span className={`h-4 w-4 rounded flex items-center justify-center shrink-0 text-[10px] font-bold border ${
                                rule.passed
                                  ? 'border-emerald-600/30 bg-emerald-600/15 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400'
                                  : 'border-[#b20808]/30 bg-[#b20808]/15 text-[#8b0909] dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-400'
                              }`}>
                                {rule.passed ? '✓' : '✗'}
                              </span>
                              <span className="font-medium text-[#2d1f17] dark:text-[#e0d1b9]">
                                {rule.rule}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono text-xs text-[#806350] dark:text-[#958a7a]">
                            {rule.detail || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Corporate Radar & Earnings Outcome Analyzer */}
              {data.corporate_radar && (
                <div className="rounded-2xl border border-[#b8a597] dark:border-[#2d3642] bg-[#f7ede5] dark:bg-[#1a222c] p-5 space-y-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#b8a597] dark:border-[#2d3642] pb-3">
                    <span className="text-[10px] font-mono tracking-widest text-[#806350] dark:text-[#958a7a] uppercase font-bold">
                      Corporate Radar & Earnings Horizon
                    </span>

                    {/* Event Risk Lockout Badge */}
                    {(() => {
                      const days = data.corporate_radar.days_to_earnings;
                      if (days != null && days <= 5) {
                        return (
                          <span className="inline-flex items-center space-x-1.5 rounded-full bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
                            <span>BINARY LOCKOUT · D-{days}</span>
                          </span>
                        );
                      }
                      if (days != null && days <= 14) {
                        return (
                          <span className="inline-flex items-center space-x-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            <span>PRE-EARNINGS RADAR · D-{days}</span>
                          </span>
                        );
                      }
                      return (
                        <span className="inline-flex items-center space-x-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          <span>CLEAR WINDOW (SAFE)</span>
                        </span>
                      );
                    })()}
                  </div>

                  {/* Date & Reason Pod */}
                  <div className="rounded-xl bg-[#edd9cc] dark:bg-[#13171e] border border-[#b8a597] dark:border-[#2d3642] p-3 text-xs space-y-1.5 font-mono">
                    <div className="flex justify-between items-center">
                      <span className="text-[#806350] dark:text-[#958a7a]">Next Earnings Release:</span>
                      <span className="font-bold text-[#2d1f17] dark:text-[#e0d1b9]">
                        {data.corporate_radar.next_earnings_date
                          ? `${data.corporate_radar.next_earnings_date} (${data.corporate_radar.days_to_earnings != null ? `${data.corporate_radar.days_to_earnings} days away` : 'Date set'})`
                          : 'No Date Declared (Safe Window)'}
                      </span>
                    </div>
                    {data.corporate_radar.ex_dividend_date && (
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-[#806350] dark:text-[#958a7a]">Ex-Dividend Date:</span>
                        <span className="text-[#2d1f17] dark:text-[#e0d1b9]">{data.corporate_radar.ex_dividend_date}</span>
                      </div>
                    )}
                    <div className="text-[11px] text-[#806350] dark:text-[#958a7a] font-sans pt-1 border-t border-[#b8a597]/40 dark:border-[#2d3642]">
                      {data.corporate_radar.event_risk_reason}
                    </div>
                  </div>

                  {/* Historical Day-1 Gap Reaction Matrix */}
                  {data.corporate_radar.gap_reactions && data.corporate_radar.gap_reactions.length > 0 && (
                    <div className="space-y-2.5 pt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-[#806350] dark:text-[#958a7a]">
                          Historical Day-1 Post-Earnings Reactions
                        </span>
                        <span className="text-[10px] font-mono text-[#806350] dark:text-[#958a7a]">
                          {data.corporate_radar.gap_stats?.summary || `${data.corporate_radar.gap_reactions.length} Quarters Analyzed`}
                        </span>
                      </div>

                      {/* 3 Metric Stat Pods */}
                      <div className="grid grid-cols-3 gap-2 text-center font-mono">
                        <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-2 border border-[#b8a597] dark:border-[#2d3642]">
                          <div className="text-[9px] uppercase font-bold text-[#806350] dark:text-[#958a7a]">Downside Gaps</div>
                          <div className="text-xs font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                            {data.corporate_radar.gap_stats?.gap_down_count ?? 0} / {data.corporate_radar.gap_stats?.quarters_analyzed ?? data.corporate_radar.gap_reactions.length}
                          </div>
                        </div>
                        <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-2 border border-[#b8a597] dark:border-[#2d3642]">
                          <div className="text-[9px] uppercase font-bold text-[#806350] dark:text-[#958a7a]">Average Gap</div>
                          <div className={`text-xs font-bold mt-0.5 ${(data.corporate_radar.gap_stats?.avg_gap_pct ?? 0) >= 0 ? 'text-[#2d6a4f] dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {(data.corporate_radar.gap_stats?.avg_gap_pct ?? 0) > 0 ? '+' : ''}{data.corporate_radar.gap_stats?.avg_gap_pct ?? 0}%
                          </div>
                        </div>
                        <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-2 border border-[#b8a597] dark:border-[#2d3642]">
                          <div className="text-[9px] uppercase font-bold text-[#806350] dark:text-[#958a7a]">Worst Gap Down</div>
                          <div className="text-xs font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                            {data.corporate_radar.gap_stats?.worst_gap_pct ?? 0}%
                          </div>
                        </div>
                      </div>

                      {/* Quarters Strip */}
                      <div className="space-y-1.5">
                        {data.corporate_radar.gap_reactions.slice(0, 4).map((q, idx) => {
                          const isDown = q.gap_pct < -0.3;
                          const isUp = q.gap_pct > 0.3;
                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-2 rounded-lg bg-[#edd9cc] dark:bg-[#13171e] border border-[#b8a597] dark:border-[#2d3642] text-xs font-mono"
                            >
                              <div className="flex items-center space-x-2">
                                <span className="font-semibold text-[#2d1f17] dark:text-[#e0d1b9]">
                                  {q.announcement_date}
                                </span>
                                {q.surprise_pct != null && (
                                  <span className={`text-[10px] px-1 rounded ${q.surprise_pct >= 0 ? 'bg-emerald-500/10 text-[#2d6a4f] dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                                    {q.surprise_pct > 0 ? '+' : ''}{q.surprise_pct}% EPS
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center space-x-3 text-right">
                                <div>
                                  <span className="text-[10px] text-[#806350] dark:text-[#958a7a] mr-1">Gap:</span>
                                  <span className={`font-bold ${isDown ? 'text-rose-600 dark:text-rose-400' : isUp ? 'text-[#2d6a4f] dark:text-emerald-400' : 'text-[#806350] dark:text-[#958a7a]'}`}>
                                    {q.gap_pct > 0 ? '+' : ''}{q.gap_pct}%
                                  </span>
                                </div>
                                <div className="text-[10px] text-[#806350] dark:text-[#958a7a]">
                                  Day-1: <span className={q.day1_pct >= 0 ? 'text-[#2d6a4f] dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{q.day1_pct > 0 ? '+' : ''}{q.day1_pct}%</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* =========================================================================
                RIGHT COLUMN: ORDER PAD, 7-PILLARS AUDIT & FORENSIC RISKS (4 COLS)
               ========================================================================= */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* Order Execution Pad */}
              <div className="relative rounded-2xl border border-[#b8a597] dark:border-[#2d3642] bg-[#f7ede5] dark:bg-[#1a222c] p-5 space-y-4 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#b8a597] dark:border-[#2d3642] pb-3">
                  <div className="flex items-center space-x-2">
                    <Briefcase className="h-4 w-4 text-[#806350] dark:text-[#e0d1b9]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[#2d1f17] dark:text-[#e0d1b9]">
                      Order Execution & Sizing
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-[#806350] dark:text-[#958a7a]">
                    1.0% Risk Model
                  </span>
                </div>

                {/* Pre-Earnings Binary Risk Gate inside Order Pad */}
                {data.corporate_radar?.days_to_earnings != null && data.corporate_radar.days_to_earnings <= 5 && (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-500/[0.08] dark:bg-rose-500/[0.06] p-3 space-y-2 text-xs">
                    <div className="flex items-center space-x-2 text-rose-700 dark:text-rose-400 font-bold font-mono text-[11px] uppercase tracking-wider">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>Pre-Earnings Lockout Active</span>
                    </div>
                    <p className="text-[11px] text-zinc-700 dark:text-zinc-300 leading-relaxed">
                      Quarterly results scheduled in {data.corporate_radar.days_to_earnings} days ({data.corporate_radar.next_earnings_date}).
                      {data.corporate_radar.gap_stats?.worst_gap_pct != null && (
                        <span> Historical worst downside gap: <strong>{data.corporate_radar.gap_stats.worst_gap_pct}%</strong>.</span>
                      )}
                    </p>
                    <label className="flex items-center space-x-2 pt-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={acknowledgedLockout}
                        onChange={(e) => setAcknowledgedLockout(e.target.checked)}
                        className="rounded border-[#b8a597] dark:border-[#2d3642] text-rose-600 focus:ring-rose-500"
                      />
                      <span className="text-[10px] font-semibold text-rose-700 dark:text-rose-400 select-none">
                        Acknowledge binary overnight gap risk before deploy
                      </span>
                    </label>
                  </div>
                )}

                <div className="space-y-2.5 text-xs font-medium">
                  <div className="flex justify-between">
                    <span className="text-[#806350] dark:text-[#958a7a]">Order Action:</span>
                    <span className="font-bold text-[#2d6a4f] dark:text-emerald-400">Delivery Buy (CNC)</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-[#806350] dark:text-[#958a7a]">Calculated Quantity:</span>
                    <span className="font-mono font-bold text-[#2d1f17] dark:text-[#e0d1b9]">{recommendedShares} Qty</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-[#806350] dark:text-[#958a7a]">Total Capital:</span>
                    <span className="font-mono font-bold text-[#2d1f17] dark:text-[#e0d1b9]">₹{positionCapital.toLocaleString('en-IN')}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-[#806350] dark:text-[#958a7a]">Capital at Stop Loss:</span>
                    <span className="font-mono font-bold text-[#b20808] dark:text-rose-400">₹{capitalAtRisk.toLocaleString('en-IN')} (1.0%)</span>
                  </div>
                </div>

                {/* Statutory Friction */}
                <div className="border-t border-[#b8a597] dark:border-[#2d3642] pt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between text-[#806350] dark:text-[#958a7a] font-mono">
                    <span>Estimated Friction (Round Trip):</span>
                    <span className="font-bold text-[#2d1f17] dark:text-[#e0d1b9]">₹{estTotalCharges}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-1 text-[10px] text-[#806350] dark:text-[#958a7a] font-mono">
                    <div>STT: ₹{estSTT}</div>
                    <div>Exchange: ₹{estExchange}</div>
                    <div>Stamp: ₹{estStampDuty}</div>
                    <div>GST: ₹{estGST}</div>
                  </div>
                </div>

                {/* Deploy Button */}
                <button
                  disabled={data.corporate_radar?.days_to_earnings != null && data.corporate_radar.days_to_earnings <= 5 && !acknowledgedLockout}
                  onClick={() => {
                    if (data.corporate_radar?.days_to_earnings != null && data.corporate_radar.days_to_earnings <= 5 && !acknowledgedLockout) {
                      return;
                    }
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
                  className={`w-full flex items-center justify-center space-x-2 rounded-lg py-3 text-xs font-bold tracking-wider shadow transition active:scale-95 ${
                    data.corporate_radar?.days_to_earnings != null && data.corporate_radar.days_to_earnings <= 5 && !acknowledgedLockout
                      ? 'bg-zinc-400/50 dark:bg-zinc-700/50 text-zinc-200 dark:text-zinc-400 cursor-not-allowed'
                      : 'bg-[#806350] hover:bg-[#6c5342] text-[#edd9cc] dark:bg-[#e0d1b9] dark:hover:bg-[#e0d1b9]/90 dark:text-[#1c232d]'
                  }`}
                >
                  <Briefcase className="h-4 w-4" />
                  <span>
                    {data.corporate_radar?.days_to_earnings != null && data.corporate_radar.days_to_earnings <= 5 && !acknowledgedLockout
                      ? 'Acknowledge Risk to Place Order'
                      : 'Place Paper Order'}
                  </span>
                </button>
              </div>

              {/* 7-Pillars Fundamental Scorecard */}
              <div className="relative rounded-2xl border border-[#b8a597] dark:border-[#2d3642] bg-[#f7ede5] dark:bg-[#1a222c] p-5 space-y-3 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#b8a597] dark:border-[#2d3642] pb-3">
                  <span className="text-[10px] font-mono tracking-widest text-[#806350] dark:text-[#958a7a] uppercase font-bold">
                    7-Pillars Fundamental Health
                  </span>
                  <span className="text-sm font-bold font-mono text-[#2d1f17] dark:text-[#e0d1b9]">
                    {f.fundamental_score || 0}/100
                  </span>
                </div>

                <div className="space-y-2">
                  {Object.entries(comps).map(([name, comp]) => {
                    const score = comp.score != null ? comp.score : 70;
                    const { grade, color } = getLetterGrade(score);
                    return (
                      <div key={name} className="flex items-center justify-between p-2.5 rounded-xl bg-[#edd9cc] dark:bg-[#13171e] border border-[#b8a597] dark:border-[#2d3642] text-xs">
                        <div className="space-y-0.5 max-w-[70%]">
                          <span className="font-semibold text-[#2d1f17] dark:text-[#e0d1b9] block truncate">{name}</span>
                          <span className="text-[10px] text-[#806350] dark:text-[#958a7a] block truncate">{comp.assessment || 'Underwriting clearance.'}</span>
                        </div>
                        <div className={`px-2.5 py-0.5 rounded-md border font-mono font-bold text-xs ${color} shadow-xs`}>
                          {grade}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Valuation vs Median Band */}
                <div className="rounded-xl border border-[#b8a597] dark:border-[#2d3642] bg-[#edd9cc] dark:bg-[#13171e] p-3 text-xs font-medium space-y-1 font-mono">
                  <div className="flex justify-between">
                    <span className="text-[#806350] dark:text-[#958a7a]">P/E Multiple:</span>
                    <span className="font-bold text-[#2d1f17] dark:text-[#e0d1b9]">{val.pe ? `${val.pe}x` : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#806350] dark:text-[#958a7a]">5Y Historical Median:</span>
                    <span className="font-bold text-[#2d1f17] dark:text-[#e0d1b9]">{val.historical_pe_median_5y ? `${val.historical_pe_median_5y}x` : 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Forensic Evidence & Key Risks */}
              <div className="rounded-2xl border border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#1c232d] p-5 space-y-3 shadow-md">
                <span className="text-[10px] font-mono tracking-widest text-[#806350] dark:text-[#958a7a] uppercase font-bold">
                  Fundamental Drivers & Risks
                </span>

                {/* Strengths */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold text-[#2d6a4f] dark:text-emerald-400 uppercase tracking-wider">
                    Verified Drivers
                  </div>
                  <ul className="text-xs text-[#806350] dark:text-[#958a7a] space-y-1">
                    {f.positives && f.positives.length > 0 ? (
                      f.positives.slice(0, 2).map((pos, idx) => (
                        <li key={idx} className="flex items-start space-x-1.5 text-[11px]">
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">•</span>
                          <span className="line-clamp-2 text-[#2d1f17] dark:text-[#e0d1b9]">{pos}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-[11px] text-[#806350] dark:text-[#958a7a]">No notable driver flagged.</li>
                    )}
                  </ul>
                </div>

                {/* Audit Red Flags */}
                <div className="space-y-1.5 pt-2 border-t border-[#b8a597] dark:border-[#363c44]">
                  <div className="text-[10px] font-bold text-[#b20808] dark:text-rose-400 uppercase tracking-wider">
                    Key Risks & Red Flags
                  </div>
                  <ul className="text-xs text-[#806350] dark:text-[#958a7a] space-y-1">
                    {f.red_flags && f.red_flags.length > 0 ? (
                      f.red_flags.slice(0, 2).map((flag, idx) => (
                        <li key={idx} className="flex items-start space-x-1.5 text-[11px]">
                          <span className="text-[#b20808] dark:text-rose-400 font-bold">•</span>
                          <span className="line-clamp-2 text-[#8b0909] dark:text-rose-300">
                            <strong>[{flag.severity}]</strong> {flag.explanation}
                          </span>
                        </li>
                      ))
                    ) : (
                      <li className="text-[11px] text-[#806350] dark:text-[#958a7a]">Zero critical red flags found.</li>
                    )}
                  </ul>
                </div>

              </div>

            </div>

          </div>

          {/* 4. Institutional AI Research Analysis & Chat */}
          <div className="rounded-2xl border border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#1c232d] p-6 shadow-md space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#b8a597] dark:border-[#363c44] pb-4">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-lg bg-[#edd9cc] dark:bg-[#222b37] border border-[#b8a597] dark:border-[#363c44] text-[#806350] dark:text-[#e0d1b9] flex items-center justify-center font-bold">
                  <Terminal className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#2d1f17] dark:text-[#e0d1b9]">
                    AI Equity Research & Qualitative Synthesis
                  </h3>
                  <p className="text-xs text-[#806350] dark:text-[#958a7a]">
                    Synthesized quantitative underwriter for {data.ticker.replace('.NS', '')}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {aiLoading && (
                  <button
                    onClick={handleCancelDossier}
                    className="flex items-center space-x-1.5 rounded-lg border border-[#b20808]/30 bg-[#b20808]/10 text-[#8b0909] dark:text-rose-400 px-3 py-1.5 text-xs font-bold hover:bg-[#b20808]/20 transition"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Cancel</span>
                  </button>
                )}

                <button
                  onClick={handleGenerateStockDossier}
                  disabled={aiLoading}
                  className="flex items-center space-x-2 rounded-lg bg-[#806350] hover:bg-[#6c5342] text-[#edd9cc] dark:bg-[#e0d1b9] dark:hover:bg-[#e0d1b9]/90 dark:text-[#1c232d] px-4 py-2 text-xs font-bold shadow transition disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{aiLoading ? 'Synthesizing Analysis...' : 'Generate Research Analysis'}</span>
                </button>
              </div>
            </div>

            {/* Error banner */}
            {aiError && (
              <div className="p-3 rounded-lg border border-[#b20808]/30 bg-[#b20808]/10 text-xs text-[#8b0909] dark:text-rose-400 font-mono">
                [!] {aiError}
              </div>
            )}

            {/* Live Streaming or Parsed Dossier Content */}
            {aiStreamingText ? (
              <div className="rounded-lg border border-[#b8a597] dark:border-[#363c44] bg-[#edd9cc] dark:bg-[#222b37] p-5 font-mono text-xs leading-relaxed text-[#2d1f17] dark:text-[#e0d1b9] space-y-2 whitespace-pre-wrap">
                <div className="flex items-center space-x-2 text-blue-700 dark:text-blue-400 font-bold">
                  <span className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400 animate-ping" />
                  <span>Synthesizing Real-Time Research Analysis...</span>
                </div>
                <div>{aiStreamingText}</div>
              </div>
            ) : data.ai_dossier ? (
              <div className="space-y-4">
                {/* 1. Risk Judge Adjudication & Verdict Banner */}
                {data.ai_dossier.risk_judge?.verdict && (
                  <div className={`rounded-xl border p-4 space-y-3 ${
                    data.ai_dossier.risk_judge?.rating === 'BEAR_FAVORED'
                      ? 'border-rose-500/40 bg-rose-500/10 text-rose-950 dark:text-rose-200'
                      : data.ai_dossier.risk_judge?.rating === 'BULL_FAVORED'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200'
                      : 'border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-200'
                  }`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] dark:border-white/[0.08] pb-2.5">
                      <div className="flex items-center space-x-2">
                        <Scale className="h-4 w-4" />
                        <span className="text-[10px] font-mono tracking-wider uppercase font-bold">
                          Risk Judge Adjudication &amp; Verification
                        </span>
                      </div>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                        data.ai_dossier.risk_judge?.rating === 'BEAR_FAVORED'
                          ? 'bg-rose-500/20 border-rose-500/40 text-rose-700 dark:text-rose-300'
                          : data.ai_dossier.risk_judge?.rating === 'BULL_FAVORED'
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-500/20 border-amber-500/40 text-amber-700 dark:text-amber-300'
                      }`}>
                        {data.ai_dossier.risk_judge?.rating === 'BEAR_FAVORED'
                          ? '⚠️ SKEPTICAL / BEAR TRAP FAVORED'
                          : data.ai_dossier.risk_judge?.rating === 'BULL_FAVORED'
                          ? '✓ BULL ACCUMULATION FAVORED'
                          : '⚖ INCONCLUSIVE / BALANCED'}
                      </span>
                    </div>

                    <p className="text-xs font-semibold leading-relaxed">
                      {cleanText(data.ai_dossier.risk_judge.verdict)}
                    </p>

                    {(data.ai_dossier.risk_judge.confirmed_facts || data.ai_dossier.risk_judge.unsupported_claims) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
                        {data.ai_dossier.risk_judge.confirmed_facts && (
                          <div className="rounded-lg bg-black/[0.02] dark:bg-white/[0.03] p-3 space-y-1 border border-black/[0.04] dark:border-white/[0.06]">
                            <span className="text-[10px] font-mono uppercase font-bold text-emerald-700 dark:text-emerald-400 block">
                              Confirmed Facts &amp; Empirical Data
                            </span>
                            <p className="text-[11px] leading-relaxed text-[#2d1f17] dark:text-[#e0d1b9] whitespace-pre-line">
                              {cleanText(data.ai_dossier.risk_judge.confirmed_facts)}
                            </p>
                          </div>
                        )}
                        {data.ai_dossier.risk_judge.unsupported_claims && (
                          <div className="rounded-lg bg-black/[0.02] dark:bg-white/[0.03] p-3 space-y-1 border border-black/[0.04] dark:border-white/[0.06]">
                            <span className="text-[10px] font-mono uppercase font-bold text-rose-700 dark:text-rose-400 block">
                              Unsupported Claims / Concerns
                            </span>
                            <p className="text-[11px] leading-relaxed text-[#2d1f17] dark:text-[#e0d1b9] whitespace-pre-line">
                              {cleanText(data.ai_dossier.risk_judge.unsupported_claims)}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {(data.ai_dossier.risk_judge.invalidation_boundary || data.ai_dossier.risks?.setup_invalidation) && (
                      <div className="flex items-start space-x-2 text-[11px] pt-1 border-t border-black/[0.04] dark:border-white/[0.05]">
                        <span className="font-mono text-rose-600 dark:text-rose-400 font-bold shrink-0">Hard Invalidation:</span>
                        <span className="text-zinc-700 dark:text-zinc-300">
                          {cleanText(data.ai_dossier.risk_judge.invalidation_boundary || data.ai_dossier.risks?.setup_invalidation)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Comparative Audit: Bull Case vs Bear Case (2 Columns) */}
                {((data.ai_dossier.bull_case && data.ai_dossier.bull_case.length > 0) || (data.ai_dossier.bear_case && data.ai_dossier.bear_case.length > 0)) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left: Bull Case */}
                    <div className="rounded-xl border border-emerald-600/30 dark:border-emerald-500/30 bg-emerald-600/5 dark:bg-emerald-500/5 p-4 space-y-2.5">
                      <div className="flex items-center space-x-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Bull Case (The Setup)</span>
                      </div>
                      <ul className="text-xs text-[#2d1f17] dark:text-[#e0d1b9] space-y-2">
                        {(data.ai_dossier.bull_case || []).map((b, i) => (
                          <li key={i} className="flex items-start space-x-2 text-[11px] leading-relaxed">
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">•</span>
                            <span>{cleanText(b)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Right: Bear Case */}
                    <div className="rounded-xl border border-rose-600/30 dark:border-rose-500/30 bg-rose-600/5 dark:bg-rose-500/5 p-4 space-y-2.5">
                      <div className="flex items-center space-x-2 text-xs font-bold text-rose-800 dark:text-rose-300">
                        <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                        <span>Bear Case (The Trap &amp; Counterevidence)</span>
                      </div>
                      <ul className="text-xs text-[#2d1f17] dark:text-[#e0d1b9] space-y-2">
                        {(data.ai_dossier.bear_case || []).map((b, i) => (
                          <li key={i} className="flex items-start space-x-2 text-[11px] leading-relaxed">
                            <span className="text-rose-600 dark:text-rose-400 font-bold mt-0.5">•</span>
                            <span>{cleanText(b)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* 3. Core Qualitative Thesis */}
                {data.ai_dossier.thesis && data.ai_dossier.thesis.length > 0 && (
                  <div className="rounded-xl border border-[#b8a597] dark:border-[#363c44] bg-[#edd9cc]/50 dark:bg-[#222b37]/50 p-4 space-y-2">
                    <span className="text-[10px] font-mono tracking-wider uppercase font-bold text-[#806350] dark:text-[#958a7a]">
                      Qualitative Investment Thesis
                    </span>
                    <ul className="text-xs text-[#2d1f17] dark:text-[#e0d1b9] space-y-1.5 list-disc pl-4 leading-relaxed">
                      {data.ai_dossier.thesis.map((th, i) => (
                        <li key={i}>{cleanText(th)}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 4. Observable Confirmation Conditions */}
                {((data.ai_dossier.strengthen_conditions && data.ai_dossier.strengthen_conditions.length > 0) ||
                  (data.ai_dossier.weaken_conditions && data.ai_dossier.weaken_conditions.length > 0)) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {data.ai_dossier.strengthen_conditions && data.ai_dossier.strengthen_conditions.length > 0 && (
                      <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 space-y-1">
                        <span className="text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-400 block uppercase">
                          What Strengthens Thesis
                        </span>
                        <ul className="text-[11px] text-[#2d1f17] dark:text-[#e0d1b9] space-y-1">
                          {data.ai_dossier.strengthen_conditions.map((sc, i) => (
                            <li key={i}>• {cleanText(sc)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {data.ai_dossier.weaken_conditions && data.ai_dossier.weaken_conditions.length > 0 && (
                      <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 space-y-1">
                        <span className="text-[10px] font-mono font-bold text-rose-700 dark:text-rose-400 block uppercase">
                          What Weakens Thesis
                        </span>
                        <ul className="text-[11px] text-[#2d1f17] dark:text-[#e0d1b9] space-y-1">
                          {data.ai_dossier.weaken_conditions.map((wc, i) => (
                            <li key={i}>• {cleanText(wc)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* 5. Unabridged Full Report Markdown Toggle */}
                {(data.ai_dossier.raw_markdown || data.ai_dossier.raw_section) && (
                  <div className="border-t border-[#b8a597]/40 dark:border-[#363c44] pt-2">
                    <button
                      type="button"
                      onClick={() => setShowRawReport(!showRawReport)}
                      className="flex items-center space-x-1.5 text-xs font-semibold text-[#806350] dark:text-[#958a7a] hover:text-[#2d1f17] dark:hover:text-[#e0d1b9] transition"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>{showRawReport ? 'Hide Unabridged Research Report' : 'View Full Unabridged Markdown Report'}</span>
                      {showRawReport ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
                    </button>

                    {showRawReport && (
                      <div className="mt-3 rounded-xl border border-[#b8a597] dark:border-[#363c44] bg-[#edd9cc]/40 dark:bg-[#13171e] p-5 text-xs font-mono leading-relaxed space-y-3 prose dark:prose-invert max-w-none text-[#2d1f17] dark:text-[#e0d1b9]">
                        <ReactMarkdown>{cleanText(data.ai_dossier.raw_markdown || data.ai_dossier.raw_section)}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-[#b8a597] dark:border-[#363c44] p-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#806350] dark:text-[#958a7a]">
                <span>Research analysis ready for synthesis on deterministic price &amp; solvency telemetry.</span>
                <button
                  onClick={handleGenerateStockDossier}
                  disabled={aiLoading}
                  className="rounded-lg border border-[#b8a597] dark:border-[#363c44] bg-[#edd9cc] dark:bg-[#222b37] hover:border-[#806350] dark:hover:border-[#e0d1b9] text-[#2d1f17] dark:text-[#e0d1b9] font-bold px-3.5 py-1.5 text-xs transition shrink-0"
                >
                  Generate Analysis
                </button>
              </div>
            )}

            {/* Interactive Stock Analyst Chat */}
            <div className="border-t border-[#b8a597] dark:border-[#363c44] pt-4 space-y-3">
              <span className="text-[10px] font-mono tracking-widest text-[#806350] dark:text-[#958a7a] uppercase font-bold flex items-center">
                <MessageSquare className="h-3 w-3 mr-1" /> Direct Analyst Chat
              </span>

              {/* Chat Thread */}
              {chatHistory.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1 text-xs">
                  {chatHistory.map((msg, i) => (
                    <div 
                      key={i}
                      className={`p-3 rounded-lg ${
                        msg.role === 'user'
                          ? 'bg-[#806350] text-[#edd9cc] ml-8 font-semibold dark:bg-[#e0d1b9] dark:text-[#1c232d]'
                          : 'bg-[#edd9cc] border border-[#b8a597] text-[#2d1f17] mr-8 dark:bg-[#222b37] dark:border-[#363c44] dark:text-[#e0d1b9]'
                      }`}
                    >
                      <span className="text-[10px] opacity-70 block uppercase font-bold mb-0.5">
                        {msg.role === 'user' ? 'YOU' : 'ANALYST'}
                      </span>
                      {msg.content}
                    </div>
                  ))}
                </div>
              )}

              {/* Chat Input */}
              <form onSubmit={handleSendStockChat} className="flex items-center space-x-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder={`Ask anything regarding ${data.ticker}'s margins, debt, or setup...`}
                  className="flex-1 rounded-lg border border-[#b8a597] dark:border-[#363c44] bg-[#edd9cc] dark:bg-[#222b37] px-3.5 py-2 text-xs text-[#2d1f17] dark:text-[#e0d1b9] outline-none focus:border-[#806350] dark:focus:border-[#e0d1b9] transition placeholder-[#806350]/60 dark:placeholder-[#958a7a]/60"
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatMessage.trim()}
                  className="rounded-lg bg-[#806350] hover:bg-[#6c5342] text-[#edd9cc] dark:bg-[#e0d1b9] dark:hover:bg-[#e0d1b9]/90 dark:text-[#1c232d] px-4 py-2 text-xs font-bold transition disabled:opacity-40"
                >
                  {chatLoading ? 'Analyzing...' : 'Ask'}
                </button>
              </form>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
