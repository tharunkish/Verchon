import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  RefreshCw, 
  Sliders, 
  RotateCcw, 
  ShieldCheck, 
  AlertTriangle, 
  Target, 
  ArrowUpRight, 
  ArrowDownRight, 
  CheckCircle2, 
  X, 
  Compass, 
  Clock, 
  Sparkles, 
  Lock, 
  Scissors, 
  Check,
  PieChart,
  DollarSign,
  Scale,
  Layers,
  TrendingUp,
  TrendingDown,
  Percent
} from 'lucide-react';
import OrderExecutionModal from '../../components/OrderExecutionModal';

export default function ApplePortfolioTab({ 
  positions = [], 
  account = null,
  onAddPosition, 
  onClosePosition,
  onUpdateStop,
  onUpdateAccount,
  onResetAccount,
  onRefreshQuotes,
  candidates = []
}) {
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [selectedStockForOrder, setSelectedStockForOrder] = useState('');
  const [selectedStrategyForOrder, setSelectedStrategyForOrder] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Partial close modal state
  const [partialModalPos, setPartialModalPos] = useState(null);
  const [partialQty, setPartialQty] = useState(1);

  // Edit Capital modal state (Preserves trades)
  const [isEditCapitalModalOpen, setIsEditCapitalModalOpen] = useState(false);
  const [editCapital, setEditCapital] = useState(account?.starting_capital?.toString() || '1000000');
  const [editRiskPct, setEditRiskPct] = useState(account?.risk_per_trade_pct?.toString() || '1.0');

  // Account reset modal state (Wipes trades)
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetCapital, setResetCapital] = useState('1000000');
  const [resetRiskPct, setResetRiskPct] = useState('1.0');

  // Filter state for flight strips
  const [activeFilter, setActiveFilter] = useState('ALL');

  useEffect(() => {
    if (account?.starting_capital) {
      setEditCapital(account.starting_capital.toString());
      setResetCapital(account.starting_capital.toString());
    }
    if (account?.risk_per_trade_pct) {
      setEditRiskPct(account.risk_per_trade_pct.toString());
      setResetRiskPct(account.risk_per_trade_pct.toString());
    }
  }, [account]);

  const openPositions = positions.filter((p) => p.status === 'OPEN');
  const closedPositions = positions.filter((p) => p.status === 'CLOSED');

  // Account calculations
  const startingCapital = account?.starting_capital || 1000000;
  const availableCash = account?.available_cash ?? 1000000;
  const totalEquity = account?.total_equity || (availableCash + openPositions.reduce((acc, p) => acc + (p.current_price || p.entry_price) * p.quantity, 0));
  const totalUnrealizedPnl = openPositions.reduce((acc, p) => acc + (p.unrealized_pnl || 0), 0);
  const totalNetRealizedPnl = account?.total_realized_net ?? closedPositions.reduce((acc, p) => acc + (p.net_pnl || p.realized_pnl || 0), 0);
  const totalChargesPaid = account?.total_charges_paid ?? (closedPositions.reduce((acc, p) => acc + (p.total_charges || 0), 0) + openPositions.reduce((acc, p) => acc + (p.buy_charges || 0), 0));
  const winRate = account?.win_rate_pct ?? (closedPositions.length > 0 ? (closedPositions.filter(p => (p.net_pnl || p.realized_pnl) > 0).length / closedPositions.length * 100).toFixed(1) : 0);
  const profitFactor = account?.profit_factor ?? 1.0;
  const avgRMultiple = account?.avg_r_multiple ?? 0.0;

  const totalCapitalAtRisk = openPositions.reduce(
    (acc, p) => acc + Math.max(0, (p.entry_price - p.stop_price) * p.quantity),
    0
  );
  const totalInvested = openPositions.reduce((acc, p) => acc + (p.entry_price * p.quantity), 0);
  const totalCombinedPnl = totalNetRealizedPnl + totalUnrealizedPnl;
  const unrealizedReturnPct = totalInvested > 0 ? (totalUnrealizedPnl / totalInvested) * 100 : 0;
  const totalReturnPct = startingCapital > 0 ? ((totalEquity - startingCapital) / startingCapital) * 100 : 0;
  const winningPositionsCount = openPositions.filter((p) => (p.unrealized_pnl || 0) > 0).length;
  const losingPositionsCount = openPositions.filter((p) => (p.unrealized_pnl || 0) < 0).length;

  const [sectorData, setSectorData] = useState(null);

  const fetchSectorExposure = async () => {
    try {
      const res = await fetch('/api/paper-trades/sector-exposure');
      if (res.ok) {
        const json = await res.json();
        setSectorData(json);
      }
    } catch {}
  };

  useEffect(() => {
    fetchSectorExposure();
  }, [positions, account]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (onRefreshQuotes) await onRefreshQuotes();
      await fetchSectorExposure();
    } finally {
      setRefreshing(false);
    }
  };

  const handleOpenNewTrade = (sym = '', strat = '') => {
    setSelectedStockForOrder(sym);
    setSelectedStrategyForOrder(strat);
    setIsOrderModalOpen(true);
  };

  const handleExecutePartialClose = (e) => {
    e.preventDefault();
    if (!partialModalPos) return;

    onClosePosition(
      partialModalPos.id,
      'PARTIAL_PROFIT_TAKE',
      partialModalPos.current_price || partialModalPos.entry_price,
      parseInt(partialQty) || 1
    );
    setPartialModalPos(null);
  };

  const handleEditCapitalSubmit = (e) => {
    e.preventDefault();
    if (onUpdateAccount) {
      onUpdateAccount({
        starting_capital: parseFloat(editCapital) || 1000000,
        risk_per_trade_pct: parseFloat(editRiskPct) || 1.0,
      });
    }
    setIsEditCapitalModalOpen(false);
  };

  const handleResetSubmit = (e) => {
    e.preventDefault();
    if (onResetAccount) {
      onResetAccount({
        starting_capital: parseFloat(resetCapital) || 1000000,
        risk_per_trade_pct: parseFloat(resetRiskPct) || 1.0,
        clear_ledger: true,
      });
    }
    setIsResetModalOpen(false);
  };

  // Filtered open positions
  const displayedPositions = useMemo(() => {
    if (activeFilter === 'IN_PROFIT') {
      return openPositions.filter((p) => (p.unrealized_pnl || 0) > 0);
    }
    if (activeFilter === 'NEEDS_ACTION') {
      return openPositions.filter((p) => p.exit_alert?.should_exit || p.target_1_hit || (p.stop_price < p.entry_price && (p.unrealized_pnl || 0) > 0));
    }
    return openPositions;
  }, [openPositions, activeFilter]);

  return (
    <div className="min-h-[calc(100vh-90px)] p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-7">
      {/* ===================================================================
          1. THE SOVEREIGN VAULT: NARRATIVE CAPITAL BRIEFING (Human & Cinematic)
          =================================================================== */}
      <div className="rounded-3xl border border-black/[0.06] dark:border-white/[0.07] bg-white dark:bg-[#111218] p-6 sm:p-8 shadow-sm backdrop-blur-2xl transition-colors space-y-6">
        {/* Top Header Row: Total Equity & Console Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-5 border-b border-black/[0.05] dark:border-white/[0.06]">
          <div>
            <div className="flex items-center space-x-2 text-[10px] font-mono tracking-widest text-zinc-400 uppercase font-semibold">
              <span>PORTFOLIO BRIEFING</span>
              <span className="text-zinc-300 dark:text-zinc-700">·</span>
              <span>SOVEREIGN VAULT</span>
            </div>
            
            <div className="flex flex-wrap items-baseline gap-3 mt-1.5">
              <span className="font-mono-num text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
                ₹{Math.round(totalEquity).toLocaleString('en-IN')}
              </span>
              <span className={`inline-flex items-center text-xs font-bold px-3 py-1 rounded-full ${
                totalCombinedPnl >= 0 
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20' 
                  : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20'
              }`}>
                {totalCombinedPnl >= 0 ? '+' : ''}₹{totalCombinedPnl.toFixed(1)} All-Time Return ({totalReturnPct >= 0 ? '+' : ''}{totalReturnPct.toFixed(2)}%)
              </span>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
              Starting capital: <strong className="text-zinc-800 dark:text-zinc-200 font-mono">₹{Math.round(startingCapital).toLocaleString('en-IN')}</strong> · 
              {' '}<strong className="text-zinc-900 dark:text-zinc-100 font-semibold">{openPositions.length} active trade campaign{openPositions.length !== 1 ? 's' : ''} in flight</strong>.
            </p>
          </div>

          {/* Quick Vault Action Console */}
          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center">
            <button
              onClick={() => handleOpenNewTrade()}
              className="flex items-center space-x-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 px-4 py-2 text-xs font-semibold shadow-sm transition active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Deploy New Trade</span>
            </button>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh Live Quotes"
              className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-zinc-900 p-2 text-zinc-600 dark:text-zinc-300 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-blue-500' : ''}`} />
            </button>

            <button
              onClick={() => setIsEditCapitalModalOpen(true)}
              title="Adjust Starting Capital & Risk Parameter"
              className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-zinc-900 p-2 text-zinc-600 dark:text-zinc-300 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition"
            >
              <Sliders className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={() => setIsResetModalOpen(true)}
              title="Reset Portfolio & Wipes Ledger"
              className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-2 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ===================================================================
            PROMINENT DUAL P&L SHOWCASE: UNREALIZED MTM & SETTLED REALIZED
            =================================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: LIVE UNREALIZED P&L (Floating MTM) */}
          <div className={`rounded-2xl p-5 border transition-all ${
            totalUnrealizedPnl >= 0 
              ? 'bg-gradient-to-br from-emerald-500/[0.08] via-emerald-500/[0.03] to-transparent border-emerald-500/30' 
              : 'bg-gradient-to-br from-rose-500/[0.08] via-rose-500/[0.03] to-transparent border-rose-500/30'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                {totalUnrealizedPnl >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                )}
                <span className="font-mono text-[11px] font-bold tracking-wider uppercase text-zinc-600 dark:text-zinc-300">
                  LIVE UNREALIZED P&L
                </span>
              </div>
              <span className={`inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                totalUnrealizedPnl >= 0 ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${totalUnrealizedPnl >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span>ACTIVE MTM</span>
              </span>
            </div>

            <div className={`font-mono-num text-3xl sm:text-4xl font-black tracking-tight ${
              totalUnrealizedPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}>
              {totalUnrealizedPnl >= 0 ? '+' : ''}₹{totalUnrealizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between text-xs text-zinc-500 font-mono gap-1">
              <span className={`font-bold ${unrealizedReturnPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {unrealizedReturnPct >= 0 ? '+' : ''}{unrealizedReturnPct.toFixed(2)}% ROI
              </span>
              <span>on ₹{Math.round(totalInvested).toLocaleString('en-IN')} deployed</span>
            </div>

            <div className="mt-3 pt-2.5 border-t border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500">
              <span>{winningPositionsCount} In Profit · {losingPositionsCount} Trailing</span>
              <span className="font-mono text-zinc-400">Risk at stop: ₹{Math.round(totalCapitalAtRisk).toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Card 2: NET REALIZED P&L (Banked / Settled Trades) */}
          <div className={`rounded-2xl p-5 border transition-all ${
            totalNetRealizedPnl >= 0 
              ? 'bg-gradient-to-br from-blue-500/[0.08] via-purple-500/[0.03] to-transparent border-blue-500/30 dark:border-purple-500/30' 
              : 'bg-gradient-to-br from-rose-500/[0.08] via-rose-500/[0.03] to-transparent border-rose-500/30'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <span className="font-mono text-[11px] font-bold tracking-wider uppercase text-zinc-600 dark:text-zinc-300">
                  NET REALIZED P&L
                </span>
              </div>
              <span className="inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                <span>SETTLED LEDGER</span>
              </span>
            </div>

            <div className={`font-mono-num text-3xl sm:text-4xl font-black tracking-tight ${
              totalNetRealizedPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}>
              {totalNetRealizedPnl >= 0 ? '+' : ''}₹{totalNetRealizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between text-xs text-zinc-500 font-mono gap-1">
              <span className="font-bold text-zinc-700 dark:text-zinc-300">
                {winRate}% Win Rate
              </span>
              <span>{closedPositions.length} closed trade{closedPositions.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="mt-3 pt-2.5 border-t border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500">
              <span>Profit Factor: <strong className="text-zinc-700 dark:text-zinc-300">{profitFactor}x</strong></span>
              <span className="font-mono text-amber-600 dark:text-amber-400">₹{Math.round(totalChargesPaid)} statutory fees paid</span>
            </div>
          </div>

          {/* Card 3: AVAILABLE DRY POWDER (Liquidity & Capital Reserves) */}
          <div className="rounded-2xl p-5 border border-black/[0.06] dark:border-white/[0.07] bg-black/[0.015] dark:bg-white/[0.02]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span className="font-mono text-[11px] font-bold tracking-wider uppercase text-zinc-600 dark:text-zinc-300">
                  AVAILABLE CASH
                </span>
              </div>
              <span className="inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-400">
                <span>DRY POWDER</span>
              </span>
            </div>

            <div className="font-mono-num text-3xl sm:text-4xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
              ₹{Math.round(availableCash).toLocaleString('en-IN')}
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between text-xs text-zinc-500 font-mono gap-1">
              <span className="font-bold text-zinc-700 dark:text-zinc-300">
                {((availableCash / (totalEquity || 1)) * 100).toFixed(1)}% Reserves
              </span>
              <span>₹{Math.round(totalInvested).toLocaleString('en-IN')} in play</span>
            </div>

            <div className="mt-3 pt-2.5 border-t border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500">
              <span>Avg Return: <strong className="text-zinc-700 dark:text-zinc-300">{avgRMultiple}R</strong></span>
              <span className="font-mono text-zinc-400">{openPositions.length} campaign{openPositions.length !== 1 ? 's' : ''} running</span>
            </div>
          </div>
        </div>

        {/* Comprehensive Sector Coverage & Risk Breakdown */}
        {sectorData?.sectors && sectorData.sectors.length > 0 && (
          <div className="mt-5 pt-4 border-t border-black/[0.05] dark:border-white/[0.06]">
            <div className="flex flex-wrap items-center justify-between mb-2.5 text-xs gap-2">
              <div className="flex items-center space-x-2">
                <PieChart className="h-3.5 w-3.5 text-zinc-400" />
                <span className="font-mono text-[10px] tracking-wider text-zinc-400 uppercase font-semibold">
                  Portfolio Sector Exposure ({sectorData.sectors.length} Active Sectors)
                </span>
              </div>
              <span className="text-[11px] font-mono text-zinc-400">
                Total Risk at Stop: <strong className="text-rose-600 dark:text-rose-400">₹{Math.round(sectorData?.total_risk_at_stop != null ? sectorData.total_risk_at_stop : totalCapitalAtRisk).toLocaleString('en-IN')}</strong> ({sectorData?.total_risk_at_stop_pct ?? ((totalCapitalAtRisk / (totalEquity || 1)) * 100).toFixed(1)}% equity)
              </span>
            </div>

            {/* Visual Stacked Progress Bar */}
            <div className="flex h-2 w-full rounded-full overflow-hidden bg-black/[0.04] dark:bg-white/[0.06] p-0.5 mb-3">
              {sectorData.sectors.map((sec, idx) => {
                const palette = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-cyan-500', 'bg-rose-500', 'bg-indigo-500'];
                return (
                  <div
                    key={sec.sector}
                    style={{ width: `${Math.max(2, sec.percentage)}%` }}
                    className={`${palette[idx % palette.length]} h-full transition-all`}
                    title={`${sec.sector}: ${sec.percentage}% (₹${Math.round(sec.amount).toLocaleString('en-IN')})`}
                  />
                );
              })}
              {sectorData.available_cash > 0 && (
                <div
                  style={{ width: `${Math.min(100, Math.max(2, (sectorData.available_cash / totalEquity) * 100))}%` }}
                  className="bg-zinc-300 dark:bg-zinc-700/60 h-full"
                  title={`Available Cash: ${((sectorData.available_cash / totalEquity) * 100).toFixed(1)}%`}
                />
              )}
            </div>

            {/* Sector detail cards grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
              {sectorData.sectors.map((sec, idx) => {
                const isOverweight = sec.percentage > 30.0;
                const dotPalette = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-cyan-500', 'bg-rose-500', 'bg-indigo-500'];
                return (
                  <div
                    key={sec.sector}
                    className={`rounded-2xl p-2.5 border transition ${
                      isOverweight
                        ? 'border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10'
                        : 'border-black/[0.04] dark:border-white/[0.05] bg-black/[0.02] dark:bg-white/[0.02]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 truncate">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${dotPalette[idx % dotPalette.length]}`} />
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{sec.sector}</span>
                      </div>
                      <span className="font-bold font-mono-num text-zinc-900 dark:text-zinc-100 ml-1">
                        {sec.percentage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-1">
                      <span>₹{Math.round(sec.amount).toLocaleString('en-IN')}</span>
                      {isOverweight ? (
                        <span className="text-amber-600 dark:text-amber-400 font-bold">⚠️ &gt;30%</span>
                      ) : (
                        <span>{sec.percentage < 15 ? 'Balanced' : 'Core'}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================
          2. THE TRADE FLIGHT STRIPS (Wide Horizontal Precision Tickets)
          =================================================================== */}
      <div className="space-y-4">
        {/* Strip Header & Quick Filter Pills */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Active Trade Flight Strips ({openPositions.length})
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${
                totalUnrealizedPnl >= 0 
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' 
                  : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20'
              }`}>
                Live MTM: {totalUnrealizedPnl >= 0 ? '+' : ''}₹{totalUnrealizedPnl.toFixed(1)}
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">Live trailing runways, target brackets, statutory friction, and execution controls</p>
          </div>

          <div className="flex items-center space-x-1.5 p-0.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04]">
            {[
              { id: 'ALL', label: 'All In Flight' },
              { id: 'IN_PROFIT', label: 'In Profit' },
              { id: 'NEEDS_ACTION', label: 'Alerts / Actions' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                  activeFilter === f.id
                    ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Flight Strip Deck */}
        {openPositions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-black/[0.08] dark:border-white/[0.1] p-16 text-center">
            <Compass className="h-8 w-8 text-zinc-400 mx-auto mb-2 opacity-50" />
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">No Active Flight Strips</h3>
            <p className="mt-1 text-xs text-zinc-500 max-w-sm mx-auto">
              You currently have no positions open. Scan high-probability setups from the Screener or click "Deploy New Trade".
            </p>
          </div>
        ) : displayedPositions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-black/[0.08] dark:border-white/[0.1] p-12 text-center text-xs text-zinc-500">
            No active positions match the selected filter.
          </div>
        ) : (
          <div className="space-y-3.5">
            {displayedPositions.map((pos) => {
              const entryP = pos.entry_price || 0;
              const stopP = pos.stop_price || 0;
              const currP = pos.current_price || entryP;
              const t1 = pos.target_1 || (entryP + 2 * (entryP - stopP));
              const t2 = pos.target_2 || (entryP + 3 * (entryP - stopP));

              const pnl = pos.unrealized_pnl || 0;
              const pnlPct = pos.unrealized_pnl_pct || 0;
              const rMult = pos.r_multiple ?? (entryP > stopP ? ((currP - entryP) / (entryP - stopP)).toFixed(2) : '0.0');

              const isExitAlert = pos.exit_alert?.should_exit;
              const isTargetHit = pos.exit_alert?.target_reached || pos.target_1_hit;
              const isBreakevenProtected = stopP >= entryP;

              // Full 5-point runway spanning from stop to Target 2 (or higher live price)
              const runwayMax = Math.max(currP, t2 && t2 > t1 ? t2 : t1);
              const runwayTotal = Math.max(1, runwayMax - stopP);
              const progressPct = Math.min(100, Math.max(0, ((currP - stopP) / runwayTotal) * 100));
              const entryPosPct = Math.min(95, Math.max(5, ((entryP - stopP) / runwayTotal) * 100));
              const t1PosPct = Math.min(95, Math.max(5, ((t1 - stopP) / runwayTotal) * 100));
              const t2PosPct = t2 ? Math.min(95, Math.max(5, ((t2 - stopP) / runwayTotal) * 100)) : null;

              // Statutory cost itemization & net realism
              const buyCharges = pos.buy_charges || 0;
              const estRoundTripFees = buyCharges * 2;
              const estNetPnl = pnl - estRoundTripFees;
              const initialRiskRupees = Math.max(0, (entryP - stopP) * pos.quantity);

              return (
                <div
                  key={pos.id}
                  className={`rounded-2xl border transition-all duration-200 p-5 ${
                    isExitAlert
                      ? 'border-rose-500/40 bg-rose-500/[0.03] dark:bg-rose-500/[0.05] shadow-sm ring-1 ring-rose-500/20'
                      : isTargetHit
                      ? 'border-emerald-500/40 bg-emerald-500/[0.03] dark:bg-emerald-500/[0.05] shadow-sm ring-1 ring-emerald-500/20'
                      : 'border-black/[0.06] dark:border-white/[0.07] bg-white dark:bg-[#121319] hover:border-black/15 dark:hover:border-white/15 shadow-sm'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    {/* 1. TICKET STUB (Identity & Strategy) */}
                    <div className="lg:w-64 shrink-0">
                      <div className="flex items-center space-x-2.5">
                        <span className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
                          {pos.ticker}
                        </span>
                        <span className="rounded-md border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.03] px-1.5 py-0.2 font-mono text-[10px] text-zinc-500">
                          {pos.quantity} shares
                        </span>
                        {isBreakevenProtected && (
                          <span className="flex items-center space-x-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded" title="Stop moved to buy price (Guaranteed risk-free trade)">
                            <Lock className="h-2.5 w-2.5" />
                            <span>Risk-Free</span>
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-zinc-500 font-medium mt-0.5 truncate">
                        {pos.strategy_name} · In flight {pos.holding_sessions || 0}d
                      </div>

                      <div className="mt-1 text-[11px] font-mono text-zinc-400">
                        Invested: ₹{(entryP * pos.quantity).toLocaleString('en-IN')}
                      </div>
                    </div>

                    {/* 2. THE RUNWAY (Live Trailing Progress Track with T1 and T2) */}
                    <div className="flex-1 px-1 lg:px-4">
                      {/* Price Level Badges (Stop, Entry, Live, Target 1, Target 2) */}
                      <div className="flex flex-wrap items-center justify-between text-[11px] font-mono mb-1.5 gap-1">
                        <span className="text-rose-600 dark:text-rose-400 font-semibold">
                          Stop ₹{stopP.toFixed(1)}
                        </span>
                        <span className="text-zinc-400">
                          Entry ₹{entryP.toFixed(1)}
                        </span>
                        <span className="font-bold text-zinc-900 dark:text-zinc-100">
                          Live ₹{currP.toFixed(1)}
                        </span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          T1 (2R) ₹{t1.toFixed(1)}
                        </span>
                        <span className="text-purple-600 dark:text-purple-400 font-semibold">
                          T2 (3R) ₹{t2.toFixed(1)}
                        </span>
                      </div>

                      {/* Tactile Runway Bar */}
                      <div className="relative h-2 w-full rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden flex">
                        {/* Entry marker */}
                        <div
                          style={{ left: `${entryPosPct}%` }}
                          className="absolute top-0 bottom-0 w-0.5 bg-zinc-400 z-10"
                          title={`Entry Price: ₹${entryP.toFixed(1)}`}
                        />
                        {/* Target 1 marker */}
                        <div
                          style={{ left: `${t1PosPct}%` }}
                          className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 z-10"
                          title={`Target 1 (2R): ₹${t1.toFixed(1)}`}
                        />
                        {/* Target 2 marker */}
                        {t2PosPct && (
                          <div
                            style={{ left: `${t2PosPct}%` }}
                            className="absolute top-0 bottom-0 w-0.5 bg-purple-400 z-10"
                            title={`Target 2 (3R): ₹${t2.toFixed(1)}`}
                          />
                        )}
                        {/* Progress fill */}
                        <div
                          style={{ width: `${progressPct}%` }}
                          className={`h-full transition-all duration-300 ${
                            currP < entryP
                              ? 'bg-rose-500'
                              : currP >= t1
                              ? 'bg-emerald-500'
                              : 'bg-emerald-500/80'
                          }`}
                        />
                      </div>

                      {/* Status / Alert Microcopy & Trailing Telemetry */}
                      <div className="mt-1.5 flex flex-wrap items-center justify-between text-[10px] gap-2">
                        <span className="text-zinc-500 font-medium">
                          {isExitAlert ? (
                            <strong className="text-rose-600 dark:text-rose-400 font-semibold flex items-center">
                              <AlertTriangle className="h-3 w-3 mr-1 inline shrink-0" />
                              <span>Exit Signal: {pos.exit_alert?.reason} {pos.exit_alert?.suggested_exit_price ? `@ ₹${pos.exit_alert.suggested_exit_price.toFixed(1)}` : ''}</span>
                            </strong>
                          ) : isTargetHit ? (
                            <strong className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center">
                              <Target className="h-3 w-3 mr-1 inline shrink-0" />
                              <span>Target 1 Reached (2R) · Bank 50% profits & trail stop to breakeven</span>
                            </strong>
                          ) : currP >= entryP ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              Trending above entry · In profit buffer
                            </span>
                          ) : (
                            <span className="text-zinc-400">Within risk tolerance buffer</span>
                          )}
                        </span>

                        <div className="flex items-center space-x-3 font-mono text-zinc-400 text-[10px]">
                          {pos.peak_price != null && (
                            <span>Peak: ₹{pos.peak_price.toFixed(1)}</span>
                          )}
                          <span>Risk: ₹{initialRiskRupees.toFixed(0)} at stop</span>
                        </div>
                      </div>
                    </div>

                    {/* 3. HERO POSITION UNREALIZED P&L & TACTILE CONTROLS */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between lg:justify-end gap-3.5 pt-3 lg:pt-0 border-t lg:border-t-0 border-black/[0.04] dark:border-white/[0.05]">
                      {/* Prominent High-Visibility Position P&L Card */}
                      <div className={`rounded-2xl p-3.5 border font-mono text-left sm:text-right min-w-[190px] shadow-sm transition-all ${
                        pnl >= 0 
                          ? 'bg-emerald-500/[0.07] border-emerald-500/25 dark:bg-emerald-500/[0.1]' 
                          : 'bg-rose-500/[0.07] border-rose-500/25 dark:bg-rose-500/[0.1]'
                      }`}>
                        <div className="flex items-center justify-between sm:justify-end space-x-1.5 text-[9px] uppercase tracking-wider font-bold text-zinc-400">
                          <span>UNREALIZED P&L</span>
                          <span className={`h-1.5 w-1.5 rounded-full ${pnl >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        </div>
                        <div className={`text-xl font-black font-mono-num mt-0.5 tracking-tight ${
                          pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}>
                          {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(1)}
                        </div>
                        <div className="flex items-center justify-between sm:justify-end space-x-1.5 text-xs font-bold mt-0.5">
                          <span className={pnlPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                            {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                          </span>
                          <span className="text-zinc-300 dark:text-zinc-600">·</span>
                          <span className="text-blue-600 dark:text-blue-400 font-extrabold">{rMult}R</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 font-medium" title="Estimated net gain after statutory fees and transaction friction">
                          Net ~₹{estNetPnl.toFixed(1)} <span className="opacity-70">(₹{Math.round(estRoundTripFees)} fees)</span>
                        </div>
                      </div>

                      {/* Action Micro-Buttons */}
                      <div className="flex items-center space-x-1.5 shrink-0 self-end sm:self-center">
                        {/* Lock Breakeven */}
                        {stopP < entryP && (
                          <button
                            onClick={() => onUpdateStop && onUpdateStop(pos.id, entryP)}
                            className="flex items-center space-x-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 text-xs font-semibold transition"
                            title="Move safety stop to your buy price so you cannot lose money on this trade"
                          >
                            <Lock className="h-3 w-3" />
                            <span className="hidden sm:inline">Lock B/E</span>
                          </button>
                        )}

                        {/* Partial Scale Out (Sell 50%) */}
                        {pos.quantity > 1 && (
                          <button
                            onClick={() => {
                              setPartialModalPos(pos);
                              setPartialQty(Math.floor(pos.quantity / 2));
                            }}
                            className="flex items-center space-x-1 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-400 px-3 py-1.5 text-xs font-semibold transition"
                            title="Sell 50% shares to lock profit"
                          >
                            <Scissors className="h-3 w-3" />
                            <span className="hidden sm:inline">Bank 50%</span>
                          </button>
                        )}

                        {/* Liquidate / Close */}
                        <button
                          onClick={() =>
                            onClosePosition(
                              pos.id,
                              isExitAlert ? pos.exit_alert?.reason : isTargetHit ? 'TARGET_REACHED' : 'MANUAL_CLOSE',
                              currP
                            )
                          }
                          className="rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 px-3.5 py-1.5 text-xs font-bold shadow-sm transition active:scale-95"
                        >
                          Exit
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===================================================================
          3. THE JOURNAL ARCHIVE: CLOSED TRADES RECEIPT BLOTTER
          =================================================================== */}
      {closedPositions.length > 0 && (
        <div className="rounded-3xl border border-black/[0.06] dark:border-white/[0.07] bg-white dark:bg-[#121319] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                The Ledger Journal ({closedPositions.length} Closed Trades)
              </h3>
              <p className="text-xs text-zinc-500">Transparent receipt of realized profit, loss, and statutory deductions</p>
            </div>
          </div>

          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse min-w-[850px] text-xs">
              <thead>
                <tr className="border-b border-black/[0.05] dark:border-white/[0.06] bg-black/[0.015] dark:bg-white/[0.02] text-[10px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                  <th className="py-2.5 px-3">TICKER</th>
                  <th className="py-2.5 px-3">STRATEGY</th>
                  <th className="py-2.5 px-3">ENTRY</th>
                  <th className="py-2.5 px-3">EXIT</th>
                  <th className="py-2.5 px-3">QTY</th>
                  <th className="py-2.5 px-3">GROSS P&L</th>
                  <th className="py-2.5 px-3">STATUTORY FEES</th>
                  <th className="py-2.5 px-3">NET P&L</th>
                  <th className="py-2.5 px-3">R-MULTIPLE</th>
                  <th className="py-2.5 px-3 pr-6">EXIT REASON</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.05] font-mono">
                {closedPositions.map((cp) => {
                  const netPnl = cp.net_pnl ?? cp.realized_pnl ?? 0;
                  const totalCharges = cp.total_charges ?? ((cp.buy_charges || 0) + (cp.sell_charges || 0));
                  const rMult = cp.r_multiple ?? 0.0;

                  return (
                    <tr key={cp.id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition">
                      <td className="py-3 px-3 font-bold text-zinc-900 dark:text-zinc-100">{cp.ticker}</td>
                      <td className="py-3 px-3 text-zinc-500">{cp.strategy_name}</td>
                      <td className="py-3 px-3 font-mono-num text-zinc-600 dark:text-zinc-300">₹{cp.entry_price?.toFixed(1)}</td>
                      <td className="py-3 px-3 font-mono-num text-zinc-600 dark:text-zinc-300">₹{cp.exit_price?.toFixed(1)}</td>
                      <td className="py-3 px-3 text-zinc-500">{cp.quantity}</td>
                      <td className="py-3 px-3 font-mono-num text-zinc-600 dark:text-zinc-300">₹{cp.realized_pnl?.toFixed(1)}</td>
                      <td className="py-3 px-3 font-mono-num text-amber-600 dark:text-amber-400">₹{totalCharges.toFixed(1)}</td>
                      <td className={`py-3 px-3 font-bold font-mono-num ${netPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {netPnl >= 0 ? '+' : ''}₹{netPnl.toFixed(1)}
                      </td>
                      <td className={`py-3 px-3 font-semibold ${rMult >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {rMult >= 0 ? '+' : ''}{rMult}R
                      </td>
                      <td className="py-3 px-3 pr-6 text-zinc-500 text-[11px]">{cp.exit_reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================
          4. GLOBAL ORDER & SCALE-OUT MODALS
          =================================================================== */}
      <OrderExecutionModal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        initialTicker={selectedStockForOrder}
        initialStrategy={selectedStrategyForOrder}
        candidateList={candidates}
        onOrderSubmitted={onAddPosition}
        account={account}
      />

      {/* Partial Profit Scale-Out Modal */}
      {partialModalPos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#151722] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] pb-3 mb-4">
              <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">Bank 50% Profit</h3>
              <button onClick={() => setPartialModalPos(null)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-500 leading-relaxed mb-4">
              Scale out partial shares to permanently lock in gains at Target 1 while letting remaining shares trail risk-free.
            </p>

            <form onSubmit={handleExecutePartialClose} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-500 block mb-1">Shares to Liquidate</label>
                <input
                  type="number"
                  min="1"
                  max={partialModalPos.quantity - 1}
                  value={partialQty}
                  onChange={(e) => setPartialQty(Math.min(partialModalPos.quantity - 1, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-full rounded-xl border border-black/[0.1] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.03] p-2.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none font-bold"
                  required
                />
                <span className="text-[10px] text-zinc-400 mt-1 block">
                  Holding {partialModalPos.quantity} shares ({partialModalPos.quantity - partialQty} will remain active)
                </span>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPartialModalPos(null)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold px-5 py-2 text-xs shadow-md transition"
                >
                  Bank Profit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Capital Settings Modal */}
      {isEditCapitalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#151722] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] pb-3 mb-4">
              <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">Capital & Risk Parameters</h3>
              <button onClick={() => setIsEditCapitalModalOpen(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleEditCapitalSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-500 block mb-1">Starting Capital (₹)</label>
                <input
                  type="number"
                  step="10000"
                  value={editCapital}
                  onChange={(e) => setEditCapital(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.1] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.03] p-2.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none font-bold"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-500 block mb-1">Risk per Trade (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="10.0"
                  value={editRiskPct}
                  onChange={(e) => setEditRiskPct(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.1] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.03] p-2.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none font-bold"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditCapitalModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold px-5 py-2 text-xs shadow-md transition"
                >
                  Save Parameters
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Portfolio Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl border border-rose-500/25 bg-white dark:bg-[#151722] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] pb-3 mb-4">
              <h3 className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Reset Paper Portfolio</h3>
              <button onClick={() => setIsResetModalOpen(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">
              This will completely wipe your paper trading ledger and reset all open positions and historical trades.
            </p>

            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-500 block mb-1">New Starting Capital (₹)</label>
                <input
                  type="number"
                  step="10000"
                  value={resetCapital}
                  onChange={(e) => setResetCapital(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.1] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.03] p-2.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none font-bold"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold px-5 py-2 text-xs shadow-md transition"
                >
                  Wipe & Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
