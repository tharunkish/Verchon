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
  PieChart,
  ChevronRight,
  ShieldAlert,
  Info
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
  const [selectedPositionId, setSelectedPositionId] = useState(null);

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

  // Select first position by default if none selected
  useEffect(() => {
    if (openPositions.length > 0) {
      const exists = openPositions.some((p) => p.id === selectedPositionId);
      if (!exists) {
        setSelectedPositionId(openPositions[0].id);
      }
    } else {
      setSelectedPositionId(null);
    }
  }, [openPositions, selectedPositionId]);

  const activePosition = openPositions.find((p) => p.id === selectedPositionId) || openPositions[0] || null;

  // Account metrics
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
    <div className="min-h-[calc(100vh-90px)] p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* 1. Master Capital Ledger & Statement Header */}
      <div className="rounded-3xl border border-black/[0.06] dark:border-white/[0.07] bg-white dark:bg-[#121319] p-6 shadow-sm backdrop-blur-xl transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Left: Total Account Equity */}
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono tracking-widest text-zinc-400 uppercase font-semibold">PORTFOLIO STATEMENT</span>
              <span className="text-zinc-300 dark:text-zinc-700">·</span>
              <span className="text-[10px] text-zinc-500 font-medium">Real-Time Mark to Market</span>
            </div>
            <div className="flex items-baseline space-x-3 mt-1">
              <span className="font-mono-num text-3xl sm:text-4xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
                ₹{Math.round(totalEquity).toLocaleString('en-IN')}
              </span>
              <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${
                totalUnrealizedPnl >= 0 
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' 
                  : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
              }`}>
                {totalUnrealizedPnl >= 0 ? '+' : ''}₹{totalUnrealizedPnl.toFixed(1)} MTM
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Initial Capital: ₹{Math.round(startingCapital).toLocaleString('en-IN')} · Available Dry Powder: <strong className="text-zinc-800 dark:text-zinc-200">₹{Math.round(availableCash).toLocaleString('en-IN')}</strong>
            </p>
          </div>

          {/* Right: Performance Metrics & Quick Tactile Controls */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Realized Profit Pill */}
            <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.07] bg-black/[0.02] dark:bg-white/[0.03] p-3 text-right">
              <div className="text-[10px] font-mono text-zinc-400 uppercase">Net Realized P&L</div>
              <div className={`font-mono-num text-sm font-bold ${totalNetRealizedPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {totalNetRealizedPnl >= 0 ? '+' : ''}₹{totalNetRealizedPnl.toFixed(1)}
              </div>
              <div className="text-[9px] text-zinc-400 mt-0.5">After ₹{Math.round(totalChargesPaid)} statutory costs</div>
            </div>

            {/* Win Rate Pill */}
            <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.07] bg-black/[0.02] dark:bg-white/[0.03] p-3 text-right">
              <div className="text-[10px] font-mono text-zinc-400 uppercase">Win Rate</div>
              <div className="font-mono-num text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {winRate}%
              </div>
              <div className="text-[9px] text-zinc-400 mt-0.5">PF: {profitFactor}x · Avg: {avgRMultiple}R</div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleOpenNewTrade()}
                className="flex items-center space-x-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 px-4 py-2 text-xs font-semibold shadow-sm transition active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Trade</span>
              </button>

              <button
                onClick={handleRefresh}
                disabled={refreshing}
                title="Refresh Quotes"
                className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-zinc-900 p-2 text-zinc-600 dark:text-zinc-300 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-blue-500' : ''}`} />
              </button>

              <button
                onClick={() => setIsEditCapitalModalOpen(true)}
                title="Edit Capital & Risk Settings"
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
        </div>

        {/* Sector Allocation Silk Bar */}
        {sectorData?.sectors && sectorData.sectors.length > 0 && (
          <div className="mt-6 pt-5 border-t border-black/[0.05] dark:border-white/[0.06]">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-mono text-[10px] text-zinc-400 uppercase font-semibold">Sector Exposure & Risk Allocation</span>
              <span className="font-mono text-[11px] text-zinc-500">
                Total Capital at Risk: <strong className="text-rose-600 dark:text-rose-400">₹{Math.round(totalCapitalAtRisk).toLocaleString('en-IN')}</strong> ({sectorData?.total_risk_at_stop_pct ?? 0}% equity)
              </span>
            </div>

            {/* The Slender Multi-Segment Bar */}
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-black/[0.04] dark:bg-white/[0.06] p-0.5">
              {sectorData.sectors.map((sec, idx) => {
                const palette = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-cyan-500', 'bg-rose-500', 'bg-indigo-500'];
                const col = palette[idx % palette.length];
                const widthPct = Math.min(100, Math.max(2, sec.percentage));
                return (
                  <div
                    key={sec.sector}
                    style={{ width: `${widthPct}%` }}
                    className={`${col} h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full`}
                    title={`${sec.sector}: ${sec.percentage}% (₹${Math.round(sec.amount).toLocaleString('en-IN')})`}
                  />
                );
              })}
            </div>

            {/* Chips */}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
              {sectorData.sectors.map((sec, idx) => {
                const isOverweight = sec.percentage > 30.0;
                const palette = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-cyan-500', 'bg-rose-500', 'bg-indigo-500'];
                const dotCol = palette[idx % palette.length];
                return (
                  <span
                    key={sec.sector}
                    className={`inline-flex items-center space-x-1.5 rounded-lg px-2.5 py-1 border ${
                      isOverweight 
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold' 
                        : 'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${dotCol}`} />
                    <span>{sec.sector}</span>
                    <span className="font-mono opacity-70">{sec.percentage}%</span>
                    {isOverweight && <AlertTriangle className="h-3 w-3 text-amber-500 ml-1" title="Concentration Alert: Exceeds 30%" />}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 2. Active Trades Split-Stage Specimen Desk */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Active Positions ({openPositions.length})
            </h2>
            <span className="text-xs text-zinc-400">· Real-time Trailing Stop & Exit Alerts</span>
          </div>
          <span className="text-xs font-mono text-zinc-500">
            Target 1: 2.0R · Target 2: 3.0R
          </span>
        </div>

        {openPositions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-black/[0.08] dark:border-white/[0.1] p-16 text-center">
            <Briefcase className="h-8 w-8 text-zinc-400 mx-auto mb-2 opacity-50" />
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">No Active Positions</h3>
            <p className="mt-1 text-xs text-zinc-500 max-w-sm mx-auto">
              Your capital is 100% unencumbered. Screen qualified setups from the Market Scanner or click "New Trade" above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Position Playlist */}
            <div className="lg:col-span-5 space-y-2">
              {openPositions.map((pos, idx) => {
                const isSelected = pos.id === activePosition?.id;
                const pnl = pos.unrealized_pnl || 0;
                const pnlPct = pos.unrealized_pnl_pct || 0;
                const isAlert = pos.exit_alert?.should_exit;
                const isTargetHit = pos.exit_alert?.target_reached || pos.target_1_hit;

                return (
                  <div
                    key={pos.id}
                    onClick={() => setSelectedPositionId(pos.id)}
                    className={`rounded-2xl p-4 cursor-pointer border transition-all duration-150 ${
                      isSelected
                        ? 'bg-white dark:bg-[#161822] border-black/20 dark:border-white/20 shadow-md ring-1 ring-black/5 dark:ring-white/10'
                        : 'bg-white/60 dark:bg-[#101117]/60 border-black/[0.04] dark:border-white/[0.05] hover:bg-white dark:hover:bg-[#14161f]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <span className="font-mono text-[10px] text-zinc-400 w-4 text-right">
                          {(idx + 1).toString().padStart(2, '0')}
                        </span>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-zinc-100">
                              {pos.ticker}
                            </span>
                            {isAlert && <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />}
                            {isTargetHit && !isAlert && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {pos.strategy_name} · {pos.quantity} shares
                          </div>
                        </div>
                      </div>

                      <div className="text-right font-mono">
                        <div className={`text-xs font-bold font-mono-num ${pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-zinc-400">
                          {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}% ({pos.holding_sessions || 0}d)
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right: Active Position Specimen Desk */}
            {activePosition && (
              <div className="lg:col-span-7">
                <div className="rounded-3xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#12141c] p-6 sm:p-8 shadow-lg backdrop-blur-2xl">
                  {/* Position Header */}
                  <div className="flex items-start justify-between border-b border-black/[0.06] dark:border-white/[0.07] pb-5">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-mono text-zinc-400 uppercase font-semibold">POSITION SPECIMEN</span>
                        <span className="text-zinc-300 dark:text-zinc-700">·</span>
                        <span className="text-xs text-zinc-500 font-medium">{activePosition.strategy_name}</span>
                      </div>
                      <h3 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 mt-1">
                        {activePosition.ticker}
                      </h3>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Entry: {activePosition.entry_date} · Holding {activePosition.holding_sessions || 0} trading sessions
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-mono text-zinc-400 uppercase">Unrealized P&L</div>
                      <div className={`font-mono-num text-3xl font-black tracking-tight mt-0.5 ${
                        (activePosition.unrealized_pnl || 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}>
                        {(activePosition.unrealized_pnl || 0) >= 0 ? '+' : ''}₹{(activePosition.unrealized_pnl || 0).toFixed(1)}
                      </div>
                      <div className="text-xs font-mono text-zinc-500 mt-0.5">
                        {(activePosition.unrealized_pnl_pct || 0) >= 0 ? '+' : ''}{(activePosition.unrealized_pnl_pct || 0).toFixed(1)}% · R-Multiple: <strong className="text-blue-600 dark:text-blue-400">{activePosition.r_multiple ?? '0.0'}R</strong>
                      </div>
                    </div>
                  </div>

                  {/* Target Reached or Exit Trigger Notification */}
                  {activePosition.exit_alert?.should_exit && (
                    <div className="mt-4 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-3.5 flex items-center space-x-3">
                      <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      <div className="text-xs text-zinc-800 dark:text-zinc-200">
                        <strong className="text-rose-600 dark:text-rose-400 font-semibold">Exit Triggered:</strong> {activePosition.exit_alert.reason}
                        {activePosition.exit_alert.suggested_exit_price && <span> @ ₹{activePosition.exit_alert.suggested_exit_price.toFixed(1)}</span>}
                      </div>
                    </div>
                  )}

                  {activePosition.target_1_hit && !activePosition.exit_alert?.should_exit && (
                    <div className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3.5 flex items-center space-x-3">
                      <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <div className="text-xs text-zinc-800 dark:text-zinc-200">
                        <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">Target 1 Reached:</strong> Consider scaling out 50% partial profit and trailing stop to breakeven.
                      </div>
                    </div>
                  )}

                  {/* Trailing Stop & Price Scale */}
                  <div className="py-5 border-b border-black/[0.06] dark:border-white/[0.07]">
                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 mb-2 font-semibold">
                      <span>THE TRAILING SCALE</span>
                      <span>Target 1 = 2R · Target 2 = 3R</span>
                    </div>

                    <div className="grid grid-cols-4 gap-2 font-mono text-center mb-3">
                      <div className="rounded-xl bg-rose-500/5 dark:bg-rose-500/10 p-2.5 border border-rose-500/15">
                        <div className="text-[9px] text-rose-600 dark:text-rose-400 uppercase font-semibold">Stop Loss</div>
                        <div className="text-xs font-bold text-rose-700 dark:text-rose-300 font-mono-num mt-0.5">₹{activePosition.stop_price?.toFixed(1)}</div>
                      </div>

                      <div className="rounded-xl bg-black/[0.02] dark:bg-white/[0.03] p-2.5 border border-black/[0.04] dark:border-white/[0.05]">
                        <div className="text-[9px] text-zinc-400 uppercase font-semibold">Entry Price</div>
                        <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200 font-mono-num mt-0.5">₹{activePosition.entry_price?.toFixed(1)}</div>
                      </div>

                      <div className="rounded-xl bg-blue-500/5 dark:bg-blue-500/10 p-2.5 border border-blue-500/15">
                        <div className="text-[9px] text-blue-600 dark:text-blue-400 uppercase font-semibold">Live Quote</div>
                        <div className="text-xs font-bold text-blue-700 dark:text-blue-300 font-mono-num mt-0.5">₹{(activePosition.current_price || activePosition.entry_price)?.toFixed(1)}</div>
                      </div>

                      <div className="rounded-xl bg-emerald-500/5 dark:bg-emerald-500/10 p-2.5 border border-emerald-500/15">
                        <div className="text-[9px] text-emerald-600 dark:text-emerald-400 uppercase font-semibold">Target 1</div>
                        <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 font-mono-num mt-0.5">₹{activePosition.target_1?.toFixed(1)}</div>
                      </div>
                    </div>

                    {/* Progress Track */}
                    {(() => {
                      const entryP = activePosition.entry_price || 0;
                      const stopP = activePosition.stop_price || 0;
                      const currP = activePosition.current_price || entryP;
                      const t1 = activePosition.target_1 || (entryP + 2 * (entryP - stopP));
                      const t2 = activePosition.target_2 || (entryP + 3 * (entryP - stopP));
                      const totalSpan = Math.max(1, t2 - stopP);
                      const progressPct = Math.min(100, Math.max(0, ((currP - stopP) / totalSpan) * 100));

                      return (
                        <div className="relative pt-2 pb-1">
                          <div className="h-1.5 w-full rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden flex">
                            <div style={{ width: `${progressPct}%` }} className={currP >= entryP ? 'bg-emerald-500 h-full' : 'bg-rose-500 h-full'} />
                          </div>
                          <div
                            style={{ left: `${progressPct}%` }}
                            className="absolute top-0 h-4 w-1 -ml-0.5 rounded-full bg-zinc-900 dark:bg-white shadow-sm"
                          />
                        </div>
                      );
                    })()}
                  </div>

                  {/* Position Detail & Action Console */}
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-zinc-500 font-mono">
                      {activePosition.quantity} shares · Capital: ₹{(activePosition.entry_price * activePosition.quantity).toLocaleString('en-IN')}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Trail Stop to Breakeven */}
                      {activePosition.stop_price < activePosition.entry_price && (
                        <button
                          onClick={() => onUpdateStop && onUpdateStop(activePosition.id, activePosition.entry_price)}
                          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 transition"
                          title="Move safety stop to your buy price so you cannot lose money on this trade"
                        >
                          Trail to Breakeven
                        </button>
                      )}

                      {/* Scale Out 50% Partial Close */}
                      {activePosition.quantity > 1 && (
                        <button
                          onClick={() => {
                            setPartialModalPos(activePosition);
                            setPartialQty(Math.floor(activePosition.quantity / 2));
                          }}
                          className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:bg-blue-500/20 transition"
                          title="Sell half of your shares to lock in profits while letting the rest run"
                        >
                          Sell 50% Profit
                        </button>
                      )}

                      {/* Close Position */}
                      <button
                        onClick={() =>
                          onClosePosition(
                            activePosition.id,
                            activePosition.exit_alert?.should_exit ? activePosition.exit_alert.reason : activePosition.target_1_hit ? 'TARGET_REACHED' : 'MANUAL_CLOSE',
                            activePosition.current_price || activePosition.entry_price
                          )
                        }
                        className="rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 px-4 py-1.5 text-xs font-bold shadow-sm transition active:scale-95"
                      >
                        Close Position
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Closed Trades History Ledger */}
      {closedPositions.length > 0 && (
        <div className="rounded-3xl border border-black/[0.06] dark:border-white/[0.07] bg-white dark:bg-[#121319] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Closed Trades History ({closedPositions.length})
              </h3>
              <p className="text-xs text-zinc-500">Transparent statutory fee breakdown and net realized profit & loss</p>
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
                  <th className="py-2.5 px-3">EXIT REASON</th>
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
                      <td className="py-3 px-3 text-zinc-500 text-[11px]">{cp.exit_reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Global Order Execution Modal */}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#151722] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] pb-3 mb-4">
              <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">Take Partial Profit</h3>
              <button onClick={() => setPartialModalPos(null)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleExecutePartialClose} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-500 block mb-1">Shares to Sell</label>
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
                  Execute Sale
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Edit Capital Modal */}
      {isEditCapitalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#151722] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] pb-3 mb-4">
              <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">Account Capital & Risk</h3>
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
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Reset Portfolio Modal */}
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
              This will completely wipe your paper trading ledger and reset all open and closed positions to zero.
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
