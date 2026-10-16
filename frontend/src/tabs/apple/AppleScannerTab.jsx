import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  Play, 
  Sparkles, 
  ChevronRight, 
  X, 
  AlertCircle, 
  ShieldAlert, 
  ShieldCheck, 
  Search, 
  SlidersHorizontal,
  ArrowUpRight,
  ArrowDownRight,
  Maximize2,
  Compass,
  CheckCircle2,
  Layers,
  Globe,
  Activity,
  BarChart2,
  TrendingUp,
  Info,
  Scale,
  Zap,
  Target
} from 'lucide-react';

export default function AppleScannerTab({
  candidates = [],
  loadingScan = false,
  regime = null,
  onRunScan,
  onSelectCandidate,
  onOpenTradeModal,
  aiReport,
  loadingAI = false,
  onGenerateAIReport,
}) {
  const regimeScore = regime?.regime_score ?? (regime?.regime === 'HOSTILE' ? 16 : 85);
  const isHostile = (regime?.regime === 'HOSTILE') || (regimeScore < 30);

  const [filterPriority, setFilterPriority] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [portfolioSectors, setPortfolioSectors] = useState([]);
  const [selectedSectorFilter, setSelectedSectorFilter] = useState(null);
  const [universeSelect, setUniverseSelect] = useState(() => {
    try {
      return localStorage.getItem('verchon_scanner_universe') || 'nifty100';
    } catch {
      return 'nifty100';
    }
  });

  const [limitCount, setLimitCount] = useState(() => {
    try {
      return Number(localStorage.getItem('verchon_scanner_limit')) || 100;
    } catch {
      return 100;
    }
  });

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [scanElapsed, setScanElapsed] = useState(0);
  const [aiElapsed, setAiElapsed] = useState(0);

  // Live timer during scanning
  useEffect(() => {
    let timer;
    if (loadingScan) {
      setScanElapsed(0);
      timer = setInterval(() => setScanElapsed((prev) => prev + 1), 1000);
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
      timer = setInterval(() => setAiElapsed((prev) => prev + 1), 1000);
    } else {
      setAiElapsed(0);
    }
    return () => clearInterval(timer);
  }, [loadingAI]);

  // Fetch portfolio sector exposure for diversification engine
  useEffect(() => {
    fetch('/api/paper-trades/sector-exposure')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.sectors) setPortfolioSectors(data.sectors);
      })
      .catch(() => {});
  }, []);

  const getSectorExposurePct = (secName) => {
    if (!secName || !portfolioSectors || portfolioSectors.length === 0) return 0;
    const match = portfolioSectors.find(
      (ps) => ps.sector?.toLowerCase() === secName.toLowerCase()
    );
    return match ? match.percentage : 0;
  };

  const getSectorImpactInfo = (secName) => {
    if (!secName) return null;
    const currentPct = getSectorExposurePct(secName);
    if (currentPct === 0) {
      return {
        type: 'NEW_SECTOR',
        label: `🌱 New Sector: ${secName} (0% in Portfolio)`,
        shortLabel: `🌱 New Sector (0%)`,
        badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        dot: 'bg-emerald-500',
        bonus: 35,
      };
    } else if (currentPct < 15) {
      return {
        type: 'BALANCED',
        label: `🔵 Balances: ${secName} (${currentPct.toFixed(1)}% in Portfolio)`,
        shortLabel: `🔵 Balanced (${currentPct.toFixed(0)}%)`,
        badge: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
        dot: 'bg-blue-500',
        bonus: 15,
      };
    } else if (currentPct > 25) {
      return {
        type: 'OVERWEIGHT',
        label: `⚠️ Overweight: ${secName} (${currentPct.toFixed(1)}% in Portfolio)`,
        shortLabel: `⚠️ Overweight (${currentPct.toFixed(0)}%)`,
        badge: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        dot: 'bg-amber-500',
        bonus: -30,
      };
    }
    return {
      type: 'NEUTRAL',
      label: `${secName} (${currentPct.toFixed(1)}%)`,
      shortLabel: `${secName}`,
      badge: 'border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] text-zinc-600 dark:text-zinc-400',
      dot: 'bg-zinc-400',
      bonus: 0,
    };
  };

  const allScannedSectors = useMemo(() => {
    return Array.from(
      new Set(candidates.map((c) => c.sector || c.fundamentals?.sector).filter(Boolean))
    );
  }, [candidates]);

  const missingSectors = useMemo(() => {
    return allScannedSectors.filter((sec) => getSectorExposurePct(sec) === 0);
  }, [allScannedSectors, portfolioSectors]);

  // Filter candidates with multi-priority and sector diversification ranking
  const filteredCandidates = useMemo(() => {
    let result = candidates.filter((c) => {
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const tickerMatch = (c.ticker || '').toLowerCase().includes(query);
        const nameMatch = (c.name || c.company_name || '').toLowerCase().includes(query);
        const sectorMatch = (c.sector || c.fundamentals?.sector || '').toLowerCase().includes(query);
        if (!tickerMatch && !nameMatch && !sectorMatch) return false;
      }
      if (filterPriority === 'SECTOR DIVERSITY') {
        if (c.priority === 'AVOID / FILTERED OUT') return false;
        if (selectedSectorFilter) {
          const sec = c.sector || c.fundamentals?.sector;
          return sec?.toLowerCase() === selectedSectorFilter.toLowerCase();
        }
        return true;
      }
      if (filterPriority === 'ALL') return true;
      return c.priority === filterPriority;
    });

    if (filterPriority === 'SECTOR DIVERSITY') {
      result = [...result].sort((a, b) => {
        const secA = a.sector || a.fundamentals?.sector;
        const secB = b.sector || b.fundamentals?.sector;
        const bonusA = getSectorImpactInfo(secA)?.bonus || 0;
        const bonusB = getSectorImpactInfo(secB)?.bonus || 0;
        return (b.overall_score || 0) + bonusB - ((a.overall_score || 0) + bonusA);
      });
    }

    return result;
  }, [candidates, filterPriority, searchQuery, selectedSectorFilter, portfolioSectors]);

  // Keep selectedTicker in sync with filtered list
  useEffect(() => {
    if (filteredCandidates.length > 0) {
      const exists = filteredCandidates.some((c) => c.ticker === selectedTicker);
      if (!exists) {
        setSelectedTicker(filteredCandidates[0].ticker);
      }
    } else {
      setSelectedTicker(null);
    }
  }, [filteredCandidates, selectedTicker]);

  // Active specimen for the Stage
  const activeCandidate = useMemo(() => {
    return filteredCandidates.find((c) => c.ticker === selectedTicker) || filteredCandidates[0] || null;
  }, [filteredCandidates, selectedTicker]);

  const handleScanSubmit = () => {
    if (universeSelect === 'fast3') {
      onRunScan({ tickers: ['ICICIBANK.NS', 'TCS.NS', 'IDEA.NS'], limit: 3 });
    } else {
      onRunScan({ universe: universeSelect, limit: Number(limitCount) });
    }
  };

  const getPriorityMood = (priority) => {
    switch (priority) {
      case 'SIGNAL TRIGGERED':
        return { label: 'Actionable Setup', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/20' };
      case 'HIGH PRIORITY':
        return { label: 'High Priority', dot: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-400', badge: 'bg-blue-500/10 border-blue-500/20' };
      case 'WATCHLIST':
        return { label: 'On Watchlist', dot: 'bg-amber-400', text: 'text-amber-700 dark:text-amber-400', badge: 'bg-amber-500/10 border-amber-500/20' };
      case 'AVOID / FILTERED OUT':
        return { label: 'On Pause', dot: 'bg-zinc-400', text: 'text-zinc-500 dark:text-zinc-400', badge: 'bg-zinc-500/10 border-zinc-500/20' };
      default:
        return { label: priority, dot: 'bg-zinc-400', text: 'text-zinc-500', badge: 'bg-zinc-500/10 border-zinc-500/20' };
    }
  };

  const getStrategyName = (strat) => {
    if (!strat || strat === 'None' || strat === 'SWING_MOMENTUM' || strat === 'NO_ACTIVE_SETUP' || strat === 'NO_SETUP') {
      return 'Market Baseline';
    }
    if (strat.includes("SWEEP")) return "Institutional Liquidity Sweep";
    if (strat.includes("SQUEEZE")) return "Volatility Contraction Breakout";
    if (strat.includes("SNAPBACK")) return "Mean-Reversion Rubber Band";
    if (strat.includes("BREAKOUT")) return "Momentum Breakout";
    return strat.replace(/_/g, ' ');
  };

  // Precision 4-Point Spectrum Math for Active Specimen (Stop, Entry, T1 2R, T2 3R)
  const spectrumMath = useMemo(() => {
    if (!activeCandidate) return null;
    const c = activeCandidate;
    const price = c.current_price ?? c.technicals?.Trend_Analysis?.Current_Price;
    const stop = c.stop_loss || c.strategy?.active_strategy_result?.stop_price;
    const t1 = c.target_1 || c.strategy?.active_strategy_result?.target_1;
    const t2 = c.target_2 || c.strategy?.active_strategy_result?.target_2;
    const rr = c.risk_reward_ratio || c.strategy?.active_strategy_result?.risk_reward_ratio;

    if (stop != null && t1 != null && price != null && Number(stop) < Number(price) && Number(price) < Number(t1)) {
      const s = Number(stop);
      const p = Number(price);
      const t1Num = Number(t1);
      const t2Num = t2 != null && Number(t2) > t1Num ? Number(t2) : (p + 3 * (p - s));
      const riskAmount = p - s;
      const t1Reward = t1Num - p;
      const t2Reward = t2Num - p;
      const maxTarget = t2Num;
      const totalSpan = maxTarget - s;

      const needlePosPct = Math.max(5, Math.min(95, Math.round(((p - s) / totalSpan) * 100)));
      const t1MarkerPct = Math.max(5, Math.min(95, Math.round(((t1Num - s) / totalSpan) * 100)));
      const t2MarkerPct = Math.max(5, Math.min(95, Math.round(((t2Num - s) / totalSpan) * 100)));

      const rr1 = (t1Reward / riskAmount).toFixed(1);
      const rr2 = (t2Reward / riskAmount).toFixed(1);

      return {
        hasValid: true,
        price: p,
        stop: s,
        target1: t1Num,
        target2: t2Num,
        riskRupees: riskAmount.toFixed(1),
        t1RewardRupees: t1Reward.toFixed(1),
        t2RewardRupees: t2Reward.toFixed(1),
        riskPct: ((riskAmount / p) * 100).toFixed(1),
        t1RewardPct: ((t1Reward / p) * 100).toFixed(1),
        t2RewardPct: ((t2Reward / p) * 100).toFixed(1),
        needlePosPct,
        t1MarkerPct,
        t2MarkerPct,
        rr: rr ? Number(rr).toFixed(1) : rr1,
        rr1,
        rr2,
      };
    }
    return { hasValid: false, price };
  }, [activeCandidate]);

  return (
    <div className="min-h-[calc(100vh-90px)] p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      {/* 1. The Atelier Control Console */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black/[0.06] dark:border-white/[0.08] pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-mono tracking-widest text-zinc-400 uppercase">THE TRADER'S ATELIER</span>
            <span className="text-zinc-300 dark:text-zinc-700">/</span>
            <span className="text-[10px] font-mono text-zinc-500 uppercase">{filteredCandidates.length} Active Candidates</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-100 mt-0.5">
            Market Specimen Stage
          </h1>
        </div>

        {/* Live Controls: Universe & Execution */}
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={universeSelect}
            onChange={(e) => {
              const val = e.target.value;
              setUniverseSelect(val);
              try { localStorage.setItem('verchon_scanner_universe', val); } catch {}
              if (val === 'fast3') setLimitCount(3);
            }}
            className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 shadow-sm outline-none cursor-pointer"
          >
            <option value="fast3">⚡ 3-Stock Fast Test</option>
            <option value="nifty50">Nifty 50 Index</option>
            <option value="nifty100">Nifty 100 Index</option>
            <option value="niftymidcap100">Nifty Midcap 100</option>
            <option value="nifty500">Nifty 500 Index</option>
          </select>

          <button
            onClick={handleScanSubmit}
            disabled={loadingScan}
            className="flex items-center space-x-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 px-4 py-1.5 text-xs font-semibold shadow-sm transition active:scale-95"
          >
            <Play className={`h-3 w-3 fill-current ${loadingScan ? 'animate-pulse' : ''}`} />
            <span>{loadingScan ? `Screening (${scanElapsed}s)...` : 'Screen Market'}</span>
          </button>

          {candidates.length > 0 && (
            <button
              onClick={() => {
                if (!aiReport && !loadingAI) onGenerateAIReport();
                setIsDrawerOpen(true);
              }}
              disabled={loadingAI}
              className="flex items-center space-x-1.5 rounded-xl border border-purple-500/25 bg-purple-500/5 px-3 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-500/10 transition"
            >
              <Sparkles className={`h-3.5 w-3.5 ${loadingAI ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{loadingAI ? `Briefing (${aiElapsed}s)...` : 'AI Dossier'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. The Split-Stage Architecture (Stream & Stage) */}
      {loadingScan ? (
        <div className="rounded-3xl border border-black/[0.06] dark:border-white/[0.07] bg-white dark:bg-[#101117] p-20 text-center shadow-sm">
          <div className="relative mb-3 flex h-14 w-14 items-center justify-center mx-auto">
            <div className="absolute inset-0 animate-ping rounded-full bg-zinc-900/10 dark:bg-zinc-100/10" />
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900">
              <Play className="h-5 w-5 fill-current animate-pulse ml-0.5" />
            </div>
          </div>
          <div className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            Screening Market Universe...
          </div>
          <div className="mt-1 text-xs text-zinc-500 max-w-sm mx-auto">
            Extracting price action, evaluating 50 DMA distances, auditing solvency, and qualifying active institutional setups.
          </div>
        </div>
      ) : candidates.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-black/[0.1] dark:border-white/[0.1] p-20 text-center">
          <Compass className="h-8 w-8 text-zinc-400 mx-auto mb-2 opacity-60" />
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">The Stage is Waiting</h3>
          <p className="mt-1 text-xs text-zinc-500 max-w-xs mx-auto">
            Click "Screen Market" above to scan the universe and project qualified setups onto this desk.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* =================================================================
              LEFT: THE SPECIMEN STREAM (The Interactive Playlist / Ticker Deck)
              ================================================================= */}
          <div className="lg:col-span-5 space-y-3">
            {/* Filter Pills & Quick Search */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar py-1">
                {[
                  { id: 'ALL', label: 'All' },
                  { id: 'SIGNAL TRIGGERED', label: 'Actionable' },
                  { id: 'HIGH PRIORITY', label: 'Priority' },
                  { id: 'WATCHLIST', label: 'Watch' },
                  { id: 'SECTOR DIVERSITY', label: '🌱 Sector Gap' },
                ].map((p) => {
                  const isSel = filterPriority === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setFilterPriority(p.id);
                        if (p.id !== 'SECTOR DIVERSITY') setSelectedSectorFilter(null);
                      }}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition shrink-0 ${
                        isSel
                          ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 font-semibold shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              <div className="relative shrink-0">
                <Search className="pointer-events-none absolute left-2.5 top-2 h-3 w-3 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Filter..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-28 rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-zinc-900 pl-7 pr-2 py-1 text-[11px] text-zinc-800 dark:text-zinc-200 outline-none"
                />
              </div>
            </div>

            {/* Sector Gap Missing Sector Chips (When Sector Diversity Active) */}
            {filterPriority === 'SECTOR DIVERSITY' && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-emerald-700 dark:text-emerald-400">
                    Portfolio Sector Gaps (0% Exposure)
                  </span>
                  {selectedSectorFilter && (
                    <button
                      onClick={() => setSelectedSectorFilter(null)}
                      className="text-[10px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 underline"
                    >
                      Show All Gaps
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {missingSectors.length > 0 ? (
                    missingSectors.map((sec) => {
                      const count = candidates.filter(
                        (c) => (c.sector === sec || c.fundamentals?.sector === sec) && c.priority !== 'AVOID / FILTERED OUT'
                      ).length;
                      const isSel = selectedSectorFilter?.toLowerCase() === sec.toLowerCase();
                      return (
                        <button
                          key={sec}
                          onClick={() => setSelectedSectorFilter(isSel ? null : sec)}
                          className={`rounded-lg px-2 py-0.5 text-[11px] font-medium transition ${
                            isSel
                              ? 'bg-emerald-600 text-white font-bold shadow-sm'
                              : 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20'
                          }`}
                        >
                          {sec} <span className="opacity-70 text-[10px]">({count})</span>
                        </button>
                      );
                    })
                  ) : (
                    <span className="text-[11px] text-zinc-500">All scanned sectors currently represented in portfolio.</span>
                  )}
                </div>
              </div>
            )}

            {/* The Stream List */}
            <div className="space-y-1.5 max-h-[680px] overflow-y-auto pr-1">
              {filteredCandidates.map((c, idx) => {
                const isSelected = c.ticker === selectedTicker;
                const price = c.current_price ?? c.technicals?.Trend_Analysis?.Current_Price;
                const dmaDist = c.technicals?.Trend_Analysis?.['Dist_50_DMA_%'];
                const mood = getPriorityMood(c.priority);
                const strat = getStrategyName(c.setup_type || c.strategy?.primary_strategy);
                const rvol = c.technicals?.Volume_Analysis?.RVOL;
                const impact = getSectorImpactInfo(c.sector || c.fundamentals?.sector);

                return (
                  <div
                    key={c.ticker}
                    onClick={() => setSelectedTicker(c.ticker)}
                    className={`group relative flex items-center justify-between rounded-2xl p-3.5 cursor-pointer transition-all duration-150 border ${
                      isSelected
                        ? 'bg-white dark:bg-[#161822] border-black/20 dark:border-white/20 shadow-md ring-1 ring-black/5 dark:ring-white/10'
                        : 'bg-white/60 dark:bg-[#101117]/60 border-black/[0.04] dark:border-white/[0.05] hover:bg-white dark:hover:bg-[#14161f] hover:border-black/10 dark:hover:border-white/10'
                    }`}
                  >
                    {/* Left: Specimen Number & Ticker */}
                    <div className="flex items-center space-x-3">
                      <span className="font-mono text-[10px] text-zinc-400 w-4 text-right">
                        {(idx + 1).toString().padStart(2, '0')}
                      </span>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-zinc-100 group-hover:text-blue-500 transition">
                            {c.ticker}
                          </span>
                          <span className={`h-1.5 w-1.5 rounded-full ${mood.dot}`} />
                          {impact && (
                            <span className={`h-1.5 w-1.5 rounded-full ${impact.dot}`} title={impact.label} />
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-500 truncate max-w-[140px] flex items-center space-x-1">
                          <span>{c.name}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Price & Quick Trend Pill */}
                    <div className="text-right">
                      <div className="font-mono-num font-bold text-xs text-zinc-900 dark:text-zinc-100">
                        {price != null ? `₹${Number(price).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : '—'}
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono flex items-center justify-end space-x-1.5">
                        {dmaDist != null && (
                          <span className={dmaDist >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-rose-600 dark:text-rose-400 font-medium'}>
                            {dmaDist > 0 ? '+' : ''}{dmaDist}% 50D
                          </span>
                        )}
                        {rvol != null && Number(rvol) >= 1.2 && (
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">
                            {Number(rvol).toFixed(1)}x vol
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* =================================================================
              RIGHT: THE SPOTLIGHT STAGE (The Master Specimen Sheet)
              ================================================================= */}
          <div className="lg:col-span-7">
            {activeCandidate ? (
              <div className="rounded-3xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#12141c] p-6 sm:p-8 shadow-lg backdrop-blur-2xl transition-all">
                {/* 1. Specimen Registry Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between border-b border-black/[0.06] dark:border-white/[0.07] pb-5 gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] tracking-widest text-zinc-400 uppercase font-bold">
                        SPECIMEN NO. {(filteredCandidates.findIndex((c) => c.ticker === activeCandidate.ticker) + 1).toString().padStart(2, '0')}
                      </span>
                      <span className="text-zinc-300 dark:text-zinc-700">·</span>
                      <span className="rounded-md border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] px-1.5 py-0.2 font-mono text-[10px] font-semibold text-zinc-500">
                        {activeCandidate.fundamentals?.company_type || 'LARGE_CAP'}
                      </span>
                      <span className="text-zinc-300 dark:text-zinc-700">·</span>
                      <span className="text-xs text-zinc-500 font-medium">
                        {activeCandidate.sector || activeCandidate.fundamentals?.sector || 'Industrial Market'}
                      </span>
                    </div>

                    <h2 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 mt-1">
                      {activeCandidate.ticker}
                    </h2>
                    <p className="text-xs text-zinc-500 mt-0.5 font-medium">
                      {activeCandidate.name} · {activeCandidate.industry || activeCandidate.fundamentals?.industry || 'Core Equities'}
                    </p>

                    {/* Dynamic Sector Impact Badge */}
                    {(() => {
                      const impact = getSectorImpactInfo(activeCandidate.sector || activeCandidate.fundamentals?.sector);
                      if (!impact) return null;
                      return (
                        <div className="mt-2 flex items-center">
                          <span className={`inline-flex items-center space-x-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${impact.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${impact.dot}`} />
                            <span>{impact.label}</span>
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Top Right: Live Price Hero & Moving Avg Distances */}
                  <div className="text-left sm:text-right">
                    <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Market Price</div>
                    <div className="font-mono-num text-3xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight mt-0.5">
                      {spectrumMath?.price != null ? `₹${Number(spectrumMath.price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </div>
                    <div className="flex flex-wrap sm:justify-end gap-2 text-xs font-semibold mt-1">
                      {activeCandidate.technicals?.Trend_Analysis?.['Dist_50_DMA_%'] != null && (
                        <span className={activeCandidate.technicals.Trend_Analysis['Dist_50_DMA_%'] >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                          {activeCandidate.technicals.Trend_Analysis['Dist_50_DMA_%'] > 0 ? '+' : ''}{activeCandidate.technicals.Trend_Analysis['Dist_50_DMA_%']}% vs 50D
                        </span>
                      )}
                      {activeCandidate.technicals?.Trend_Analysis?.['Dist_200_DMA_%'] != null && (
                        <span className="text-zinc-500 font-mono">
                          ({activeCandidate.technicals.Trend_Analysis['Dist_200_DMA_%'] > 0 ? '+' : ''}{activeCandidate.technicals.Trend_Analysis['Dist_200_DMA_%']}% vs 200D)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. The Setup Narrative (Human Story First) */}
                <div className="py-5 border-b border-black/[0.06] dark:border-white/[0.07]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono tracking-wider text-zinc-400 uppercase font-semibold">
                      Strategy Blueprint
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium border ${getPriorityMood(activeCandidate.priority).badge} ${getPriorityMood(activeCandidate.priority).text}`}>
                      {getPriorityMood(activeCandidate.priority).label}
                    </span>
                  </div>

                  <div className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                    {getStrategyName(activeCandidate.setup_type || activeCandidate.strategy?.primary_strategy)}
                  </div>

                  <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-2 leading-relaxed">
                    {activeCandidate.priority_reason || 
                      "Deterministic multi-factor qualification confirmed. Balance sheet solvency verified against debt-to-equity and valuation parameters."}
                  </p>
                </div>

                {/* 3. The Precision 4-Point Trade Spectrum (Stop, Entry, T1, T2) */}
                <div className="py-5 border-b border-black/[0.06] dark:border-white/[0.07]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-mono tracking-wider text-zinc-400 uppercase font-semibold">
                      The Trade Spectrum (Precision Scale)
                    </span>
                    {spectrumMath?.hasValid && (
                      <span className="text-xs font-bold font-mono text-zinc-900 dark:text-zinc-100 bg-black/[0.04] dark:bg-white/[0.06] px-2.5 py-0.5 rounded-lg">
                        T1 {spectrumMath.rr1}R · T2 {spectrumMath.rr2}R Runner
                      </span>
                    )}
                  </div>

                  {spectrumMath?.hasValid ? (
                    <div className="space-y-3">
                      {/* 4 Precision Metric Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-center">
                        <div className="rounded-2xl bg-rose-500/5 dark:bg-rose-500/10 p-2.5 border border-rose-500/15">
                          <div className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold uppercase">Stop Loss</div>
                          <div className="text-sm font-bold text-rose-700 dark:text-rose-300 font-mono-num mt-0.5">₹{spectrumMath.stop}</div>
                          <div className="text-[10px] text-rose-500">-{spectrumMath.riskPct}% (₹{spectrumMath.riskRupees})</div>
                        </div>

                        <div className="rounded-2xl bg-blue-500/5 dark:bg-blue-500/10 p-2.5 border border-blue-500/15">
                          <div className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold uppercase">Observed Entry</div>
                          <div className="text-sm font-bold text-blue-700 dark:text-blue-300 font-mono-num mt-0.5">₹{spectrumMath.price.toFixed(1)}</div>
                          <div className="text-[10px] text-blue-500">Live Market</div>
                        </div>

                        <div className="rounded-2xl bg-emerald-500/5 dark:bg-emerald-500/10 p-2.5 border border-emerald-500/15">
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase">Target 1 (2R)</div>
                          <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300 font-mono-num mt-0.5">₹{spectrumMath.target1.toFixed(1)}</div>
                          <div className="text-[10px] text-emerald-500">+{spectrumMath.t1RewardPct}% (₹{spectrumMath.t1RewardRupees})</div>
                        </div>

                        <div className="rounded-2xl bg-purple-500/5 dark:bg-purple-500/10 p-2.5 border border-purple-500/15">
                          <div className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold uppercase">Target 2 (3R)</div>
                          <div className="text-sm font-bold text-purple-700 dark:text-purple-300 font-mono-num mt-0.5">₹{spectrumMath.target2.toFixed(1)}</div>
                          <div className="text-[10px] text-purple-500">+{spectrumMath.t2RewardPct}% (₹{spectrumMath.t2RewardRupees})</div>
                        </div>
                      </div>

                      {/* Hairline Drafting Needle Gauge */}
                      <div className="relative pt-3 pb-1">
                        <div className="h-1.5 w-full rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden flex">
                          <div style={{ width: `${spectrumMath.needlePosPct}%` }} className="bg-rose-500 h-full" />
                          <div style={{ width: `${Math.max(0, (spectrumMath.t1MarkerPct || 70) - spectrumMath.needlePosPct)}%` }} className="bg-emerald-500 h-full" />
                          <div style={{ width: `${Math.max(0, 100 - (spectrumMath.t1MarkerPct || 70))}%` }} className="bg-purple-500/70 h-full" />
                        </div>
                        {/* Needle at Entry */}
                        <div
                          style={{ left: `${spectrumMath.needlePosPct}%` }}
                          className="absolute top-1 h-4 w-1 -ml-0.5 rounded-full bg-zinc-900 dark:bg-white shadow-sm"
                          title="Observed Entry"
                        />
                        {/* Target 1 marker */}
                        {spectrumMath.t1MarkerPct && (
                          <div
                            style={{ left: `${spectrumMath.t1MarkerPct}%` }}
                            className="absolute top-1 h-4 w-0.5 -ml-0.2 rounded-full bg-emerald-400"
                            title="Target 1 (2R)"
                          />
                        )}
                      </div>

                      <div className="text-[11px] text-zinc-500 text-center font-medium">
                        Risking <strong className="text-rose-600 dark:text-rose-400 font-semibold">₹{spectrumMath.riskRupees}</strong> ({spectrumMath.riskPct}%) per share to capture <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">₹{spectrumMath.t1RewardRupees}</strong> at T1 ({spectrumMath.rr1}:1) and <strong className="text-purple-600 dark:text-purple-400 font-semibold">₹{spectrumMath.t2RewardRupees}</strong> at T2 ({spectrumMath.rr2}:1 runner).
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] p-4 text-center text-xs text-zinc-500 border border-black/[0.04] dark:border-white/[0.05]">
                      No active trade range qualified for this baseline candidate.
                    </div>
                  )}
                </div>

                {/* 4. Quantitative Technical Telemetry (Swing Indicators) */}
                <div className="py-5 border-b border-black/[0.06] dark:border-white/[0.07]">
                  <div className="text-[11px] font-mono tracking-wider text-zinc-400 uppercase font-semibold mb-3">
                    Technical Indicators & Swing Parameters
                  </div>

                  {(() => {
                    const trend = activeCandidate.technicals?.Trend_Analysis || {};
                    const vol = activeCandidate.technicals?.Volume_Analysis || {};
                    const rsi = trend.RSI_14;
                    const atr = trend.ATR_14;
                    const dma50 = trend['50_DMA'];
                    const dma200 = trend['200_DMA'];
                    const rvol = vol.RVOL;

                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 font-mono text-center">
                        <div className="rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] p-2.5 border border-black/[0.04] dark:border-white/[0.05]">
                          <div className="text-[9px] text-zinc-400 uppercase">RSI (14)</div>
                          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-mono-num mt-0.5">
                            {rsi != null ? Number(rsi).toFixed(1) : '—'}
                          </div>
                          <div className="text-[9px] text-zinc-500 mt-0.5">
                            {rsi != null ? (rsi >= 70 ? 'Overbought' : rsi <= 35 ? 'Oversold' : rsi >= 55 ? 'Bullish' : 'Neutral') : 'Standard'}
                          </div>
                        </div>

                        <div className="rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] p-2.5 border border-black/[0.04] dark:border-white/[0.05]">
                          <div className="text-[9px] text-zinc-400 uppercase">ATR (14)</div>
                          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-mono-num mt-0.5">
                            {atr != null ? `₹${Number(atr).toFixed(1)}` : '—'}
                          </div>
                          <div className="text-[9px] text-zinc-500 mt-0.5">Daily Buffer</div>
                        </div>

                        <div className="rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] p-2.5 border border-black/[0.04] dark:border-white/[0.05]">
                          <div className="text-[9px] text-zinc-400 uppercase">50 DMA</div>
                          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-mono-num mt-0.5">
                            {dma50 != null ? `₹${Number(dma50).toFixed(1)}` : '—'}
                          </div>
                          <div className={`text-[9px] mt-0.5 ${trend['Dist_50_DMA_%'] >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {trend['Dist_50_DMA_%'] != null ? `${trend['Dist_50_DMA_%'] > 0 ? '+' : ''}${trend['Dist_50_DMA_%']}%` : '—'}
                          </div>
                        </div>

                        <div className="rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] p-2.5 border border-black/[0.04] dark:border-white/[0.05]">
                          <div className="text-[9px] text-zinc-400 uppercase">200 DMA</div>
                          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-mono-num mt-0.5">
                            {dma200 != null ? `₹${Number(dma200).toFixed(1)}` : '—'}
                          </div>
                          <div className={`text-[9px] mt-0.5 ${trend['Dist_200_DMA_%'] >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {trend['Dist_200_DMA_%'] != null ? `${trend['Dist_200_DMA_%'] > 0 ? '+' : ''}${trend['Dist_200_DMA_%']}%` : '—'}
                          </div>
                        </div>

                        <div className="rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] p-2.5 border border-black/[0.04] dark:border-white/[0.05]">
                          <div className="text-[9px] text-zinc-400 uppercase">RVOL Surge</div>
                          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-mono-num mt-0.5">
                            {rvol != null ? `${Number(rvol).toFixed(2)}x` : '1.0x'}
                          </div>
                          <div className="text-[9px] text-zinc-500 mt-0.5">
                            {vol.Volume_Surge ? 'Surge Confirmed' : (rvol != null && rvol >= 1.2 ? 'Elevated' : 'Average')}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* 5. Fundamental Solvency & Multi-Factor Valuation */}
                <div className="py-5 border-b border-black/[0.06] dark:border-white/[0.07]">
                  <div className="text-[11px] font-mono tracking-wider text-zinc-400 uppercase font-semibold mb-3">
                    Fundamental Solvency & Scoring
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center mb-3">
                    <div className="rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] p-3 border border-black/[0.04] dark:border-white/[0.05]">
                      <div className="text-[10px] font-mono text-zinc-400 uppercase">Composite Health</div>
                      <div className="text-base font-bold text-zinc-900 dark:text-zinc-100 font-mono-num mt-0.5">
                        {activeCandidate.overall_score ?? '—'}/100
                      </div>
                    </div>

                    <div className="rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] p-3 border border-black/[0.04] dark:border-white/[0.05]">
                      <div className="text-[10px] font-mono text-zinc-400 uppercase">Financial Solvency</div>
                      <div className="text-base font-bold text-zinc-800 dark:text-zinc-200 font-mono-num mt-0.5">
                        {activeCandidate.fundamentals?.fundamental_score ?? '—'}/100
                      </div>
                    </div>

                    <div className="rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] p-3 border border-black/[0.04] dark:border-white/[0.05]">
                      <div className="text-[10px] font-mono text-zinc-400 uppercase">Chart Structure</div>
                      <div className="text-base font-bold text-zinc-800 dark:text-zinc-200 font-mono-num mt-0.5">
                        {activeCandidate.technicals?.Scoring_Summary?.Technical_Score ?? '—'}/100
                      </div>
                    </div>
                  </div>

                  {/* Multi-Factor Ratios Row */}
                  {(() => {
                    const f = activeCandidate.fundamentals || {};
                    const val = f.valuation || {};
                    const de = f.debt_to_equity ?? f.components?.['Solvency']?.details?.debt_to_equity;
                    const roe = f.roe ?? f.roce;

                    return (
                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-zinc-500 pt-1">
                        <div>
                          Valuation:{' '}
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                            P/E {val.pe ? `${val.pe}x` : '—'} · P/B {val.pb ? `${val.pb}x` : '—'}
                          </span>
                        </div>
                        <div>
                          Solvency:{' '}
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                            Debt-to-Equity {de != null ? Number(de).toFixed(2) : 'Safe'}
                          </span>
                        </div>
                        {roe != null && (
                          <div>
                            Return on Equity:{' '}
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {roe}%
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* 6. Deterministic Rule Verification Checkpoints */}
                <div className="py-4 border-b border-black/[0.06] dark:border-white/[0.07]">
                  <div className="text-[11px] font-mono tracking-wider text-zinc-400 uppercase font-semibold mb-2.5">
                    Algorithmic Setup Verification
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="flex items-center space-x-1.5 text-zinc-600 dark:text-zinc-300">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <span className="truncate">Trend Structure Safe</span>
                    </div>
                    <div className="flex items-center space-x-1.5 text-zinc-600 dark:text-zinc-300">
                      <ShieldCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      <span className="truncate">Balance Sheet Safe</span>
                    </div>
                    <div className="flex items-center space-x-1.5 text-zinc-600 dark:text-zinc-300">
                      <Activity className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                      <span className="truncate">Volatility ATR Valid</span>
                    </div>
                    <div className="flex items-center space-x-1.5 text-zinc-600 dark:text-zinc-300">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <span className="truncate">Event Risk Clean</span>
                    </div>
                  </div>
                </div>

                {/* 7. Macro Regime Warning Pill (If Hostile) */}
                {isHostile && (
                  <div className="mt-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 p-3.5 flex items-center space-x-3">
                    <ShieldAlert className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    <div className="text-xs text-zinc-700 dark:text-zinc-300">
                      <strong className="text-rose-600 dark:text-rose-400 font-semibold">Macro Sizing Warning:</strong> Nifty is in a downdraft (Score: {regimeScore}/100). 50% position sizing is enforced on paper trades.
                    </div>
                  </div>
                )}

                {/* 8. The Action Console */}
                <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <button
                    onClick={() => onSelectCandidate(activeCandidate.ticker)}
                    className="w-full sm:w-auto flex items-center justify-center space-x-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-blue-500 transition py-2 px-3"
                  >
                    <span>Examine Full Deep Dive Dossier</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>

                  <button
                    onClick={() => {
                      if (onOpenTradeModal) {
                        onOpenTradeModal(activeCandidate.ticker, activeCandidate.setup_type || activeCandidate.strategy?.primary_strategy);
                      }
                    }}
                    className="w-full sm:w-auto rounded-2xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold px-7 py-3 text-xs shadow-md transition active:scale-95"
                  >
                    Execute Paper Position
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* 4. Slide-Over Executive Briefing Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="relative h-full w-full max-w-3xl overflow-y-auto border-l border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#121319] p-8 shadow-2xl transition-colors">
            <div className="sticky top-0 mb-6 flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.07] bg-white/95 dark:bg-[#121319]/95 pb-4 backdrop-blur z-10">
              <div className="flex items-center space-x-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    Executive Market Synthesis
                  </h2>
                  <p className="text-xs text-zinc-500">Curated quantitative cross-examination across candidates</p>
                </div>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] p-2 text-zinc-500 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loadingAI ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Sparkles className="mb-3 h-8 w-8 animate-spin text-purple-500" />
                <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  Synthesizing Market Intelligence...
                </div>
                <div className="mt-1 font-mono text-xs text-zinc-500">
                  Elapsed: {aiElapsed}s
                </div>
              </div>
            ) : aiReport ? (
              <div className="prose dark:prose-invert max-w-none text-xs leading-relaxed space-y-4">
                <ReactMarkdown>{aiReport}</ReactMarkdown>
              </div>
            ) : (
              <div className="py-16 text-center text-xs text-zinc-500">
                No briefing generated yet. Click "AI Dossier" to synthesize insights.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
