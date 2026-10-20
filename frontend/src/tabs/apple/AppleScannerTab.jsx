import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Compass,
  CheckCircle2,
  Layers,
  Activity,
  BarChart2,
  TrendingUp,
  Info,
  Scale,
  Zap,
  Target,
  AlertTriangle
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
        label: `New Sector: ${secName} (0% in Portfolio)`,
        shortLabel: `New Sector (0%)`,
        badge: 'border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400',
        dot: 'bg-emerald-600 dark:bg-emerald-400',
        bonus: 35,
      };
    } else if (currentPct < 15) {
      return {
        type: 'BALANCED',
        label: `Balanced: ${secName} (${currentPct.toFixed(1)}%)`,
        shortLabel: `Balanced (${currentPct.toFixed(0)}%)`,
        badge: 'border-blue-600/30 bg-blue-600/10 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400',
        dot: 'bg-blue-600 dark:bg-blue-400',
        bonus: 15,
      };
    } else if (currentPct > 25) {
      return {
        type: 'OVERWEIGHT',
        label: `Overweight: ${secName} (${currentPct.toFixed(1)}%)`,
        shortLabel: `Overweight (${currentPct.toFixed(0)}%)`,
        badge: 'border-[#b20808]/30 bg-[#b20808]/10 text-[#8b0909] dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400',
        dot: 'bg-[#b20808] dark:bg-amber-400',
        bonus: -30,
      };
    }
    return {
      type: 'NEUTRAL',
      label: `${secName} (${currentPct.toFixed(1)}%)`,
      shortLabel: `${secName}`,
      badge: 'border-[#b8a597] bg-[#edd9cc] text-[#806350] dark:border-[#363c44] dark:bg-[#1c232d] dark:text-[#958a7a]',
      dot: 'bg-[#806350] dark:bg-[#958a7a]',
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

  // Active candidate for the Overview
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
        return { 
          label: 'Actionable Setup', 
          dot: 'bg-[#2d6a4f] dark:bg-emerald-400', 
          text: 'text-[#2d6a4f] dark:text-emerald-400', 
          badge: 'bg-[#2d6a4f]/10 dark:bg-emerald-500/10 border-[#2d6a4f]/30 dark:border-emerald-500/30' 
        };
      case 'HIGH PRIORITY':
        return { 
          label: 'High Priority', 
          dot: 'bg-[#806350] dark:bg-[#e0d1b9]', 
          text: 'text-[#806350] dark:text-[#e0d1b9]', 
          badge: 'bg-[#806350]/10 dark:bg-[#e0d1b9]/10 border-[#806350]/30 dark:border-[#e0d1b9]/30' 
        };
      case 'WATCHLIST':
        return { 
          label: 'Watchlist', 
          dot: 'bg-amber-600 dark:bg-amber-400', 
          text: 'text-amber-700 dark:text-amber-400', 
          badge: 'bg-amber-500/10 dark:bg-amber-500/10 border-amber-500/30 dark:border-amber-500/30' 
        };
      case 'AVOID / FILTERED OUT':
        return { 
          label: 'Filtered', 
          dot: 'bg-[#b8a597] dark:bg-[#958a7a]', 
          text: 'text-[#806350] dark:text-[#958a7a]', 
          badge: 'bg-[#edd9cc] dark:bg-[#363c44]/40 border-[#b8a597] dark:border-[#363c44]' 
        };
      default:
        return { 
          label: priority, 
          dot: 'bg-[#b8a597] dark:bg-[#958a7a]', 
          text: 'text-[#806350] dark:text-[#958a7a]', 
          badge: 'bg-[#edd9cc] dark:bg-[#363c44]/40 border-[#b8a597] dark:border-[#363c44]' 
        };
    }
  };

  const getStrategyName = (strat) => {
    if (!strat || strat === 'None' || strat === 'SWING_MOMENTUM' || strat === 'NO_ACTIVE_SETUP' || strat === 'NO_SETUP') {
      return 'Market Baseline';
    }
    if (strat.includes("SWEEP")) return "Institutional Liquidity Sweep";
    if (strat.includes("SQUEEZE")) return "Volatility Contraction Breakout";
    if (strat.includes("SNAPBACK")) return "Mean-Reversion Snapback";
    if (strat.includes("BREAKOUT")) return "Momentum Breakout";
    return strat.replace(/_/g, ' ');
  };

  // 4-Point Trade Setup Math (Stop, Entry, T1 2R, T2 3R)
  const spectrumMath = useMemo(() => {
    if (!activeCandidate) return null;
    const c = activeCandidate;
    const price = c.current_price ?? c.technicals?.Trend_Analysis?.Current_Price;
    const stop = c.stop_loss || c.strategy?.active_strategy_result?.stop_price;
    const t1 = c.target_1 || c.strategy?.active_strategy_result?.target_1;
    const t2 = c.target_2 || c.strategy?.active_strategy_result?.target_2;
    const rr = c.risk_reward_ratio || c.strategy?.active_strategy_result?.risk_reward_ratio;

    const atr = Number(c.technicals?.Trend_Analysis?.ATR_14 || (price ? price * 0.035 : 10));
    const effectiveStop = stop != null && Number(stop) < Number(price) ? Number(stop) : (Number(price) - atr * 1.5);
    const effectiveT1 = t1 != null && Number(t1) > Number(price) ? Number(t1) : (Number(price) + (Number(price) - effectiveStop) * 2);
    const effectiveT2 = t2 != null && Number(t2) > Number(effectiveT1) ? Number(t2) : (Number(price) + (Number(price) - effectiveStop) * 3);

    if (effectiveStop < Number(price) && Number(price) < effectiveT1) {
      const s = effectiveStop;
      const p = Number(price);
      const t1Num = effectiveT1;
      const t2Num = effectiveT2;
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
        stop: Number(s.toFixed(1)),
        target1: Number(t1Num.toFixed(1)),
        target2: Number(t2Num.toFixed(1)),
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
    <div className="min-h-[calc(100vh-90px)] p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-[#2d1f17] dark:text-[#e0d1b9]">
      {/* 1. Screener Header & Universe Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#b8a597] dark:border-[#363c44] pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-mono tracking-widest text-[#806350] dark:text-[#958a7a] uppercase font-bold">
              Market Opportunities
            </span>
            <span className="text-[#b8a597] dark:text-[#363c44]">/</span>
            <span className="text-[10px] font-mono text-[#806350] dark:text-[#958a7a]">
              {filteredCandidates.length} Qualified Candidates
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#2d1f17] dark:text-[#e0d1b9] mt-0.5">
            Equity Screener & Opportunity Radar
          </h1>
        </div>

        {/* Screener Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={universeSelect}
            onChange={(e) => {
              const val = e.target.value;
              setUniverseSelect(val);
              try { localStorage.getItem('verchon_scanner_universe', val); } catch {}
              if (val === 'fast3') setLimitCount(3);
            }}
            className="rounded-lg border border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#1c232d] px-3 py-1.5 text-xs font-semibold text-[#2d1f17] dark:text-[#e0d1b9] shadow-sm outline-none cursor-pointer focus:border-[#806350] dark:focus:border-[#e0d1b9] transition"
          >
            <option value="fast3">3-Stock Quick Test</option>
            <option value="nifty50">Nifty 50 Index</option>
            <option value="nifty100">Nifty 100 Index</option>
            <option value="niftymidcap100">Nifty Midcap 100</option>
            <option value="nifty500">Nifty 500 Index</option>
          </select>

          <button
            onClick={handleScanSubmit}
            disabled={loadingScan}
            className="flex items-center space-x-2 rounded-lg bg-[#806350] hover:bg-[#6c5342] text-[#edd9cc] dark:bg-[#e0d1b9] dark:hover:bg-[#e0d1b9]/90 dark:text-[#1c232d] px-4 py-1.5 text-xs font-bold shadow-sm transition active:scale-95"
          >
            <Play className={`h-3 w-3 fill-current ${loadingScan ? 'animate-pulse' : ''}`} />
            <span>{loadingScan ? `Scanning (${scanElapsed}s)...` : 'Run Scanner'}</span>
          </button>

          {candidates.length > 0 && (
            <button
              onClick={() => {
                if (!aiReport && !loadingAI) onGenerateAIReport();
                setIsDrawerOpen(true);
              }}
              disabled={loadingAI}
              className="flex items-center space-x-1.5 rounded-lg border border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#222b37] px-3 py-1.5 text-xs font-semibold text-[#2d1f17] dark:text-[#e0d1b9] hover:border-[#806350] dark:hover:border-[#e0d1b9] transition"
            >
              <Sparkles className={`h-3.5 w-3.5 text-[#806350] dark:text-[#e0d1b9] ${loadingAI ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{loadingAI ? `Synthesizing (${aiElapsed}s)...` : 'Executive Summary'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Screener State / Main View */}
      {loadingScan ? (
        <div className="rounded-2xl border border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#1c232d] p-16 text-center shadow-lg">
          <div className="relative mb-3 flex h-12 w-12 items-center justify-center mx-auto">
            <div className="absolute inset-0 animate-ping rounded-full bg-[#806350]/15 dark:bg-[#e0d1b9]/10" />
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#806350] dark:bg-[#e0d1b9] text-[#edd9cc] dark:text-[#1c232d]">
              <Play className="h-4 w-4 fill-current animate-pulse ml-0.5" />
            </div>
          </div>
          <div className="text-sm font-bold text-[#2d1f17] dark:text-[#e0d1b9]">
            Scanning Market Universe...
          </div>
          <div className="mt-1 text-xs text-[#806350] dark:text-[#958a7a] max-w-sm mx-auto">
            Filtering trend structure, computing 50 DMA relative distance, verifying balance sheet solvency, and scoring active swing setups.
          </div>
        </div>
      ) : candidates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#b8a597] dark:border-[#363c44] p-16 text-center bg-[#f7ede5]/60 dark:bg-[#1c232d]/40">
          <Compass className="h-8 w-8 text-[#806350] dark:text-[#958a7a] mx-auto mb-2 opacity-60" />
          <h3 className="text-sm font-semibold text-[#2d1f17] dark:text-[#e0d1b9]">No Active Candidates Screened</h3>
          <p className="mt-1 text-xs text-[#806350] dark:text-[#958a7a] max-w-xs mx-auto">
            Click "Run Scanner" above to screen the selected index and identify qualified setups.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* =================================================================
              LEFT: OPPORTUNITIES STREAM (Candidates List)
              ================================================================= */}
          <div className="lg:col-span-5 space-y-3">
            {/* Filter Pills & Quick Search */}
            <div className="flex items-center justify-between gap-2 border-b border-[#b8a597] dark:border-[#363c44] pb-3">
              <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar py-0.5">
                {[
                  { id: 'ALL', label: 'All' },
                  { id: 'SIGNAL TRIGGERED', label: 'Actionable' },
                  { id: 'HIGH PRIORITY', label: 'Priority' },
                  { id: 'WATCHLIST', label: 'Watchlist' },
                  { id: 'SECTOR DIVERSITY', label: 'Sector Gap' },
                ].map((p) => {
                  const isSel = filterPriority === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setFilterPriority(p.id);
                        if (p.id !== 'SECTOR DIVERSITY') setSelectedSectorFilter(null);
                      }}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition shrink-0 ${
                        isSel
                          ? 'bg-[#806350] text-[#edd9cc] dark:bg-[#e0d1b9] dark:text-[#1c232d] shadow-sm'
                          : 'text-[#806350] dark:text-[#958a7a] hover:text-[#2d1f17] dark:hover:text-[#e0d1b9] hover:bg-[#edd9cc] dark:hover:bg-[#222b37]'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              <div className="relative shrink-0">
                <Search className="pointer-events-none absolute left-2.5 top-2 h-3 w-3 text-[#806350] dark:text-[#958a7a]" />
                <input
                  type="text"
                  placeholder="Search ticker..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-32 rounded-md border border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#1c232d] pl-7 pr-2 py-1 text-xs text-[#2d1f17] dark:text-[#e0d1b9] outline-none focus:border-[#806350] dark:focus:border-[#e0d1b9] transition placeholder-[#806350]/60 dark:placeholder-[#958a7a]/60"
                />
              </div>
            </div>

            {/* Sector Gap Missing Sector Chips (When Sector Diversity Active) */}
            {filterPriority === 'SECTOR DIVERSITY' && (
              <div className="rounded-xl border border-emerald-600/30 dark:border-emerald-500/20 bg-emerald-600/[0.06] dark:bg-emerald-500/[0.04] p-3 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-emerald-800 dark:text-emerald-400">
                    Portfolio Sector Gaps (0% Exposure)
                  </span>
                  {selectedSectorFilter && (
                    <button
                      onClick={() => setSelectedSectorFilter(null)}
                      className="text-[10px] text-[#806350] dark:text-[#958a7a] hover:text-[#2d1f17] dark:hover:text-[#e0d1b9] underline"
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
                          className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                            isSel
                              ? 'bg-emerald-700 text-white font-bold'
                              : 'bg-emerald-600/15 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-300 hover:bg-emerald-600/25'
                          }`}
                        >
                          {sec} <span className="opacity-70 text-[10px]">({count})</span>
                        </button>
                      );
                    })
                  ) : (
                    <span className="text-[11px] text-[#806350] dark:text-[#958a7a]">All scanned sectors currently represented in portfolio.</span>
                  )}
                </div>
              </div>
            )}

            {/* The Candidate Stream List */}
            <div className="space-y-2 max-h-[680px] overflow-y-auto pr-1">
              {filteredCandidates.map((c) => {
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
                    className={`relative flex items-center justify-between rounded-xl p-3 cursor-pointer transition border ${
                      isSelected
                        ? 'bg-[#edd9cc] border-[#806350] shadow-xs dark:bg-[#242c38] dark:border-[#e0d1b9]'
                        : 'bg-[#f7ede5] border-[#b8a597]/70 hover:border-[#806350] dark:bg-[#1c232d] dark:border-[#2d3642] dark:hover:border-[#4a5568]'
                    }`}
                  >
                    {/* Left: Ticker & Sector */}
                    <div className="flex items-center space-x-3">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-sm tracking-tight text-[#2d1f17] dark:text-[#e0d1b9]">
                            {c.ticker.replace('.NS', '')}
                          </span>
                          <span className={`h-1.5 w-1.5 rounded-full ${mood.dot} shadow-xs`} />
                          {impact && (
                            <span className={`h-1.5 w-1.5 rounded-full ${impact.dot}`} title={impact.label} />
                          )}
                          {(c.is_earnings_lockout || (c.days_to_earnings != null && c.days_to_earnings <= 5) || c.event_risk?.has_event_risk) && (
                            <span className="rounded bg-rose-500/15 border border-rose-500/30 px-1 py-0.2 text-[8px] font-mono font-bold text-rose-700 dark:text-rose-400">
                              {c.days_to_earnings != null ? `⚠️ D-${c.days_to_earnings}` : '⚠️ EVENT'}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#806350] dark:text-[#958a7a] truncate max-w-[170px] mt-0.5">
                          {c.name || c.company_name}
                        </div>
                        <div className="text-[10px] text-[#806350]/80 dark:text-[#958a7a]/80 font-mono mt-0.5">
                          {strat}
                        </div>
                      </div>
                    </div>

                    {/* Right: Price & Distance vs 50D */}
                    <div className="text-right">
                      <div className="font-mono font-bold text-xs text-[#2d1f17] dark:text-[#e0d1b9]">
                        {price != null ? `₹${Number(price).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : '—'}
                      </div>
                      <div className="text-[10px] text-[#806350] dark:text-[#958a7a] font-mono flex items-center justify-end space-x-1.5 mt-0.5">
                        {dmaDist != null && (
                          <span className={dmaDist >= 0 ? 'text-[#2d6a4f] dark:text-emerald-400 font-semibold' : 'text-[#b20808] dark:text-rose-400 font-semibold'}>
                            {dmaDist > 0 ? '+' : ''}{dmaDist}% 50D
                          </span>
                        )}
                        {rvol != null && Number(rvol) >= 1.2 && (
                          <span className="text-amber-700 dark:text-amber-400 font-bold bg-amber-500/10 px-1 rounded">
                            {Number(rvol).toFixed(1)}x
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
              RIGHT: STOCK OVERVIEW & TRADE SETUP
              ================================================================= */}
          <div className="lg:col-span-7">
            {activeCandidate ? (
              <div 
                key={activeCandidate.ticker}
                className="rounded-2xl border border-[#b8a597] dark:border-[#2d3642] bg-[#f7ede5] dark:bg-[#1c232d] p-6 space-y-6 shadow-sm"
              >
                {/* 1. Header Information */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between border-b border-[#b8a597] dark:border-[#2d3642] pb-5 gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded border border-[#b8a597] dark:border-[#363c44] bg-[#edd9cc] dark:bg-[#222b37] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#806350] dark:text-[#958a7a]">
                        NSE · {activeCandidate.fundamentals?.company_type || 'LARGE_CAP'}
                      </span>
                      <span className="text-[#b8a597] dark:text-[#363c44]">·</span>
                      <span className="text-xs text-[#806350] dark:text-[#958a7a] font-medium">
                        {activeCandidate.sector || activeCandidate.fundamentals?.sector || 'Industrial Market'}
                      </span>
                    </div>

                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#2d1f17] dark:text-[#e0d1b9] mt-1.5">
                      {activeCandidate.ticker.replace('.NS', '')}
                    </h2>
                    <p className="text-xs text-[#806350] dark:text-[#958a7a] mt-0.5">
                      {activeCandidate.name} · {activeCandidate.industry || activeCandidate.fundamentals?.industry || 'Core Equities'}
                    </p>

                    {/* Sector Diversification Pill */}
                    {(() => {
                      const impact = getSectorImpactInfo(activeCandidate.sector || activeCandidate.fundamentals?.sector);
                      if (!impact) return null;
                      return (
                        <div className="mt-2 flex items-center">
                          <span className={`inline-flex items-center space-x-1.5 rounded-md px-2 py-0.5 text-xs font-medium border ${impact.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${impact.dot}`} />
                            <span>{impact.label}</span>
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Top Right: Live Price Hero */}
                  <div className="text-left sm:text-right">
                    <div className="text-[11px] font-mono text-[#806350] dark:text-[#958a7a] uppercase tracking-wider">Current Market Price</div>
                    <div className="font-mono text-2xl sm:text-3xl font-bold text-[#2d1f17] dark:text-[#e0d1b9] tracking-tight mt-0.5">
                      {spectrumMath?.price != null ? `₹${Number(spectrumMath.price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </div>
                    <div className="flex flex-wrap sm:justify-end gap-2 text-xs font-semibold mt-1 font-mono">
                      {activeCandidate.technicals?.Trend_Analysis?.['Dist_50_DMA_%'] != null && (
                        <span className={activeCandidate.technicals.Trend_Analysis['Dist_50_DMA_%'] >= 0 ? 'text-[#2d6a4f] dark:text-emerald-400' : 'text-[#b20808] dark:text-rose-400'}>
                          {activeCandidate.technicals.Trend_Analysis['Dist_50_DMA_%'] > 0 ? '+' : ''}{activeCandidate.technicals.Trend_Analysis['Dist_50_DMA_%']}% vs 50D
                        </span>
                      )}
                      {activeCandidate.technicals?.Trend_Analysis?.['Dist_200_DMA_%'] != null && (
                        <span className="text-[#806350] dark:text-[#958a7a]">
                          ({activeCandidate.technicals.Trend_Analysis['Dist_200_DMA_%'] > 0 ? '+' : ''}{activeCandidate.technicals.Trend_Analysis['Dist_200_DMA_%']}% vs 200D)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Pre-Earnings Event Lockout Warning Banner */}
                {(activeCandidate.is_earnings_lockout || (activeCandidate.days_to_earnings != null && activeCandidate.days_to_earnings <= 5) || activeCandidate.event_risk?.has_event_risk) && (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-500/[0.08] dark:bg-rose-500/[0.06] p-3 text-xs flex items-start space-x-2.5">
                    <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-rose-700 dark:text-rose-400 font-mono text-[11px] uppercase tracking-wider block">
                        Pre-Earnings Lockout Active (Binary Event Risk)
                      </span>
                      <p className="text-zinc-700 dark:text-zinc-300 mt-0.5 leading-relaxed text-[11px]">
                        {activeCandidate.days_to_earnings != null
                          ? `Quarterly results announcement scheduled in ${activeCandidate.days_to_earnings} day${activeCandidate.days_to_earnings !== 1 ? 's' : ''} (${activeCandidate.next_earnings_date || 'Upcoming'}). Initiating swing momentum setups directly before earnings incurs extreme overnight gap-down exposure.`
                          : activeCandidate.event_risk?.event_warning || 'Active corporate board meeting / results event within immediate swing window. Verify binary event calendar before committing capital.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* 2. Strategy Analysis & Priority */}
                <div className="border-b border-[#b8a597] dark:border-[#363c44] pb-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono tracking-wider text-[#806350] dark:text-[#958a7a] uppercase font-semibold">
                      Strategy Qualification
                    </span>
                    <span className={`rounded-md px-2.5 py-0.5 text-xs font-semibold border ${getPriorityMood(activeCandidate.priority).badge} ${getPriorityMood(activeCandidate.priority).text}`}>
                      {getPriorityMood(activeCandidate.priority).label}
                    </span>
                  </div>

                  <div className="text-sm font-bold text-[#2d1f17] dark:text-[#e0d1b9] tracking-tight">
                    {getStrategyName(activeCandidate.setup_type || activeCandidate.strategy?.primary_strategy)}
                  </div>

                  <p className="text-xs text-[#806350] dark:text-[#958a7a] mt-1.5 leading-relaxed">
                    {activeCandidate.priority_reason || 
                      "Deterministic multi-factor qualification confirmed. Balance sheet solvency verified against debt-to-equity and valuation parameters."}
                  </p>
                </div>

                {/* 3. Trade Setup & Risk Management */}
                <div className="border-b border-[#b8a597] dark:border-[#363c44] pb-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-mono tracking-wider text-[#806350] dark:text-[#958a7a] uppercase font-semibold">
                      Trade Setup & Risk Management
                    </span>
                    {spectrumMath?.hasValid && (
                      <span className="text-xs font-bold font-mono text-[#2d1f17] dark:text-[#e0d1b9] bg-[#edd9cc] dark:bg-[#222b37] border border-[#b8a597] dark:border-[#363c44] px-2.5 py-0.5 rounded">
                        T1 {spectrumMath.rr1}R · T2 {spectrumMath.rr2}R Runner
                      </span>
                    )}
                  </div>

                  {spectrumMath?.hasValid ? (
                    <div className="space-y-3">
                      {/* 4 Execution Metric Cards (Clean Apple Flat Style) */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-center">
                        <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-2.5 border border-[#b20808]/30 dark:border-rose-500/20">
                          <div className="text-[10px] text-[#b20808] dark:text-rose-400 font-bold uppercase tracking-wider">Stop Loss</div>
                          <div className="text-sm font-bold text-[#b20808] dark:text-rose-400 font-mono mt-0.5">₹{spectrumMath.stop}</div>
                          <div className="text-[10px] text-[#806350] dark:text-[#958a7a]">-{spectrumMath.riskPct}% (₹{spectrumMath.riskRupees})</div>
                        </div>

                        <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-2.5 border border-[#b8a597] dark:border-[#2d3642]">
                          <div className="text-[10px] text-[#2d1f17] dark:text-[#e0d1b9] font-bold uppercase tracking-wider">Entry Price</div>
                          <div className="text-sm font-bold text-[#2d1f17] dark:text-[#e0d1b9] font-mono mt-0.5">₹{spectrumMath.price.toFixed(1)}</div>
                          <div className="text-[10px] text-[#806350] dark:text-[#958a7a]">Current Market</div>
                        </div>

                        <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-2.5 border border-emerald-600/30 dark:border-emerald-500/20">
                          <div className="text-[10px] text-[#2d6a4f] dark:text-emerald-400 font-bold uppercase tracking-wider">Target 1 (2R)</div>
                          <div className="text-sm font-bold text-[#2d6a4f] dark:text-emerald-400 font-mono mt-0.5">₹{spectrumMath.target1.toFixed(1)}</div>
                          <div className="text-[10px] text-[#806350] dark:text-[#958a7a]">+{spectrumMath.t1RewardPct}% (₹{spectrumMath.t1RewardRupees})</div>
                        </div>

                        <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-2.5 border border-indigo-600/30 dark:border-indigo-500/20">
                          <div className="text-[10px] text-indigo-700 dark:text-indigo-400 font-bold uppercase tracking-wider">Target 2 (3R)</div>
                          <div className="text-sm font-bold text-indigo-700 dark:text-indigo-400 font-mono mt-0.5">₹{spectrumMath.target2.toFixed(1)}</div>
                          <div className="text-[10px] text-[#806350] dark:text-[#958a7a]">+{spectrumMath.t2RewardPct}% (₹{spectrumMath.t2RewardRupees})</div>
                        </div>
                      </div>

                      {/* Clean Range Scale Bar */}
                      <div className="relative pt-2 pb-1">
                        <div className="h-1.5 w-full rounded-full bg-[#edd9cc] dark:bg-[#13171e] overflow-hidden flex border border-[#b8a597]/40 dark:border-[#2d3642]">
                          <div style={{ width: `${spectrumMath.needlePosPct}%` }} className="bg-[#b20808] dark:bg-rose-500 h-full" />
                          <div style={{ width: `${Math.max(0, (spectrumMath.t1MarkerPct || 70) - spectrumMath.needlePosPct)}%` }} className="bg-[#2d6a4f] dark:bg-emerald-500 h-full" />
                          <div style={{ width: `${Math.max(0, 100 - (spectrumMath.t1MarkerPct || 70))}%` }} className="bg-indigo-600 dark:bg-indigo-500 h-full" />
                        </div>
                      </div>

                      <div className="text-[11px] text-[#806350] dark:text-[#958a7a] text-center font-medium">
                        Risking <strong className="text-[#b20808] dark:text-rose-400 font-semibold">₹{spectrumMath.riskRupees}</strong> ({spectrumMath.riskPct}%) per share to capture <strong className="text-[#2d6a4f] dark:text-emerald-400 font-semibold">₹{spectrumMath.t1RewardRupees}</strong> at Target 1 ({spectrumMath.rr1}:1 R:R) and <strong className="text-indigo-700 dark:text-indigo-400 font-semibold">₹{spectrumMath.t2RewardRupees}</strong> at Target 2 ({spectrumMath.rr2}:1 R:R).
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-3 text-center text-xs text-[#806350] dark:text-[#958a7a] border border-[#b8a597] dark:border-[#2d3642]">
                      No active trade range qualified for this baseline candidate.
                    </div>
                  )}
                </div>

                {/* 4. Technical Indicators */}
                <div className="border-b border-[#b8a597] dark:border-[#2d3642] pb-5">
                  <div className="text-[11px] font-mono tracking-wider text-[#806350] dark:text-[#958a7a] uppercase font-semibold mb-3">
                    Technical Indicators & Price Action
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
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-center">
                        <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-2.5 border border-[#b8a597] dark:border-[#2d3642]">
                          <div className="text-[9px] text-[#806350] dark:text-[#958a7a] font-bold uppercase">RSI (14)</div>
                          <div className="text-sm font-bold text-[#2d1f17] dark:text-[#e0d1b9] mt-0.5">
                            {rsi != null ? Number(rsi).toFixed(1) : '—'}
                          </div>
                          <div className="text-[9px] text-[#806350] dark:text-[#958a7a] mt-0.5">
                            {rsi != null ? (rsi >= 70 ? 'Overbought' : rsi <= 35 ? 'Oversold' : rsi >= 55 ? 'Bullish' : 'Neutral') : 'Standard'}
                          </div>
                        </div>

                        <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-2.5 border border-[#b8a597] dark:border-[#2d3642]">
                          <div className="text-[9px] text-[#806350] dark:text-[#958a7a] font-bold uppercase">ATR (14)</div>
                          <div className="text-sm font-bold text-[#2d1f17] dark:text-[#e0d1b9] mt-0.5">
                            {atr != null ? `₹${Number(atr).toFixed(1)}` : '—'}
                          </div>
                          <div className="text-[9px] text-[#806350] dark:text-[#958a7a] mt-0.5">Daily Volatility</div>
                        </div>

                        <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-2.5 border border-[#b8a597] dark:border-[#2d3642]">
                          <div className="text-[9px] text-[#806350] dark:text-[#958a7a] font-bold uppercase">50 DMA</div>
                          <div className="text-sm font-bold text-[#2d1f17] dark:text-[#e0d1b9] mt-0.5">
                            {dma50 != null ? `₹${Number(dma50).toFixed(1)}` : '—'}
                          </div>
                          <div className={`text-[9px] mt-0.5 font-bold ${trend['Dist_50_DMA_%'] >= 0 ? 'text-[#2d6a4f] dark:text-emerald-400' : 'text-[#b20808] dark:text-rose-400'}`}>
                            {trend['Dist_50_DMA_%'] != null ? `${trend['Dist_50_DMA_%'] > 0 ? '+' : ''}${trend['Dist_50_DMA_%']}%` : '—'}
                          </div>
                        </div>

                        <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-2.5 border border-[#b8a597] dark:border-[#2d3642]">
                          <div className="text-[9px] text-[#806350] dark:text-[#958a7a] font-bold uppercase">200 DMA</div>
                          <div className="text-sm font-bold text-[#2d1f17] dark:text-[#e0d1b9] mt-0.5">
                            {dma200 != null ? `₹${Number(dma200).toFixed(1)}` : '—'}
                          </div>
                          <div className={`text-[9px] mt-0.5 font-bold ${trend['Dist_200_DMA_%'] >= 0 ? 'text-[#2d6a4f] dark:text-emerald-400' : 'text-[#b20808] dark:text-rose-400'}`}>
                            {trend['Dist_200_DMA_%'] != null ? `${trend['Dist_200_DMA_%'] > 0 ? '+' : ''}${trend['Dist_200_DMA_%']}%` : '—'}
                          </div>
                        </div>

                        <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-2.5 border border-[#b8a597] dark:border-[#2d3642]">
                          <div className="text-[9px] text-[#806350] dark:text-[#958a7a] font-bold uppercase">RVOL Surge</div>
                          <div className="text-sm font-bold text-[#2d1f17] dark:text-[#e0d1b9] mt-0.5">
                            {rvol != null ? `${Number(rvol).toFixed(2)}x` : '1.0x'}
                          </div>
                          <div className="text-[9px] text-[#806350] dark:text-[#958a7a] font-semibold mt-0.5">
                            {vol.Volume_Surge ? 'Surge Active' : (rvol != null && rvol >= 1.2 ? 'Elevated' : 'Normal')}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* 5. Fundamental Solvency & Valuation */}
                <div className="border-b border-[#b8a597] dark:border-[#2d3642] pb-5">
                  <div className="text-[11px] font-mono tracking-wider text-[#806350] dark:text-[#958a7a] uppercase font-semibold mb-3">
                    Fundamental Solvency & Scoring
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center mb-3">
                    <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-3 border border-[#b8a597] dark:border-[#2d3642]">
                      <div className="text-[10px] font-mono text-[#806350] dark:text-[#958a7a] font-bold uppercase tracking-wider">Composite Health</div>
                      <div className="text-xl font-bold text-[#2d6a4f] dark:text-emerald-400 font-mono mt-0.5 tracking-tight">
                        {activeCandidate.overall_score ?? '—'}<span className="text-xs text-[#806350] dark:text-[#958a7a]">/100</span>
                      </div>
                    </div>

                    <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-3 border border-[#b8a597] dark:border-[#2d3642]">
                      <div className="text-[10px] font-mono text-[#806350] dark:text-[#958a7a] font-bold uppercase tracking-wider">Solvency Score</div>
                      <div className="text-xl font-bold text-blue-700 dark:text-blue-400 font-mono mt-0.5 tracking-tight">
                        {activeCandidate.fundamentals?.fundamental_score ?? '—'}<span className="text-xs text-[#806350] dark:text-[#958a7a]">/100</span>
                      </div>
                    </div>

                    <div className="rounded-lg bg-[#edd9cc] dark:bg-[#13171e] p-3 border border-[#b8a597] dark:border-[#2d3642]">
                      <div className="text-[10px] font-mono text-[#806350] dark:text-[#958a7a] font-bold uppercase tracking-wider">Chart Structure</div>
                      <div className="text-xl font-bold text-[#2d1f17] dark:text-[#e0d1b9] font-mono mt-0.5 tracking-tight">
                        {activeCandidate.technicals?.Scoring_Summary?.Technical_Score ?? '—'}<span className="text-xs text-[#806350] dark:text-[#958a7a]">/100</span>
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
                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-[#806350] dark:text-[#958a7a] pt-1">
                        <div>
                          Valuation:{' '}
                          <span className="font-semibold text-[#2d1f17] dark:text-[#e0d1b9]">
                            P/E {val.pe ? `${val.pe}x` : '—'} · P/B {val.pb ? `${val.pb}x` : '—'}
                          </span>
                        </div>
                        <div>
                          Solvency:{' '}
                          <span className="font-semibold text-[#2d1f17] dark:text-[#e0d1b9]">
                            Debt-to-Equity {de != null ? Number(de).toFixed(2) : 'Safe'}
                          </span>
                        </div>
                        {roe != null && (
                          <div>
                            Return on Equity:{' '}
                            <span className="font-semibold text-[#2d6a4f] dark:text-emerald-400">
                              {roe}%
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* 6. Algorithmic Setup Verification */}
                <div className="border-b border-[#b8a597] dark:border-[#363c44] pb-4">
                  <div className="text-[11px] font-mono tracking-wider text-[#806350] dark:text-[#958a7a] uppercase font-semibold mb-2.5">
                    Algorithmic Setup Verification
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="flex items-center space-x-1.5 text-[#806350] dark:text-[#958a7a]">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="truncate">Trend Structure Safe</span>
                    </div>
                    <div className="flex items-center space-x-1.5 text-[#806350] dark:text-[#958a7a]">
                      <ShieldCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span className="truncate">Balance Sheet Safe</span>
                    </div>
                    <div className="flex items-center space-x-1.5 text-[#806350] dark:text-[#958a7a]">
                      <Activity className="h-3.5 w-3.5 text-[#806350] dark:text-[#e0d1b9] shrink-0" />
                      <span className="truncate">Volatility ATR Valid</span>
                    </div>
                    <div className="flex items-center space-x-1.5 text-[#806350] dark:text-[#958a7a]">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="truncate">Event Risk Clean</span>
                    </div>
                  </div>
                </div>

                {/* 7. Macro Regime Warning Pill (If Hostile) */}
                {isHostile && (
                  <div className="rounded-lg bg-[#b20808]/10 dark:bg-rose-500/10 border border-[#b20808]/30 dark:border-rose-500/25 p-3 flex items-center space-x-3">
                    <ShieldAlert className="h-4 w-4 text-[#8b0909] dark:text-rose-400 shrink-0" />
                    <div className="text-xs text-[#2d1f17] dark:text-[#e0d1b9]">
                      <strong className="text-[#8b0909] dark:text-rose-400 font-semibold">Macro Sizing Warning:</strong> Market regime is in downdraft (Score: {regimeScore}/100). Enforcing 50% position sizing on paper trades.
                    </div>
                  </div>
                )}

                {/* 8. Action Console */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <button
                    onClick={() => onSelectCandidate(activeCandidate.ticker)}
                    className="w-full sm:w-auto flex items-center justify-center space-x-1.5 text-xs font-semibold text-[#806350] dark:text-[#958a7a] hover:text-[#2d1f17] dark:hover:text-[#e0d1b9] transition py-2 px-3 border border-[#b8a597] dark:border-[#363c44] rounded-lg hover:border-[#806350] dark:hover:border-[#e0d1b9]"
                  >
                    <span>Open Deep Dive Analysis</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>

                  <button
                    onClick={() => {
                      if (onOpenTradeModal) {
                        onOpenTradeModal(activeCandidate.ticker, activeCandidate.setup_type || activeCandidate.strategy?.primary_strategy);
                      }
                    }}
                    className="w-full sm:w-auto rounded-lg bg-[#806350] hover:bg-[#6c5342] text-[#edd9cc] dark:bg-[#e0d1b9] dark:hover:bg-[#e0d1b9]/90 dark:text-[#1c232d] font-bold px-6 py-2.5 text-xs shadow transition active:scale-95"
                  >
                    Place Paper Order
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
          <div className="relative h-full w-full max-w-2xl overflow-y-auto border-l border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#1c232d] p-6 sm:p-8 shadow-2xl transition-colors text-[#2d1f17] dark:text-[#e0d1b9]">
            <div className="sticky top-0 mb-6 flex items-center justify-between border-b border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5]/95 dark:bg-[#1c232d]/95 pb-4 backdrop-blur z-10">
              <div className="flex items-center space-x-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#edd9cc] dark:bg-[#222b37] text-[#806350] dark:text-[#e0d1b9] border border-[#b8a597] dark:border-[#363c44]">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-[#2d1f17] dark:text-[#e0d1b9]">
                    Executive Market Synthesis
                  </h2>
                  <p className="text-xs text-[#806350] dark:text-[#958a7a]">Institutional quantitative summary across screened candidates</p>
                </div>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="rounded-lg border border-[#b8a597] dark:border-[#363c44] p-2 text-[#806350] dark:text-[#958a7a] hover:text-[#2d1f17] dark:hover:text-[#e0d1b9] hover:bg-[#edd9cc] dark:hover:bg-[#222b37] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loadingAI ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Sparkles className="mb-3 h-8 w-8 animate-spin text-[#806350] dark:text-[#e0d1b9]" />
                <div className="text-sm font-semibold text-[#2d1f17] dark:text-[#e0d1b9]">
                  Synthesizing Market Intelligence...
                </div>
                <div className="mt-1 font-mono text-xs text-[#806350] dark:text-[#958a7a]">
                  Elapsed: {aiElapsed}s
                </div>
              </div>
            ) : aiReport ? (
              <div className="prose dark:prose-invert max-w-none text-xs leading-relaxed space-y-4 text-[#2d1f17] dark:text-[#e0d1b9]">
                <ReactMarkdown>{aiReport}</ReactMarkdown>
              </div>
            ) : (
              <div className="py-16 text-center text-xs text-[#806350] dark:text-[#958a7a]">
                No summary generated yet. Click "Executive Summary" to synthesize insights.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
