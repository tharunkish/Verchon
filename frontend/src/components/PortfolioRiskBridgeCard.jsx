import React from 'react';
import { 
  ShieldAlert, 
  Briefcase, 
  PieChart, 
  AlertTriangle, 
  ArrowRight, 
  CheckCircle2, 
  ExternalLink,
  Info
} from 'lucide-react';

export default function PortfolioRiskBridgeCard({ 
  portfolioImpact, 
  loading, 
  onOpenTradeModal 
}) {
  if (loading) {
    return (
      <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 font-mono text-xs text-zinc-400 animate-pulse flex items-center space-x-3">
        <div className="h-4 w-4 rounded-full border-2 border-rose-500 border-t-transparent animate-spin" />
        <span>Evaluating Paper Portfolio Risk & Sector Concentration...</span>
      </div>
    );
  }

  if (!portfolioImpact) return null;

  const {
    ticker,
    clean_symbol,
    sector,
    strategy_name,
    proposed_entry,
    proposed_stop,
    proposed_target_1,
    proposed_target_2,
    proposed_quantity,
    position_value,
    position_equity_pct,
    estimated_loss_at_stop_net,
    estimated_charges,
    sector_exposure_before_pct,
    sector_exposure_after_pct,
    sector_amount_before,
    sector_amount_after,
    portfolio_risk_before_pct,
    portfolio_risk_after_pct,
    total_risk_before,
    total_risk_after,
    existing_position_in_stock,
    warnings = []
  } = portfolioImpact;

  const hasSectorWarning = sector_exposure_after_pct > 30.0;
  const hasPositionWarning = position_equity_pct > 20.0;

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/90 shadow-xl backdrop-blur-md">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-zinc-900 bg-zinc-900/50 px-4 py-3">
        <div className="flex items-center space-x-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <PieChart className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2 font-mono text-xs font-bold tracking-wider text-zinc-200">
              <span>PORTFOLIO RISK BRIDGE</span>
              <span className="text-[10px] text-zinc-500">•</span>
              <span className="text-zinc-400 font-medium">PRE-TRADE IMPACT PREVIEW</span>
            </div>
            <div className="font-mono text-[11px] text-zinc-400">
              Sector: <span className="text-zinc-200 font-semibold">{sector}</span>
              {existing_position_in_stock && (
                <span className="ml-2 inline-flex items-center text-amber-400 bg-amber-950/40 border border-amber-800/50 rounded px-1.5 py-0.2 text-[10px]">
                  Already Holding Position
                </span>
              )}
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <button
          onClick={() => {
            if (onOpenTradeModal) {
              onOpenTradeModal(ticker, strategy_name || 'MANUAL_ENTRY');
            }
          }}
          className="flex items-center space-x-1.5 rounded-lg bg-gradient-to-r from-[#c9183b] to-[#a1112e] px-3.5 py-1.5 font-mono text-xs font-bold text-white shadow-md shadow-rose-950/50 transition hover:from-[#e11d48] hover:to-[#be123c] active:scale-95"
        >
          <Briefcase className="h-3.5 w-3.5" />
          <span>Pre-fill & Execute</span>
          <ExternalLink className="h-3 w-3 opacity-70" />
        </button>
      </div>

      {/* Warnings & Safeguards Alert Banner */}
      {warnings && warnings.length > 0 && (
        <div className="border-b border-amber-900/40 bg-amber-950/20 px-4 py-2.5">
          <div className="space-y-1">
            {warnings.map((w, idx) => (
              <div key={idx} className="flex items-start space-x-2 font-mono text-xs text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid of Key Impact Metrics */}
      <div className="grid grid-cols-1 divide-y divide-zinc-900 sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4 font-mono">
        {/* Metric 1: Proposed Sizing */}
        <div className="p-4 space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider text-zinc-400 flex items-center justify-between">
            <span>PROPOSED POSITION</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
              hasPositionWarning ? 'bg-amber-950 text-amber-400 border border-amber-800' : 'bg-zinc-900 text-zinc-300'
            }`}>
              {position_equity_pct}% of Equity
            </span>
          </div>
          <div className="text-lg font-bold text-zinc-100">
            ₹{Math.round(position_value).toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-zinc-400 space-y-0.5">
            <div>Qty: <span className="text-zinc-200">{proposed_quantity} shs</span> @ ₹{proposed_entry}</div>
            <div>Stop: <span className="text-rose-400">₹{proposed_stop}</span></div>
          </div>
        </div>

        {/* Metric 2: Capital at Risk at Stop */}
        <div className="p-4 space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider text-zinc-400 flex items-center justify-between">
            <span>CAPITAL AT RISK (AT STOP)</span>
            <span className="text-[10px] text-zinc-500 font-medium">Incl. Charges</span>
          </div>
          <div className="text-lg font-bold text-rose-400">
            -₹{Math.round(estimated_loss_at_stop_net).toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-zinc-400 space-y-0.5">
            <div>Statutory Costs: ₹{Math.round(estimated_charges)}</div>
            <div>Target 1: <span className="text-emerald-400">₹{proposed_target_1 || '—'}</span></div>
          </div>
        </div>

        {/* Metric 3: Sector Concentration Impact */}
        <div className="p-4 space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider text-zinc-400 flex items-center justify-between">
            <span>SECTOR CONCENTRATION</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
              hasSectorWarning ? 'bg-amber-950 text-amber-400 border border-amber-800' : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
            }`}>
              {hasSectorWarning ? '>30% Warning' : 'Within Limits'}
            </span>
          </div>
          <div className="flex items-center space-x-2 text-lg font-bold">
            <span className="text-zinc-400">{sector_exposure_before_pct}%</span>
            <ArrowRight className="h-4 w-4 text-zinc-500" />
            <span className={hasSectorWarning ? 'text-amber-400' : 'text-zinc-100'}>
              {sector_exposure_after_pct}%
            </span>
          </div>
          <div className="text-[11px] text-zinc-400">
            ₹{Math.round(sector_amount_before).toLocaleString('en-IN')} → <span className="text-zinc-200">₹{Math.round(sector_amount_after).toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Metric 4: Total Portfolio Risk at Stop */}
        <div className="p-4 space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider text-zinc-400 flex items-center justify-between">
            <span>TOTAL PORTFOLIO RISK</span>
            <span className="text-[10px] text-zinc-500">All Open Stops</span>
          </div>
          <div className="flex items-center space-x-2 text-lg font-bold">
            <span className="text-zinc-400">{portfolio_risk_before_pct}%</span>
            <ArrowRight className="h-4 w-4 text-zinc-500" />
            <span className="text-rose-400 font-bold">
              {portfolio_risk_after_pct}%
            </span>
          </div>
          <div className="text-[11px] text-zinc-400">
            ₹{Math.round(total_risk_before).toLocaleString('en-IN')} → <span className="text-rose-300">₹{Math.round(total_risk_after).toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
