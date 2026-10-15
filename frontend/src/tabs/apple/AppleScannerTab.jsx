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
  LayoutGrid,
  List,
  Search,
  ChevronUp,
  ChevronDown,
  Info
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

  // View mode: 'cards' or 'dense'
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('verchon_apple_scanner_view') || 'cards';
    } catch {
      return 'cards';
    }
  });

  const handleSetViewMode = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('verchon_apple_scanner_view', mode);
    } catch {}
  };

  const [filterPriority, setFilterPriority] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSectorFilter, setSelectedSectorFilter] = useState(null);
  const [portfolioSectors, setPortfolioSectors] = useState([]);
  const [isAdvisoryDismissed, setIsAdvisoryDismissed] = useState(false);

  const [sortConfig, setSortConfig] = useState({ key: 'overall_score', direction: 'desc' });

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

  // Identify all scanned sectors and those missing
  const allScannedSectors = useMemo(() => {
    return Array.from(
      new Set(candidates.map((c) => c.sector || c.fundamentals?.sector).filter(Boolean))
    );
  }, [candidates]);

  // Unified Filtering & Sorting
  const filteredAndSortedCandidates = useMemo(() => {
    let result = candidates.filter((c) => {
      // 1. Text Search Filter
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const tickerMatch = (c.ticker || '').toLowerCase().includes(query);
        const nameMatch = (c.name || c.company_name || '').toLowerCase().includes(query);
        const sectorMatch = (c.sector || c.fundamentals?.sector || '').toLowerCase().includes(query);
        const setupMatch = (c.setup_type || '').toLowerCase().includes(query);
        if (!tickerMatch && !nameMatch && !sectorMatch && !setupMatch) {
          return false;
        }
      }

      // 2. Priority Filter
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

    // 3. Sorting
    result.sort((a, b) => {
      let valA, valB;
      const key = sortConfig.key;

      if (key === 'ticker') {
        valA = a.ticker || '';
        valB = b.ticker || '';
        return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (key === 'current_price') {
        valA = a.current_price ?? a.technicals?.Trend_Analysis?.Current_Price ?? 0;
        valB = b.current_price ?? b.technicals?.Trend_Analysis?.Current_Price ?? 0;
      } else if (key === 'fundamental_score') {
        valA = a.fundamentals?.fundamental_score ?? 0;
        valB = b.fundamentals?.fundamental_score ?? 0;
      } else if (key === 'technical_score') {
        valA = a.technicals?.Scoring_Summary?.Technical_Score ?? 0;
        valB = b.technicals?.Scoring_Summary?.Technical_Score ?? 0;
      } else if (key === 'risk_reward_ratio') {
        valA = a.risk_reward_ratio ?? a.strategy?.active_strategy_result?.risk_reward_ratio ?? 0;
        valB = b.risk_reward_ratio ?? b.strategy?.active_strategy_result?.risk_reward_ratio ?? 0;
      } else {
        valA = a.overall_score ?? 0;
        valB = b.overall_score ?? 0;
      }

      return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
    });

    return result;
  }, [candidates, filterPriority, selectedSectorFilter, searchQuery, sortConfig]);

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'desc' };
    });
  };

  const handleScanSubmit = () => {
    if (universeSelect === 'fast3') {
      onRunScan({ tickers: ['ICICIBANK.NS', 'TCS.NS', 'IDEA.NS'], limit: 3 });
    } else {
      onRunScan({ universe: universeSelect, limit: Number(limitCount) });
    }
  };

  const getHumanPriorityPill = (priority) => {
    switch (priority) {
      case 'SIGNAL TRIGGERED':
        return { label: 'Actionable Setup', style: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold' };
      case 'HIGH PRIORITY':
        return { label: 'High Priority', style: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 font-semibold' };
      case 'WATCHLIST':
        return { label: 'Watchlist', style: 'bg-black/[0.04] dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300' };
      case 'AVOID / FILTERED OUT':
        return { label: 'On Pause', style: 'bg-rose-500/10 text-rose-700 dark:text-rose-400' };
      default:
        return { label: priority, style: 'bg-black/[0.04] dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300' };
    }
  };

  const getStrategyTitle = (strat) => {
    if (!strat || strat === 'None' || strat === 'SWING_MOMENTUM' || strat === 'NO_ACTIVE_SETUP' || strat === 'NO_SETUP') {
      return null;
    }
    if (strat.includes("SWEEP")) return "Institutional Liquidity Sweep";
    if (strat.includes("SQUEEZE")) return "Volatility Contraction Breakout";
    if (strat.includes("SNAPBACK")) return "Mean-Reversion Snapback";
    if (strat.includes("BREAKOUT")) return "Momentum Continuation";
    return strat.replace(/_/g, ' ');
  };

  return (
    <div className="min-h-[calc(100vh-100px)] p-5 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* 1. Calm Editorial Toolbar */}
      <div className="rounded-3xl border border-black/[0.06] dark:border-white/[0.07] bg-white dark:bg-[#121319] p-5 shadow-sm backdrop-blur-xl transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: Scan Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Market Universe</label>
              <select
                value={universeSelect}
                onChange={(e) => {
                  const val = e.target.value;
                  setUniverseSelect(val);
                  try {
                    localStorage.setItem('verchon_scanner_universe', val);
                  } catch {}
                  if (val === 'fast3') setLimitCount(3);
                }}
                className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-100 outline-none hover:border-black/20 dark:hover:border-white/20 transition"
              >
                <option value="fast3">⚡ 3-Stock Fast Test (ICICI, TCS, IDEA)</option>
                <option value="nifty50">Nifty 50 Index</option>
                <option value="nifty100">Nifty 100 Index</option>
                <option value="niftymidcap100">Nifty Midcap 100</option>
                <option value="nifty500">Nifty 500 Index (500 Stocks)</option>
                <option value="niftytotalmarket">Total Market Index (750 Stocks)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Candidate Limit</label>
              <select
                value={universeSelect === 'fast3' ? 3 : limitCount}
                onChange={(e) => {
                  const val = e.target.value;
                  setLimitCount(val);
                  try {
                    localStorage.setItem('verchon_scanner_limit', val);
                  } catch {}
                }}
                disabled={universeSelect === 'fast3'}
                className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-100 outline-none hover:border-black/20 dark:hover:border-white/20 transition"
              >
                <option value="3">3 Candidates</option>
                <option value="10">10 Candidates</option>
                <option value="25">25 Candidates</option>
                <option value="50">50 Candidates</option>
                <option value="100">100 Candidates</option>
              </select>
            </div>

            {/* Run Button */}
            <div className="self-end">
              <button
                onClick={handleScanSubmit}
                disabled={loadingScan}
                className="flex items-center space-x-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 text-white px-5 py-2 text-xs font-semibold shadow-sm transition active:scale-95"
              >
                <Play className={`h-3.5 w-3.5 fill-current ${loadingScan ? 'animate-pulse' : ''}`} />
                <span>{loadingScan ? `Scanning (${scanElapsed}s)...` : 'Screen Market'}</span>
              </button>
            </div>
          </div>

          {/* Right: Search & View Mode Switcher */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Live Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Search stock, sector, setup..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-52 rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.03] pl-9 pr-3 py-2 text-xs text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 outline-none hover:border-black/20 dark:hover:border-white/20 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* View Switcher */}
            <div className="flex items-center rounded-xl bg-black/[0.04] dark:bg-white/[0.05] p-0.5">
              <button
                onClick={() => handleSetViewMode('cards')}
                className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  viewMode === 'cards'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Cards</span>
              </button>

              <button
                onClick={() => handleSetViewMode('dense')}
                className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  viewMode === 'dense'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                <span>Focus Table</span>
              </button>
            </div>

            {/* AI Dossier */}
            {candidates.length > 0 && (
              <button
                onClick={() => {
                  if (!aiReport && !loadingAI) onGenerateAIReport();
                  setIsDrawerOpen(true);
                }}
                disabled={loadingAI}
                className="flex items-center space-x-1.5 rounded-xl border border-purple-500/20 bg-purple-500/5 px-3.5 py-2 text-xs font-medium text-purple-700 dark:text-purple-400 hover:bg-purple-500/10 transition"
              >
                <Sparkles className={`h-3.5 w-3.5 ${loadingAI ? 'animate-spin' : ''}`} />
                <span>{loadingAI ? `Briefing (${aiElapsed}s)...` : 'Executive Briefing'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-black/[0.04] dark:border-white/[0.05] pt-3 text-xs">
          {['ALL', 'SIGNAL TRIGGERED', 'HIGH PRIORITY', 'WATCHLIST', 'AVOID / FILTERED OUT'].map((p) => {
            const isSelected = filterPriority === p;
            const count = p === 'ALL'
              ? candidates.length
              : candidates.filter((c) => c.priority === p).length;
            const displayLabel = p === 'ALL' ? 'All Candidates' : p === 'SIGNAL TRIGGERED' ? 'Actionable Setups' : p === 'HIGH PRIORITY' ? 'High Priority' : p === 'WATCHLIST' ? 'Watchlist' : 'On Pause';

            return (
              <button
                key={p}
                onClick={() => setFilterPriority(p)}
                className={`flex items-center space-x-1.5 rounded-full px-3.5 py-1 text-xs transition ${
                  isSelected
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 font-medium'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                }`}
              >
                <span>{displayLabel}</span>
                <span className={`text-[10px] ${isSelected ? 'opacity-70' : 'text-zinc-400'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Calm Market Advisory Pill (No screaming red boxes) */}
      {isHostile && !isAdvisoryDismissed && (
        <div className="rounded-2xl border border-rose-500/15 bg-rose-500/5 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
              <strong className="font-semibold text-rose-600 dark:text-rose-400">Market Advisory:</strong> Nifty 50 is trending in a cautious regime (Score {regimeScore}/100). To protect your capital, position sizing is automatically reduced to 50% across qualified setups.
            </div>
          </div>
          <button
            onClick={() => setIsAdvisoryDismissed(true)}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 3. The Content: Humane Cards or Focus Table */}
      {loadingScan ? (
        <div className="rounded-3xl border border-black/[0.06] dark:border-white/[0.07] bg-white dark:bg-[#121319] p-16 text-center shadow-sm">
          <div className="relative mb-3 flex h-12 w-12 items-center justify-center mx-auto">
            <div className="absolute inset-0 animate-ping rounded-full bg-zinc-900/10 dark:bg-zinc-100/10" />
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900">
              <Play className="h-4 w-4 fill-current animate-pulse ml-0.5" />
            </div>
          </div>
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Screening {universeSelect === 'fast3' ? '3 Test Stocks' : universeSelect.toUpperCase()}...
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Checking price action, calculating 50-day distances, auditing financial solvency, and checking risk-to-reward boundaries.
          </div>
        </div>
      ) : filteredAndSortedCandidates.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-black/[0.08] dark:border-white/[0.1] p-16 text-center">
          <AlertCircle className="mb-2 h-7 w-7 text-zinc-400 mx-auto" />
          <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">No candidates found</div>
          <div className="mt-1 text-xs text-zinc-500">
            {candidates.length === 0
              ? 'Click "Screen Market" above to analyze the current stock universe.'
              : 'Adjust your search terms or select another filter pill above.'}
          </div>
        </div>
      ) : viewMode === 'dense' ? (
        /* ===================================================================
           FOCUS TABLE VIEW (Crisp Apple Numbers style)
           =================================================================== */
        <div className="overflow-hidden rounded-3xl border border-black/[0.06] dark:border-white/[0.07] bg-white dark:bg-[#121319] shadow-sm">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b border-black/[0.05] dark:border-white/[0.06] bg-black/[0.015] dark:bg-white/[0.02] text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                  <th className="py-3 px-5 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => handleSort('ticker')}>
                    Company & Ticker
                  </th>
                  <th className="py-3 px-4 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => handleSort('current_price')}>
                    Market Price
                  </th>
                  <th className="py-3 px-4">Setup Strategy</th>
                  <th className="py-3 px-4 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => handleSort('overall_score')}>
                    Quality Score
                  </th>
                  <th className="py-3 px-4 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => handleSort('risk_reward_ratio')}>
                    Risk / Reward
                  </th>
                  <th className="py-3 px-4">Stop Loss</th>
                  <th className="py-3 px-4">Target</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.05] text-xs">
                {filteredAndSortedCandidates.map((c) => {
                  const f = c.fundamentals || {};
                  const t = c.technicals || {};
                  const price = c.current_price ?? t.Trend_Analysis?.Current_Price;
                  const dmaDist = t.Trend_Analysis?.['Dist_50_DMA_%'];
                  const stratTitle = getStrategyTitle(c.setup_type || c.strategy?.primary_strategy);
                  const stop = c.stop_loss || c.strategy?.active_strategy_result?.stop_price;
                  const t1 = c.target_1 || c.strategy?.active_strategy_result?.target_1;
                  const rr = c.risk_reward_ratio || c.strategy?.active_strategy_result?.risk_reward_ratio;
                  const pill = getHumanPriorityPill(c.priority);

                  return (
                    <tr
                      key={c.ticker}
                      onClick={() => onSelectCandidate(c.ticker)}
                      className="cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition group"
                    >
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-blue-500 transition">
                          {c.ticker}
                        </div>
                        <div className="text-[11px] text-zinc-500 truncate max-w-[160px]">
                          {c.name}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono-num font-medium text-zinc-900 dark:text-zinc-100">
                        {price != null ? `₹${Number(price).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}` : '—'}
                        {dmaDist != null && (
                          <span className={`ml-2 text-[10px] font-semibold ${dmaDist >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {dmaDist > 0 ? '+' : ''}{dmaDist}% vs 50D
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {stratTitle ? (
                          <span className="font-medium text-zinc-800 dark:text-zinc-200">
                            {stratTitle}
                          </span>
                        ) : (
                          <span className="text-zinc-400 dark:text-zinc-500 text-[11px]">No active setup</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono-num font-semibold text-zinc-800 dark:text-zinc-200">
                        {c.overall_score ?? '—'}/100
                      </td>
                      <td className="py-3.5 px-4 font-mono-num">
                        {rr ? (
                          <span className="font-semibold text-blue-600 dark:text-blue-400">{rr}x</span>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono-num text-rose-600 dark:text-rose-400">
                        {stop ? `₹${Number(stop).toFixed(1)}` : '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono-num text-emerald-600 dark:text-emerald-400">
                        {t1 ? `₹${Number(t1).toFixed(1)}` : '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] ${pill.style}`}>
                          {pill.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onOpenTradeModal) onOpenTradeModal(c.ticker, c.setup_type || c.strategy?.primary_strategy);
                          }}
                          className="rounded-lg border border-black/[0.1] dark:border-white/[0.1] px-3 py-1 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition"
                        >
                          Trade
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ===================================================================
           EDITORIAL CARDS VIEW (Handcrafted, humane, thoughtful)
           =================================================================== */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAndSortedCandidates.map((c) => {
            const f = c.fundamentals || {};
            const t = c.technicals || {};
            const val = f.valuation || {};
            const trend = t.Trend_Analysis || {};
            const price = c.current_price ?? trend.Current_Price;
            const dmaDist = trend['Dist_50_DMA_%'];

            const stratTitle = getStrategyTitle(c.setup_type || c.strategy?.primary_strategy);
            const stop = c.stop_loss || c.strategy?.active_strategy_result?.stop_price;
            const t1 = c.target_1 || c.strategy?.active_strategy_result?.target_1;
            const rr = c.risk_reward_ratio || c.strategy?.active_strategy_result?.risk_reward_ratio;
            const pill = getHumanPriorityPill(c.priority);

            // Precision Risk Calculation
            let hasValidSpectrum = false;
            let riskWidthPct = 33;
            let rewardWidthPct = 67;
            let riskRupees = null;
            let rewardRupees = null;

            if (stop != null && t1 != null && price != null && Number(stop) < Number(price) && Number(price) < Number(t1)) {
              hasValidSpectrum = true;
              const s = Number(stop);
              const p = Number(price);
              const target = Number(t1);
              riskRupees = (p - s).toFixed(1);
              rewardRupees = (target - p).toFixed(1);

              const totalSpan = target - s;
              if (totalSpan > 0) {
                riskWidthPct = Math.max(15, Math.min(85, Math.round(((p - s) / totalSpan) * 100)));
                rewardWidthPct = 100 - riskWidthPct;
              }
            }

            return (
              <div
                key={c.ticker}
                onClick={() => onSelectCandidate(c.ticker)}
                className="group relative flex flex-col justify-between rounded-3xl border border-black/[0.06] dark:border-white/[0.07] bg-white dark:bg-[#121319] p-6 shadow-sm hover:shadow-md hover:border-black/20 dark:hover:border-white/20 transition-all duration-200 cursor-pointer"
              >
                <div>
                  {/* Top Header: Stock Identity + Market Price */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 group-hover:text-blue-500 transition">
                        {c.ticker}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate max-w-[170px]">
                        {c.name} · {c.sector}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono-num text-lg font-bold text-zinc-900 dark:text-zinc-100">
                        {price != null ? `₹${Number(price).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}` : 'N/A'}
                      </div>
                      {dmaDist != null && (
                        <div className={`text-[11px] font-semibold ${dmaDist >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {dmaDist > 0 ? '+' : ''}{dmaDist}% vs 50D
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Strategy Badge & Human Priority */}
                  <div className="mt-3.5 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] ${pill.style}`}>
                      {pill.label}
                    </span>
                    {stratTitle && (
                      <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                        {stratTitle}
                      </span>
                    )}
                  </div>

                  {/* The Human Narrative Setup Story */}
                  {c.priority_reason ? (
                    <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-2">
                      {c.priority_reason}
                    </p>
                  ) : (
                    <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500 italic">
                      Deterministic multi-factor qualification completed.
                    </p>
                  )}

                  {/* Hairline Precision Risk Gauge */}
                  {hasValidSpectrum ? (
                    <div className="mt-5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] p-3 border border-black/[0.04] dark:border-white/[0.05]">
                      <div className="flex items-center justify-between text-[11px] font-mono mb-2">
                        <span className="text-rose-600 dark:text-rose-400 font-semibold">
                          Stop ₹{Number(stop).toFixed(1)}
                        </span>
                        {rr && (
                          <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                            {rr} : 1 R:R
                          </span>
                        )}
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          Target ₹{Number(t1).toFixed(1)}
                        </span>
                      </div>

                      {/* Hairline Gauge Track */}
                      <div className="h-1.5 w-full rounded-full bg-black/[0.08] dark:bg-white/[0.1] overflow-hidden flex">
                        <div style={{ width: `${riskWidthPct}%` }} className="bg-rose-500 h-full" />
                        <div style={{ width: `${rewardWidthPct}%` }} className="bg-emerald-500 h-full" />
                      </div>

                      <div className="mt-2 text-[10px] text-zinc-500 dark:text-zinc-400 text-center font-medium">
                        Risking ₹{riskRupees} to target ₹{rewardRupees} per share
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] p-3 text-center text-[11px] text-zinc-400 border border-black/[0.04] dark:border-white/[0.05]">
                      No active trade levels qualified
                    </div>
                  )}

                  {/* Quiet Editorial Fundamentals Summary */}
                  <div className="mt-4 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 border-t border-black/[0.04] dark:border-white/[0.05] pt-3">
                    <span>Overall Health: <strong className="text-zinc-800 dark:text-zinc-200 font-semibold">{c.overall_score ?? '—'}/100</strong></span>
                    <span className="font-mono text-[11px]">
                      P/E {val.pe ? `${val.pe}x` : 'Fair'}
                    </span>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="mt-5 flex items-center justify-between border-t border-black/[0.04] dark:border-white/[0.05] pt-3.5">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-blue-500 transition flex items-center">
                    Examine Setup <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenTradeModal) onOpenTradeModal(c.ticker, c.setup_type || c.strategy?.primary_strategy);
                    }}
                    className="rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 px-3.5 py-1.5 text-xs font-semibold shadow-sm transition active:scale-95"
                  >
                    Trade
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Slide-Over Executive Briefing Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm">
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
                No briefing generated yet. Click "Executive Briefing" to synthesize insights.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
