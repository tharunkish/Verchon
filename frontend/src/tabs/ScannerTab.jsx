import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  Play, 
  Sparkles, 
  Filter, 
  ChevronRight, 
  X, 
  AlertCircle, 
  ShieldAlert, 
  ShieldCheck, 
  Clock,
  PieChart,
  Layers,
  LayoutGrid,
  List,
  Search,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Zap,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

export default function ScannerTab({
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
      return localStorage.getItem('verchon_scanner_view') || 'cards';
    } catch {
      return 'cards';
    }
  });

  const handleSetViewMode = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('verchon_scanner_view', mode);
    } catch {}
  };

  const [filterPriority, setFilterPriority] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSectorFilter, setSelectedSectorFilter] = useState(null);
  const [portfolioSectors, setPortfolioSectors] = useState([]);
  const [isGovernorCollapsed, setIsGovernorCollapsed] = useState(false);

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

  const getSectorImpactInfo = (secName) => {
    if (!secName) return null;
    const currentPct = getSectorExposurePct(secName);
    if (currentPct === 0) {
      return {
        type: 'NEW_SECTOR',
        label: `🌱 New Sector: ${secName}`,
        badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        bonus: 35,
      };
    } else if (currentPct < 15) {
      return {
        type: 'BALANCED',
        label: `🔵 ${secName} (${currentPct.toFixed(1)}%)`,
        badge: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
        bonus: 15,
      };
    } else if (currentPct > 25) {
      return {
        type: 'OVERWEIGHT',
        label: `⚠️ Overweight: ${secName} (${currentPct.toFixed(1)}%)`,
        badge: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
        bonus: -30,
      };
    }
    return {
      type: 'NEUTRAL',
      label: `${secName} (${currentPct.toFixed(1)}%)`,
      badge: 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]',
      bonus: 0,
    };
  };

  // Identify all scanned sectors and those missing
  const allScannedSectors = useMemo(() => {
    return Array.from(
      new Set(candidates.map((c) => c.sector || c.fundamentals?.sector).filter(Boolean))
    );
  }, [candidates]);

  const missingSectors = useMemo(() => {
    return allScannedSectors.filter((sec) => getSectorExposurePct(sec) === 0);
  }, [allScannedSectors, portfolioSectors]);

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
      } else if (key === 'dma_dist') {
        valA = a.technicals?.Trend_Analysis?.['Dist_50_DMA_%'] ?? 0;
        valB = b.technicals?.Trend_Analysis?.['Dist_50_DMA_%'] ?? 0;
      } else {
        // overall_score (with sector diversity bonus if selected)
        let bonusA = 0;
        let bonusB = 0;
        if (filterPriority === 'SECTOR DIVERSITY') {
          bonusA = getSectorImpactInfo(a.sector || a.fundamentals?.sector)?.bonus || 0;
          bonusB = getSectorImpactInfo(b.sector || b.fundamentals?.sector)?.bonus || 0;
        }
        valA = (a.overall_score ?? 0) + bonusA;
        valB = (b.overall_score ?? 0) + bonusB;
      }

      return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
    });

    return result;
  }, [candidates, filterPriority, selectedSectorFilter, searchQuery, sortConfig, portfolioSectors]);

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

  const getPriorityBadgeStyle = (priority) => {
    switch (priority) {
      case 'SIGNAL TRIGGERED':
        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold';
      case 'HIGH PRIORITY':
        return 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 font-bold';
      case 'WATCHLIST':
        return 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300';
      case 'AVOID / FILTERED OUT':
        return 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-muted)]';
      default:
        return 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]';
    }
  };

  const getStrategyBadgeInfo = (strat) => {
    if (!strat || strat === 'None' || strat === 'SWING_MOMENTUM' || strat === 'NO_ACTIVE_SETUP' || strat === 'NO_SETUP') {
      return null;
    }
    if (strat.includes("SWEEP")) {
      return { icon: "🛡️", label: "Liquidity Sweep", style: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
    }
    if (strat.includes("SQUEEZE")) {
      return { icon: "⚡", label: "Volatility Squeeze", style: "border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400" };
    }
    if (strat.includes("SNAPBACK")) {
      return { icon: "🧲", label: "Rubber Band Snapback", style: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" };
    }
    if (strat.includes("BREAKOUT")) {
      return { icon: "🚀", label: "Momentum Breakout", style: "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" };
    }
    return { icon: "🎯", label: strat.replace(/_/g, ' '), style: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400" };
  };

  return (
    <div className="min-h-[calc(100vh-100px)] p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      {/* 1. Apple-Grade Control Toolbar */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm backdrop-blur-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: Scan Controls & Universe Selector */}
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="mb-1 block font-mono text-[10px] text-[var(--text-secondary)]">UNIVERSE</label>
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
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none hover:border-black/20 dark:hover:border-white/20 focus:ring-1 focus:ring-blue-500 transition"
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
              <label className="mb-1 block font-mono text-[10px] text-[var(--text-secondary)]">CANDIDATE LIMIT</label>
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
                className={`rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none hover:border-black/20 dark:hover:border-white/20 focus:ring-1 focus:ring-blue-500 transition ${
                  universeSelect === 'fast3' ? 'cursor-not-allowed opacity-50' : ''
                }`}
              >
                <option value="3">3 Stocks (Fast)</option>
                <option value="10">10 Stocks</option>
                <option value="25">25 Stocks</option>
                <option value="50">50 Stocks</option>
                <option value="100">100 Stocks</option>
              </select>
            </div>

            {/* Run Deterministic Scan Trigger */}
            <div className="self-end">
              <button
                onClick={handleScanSubmit}
                disabled={loadingScan}
                className={`flex items-center space-x-2 rounded-xl px-4 py-2 font-medium text-xs text-white shadow-md transition-all ${
                  loadingScan
                    ? 'cursor-not-allowed bg-blue-500/50'
                    : 'bg-blue-500 hover:bg-blue-600 active:scale-95 shadow-blue-500/25'
                }`}
              >
                <Play className={`h-3.5 w-3.5 fill-current ${loadingScan ? 'animate-pulse' : ''}`} />
                <span>{loadingScan ? `Scanning (${scanElapsed}s)...` : 'Run Scan'}</span>
              </button>
            </div>
          </div>

          {/* Right: Search, Dual View Switcher, and AI Dossier Trigger */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Quick Search Box */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search ticker, name, setup..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 sm:w-56 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] pl-9 pr-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none hover:border-black/20 dark:hover:border-white/20 focus:ring-1 focus:ring-blue-500 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Dual View Switcher: [Cards] vs [Dense List] */}
            <div className="flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-0.5">
              <button
                onClick={() => handleSetViewMode('cards')}
                title="Apple Trade Cards View"
                className={`flex items-center space-x-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  viewMode === 'cards'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>

              <button
                onClick={() => handleSetViewMode('dense')}
                title="Dense Financial Table View"
                className={`flex items-center space-x-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  viewMode === 'dense'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Dense List</span>
              </button>
            </div>

            {/* AI Dossier Button */}
            {candidates.length > 0 && (
              <button
                onClick={() => {
                  if (!aiReport && !loadingAI) {
                    onGenerateAIReport();
                  }
                  setIsDrawerOpen(true);
                }}
                disabled={loadingAI}
                className="flex items-center space-x-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 transition"
              >
                <Sparkles className={`h-3.5 w-3.5 ${loadingAI ? 'animate-spin' : ''}`} />
                <span>{loadingAI ? `Synthesizing (${aiElapsed}s)...` : 'AI Dossier'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Priority Filter Pills */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-[var(--border-subtle)] pt-3 text-xs">
          <span className="font-mono text-[10px] text-[var(--text-secondary)] mr-1">FILTER:</span>
          {['ALL', 'SIGNAL TRIGGERED', 'HIGH PRIORITY', 'WATCHLIST', 'SECTOR DIVERSITY', 'AVOID / FILTERED OUT'].map((p) => {
            const isSelected = filterPriority === p;
            const count = p === 'ALL'
              ? candidates.length
              : p === 'SECTOR DIVERSITY'
              ? candidates.filter((c) => c.priority !== 'AVOID / FILTERED OUT').length
              : candidates.filter((c) => c.priority === p).length;

            return (
              <button
                key={p}
                onClick={() => {
                  setFilterPriority(p);
                  if (p !== 'SECTOR DIVERSITY') setSelectedSectorFilter(null);
                }}
                className={`flex items-center space-x-1.5 rounded-lg px-2.5 py-1 text-xs transition ${
                  isSelected
                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold border border-blue-500/30'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]/50'
                }`}
              >
                <span>{p}</span>
                <span className="rounded-full bg-[var(--border-subtle)] px-1.5 py-0.2 font-mono text-[10px]">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Data-Driven Macro Governor Capsule */}
      {isHostile && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 backdrop-blur-xl transition-all">
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="rounded-md bg-rose-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-rose-700 dark:text-rose-300">
                    MACRO REGIME GOVERNOR ACTIVE
                  </span>
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    Nifty Score: {regimeScore}/100
                  </span>
                </div>
                {!isGovernorCollapsed && (
                  <p className="mt-1 text-xs text-[var(--text-secondary)] max-w-2xl leading-relaxed">
                    NIFTY 50 is in a downdraft regime. Capital preservation is active: 50% position sizing is enforced across setups. High-beta breakouts are suppressed to protect capital.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <span className="rounded-xl border border-rose-500/30 bg-rose-500/20 px-3 py-1 font-mono text-xs font-bold text-rose-700 dark:text-rose-300">
                ⚡ 50% SIZING
              </span>
              <button
                onClick={() => setIsGovernorCollapsed(!isGovernorCollapsed)}
                className="rounded-lg p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
                title={isGovernorCollapsed ? "Expand Macro Governor details" : "Collapse into slim capsule"}
              >
                {isGovernorCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Candidate Grid / Dense Table Renderer */}
      {loadingScan ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-16 text-center shadow-sm backdrop-blur-xl">
          <div className="relative mb-4 flex h-14 w-14 items-center justify-center">
            <div className="absolute inset-0 animate-ping rounded-full bg-blue-500/20" />
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
              <Play className="ml-0.5 h-5 w-5 fill-current animate-pulse" />
            </div>
          </div>
          <div className="text-sm font-semibold text-[var(--text-primary)]">
            Scanning Universe: {universeSelect === 'fast3' ? 'Fast Test (3 Stocks)' : universeSelect.toUpperCase()}
          </div>
          <div className="mt-1 font-mono text-xs text-blue-600 dark:text-blue-400 font-medium">
            Elapsed: {scanElapsed}s · Deterministic multi-factor qualification
          </div>
          <p className="mt-2 max-w-md text-xs text-[var(--text-secondary)]">
            Calculating swing technicals (50/200 DMA, ATR, RSI), auditing corporate fundamentals, and checking strategy conditions.
          </p>
        </div>
      ) : filteredAndSortedCandidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-subtle)] p-16 text-center">
          <AlertCircle className="mb-3 h-8 w-8 text-[var(--text-muted)]" />
          <div className="text-sm font-semibold text-[var(--text-primary)]">No matching candidates</div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">
            {candidates.length === 0
              ? 'Click "Run Scan" above to screen the selected stock universe.'
              : 'Try clearing the search query or adjusting your priority filter.'}
          </div>
        </div>
      ) : viewMode === 'dense' ? (
        /* ===================================================================
           DENSE FINANCIAL TABLE VIEW
           =================================================================== */
        <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-sm">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse min-w-[960px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] font-semibold text-[var(--text-secondary)] tracking-wider uppercase">
                  <th className="py-3 px-4 cursor-pointer hover:text-[var(--text-primary)]" onClick={() => handleSort('ticker')}>
                    <div className="flex items-center space-x-1">
                      <span>Ticker & Co.</span>
                      {sortConfig.key === 'ticker' && (sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </div>
                  </th>
                  <th className="py-3 px-3 cursor-pointer hover:text-[var(--text-primary)]" onClick={() => handleSort('current_price')}>
                    <div className="flex items-center space-x-1">
                      <span>Price</span>
                      {sortConfig.key === 'current_price' && (sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </div>
                  </th>
                  <th className="py-3 px-3 cursor-pointer hover:text-[var(--text-primary)]" onClick={() => handleSort('dma_dist')}>
                    <div className="flex items-center space-x-1">
                      <span>50D Dist</span>
                      {sortConfig.key === 'dma_dist' && (sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </div>
                  </th>
                  <th className="py-3 px-3">Strategy</th>
                  <th className="py-3 px-3 cursor-pointer hover:text-[var(--text-primary)]" onClick={() => handleSort('overall_score')}>
                    <div className="flex items-center space-x-1">
                      <span>Score</span>
                      {sortConfig.key === 'overall_score' && (sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </div>
                  </th>
                  <th className="py-3 px-3 cursor-pointer hover:text-[var(--text-primary)]" onClick={() => handleSort('fundamental_score')}>
                    <div className="flex items-center space-x-1">
                      <span>Finances</span>
                      {sortConfig.key === 'fundamental_score' && (sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </div>
                  </th>
                  <th className="py-3 px-3 cursor-pointer hover:text-[var(--text-primary)]" onClick={() => handleSort('technical_score')}>
                    <div className="flex items-center space-x-1">
                      <span>Chart</span>
                      {sortConfig.key === 'technical_score' && (sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </div>
                  </th>
                  <th className="py-3 px-3 cursor-pointer hover:text-[var(--text-primary)]" onClick={() => handleSort('risk_reward_ratio')}>
                    <div className="flex items-center space-x-1">
                      <span>R:R</span>
                      {sortConfig.key === 'risk_reward_ratio' && (sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </div>
                  </th>
                  <th className="py-3 px-3">Stop Loss</th>
                  <th className="py-3 px-3">Target 1</th>
                  <th className="py-3 px-3">Priority</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
                {filteredAndSortedCandidates.map((c) => {
                  const f = c.fundamentals || {};
                  const t = c.technicals || {};
                  const price = c.current_price ?? t.Trend_Analysis?.Current_Price;
                  const dmaDist = t.Trend_Analysis?.['Dist_50_DMA_%'];
                  const stratInfo = getStrategyBadgeInfo(c.setup_type || c.strategy?.primary_strategy || t.Strategy_Evaluation?.primary_strategy);
                  const stop = c.stop_loss || c.strategy?.active_strategy_result?.stop_price;
                  const t1 = c.target_1 || c.strategy?.active_strategy_result?.target_1;
                  const rr = c.risk_reward_ratio || c.strategy?.active_strategy_result?.risk_reward_ratio;

                  return (
                    <tr
                      key={c.ticker}
                      onClick={() => onSelectCandidate(c.ticker)}
                      className="cursor-pointer hover:bg-[var(--border-subtle)]/40 transition group"
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-[var(--text-primary)] group-hover:text-blue-500 transition">
                          {c.ticker}
                        </div>
                        <div className="text-[10px] text-[var(--text-secondary)] truncate max-w-[150px]">
                          {c.name}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono-num font-semibold text-[var(--text-primary)]">
                        {price != null ? `₹${Number(price).toFixed(1)}` : '—'}
                      </td>
                      <td className="py-3 px-3 font-mono-num text-[11px]">
                        {dmaDist != null ? (
                          <span className={dmaDist >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-rose-600 dark:text-rose-400 font-semibold'}>
                            {dmaDist > 0 ? '+' : ''}{dmaDist}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-3 px-3">
                        {stratInfo ? (
                          <span className={`inline-flex items-center space-x-1 rounded-md px-2 py-0.5 text-[10px] font-semibold border ${stratInfo.style}`}>
                            <span>{stratInfo.icon}</span>
                            <span>{stratInfo.label}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)]">No setup</span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono-num font-bold text-[var(--text-primary)]">
                        {c.overall_score ?? '—'}
                      </td>
                      <td className="py-3 px-3 font-mono-num text-[var(--text-secondary)]">
                        {f.fundamental_score ?? '—'}
                      </td>
                      <td className="py-3 px-3 font-mono-num text-[var(--text-secondary)]">
                        {t.Scoring_Summary?.Technical_Score ?? '—'}
                      </td>
                      <td className="py-3 px-3 font-mono-num">
                        {rr ? (
                          <span className="text-blue-600 dark:text-blue-400 font-bold">{rr}x</span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono-num text-rose-600 dark:text-rose-400">
                        {stop ? `₹${Number(stop).toFixed(1)}` : '—'}
                      </td>
                      <td className="py-3 px-3 font-mono-num text-emerald-600 dark:text-emerald-400">
                        {t1 ? `₹${Number(t1).toFixed(1)}` : '—'}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`rounded-full border px-2 py-0.2 font-mono text-[9px] ${getPriorityBadgeStyle(c.priority)}`}>
                          {c.priority}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onOpenTradeModal) {
                              onOpenTradeModal(c.ticker, c.setup_type || c.strategy?.primary_strategy);
                            }
                          }}
                          className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition"
                        >
                          ⚡ Trade
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
           APPLE TRADE SPECTRUM CARDS VIEW
           =================================================================== */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSortedCandidates.map((c) => {
            const f = c.fundamentals || {};
            const t = c.technicals || {};
            const val = f.valuation || {};
            const trend = t.Trend_Analysis || {};
            const price = c.current_price ?? trend.Current_Price;
            const dmaDist = trend['Dist_50_DMA_%'];

            const stratInfo = getStrategyBadgeInfo(c.setup_type || c.strategy?.primary_strategy || t.Strategy_Evaluation?.primary_strategy);
            const stop = c.stop_loss || c.strategy?.active_strategy_result?.stop_price;
            const t1 = c.target_1 || c.strategy?.active_strategy_result?.target_1;
            const rr = c.risk_reward_ratio || c.strategy?.active_strategy_result?.risk_reward_ratio;

            // Mathematical Risk Spectrum Calculation
            let hasValidSpectrum = false;
            let riskPct = 35;
            let rewardPct = 65;
            if (stop != null && t1 != null && price != null && Number(stop) < Number(price) && Number(price) < Number(t1)) {
              hasValidSpectrum = true;
              const s = Number(stop);
              const p = Number(price);
              const target = Number(t1);
              const totalSpan = target - s;
              if (totalSpan > 0) {
                riskPct = Math.max(15, Math.min(85, Math.round(((p - s) / totalSpan) * 100)));
                rewardPct = 100 - riskPct;
              }
            }

            const impact = getSectorImpactInfo(c.sector || f.sector);

            return (
              <div
                key={c.ticker}
                onClick={() => onSelectCandidate(c.ticker)}
                className="group relative flex flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-sm hover:shadow-md hover:border-blue-500/40 transition-all duration-200 cursor-pointer"
              >
                <div>
                  {/* Primary Hierarchy: Big Ticker, Company Name, and Bold Price */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-base font-black tracking-tight text-[var(--text-primary)] group-hover:text-blue-500 transition">
                          {c.ticker}
                        </span>
                        <span className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-1.5 py-0.2 font-mono text-[9px] text-[var(--text-secondary)]">
                          {f.company_type || 'GENERAL'}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] truncate max-w-[180px] mt-0.5">
                        {c.name}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono-num text-base font-extrabold text-[var(--text-primary)]">
                        {price != null ? `₹${Number(price).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}` : 'N/A'}
                      </div>
                      {dmaDist != null && (
                        <div className={`font-mono-num text-[11px] font-semibold ${dmaDist >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {dmaDist > 0 ? '+' : ''}{dmaDist}% vs 50D
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Strategy Badge & Priority */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {stratInfo ? (
                      <span className={`inline-flex items-center space-x-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold border ${stratInfo.style}`}>
                        <span>{stratInfo.icon}</span>
                        <span>{stratInfo.label}</span>
                      </span>
                    ) : (
                      <span className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
                        No active setup
                      </span>
                    )}

                    <span className={`rounded-full border px-2 py-0.2 font-mono text-[9px] ${getPriorityBadgeStyle(c.priority)}`}>
                      {c.priority}
                    </span>
                  </div>

                  {/* Mathematical Risk Spectrum Bar */}
                  {hasValidSpectrum ? (
                    <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2.5">
                      <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
                        <span className="text-rose-600 dark:text-rose-400 font-bold">SL ₹{Number(stop).toFixed(1)}</span>
                        {rr && <span className="font-bold text-blue-600 dark:text-blue-400">R:R {rr}x</span>}
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">T1 ₹{Number(t1).toFixed(1)}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[var(--border-subtle)] overflow-hidden flex">
                        <div style={{ width: `${riskPct}%` }} className="bg-rose-500 h-full" title={`Risk Span: ${riskPct}%`} />
                        <div style={{ width: `${rewardPct}%` }} className="bg-emerald-500 h-full" title={`Reward Span: ${rewardPct}%`} />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2 text-center text-[10px] text-[var(--text-muted)] font-mono">
                      No active trade levels qualified
                    </div>
                  )}

                  {/* Secondary Hierarchy: Scores & Valuation */}
                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2 text-center font-mono">
                    <div>
                      <div className="text-[9px] text-[var(--text-muted)]">SCORE</div>
                      <div className="text-xs font-bold text-[var(--text-primary)]">{c.overall_score ?? '—'}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[var(--text-muted)]">FINANCES</div>
                      <div className="text-xs font-bold text-[var(--text-secondary)]">{f.fundamental_score ?? '—'}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[var(--text-muted)]">CHART</div>
                      <div className="text-xs font-bold text-[var(--text-secondary)]">{t.Scoring_Summary?.Technical_Score ?? '—'}</div>
                    </div>
                  </div>

                  {/* Valuation & Sector Diversity */}
                  <div className="mt-2.5 flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                    <span className="font-mono text-[10px]">
                      P/E {val.pe ? `${val.pe}x` : 'N/A'} · P/B {val.pb ? `${val.pb}x` : 'N/A'}
                    </span>
                    {impact && (
                      <span className={`rounded px-1.5 py-0.2 font-mono text-[9px] font-semibold border ${impact.badge}`}>
                        {impact.label}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="mt-4 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
                  <span className="text-[11px] text-blue-500 font-medium group-hover:underline flex items-center">
                    Deep Dive <ChevronRight className="h-3 w-3 ml-0.5" />
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenTradeModal) {
                        onOpenTradeModal(c.ticker, c.setup_type || c.strategy?.primary_strategy);
                      }
                    }}
                    className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-1 font-mono text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 active:scale-95 transition"
                  >
                    ⚡ Trade
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Slide-Over AI Report Drawer (Executive Briefing Mode) */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="relative h-full w-full max-w-4xl overflow-y-auto border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-2xl transition-colors">
            {/* Header */}
            <div className="sticky top-0 mb-5 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 pb-3 backdrop-blur z-10">
              <div className="flex items-center space-x-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-purple-500/20 text-purple-600 dark:text-purple-400">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div>
                  <div className="font-mono text-[10px] font-bold text-purple-600 dark:text-purple-400 tracking-wider">
                    VERCHON VECTOR · EXECUTIVE DOSSIER
                  </div>
                  <h2 className="text-base font-bold text-[var(--text-primary)]">
                    Multi-Factor Candidate Synthesis
                  </h2>
                </div>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="rounded-xl border border-[var(--border-subtle)] p-2 text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] hover:text-[var(--text-primary)] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* AI Report Content */}
            {loadingAI ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Sparkles className="mb-3 h-8 w-8 animate-spin text-purple-500" />
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  Synthesizing Market Intelligence...
                </div>
                <div className="mt-1 font-mono text-xs text-purple-600 dark:text-purple-400">
                  Elapsed: {aiElapsed}s
                </div>
              </div>
            ) : aiReport ? (
              <div className="prose dark:prose-invert max-w-none text-xs leading-relaxed space-y-4">
                <ReactMarkdown>{aiReport}</ReactMarkdown>
              </div>
            ) : (
              <div className="py-16 text-center text-xs text-[var(--text-secondary)]">
                No report generated yet. Click "AI Dossier" in the toolbar to synthesize candidate insights.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
