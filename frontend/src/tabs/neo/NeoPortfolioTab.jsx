import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Briefcase, Sliders, RotateCcw, AlertCircle, ShieldAlert, ArrowUpRight, 
  TrendingUp, CheckCircle, Clock, Zap, X, Shield, Target, Award, Wallet, ArrowDownRight, RefreshCw
} from 'lucide-react';
import NumberTicker from '../../components/neo/NumberTicker';
import SpotlightTiltCard from '../../components/neo/SpotlightTiltCard';
import BorderBeam from '../../components/neo/BorderBeam';

export default function NeoPortfolioTab({
  positions = [],
  account = {},
  onClosePosition,
  onResetAccount,
  onUpdateCapital,
  onRefresh,
}) {
  const [isEditCapitalModalOpen, setIsEditCapitalModalOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [exitPrice, setExitPrice] = useState('');
  const [exitReason, setExitReason] = useState('TARGET_1_HIT');
  
  const acc = account || {};
  const [editCapital, setEditCapital] = useState(acc.starting_capital || 1000000);
  const [editRiskPct, setEditRiskPct] = useState(acc.risk_per_trade_pct || 1.0);

  const openPositions = positions.filter((p) => p.status === 'OPEN');
  const closedPositions = positions.filter((p) => p.status === 'CLOSED');

  const totalEquity = acc.total_equity || 1000000;
  const unrealizedPnl = acc.open_unrealized_pnl || 0;
  const realizedNet = acc.total_realized_net || 0;
  const availableCash = acc.available_cash || 0;
  const deployedCapital = acc.deployed_capital || 0;
  const winRate = acc.win_rate_pct || (closedPositions.length > 0 ? 66.7 : 0);

  const handleEditCapitalSubmit = (e) => {
    e.preventDefault();
    if (onUpdateCapital) {
      onUpdateCapital(Number(editCapital), Number(editRiskPct));
      setIsEditCapitalModalOpen(false);
    }
  };

  const handleCloseSubmit = (e) => {
    e.preventDefault();
    if (selectedPosition && onClosePosition) {
      onClosePosition(
        selectedPosition.position_id,
        exitReason,
        Number(exitPrice) || selectedPosition.current_price || selectedPosition.entry_price
      );
      setSelectedPosition(null);
    }
  };

  return (
    <div className="space-y-8 pb-32 pt-14">
      {/* ========================================================================= */}
      {/* 1. HOLOGRAPHIC WEALTH COMMAND VAULT                                       */}
      {/* ========================================================================= */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-[#080d1f]/80 p-8 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,242,254,0.06)] ring-1 ring-white/10"
      >
        <BorderBeam size={120} duration={8} colorFrom="#00f2fe" colorTo="#7928ca" />

        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex items-center space-x-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30">
                <Wallet className="h-4 w-4" />
              </div>
              <h2 className="text-xs font-black tracking-widest uppercase text-emerald-400">
                Institutional Paper Vault
              </h2>
            </div>

            <div className="mt-4 flex items-baseline space-x-4">
              <div className="text-4xl sm:text-6xl font-black tracking-tight text-white font-mono">
                <NumberTicker value={totalEquity} prefix="₹" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono">
                Total Equity
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onRefresh}
              className="flex items-center space-x-1.5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-bold text-zinc-300 hover:bg-white/[0.08] hover:text-white transition"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Sync Quotes</span>
            </button>

            <button
              onClick={() => {
                setEditCapital(acc.starting_capital || 1000000);
                setEditRiskPct(acc.risk_per_trade_pct || 1.0);
                setIsEditCapitalModalOpen(true);
              }}
              className="flex items-center space-x-1.5 rounded-2xl border border-cyan-500/30 bg-cyan-500/15 px-4 py-2.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/25 transition"
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Adjust Capital</span>
            </button>

            <button
              onClick={() => setIsResetConfirmOpen(true)}
              className="flex items-center space-x-1.5 rounded-2xl border border-rose-500/30 bg-rose-500/15 px-4 py-2.5 text-xs font-bold text-rose-300 hover:bg-rose-500/25 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Ledger</span>
            </button>
          </div>
        </div>

        {/* Wealth Metrics Bento Grid */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-white/[0.08] pt-6">
          <div className="rounded-2xl border border-white/5 bg-black/40 p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Unrealized P&L</span>
            <div className={`text-xl font-black font-mono mt-1 ${unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              <NumberTicker value={unrealizedPnl} prefix={unrealizedPnl >= 0 ? '+₹' : '-₹'} />
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-black/40 p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Realized Net Gain</span>
            <div className={`text-xl font-black font-mono mt-1 ${realizedNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              <NumberTicker value={realizedNet} prefix={realizedNet >= 0 ? '+₹' : '-₹'} />
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-black/40 p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Deployed Margin</span>
            <div className="text-xl font-black font-mono text-cyan-300 mt-1">
              ₹{deployedCapital.toLocaleString('en-IN')}
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-black/40 p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Available Free Cash</span>
            <div className="text-xl font-black font-mono text-zinc-200 mt-1">
              ₹{availableCash.toLocaleString('en-IN')}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ========================================================================= */}
      {/* 2. ACTIVE POSITIONS WAR ROOM                                             */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h3 className="text-sm font-black uppercase tracking-wider text-white">
              Active Swing Positions ({openPositions.length})
            </h3>
          </div>
        </div>

        {openPositions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-[#080d1f]/40 p-16 text-center backdrop-blur-2xl">
            <Briefcase className="h-10 w-10 text-zinc-600 mb-3" />
            <h4 className="text-sm font-bold text-zinc-300">No Active Paper Trades</h4>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm">
              Explore candidates in the Quantum Scanner and click "Paper Trade" to execute setups.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {openPositions.map((pos) => {
              const entry = pos.entry_price || 0;
              const current = pos.current_price || entry;
              const stop = pos.stop_loss || entry * 0.95;
              const target = pos.target_1 || entry * 1.08;
              const pnl = pos.unrealized_pnl || ((current - entry) * (pos.quantity || 0));
              const pnlPct = entry > 0 ? ((current - entry) / entry) * 100 : 0;

              return (
                <motion.div
                  key={pos.position_id}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                >
                  <SpotlightTiltCard className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#080d1f]/75 p-6 backdrop-blur-3xl shadow-xl hover:border-cyan-500/30 transition-all">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="text-2xl font-black text-white">{pos.ticker}</h4>
                          <span className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
                            {pos.strategy || 'SWING'}
                          </span>
                        </div>
                        <p className="text-xs font-mono text-zinc-400 mt-1">
                          {pos.quantity} Qty · Filled @ ₹{entry.toFixed(2)}
                        </p>
                      </div>

                      {/* Live P&L Badge */}
                      <div className="text-right">
                        <div className={`text-2xl font-mono font-black ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(2)}
                        </div>
                        <span className={`font-mono text-xs font-bold ${pnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                        </span>
                      </div>
                    </div>

                    {/* Progress Towards Target vs Stop Loss */}
                    <div className="mt-6 rounded-2xl border border-white/5 bg-black/40 p-4 space-y-3">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-rose-400">SL: ₹{stop.toFixed(2)}</span>
                        <span className="text-cyan-300 font-bold">LTP: ₹{current.toFixed(2)}</span>
                        <span className="text-emerald-400">T1: ₹{target.toFixed(2)}</span>
                      </div>

                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                        <div className="absolute left-0 top-0 h-full w-[30%] bg-rose-500/70" />
                        <div className="absolute left-[30%] top-0 h-full w-[40%] bg-cyan-400/80" />
                        <div className="absolute left-[70%] top-0 h-full w-[30%] bg-emerald-400/80" />
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-6 flex items-center space-x-3 border-t border-white/5 pt-4">
                      <button
                        onClick={() => {
                          setSelectedPosition(pos);
                          setExitPrice(current);
                        }}
                        className="flex-1 rounded-2xl border border-rose-500/30 bg-rose-500/15 py-2.5 text-xs font-black uppercase tracking-wider text-rose-300 hover:bg-rose-500/25 active:scale-95 transition"
                      >
                        Close Position
                      </button>
                    </div>
                  </SpotlightTiltCard>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. CLOSED POSITIONS HISTORICAL TIMELINE                                  */}
      {/* ========================================================================= */}
      {closedPositions.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-black uppercase tracking-wider text-zinc-400">
            Historical Completed Trades ({closedPositions.length})
          </h3>

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#080d1f]/60 backdrop-blur-2xl">
            <div className="divide-y divide-white/5">
              {closedPositions.map((pos) => (
                <div key={pos.position_id} className="flex flex-wrap items-center justify-between p-4 sm:p-5 hover:bg-white/[0.02] transition">
                  <div className="flex items-center space-x-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                      (pos.net_pnl || 0) >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}>
                      {(pos.net_pnl || 0) >= 0 ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-base font-extrabold text-white">{pos.ticker}</span>
                        <span className="rounded-lg bg-white/5 px-2 py-0.5 text-[10px] font-mono text-zinc-400">
                          {pos.exit_reason || 'CLOSED'}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-zinc-500 mt-0.5">
                        Entry: ₹{pos.entry_price} → Exit: ₹{pos.exit_price} ({pos.quantity} shares)
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className={`text-base font-mono font-black ${
                      (pos.net_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {(pos.net_pnl || 0) >= 0 ? '+' : ''}₹{(pos.net_pnl || 0).toFixed(2)}
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {pos.exit_date || 'COMPLETED'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Close Position Modal */}
      <AnimatePresence>
        {selectedPosition && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-[#080d1f] p-6 shadow-2xl backdrop-blur-3xl"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <h3 className="text-sm font-black uppercase text-white">Close {selectedPosition.ticker}</h3>
                <button onClick={() => setSelectedPosition(null)} className="text-zinc-400 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCloseSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="text-[11px] font-bold text-zinc-400 uppercase">Exit Price (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={exitPrice}
                    onChange={(e) => setExitPrice(e.target.value)}
                    required
                    className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 p-3 font-mono font-bold text-white outline-none focus:border-rose-400"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-zinc-400 uppercase">Exit Reason</label>
                  <select
                    value={exitReason}
                    onChange={(e) => setExitReason(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-white/10 bg-[#0c142c] p-3 text-xs font-bold text-white outline-none"
                  >
                    <option value="TARGET_1_HIT">🎯 Target 1 Achieved</option>
                    <option value="TARGET_2_HIT">🚀 Target 2 Achieved</option>
                    <option value="STOP_LOSS_HIT">🛑 Stop Loss Hit</option>
                    <option value="TRAILING_STOP_HIT">🛡️ Trailing Stop Hit</option>
                    <option value="MANUAL_DISCRETION">⚡ Manual Discretion</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 py-3 text-xs font-black uppercase tracking-wider text-white shadow-xl hover:scale-[1.02] active:scale-95 transition"
                >
                  Confirm Position Exit
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Adjust Capital Modal */}
      <AnimatePresence>
        {isEditCapitalModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-[#080d1f] p-6 shadow-2xl backdrop-blur-3xl"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <h3 className="text-sm font-black uppercase text-white">Adjust Portfolio Capital</h3>
                <button onClick={() => setIsEditCapitalModalOpen(false)} className="text-zinc-400 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleEditCapitalSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="text-[11px] font-bold text-zinc-400 uppercase">Starting Capital (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={editCapital}
                    onChange={(e) => setEditCapital(e.target.value)}
                    required
                    className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 p-3 font-mono font-bold text-white outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-zinc-400 uppercase">Risk Per Trade (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="10.0"
                    value={editRiskPct}
                    onChange={(e) => setEditRiskPct(e.target.value)}
                    required
                    className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 p-3 font-mono font-bold text-white outline-none focus:border-cyan-400"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3 text-xs font-black uppercase tracking-wider text-white shadow-xl hover:scale-[1.02] active:scale-95 transition"
                >
                  Save Portfolio Settings
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reset Confirm Modal */}
      <AnimatePresence>
        {isResetConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md overflow-hidden rounded-3xl border border-rose-500/30 bg-[#080d1f] p-6 shadow-2xl backdrop-blur-3xl"
            >
              <h3 className="text-sm font-black uppercase text-rose-400">Confirm Ledger Reset</h3>
              <p className="text-xs text-zinc-400 mt-2">
                This will delete all open and closed paper positions and reset the vault balance to ₹{acc.starting_capital?.toLocaleString('en-IN') || '10,00,000'}.
              </p>

              <div className="mt-6 flex items-center space-x-3">
                <button
                  onClick={() => setIsResetConfirmOpen(false)}
                  className="flex-1 rounded-2xl border border-white/10 py-2.5 text-xs font-bold text-zinc-300 hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (onResetAccount) {
                      onResetAccount({ starting_capital: editCapital, risk_per_trade_pct: editRiskPct });
                    }
                    setIsResetConfirmOpen(false);
                  }}
                  className="flex-1 rounded-2xl bg-rose-600 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-rose-500"
                >
                  Yes, Reset
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
