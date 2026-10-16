import React, { useState, useEffect } from 'react';
import { 
  Briefcase, 
  AlertTriangle, 
  ShieldCheck, 
  CheckCircle2, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  X, 
  RefreshCw, 
  Target, 
  Percent, 
  ArrowUpRight, 
  ArrowDownRight,
  Sliders,
  DollarSign,
  Scale,
  RotateCcw,
  PieChart
} from 'lucide-react';
import OrderExecutionModal from '../../components/OrderExecutionModal';

export default function PortfolioTab({ 
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

  // Account metric fallbacks if account not loaded yet
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

  const [sectorData, setSectorData] = useState(null);
  const [loadingSector, setLoadingSector] = useState(false);

  const fetchSectorExposure = async () => {
    setLoadingSector(true);
    try {
      const res = await fetch('/api/paper-trades/sector-exposure');
      if (res.ok) {
        const json = await res.json();
        setSectorData(json);
      }
    } catch {
      // Background sector fetch failure safely ignored
    } finally {
      setLoadingSector(false);
    }
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


  return (
    <div className="min-h-[calc(100vh-100px)] p-6">
      {/* 1. Institutional Portfolio Cockpit */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Total Equity */}
        <div className="rounded-xl border border-white/[0.08] bg-[#0c0c10]/80 p-4 shadow-lg backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
            <span>TOTAL EQUITY</span>
            <DollarSign className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-zinc-100">
            ₹{Math.round(totalEquity).toLocaleString('en-IN')}
          </div>
          <div className="mt-1 text-[10px] text-zinc-500 font-mono">
            Cash + Live Open MTM
          </div>
        </div>

        {/* Available Cash */}
        <div className="rounded-xl border border-white/[0.08] bg-[#0c0c10]/80 p-4 shadow-lg backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
            <span>AVAILABLE CASH</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-zinc-100">
            ₹{Math.round(availableCash).toLocaleString('en-IN')}
          </div>
          <div className="mt-1 text-[10px] text-zinc-500 font-mono">
            Unencumbered capital
          </div>
        </div>

        {/* Unrealized P&L */}
        <div className="rounded-xl border border-white/[0.08] bg-[#0c0c10]/80 p-4 shadow-lg backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
            <span>UNREALIZED P&L</span>
            {totalUnrealizedPnl >= 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-rose-400" />
            )}
          </div>
          <div className={`mt-2 text-xl font-bold font-mono ${totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalUnrealizedPnl >= 0 ? '+' : ''}₹{totalUnrealizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-[10px] text-zinc-500 font-mono">
            {openPositions.length} active position(s)
          </div>
        </div>

        {/* Realized Net P&L */}
        <div className="rounded-xl border border-white/[0.08] bg-[#0c0c10]/80 p-4 shadow-lg backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
            <span>NET REALIZED P&L</span>
            <CheckCircle2 className="h-4 w-4 text-purple-400" />
          </div>
          <div className={`mt-2 text-xl font-bold font-mono ${totalNetRealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalNetRealizedPnl >= 0 ? '+' : ''}₹{totalNetRealizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-[10px] text-zinc-500 font-mono">
            After ₹{Math.round(totalChargesPaid)} charges
          </div>
        </div>

        {/* Win Rate & Profit Factor */}
        <div className="rounded-xl border border-white/[0.08] bg-[#0c0c10]/80 p-4 shadow-lg backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
            <span>WIN RATE</span>
            <Percent className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-zinc-100">
            {winRate}%
          </div>
          <div className="mt-1 text-[10px] text-zinc-500 font-mono">
            Profit Factor: {profitFactor}x · Avg R: {avgRMultiple}R
          </div>
        </div>

        {/* Action Center */}
        <div className="flex flex-col justify-between rounded-xl border border-white/[0.08] bg-[#0c0c10]/80 p-4 shadow-lg backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-zinc-400">ACTIONS</span>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              title="Refresh Quotes"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-rose-400' : ''}`} />
            </button>
          </div>
          <div className="flex items-center space-x-1.5 mt-2">
            <button
              onClick={() => handleOpenNewTrade()}
              className="flex-1 flex items-center justify-center space-x-1 rounded-lg bg-gradient-to-r from-[#c9183b] to-[#a1112e] px-2.5 py-1.5 font-mono text-xs font-bold text-white shadow-md shadow-rose-950/60 transition hover:from-[#e11d48] hover:to-[#be123c] active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Trade</span>
            </button>
            <button
              onClick={() => setIsEditCapitalModalOpen(true)}
              className="rounded-lg border border-zinc-800 p-1.5 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200 transition"
              title="Edit Capital & Risk (Preserves Trades)"
            >
              <Sliders className="h-3.5 w-3.5 text-rose-400" />
            </button>
            <button
              onClick={() => setIsResetModalOpen(true)}
              className="rounded-lg border border-zinc-800 p-1.5 text-zinc-500 hover:border-rose-900 hover:bg-rose-950/40 hover:text-rose-300 transition"
              title="Reset Portfolio & Clear All Trades"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Sector Allocation & Portfolio Risk Breakdown */}
      <div className="mb-6 rounded-xl border border-white/[0.08] bg-[#0c0c10]/80 p-5 shadow-lg backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between border-b border-zinc-900 pb-3 gap-2">
          <div className="flex items-center space-x-2">
            <PieChart className="h-4 w-4 text-rose-400" />
            <h2 className="font-mono text-xs font-bold tracking-wider uppercase text-zinc-200">
              PORTFOLIO SECTOR COVERAGE & RISK EXPOSURE
            </h2>
          </div>
          <div className="flex items-center space-x-4 font-mono text-xs text-zinc-400">
            <div>
              Total Risk at Stop:{' '}
              <span className="font-bold text-rose-400">
                ₹{sectorData?.total_risk_at_stop != null ? Math.round(sectorData.total_risk_at_stop).toLocaleString('en-IN') : Math.round(totalCapitalAtRisk).toLocaleString('en-IN')}
              </span>{' '}
              <span className="text-[10px] text-zinc-500">
                ({sectorData?.total_risk_at_stop_pct ?? 0}% equity)
              </span>
            </div>
            <div>
              Active Sectors:{' '}
              <span className="font-bold text-zinc-200">
                {sectorData?.sectors?.length || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Visual Stacked Progress Bar */}
        {sectorData?.sectors && sectorData.sectors.length > 0 ? (
          <div className="mt-4">
            <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-zinc-900 p-0.5 border border-zinc-800">
              {sectorData.sectors.map((sec, idx) => {
                const colors = [
                  'bg-rose-500',
                  'bg-blue-500',
                  'bg-emerald-500',
                  'bg-amber-500',
                  'bg-purple-500',
                  'bg-cyan-500',
                  'bg-pink-500',
                  'bg-indigo-500',
                ];
                const color = colors[idx % colors.length];
                const widthPct = Math.min(100, Math.max(1, sec.percentage));
                return (
                  <div
                    key={sec.sector}
                    style={{ width: `${widthPct}%` }}
                    className={`${color} h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full relative group cursor-pointer`}
                    title={`${sec.sector}: ${sec.percentage}% (₹${Math.round(sec.amount).toLocaleString('en-IN')})`}
                  />
                );
              })}
              {/* Remaining Cash Allocation segment */}
              {sectorData.available_cash > 0 && sectorData.total_equity > 0 && (
                <div
                  style={{
                    width: `${Math.min(100, Math.max(1, (sectorData.available_cash / sectorData.total_equity) * 100))}%`,
                  }}
                  className="bg-zinc-700/60 h-full transition-all duration-500 last:rounded-r-full cursor-pointer"
                  title={`Available Cash: ${((sectorData.available_cash / sectorData.total_equity) * 100).toFixed(1)}% (₹${Math.round(sectorData.available_cash).toLocaleString('en-IN')})`}
                />
              )}
            </div>

            {/* Sector detail cards grid */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 font-mono text-xs">
              {sectorData.sectors.map((sec, idx) => {
                const isOverweight = sec.percentage > 30.0;
                const dotColors = [
                  'bg-rose-500',
                  'bg-blue-500',
                  'bg-emerald-500',
                  'bg-amber-500',
                  'bg-purple-500',
                  'bg-cyan-500',
                  'bg-pink-500',
                  'bg-indigo-500',
                ];
                const dotColor = dotColors[idx % dotColors.length];
                return (
                  <div
                    key={sec.sector}
                    className={`rounded-lg border p-3 ${
                      isOverweight
                        ? 'border-amber-800/60 bg-amber-950/20'
                        : 'border-zinc-800/80 bg-zinc-900/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-2 truncate">
                        <span className={`h-2.5 w-2.5 rounded-full ${dotColor} shrink-0`} />
                        <span className="font-semibold text-zinc-200 truncate" title={sec.sector}>
                          {sec.sector}
                        </span>
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded shrink-0 ${
                        isOverweight
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-zinc-800 text-zinc-300'
                      }`}>
                        {sec.percentage}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span>₹{Math.round(sec.amount).toLocaleString('en-IN')}</span>
                      <span>{sec.positions_count} trade{sec.positions_count > 1 ? 's' : ''} ({sec.tickers.join(', ')})</span>
                    </div>
                    {isOverweight && (
                      <div className="mt-1.5 flex items-center space-x-1 text-[10px] text-amber-400">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <span>Concentration Alert &gt;30%</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Cash allocation chip */}
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3 font-mono text-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center space-x-2 truncate">
                    <span className="h-2.5 w-2.5 rounded-full bg-zinc-500 shrink-0" />
                    <span className="font-semibold text-zinc-300">Unallocated Cash</span>
                  </div>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                    {sectorData.total_equity > 0
                      ? ((sectorData.available_cash / sectorData.total_equity) * 100).toFixed(1)
                      : 100}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>₹{Math.round(sectorData.available_cash).toLocaleString('en-IN')}</span>
                  <span>Dry Powder</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center font-mono text-xs text-zinc-500">
            No active positions open. Deploy capital from Deep Dive to see live sector coverage and risk allocations.
          </div>
        )}
      </div>

      {/* 2. Active Positions Section */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h2 className="font-mono text-sm font-semibold tracking-wide text-zinc-200">
              ACTIVE TRADES ({openPositions.length})
            </h2>
            <span className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
              Capital at Risk: ₹{totalCapitalAtRisk.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center space-x-3 text-xs font-mono text-zinc-500">
            <span>R:R Target 1 = 2.0R</span>
            <span>·</span>
            <span>Target 2 = 3.0R</span>
          </div>
        </div>

        {openPositions.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {openPositions.map((pos) => {
              const exitAlert = pos.exit_alert || {};
              const isAlert = exitAlert.should_exit;
              const isTargetHit = exitAlert.target_reached || pos.target_1_hit;
              const pnl = pos.unrealized_pnl || 0;
              const pnlPct = pos.unrealized_pnl_pct || 0;
              const rMultiple = pos.r_multiple ?? (pos.entry_price > pos.stop_price ? ((pos.current_price - pos.entry_price) / (pos.entry_price - pos.stop_price)).toFixed(2) : '0.0');

              const entryP = pos.entry_price || 0;
              const stopP = pos.stop_price || 0;
              const currP = pos.current_price || entryP;
              const t1 = pos.target_1 || roundTwo(entryP + 2 * (entryP - stopP));
              const t2 = pos.target_2 || roundTwo(entryP + 3 * (entryP - stopP));

              // Compute bracket bar fill percentage
              const totalSpan = Math.max(1, t2 - stopP);
              const progressPct = Math.min(100, Math.max(0, ((currP - stopP) / totalSpan) * 100));
              const entryMarkerPct = Math.min(100, Math.max(0, ((entryP - stopP) / totalSpan) * 100));
              const t1MarkerPct = Math.min(100, Math.max(0, ((t1 - stopP) / totalSpan) * 100));

              return (
                <div
                  key={pos.id}
                  className={`rounded-xl border p-5 transition ${
                    isAlert
                      ? 'border-rose-600/80 bg-rose-950/20'
                      : isTargetHit
                      ? 'border-emerald-600/80 bg-emerald-950/20'
                      : 'border-zinc-800/80 bg-zinc-950'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-lg font-bold text-zinc-100">
                          {pos.ticker}
                        </span>
                        <span className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                          {pos.strategy_name}
                        </span>
                        <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                          {pos.order_type || 'MARKET'}
                        </span>
                      </div>
                      <div className="mt-0.5 font-mono text-xs text-zinc-500">
                        Entry: {pos.entry_date} · {pos.holding_sessions || 0} sessions held
                      </div>
                    </div>

                    <div className="text-right font-mono">
                      <div className={`text-base font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
                      </div>
                      <div className="text-[11px] text-cyan-400 font-bold">
                        {rMultiple >= 0 ? '+' : ''}{rMultiple} R
                      </div>
                    </div>
                  </div>

                  {/* Price Metrics Grid */}
                  <div className="mt-4 grid grid-cols-4 gap-2 rounded-lg border border-zinc-900 bg-zinc-900/40 p-2.5 text-center font-mono text-xs">
                    <div>
                      <div className="text-[9px] text-zinc-500">STOP LOSS</div>
                      <div className="text-xs font-bold text-rose-400">₹{stopP.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-zinc-500">ENTRY PRICE</div>
                      <div className="text-xs font-semibold text-zinc-300">₹{entryP.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-zinc-500">CURRENT</div>
                      <div className="text-xs font-bold text-zinc-100">₹{currP.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-zinc-500">TARGET 1 (2R)</div>
                      <div className="text-xs font-bold text-emerald-400">₹{t1.toFixed(2)}</div>
                    </div>
                  </div>

                  {/* Visual R:R Bracket Tracker */}
                  <div className="mt-3.5">
                    <div className="mb-1 flex justify-between font-mono text-[10px] text-zinc-400">
                      <span className="text-rose-400">Stop: ₹{stopP.toFixed(2)}</span>
                      <span className="text-zinc-400">Entry: ₹{entryP.toFixed(2)}</span>
                      <span className="text-emerald-400">T1: ₹{t1.toFixed(2)}</span>
                      <span className="text-rose-400">T2: ₹{t2.toFixed(2)}</span>
                    </div>

                    {/* Progress Track */}
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-900 border border-zinc-800">
                      {/* Entry line */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-zinc-500 z-10"
                        style={{ left: `${entryMarkerPct}%` }}
                      />
                      {/* T1 line */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-emerald-500/80 z-10"
                        style={{ left: `${t1MarkerPct}%` }}
                      />
                      {/* Fill bar */}
                      <div
                        className={`h-full transition-all duration-500 ${
                          currP < entryP
                            ? 'bg-rose-500/80'
                            : currP >= t1
                            ? 'bg-emerald-500'
                            : 'bg-rose-500'
                        }`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Target 1 Reached Alert Banner */}
                  {isTargetHit && !isAlert && (
                    <div className="mt-3 flex items-center justify-between rounded-lg border border-emerald-600/60 bg-emerald-950/60 p-2.5 text-xs">
                      <div className="flex items-center space-x-2 text-emerald-300 font-mono">
                        <Target className="h-4 w-4 shrink-0" />
                        <div>
                          <span className="font-bold">TARGET 1 REACHED (2R): </span>
                          <span>Consider booking 50% partial profit and trailing stop to breakeven.</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Automated Exit Trigger Banner */}
                  {isAlert && (
                    <div className="mt-3 flex items-center justify-between rounded-lg border border-rose-600/60 bg-rose-950/60 p-2.5 text-xs">
                      <div className="flex items-center space-x-2 text-rose-300 font-mono">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <div>
                          <span className="font-bold">EXIT TRIGGERED: </span>
                          <span>{exitAlert.reason}</span>
                          {exitAlert.suggested_exit_price && (
                            <span className="ml-1 font-semibold">
                              @ ₹{exitAlert.suggested_exit_price.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Position Action Controls */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-900 pt-3">
                    <div className="font-mono text-[11px] text-zinc-500">
                      {pos.quantity} shares · Invested: ₹{(entryP * pos.quantity).toLocaleString('en-IN')}
                    </div>

                    <div className="flex items-center space-x-2">
                      {/* Trail Stop to Breakeven */}
                      {stopP < entryP && (
                        <button
                          onClick={() => onUpdateStop && onUpdateStop(pos.id, entryP)}
                          className="rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1 font-mono text-[11px] text-zinc-300 transition hover:border-emerald-500 hover:text-emerald-300"
                          title="Move safety stop to your buy price so you cannot lose money on this trade"
                        >
                          Protect (Stop at Buy Price)
                        </button>
                      )}

                      {/* Scale Out 50% Partial Close */}
                      {pos.quantity > 1 && (
                        <button
                          onClick={() => {
                            setPartialModalPos(pos);
                            setPartialQty(Math.floor(pos.quantity / 2));
                          }}
                          className="rounded border border-emerald-900/60 bg-emerald-950/30 px-2.5 py-1 font-mono text-[11px] text-emerald-300 transition hover:bg-emerald-900/50"
                          title="Sell half of your shares to lock in profits while letting the rest run"
                        >
                          Sell 50% (Lock Profit)
                        </button>
                      )}

                      {/* Close Position */}
                      <button
                        data-testid="close-position-btn"
                        onClick={() =>
                          onClosePosition(
                            pos.id,
                            isAlert ? exitAlert.reason : isTargetHit ? 'TARGET_REACHED' : 'MANUAL_CLOSE',
                            currP
                          )
                        }
                        className="rounded border border-zinc-800 bg-zinc-900 px-3 py-1 font-mono text-xs font-semibold text-zinc-200 transition hover:border-rose-600 hover:text-rose-300"
                      >
                        Close Position
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-800 p-12 text-center font-mono text-xs text-zinc-500">
            No open paper positions. Click "New Trade" above or trigger ⚡ Paper Trade from the Scanner.
          </div>
        )}
      </div>

      {/* 3. Closed Trades History Blotter */}
      {closedPositions.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-sm font-semibold tracking-wide text-zinc-200">
              CLOSED TRADES HISTORY ({closedPositions.length} TRADES)
            </h2>
            <span className="font-mono text-xs text-zinc-500">
              Complete fee breakdown and net realized profit & loss
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-950">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-400">
                <tr>
                  <th className="p-3">TICKER</th>
                  <th className="p-3">STRATEGY</th>
                  <th className="p-3">ENTRY</th>
                  <th className="p-3">EXIT</th>
                  <th className="p-3">QTY</th>
                  <th className="p-3">GROSS P&L</th>
                  <th className="p-3">FEES & TAXES</th>
                  <th className="p-3">NET P&L</th>
                  <th className="p-3">R-MULTIPLE</th>
                  <th className="p-3">EXIT REASON</th>
                  <th className="p-3">DATE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {closedPositions.map((cp) => {
                  const netPnl = cp.net_pnl ?? cp.realized_pnl ?? 0;
                  const totalCharges = cp.total_charges ?? (cp.buy_charges || 0) + (cp.sell_charges || 0);
                  const rMult = cp.r_multiple ?? 0.0;

                  return (
                    <tr key={cp.id} className="hover:bg-zinc-900/30">
                      <td className="p-3 font-bold text-zinc-100">{cp.ticker}</td>
                      <td className="p-3 text-zinc-400">{cp.strategy_name}</td>
                      <td className="p-3 text-zinc-300">₹{cp.entry_price?.toFixed(2)}</td>
                      <td className="p-3 text-zinc-300">₹{cp.exit_price?.toFixed(2)}</td>
                      <td className="p-3 text-zinc-400">{cp.quantity}</td>
                      <td className="p-3 text-zinc-300">₹{cp.realized_pnl?.toFixed(2)}</td>
                      <td className="p-3 text-amber-400">₹{totalCharges.toFixed(2)}</td>
                      <td className={`p-3 font-bold ${netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {netPnl >= 0 ? '+' : ''}₹{netPnl.toFixed(2)}
                      </td>
                      <td className={`p-3 font-semibold ${rMult >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {rMult >= 0 ? '+' : ''}{rMult}R
                      </td>
                      <td className="p-3 text-zinc-400">{cp.exit_reason}</td>
                      <td className="p-3 text-zinc-500">{cp.exit_date}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Order Execution Modal */}
      <OrderExecutionModal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        initialTicker={selectedStockForOrder}
        initialStrategy={selectedStrategyForOrder}
        candidateList={candidates}
        onOrderSubmitted={onAddPosition}
        account={account}
      />

      {/* 5. Partial Scale-Out Modal */}
      {partialModalPos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl font-mono text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <h3 className="font-bold text-zinc-100">SELL PARTIAL SHARES (LOCK IN PROFIT)</h3>
              <button
                onClick={() => setPartialModalPos(null)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleExecutePartialClose} className="space-y-4">
              <div>
                <label className="text-zinc-400 block mb-1">SHARES TO CLOSE</label>
                <input
                  type="number"
                  min="1"
                  max={partialModalPos.quantity - 1}
                  value={partialQty}
                  onChange={(e) => setPartialQty(Math.min(partialModalPos.quantity - 1, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-full rounded border border-zinc-800 bg-zinc-900 p-2 text-zinc-100 outline-none focus:border-rose-500 font-bold"
                  required
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">
                  Total open: {partialModalPos.quantity} shares ({partialModalPos.quantity - partialQty} will remain open)
                </span>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">EXIT PRICE (₹)</label>
                <input
                  type="number"
                  step="0.05"
                  defaultValue={partialModalPos.current_price || partialModalPos.entry_price}
                  className="w-full rounded border border-zinc-800 bg-zinc-900 p-2 text-zinc-100 outline-none"
                  readOnly
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setPartialModalPos(null)}
                  className="rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-zinc-400 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded bg-emerald-500 px-4 py-1.5 font-bold text-zinc-950 hover:bg-emerald-400"
                >
                  Close {partialQty} Shares
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Edit Capital & Risk Allocation Modal (Preserves Trades) */}
      {isEditCapitalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl font-mono text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <div className="flex items-center space-x-2">
                <Sliders className="h-4 w-4 text-rose-400" />
                <h3 className="font-bold text-zinc-100">EDIT PORTFOLIO CAPITAL & RISK</h3>
              </div>
              <button
                onClick={() => setIsEditCapitalModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleEditCapitalSubmit} className="space-y-4">
              <div>
                <label className="text-zinc-400 block mb-1">TOTAL PORTFOLIO CAPITAL (₹)</label>
                <input
                  type="number"
                  step="any"
                  min="10000"
                  value={editCapital}
                  onChange={(e) => setEditCapital(e.target.value)}
                  className="w-full rounded border border-zinc-800 bg-zinc-900 p-2 text-zinc-100 outline-none focus:border-rose-500 font-bold"
                  required
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">RISK RULE PER TRADE (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.2"
                  max="10.0"
                  value={editRiskPct}
                  onChange={(e) => setEditRiskPct(e.target.value)}
                  className="w-full rounded border border-zinc-800 bg-zinc-900 p-2 text-zinc-100 outline-none focus:border-rose-500 font-bold"
                  required
                />
              </div>

              <div className="rounded border border-emerald-900/60 bg-emerald-950/20 p-2.5 text-[11px] text-emerald-300">
                ✓ Preserves your trade ledger. All open positions, closed trade history, and P&L metrics remain completely intact.
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsEditCapitalModalOpen(false)}
                  className="rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-zinc-400 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded bg-rose-600 px-4 py-1.5 font-bold text-zinc-100 hover:bg-rose-500"
                >
                  Update Capital
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Reset Portfolio & Clear Trades Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-rose-900/60 bg-zinc-950 p-6 shadow-2xl font-mono text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <div className="flex items-center space-x-2">
                <RotateCcw className="h-4 w-4 text-rose-500" />
                <h3 className="font-bold text-rose-400">RESET PORTFOLIO & TRADES</h3>
              </div>
              <button
                onClick={() => setIsResetModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div>
                <label className="text-zinc-400 block mb-1">STARTING CASH BALANCE (₹)</label>
                <input
                  type="number"
                  step="50000"
                  value={resetCapital}
                  onChange={(e) => setResetCapital(e.target.value)}
                  className="w-full rounded border border-zinc-800 bg-zinc-900 p-2 text-zinc-100 outline-none focus:border-rose-500 font-bold"
                  required
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">RISK RULE PER TRADE (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.2"
                  max="5.0"
                  value={resetRiskPct}
                  onChange={(e) => setResetRiskPct(e.target.value)}
                  className="w-full rounded border border-zinc-800 bg-zinc-900 p-2 text-zinc-100 outline-none focus:border-rose-500 font-bold"
                  required
                />
              </div>

              <div className="rounded border border-rose-900/70 bg-rose-950/40 p-2.5 text-[11px] text-rose-300">
                ⚠️ DANGER: This will permanently purge all open positions and historical trades. Capital will be reset to the value specified above.
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  className="rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-zinc-400 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded bg-rose-700 px-4 py-1.5 font-bold text-zinc-100 hover:bg-rose-600 shadow-md shadow-rose-950"
                >
                  Confirm Full Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function roundTwo(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}
