import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Search, Briefcase, Zap, Sparkles, TrendingUp, ShieldAlert, ShieldCheck, 
  ArrowUpRight, CheckCircle2, ChevronRight, Activity, Target, Compass, BarChart2
} from 'lucide-react';
import CanvasChart from '../../components/CanvasChart';
import AIDossierCard from '../../components/AIDossierCard';
import CorporateRadarCard from '../../components/CorporateRadarCard';
import RuleChecklist from '../../components/RuleChecklist';
import NumberTicker from '../../components/neo/NumberTicker';
import BorderBeam from '../../components/neo/BorderBeam';
import SpotlightTiltCard from '../../components/neo/SpotlightTiltCard';

export default function NeoDeepDiveTab({
  ticker,
  setTicker,
  data,
  loading,
  error,
  onFetchData,
  onOpenTradeModal,
  onLogPaperTrade,
  onGenerateStockDossier,
  aiLoading,
  aiDiagnostics,
  aiError,
  onCancelDossier,
}) {
  const [inputTicker, setInputTicker] = useState(ticker || 'ICICIBANK.NS');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputTicker) {
      setTicker(inputTicker);
      onFetchData(inputTicker);
    }
  };

  const dossier = data?.dossier || {};
  const t = data?.technical || {};
  const f = data?.fundamentals || {};
  const strat = data?.strategy || {};
  const trend = t.Trend_Structure || {};
  const activeStrat = strat.active_strategy_result || {};

  const currentPrice = trend.Current_Price || 0;
  const stopPrice = activeStrat.stop_price || (currentPrice ? currentPrice * 0.95 : 0);
  const target1 = activeStrat.target_1 || (currentPrice ? currentPrice * 1.08 : 0);
  const target2 = activeStrat.target_2 || (currentPrice ? currentPrice * 1.15 : 0);

  return (
    <div className="space-y-8 pb-32 pt-14">
      {/* ========================================================================= */}
      {/* 1. HERO TICKER COCKPIT & QUICK EXECUTION HUD                              */}
      {/* ========================================================================= */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-[#080d1f]/80 p-8 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,242,254,0.06)] ring-1 ring-white/10"
      >
        <BorderBeam size={100} duration={6} colorFrom="#00f2fe" colorTo="#7928ca" />

        <div className="flex flex-wrap items-center justify-between gap-6">
          {/* Ticker Search Form */}
          <form onSubmit={handleSubmit} className="flex items-center space-x-2">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                type="text"
                value={inputTicker}
                onChange={(e) => setInputTicker(e.target.value.toUpperCase())}
                placeholder="e.g. HAL.NS, TCS.NS"
                className="w-56 sm:w-72 rounded-2xl border border-white/10 bg-black/40 pl-10 pr-4 py-2.5 text-xs font-bold text-white placeholder-zinc-500 outline-none focus:border-cyan-400 backdrop-blur-md"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-cyan-950/50 hover:scale-105 active:scale-95 transition disabled:opacity-50"
            >
              {loading ? 'Analyzing...' : 'Analyze'}
            </button>
          </form>

          {/* Quick Trade Setup Trigger */}
          {data && (
            <button
              onClick={() => {
                if (onOpenTradeModal && data?.ticker) {
                  onOpenTradeModal(data.ticker, strat.primary_strategy || 'MANUAL_ENTRY');
                }
              }}
              className="flex items-center space-x-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-xl shadow-emerald-950/50 hover:scale-105 active:scale-95 transition"
            >
              <Zap className="h-4 w-4 fill-current" />
              <span>Paper Trade Setup</span>
            </button>
          )}
        </div>

        {/* Hero Stock Identity & Live Prices */}
        {data && (
          <div className="mt-8 border-t border-white/[0.08] pt-6 flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white font-mono">
                  {data.ticker}
                </h1>
                <span className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300">
                  {dossier.name} · {f.sector || 'NSE'}
                </span>
              </div>

              <div className="mt-3 flex items-baseline space-x-4">
                <span className="text-3xl sm:text-5xl font-black text-white font-mono">
                  <NumberTicker value={currentPrice} prefix="₹" />
                </span>
                <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/20 px-3 py-1 font-mono text-xs font-black text-emerald-300">
                  ALPHA SCORE: {dossier.overall_score || 0}/100
                </span>
              </div>
            </div>

            {/* Target & Risk Projection Blocks */}
            <div className="flex flex-wrap gap-3">
              <div className="rounded-2xl border border-rose-500/30 bg-black/40 px-4 py-3 text-center min-w-[120px]">
                <div className="text-[10px] uppercase font-bold text-rose-400">Stop Loss</div>
                <div className="text-base font-black font-mono text-rose-200 mt-0.5">
                  <NumberTicker value={stopPrice} prefix="₹" />
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-500/30 bg-black/40 px-4 py-3 text-center min-w-[120px]">
                <div className="text-[10px] uppercase font-bold text-emerald-400">Target 1 (2R)</div>
                <div className="text-base font-black font-mono text-emerald-200 mt-0.5">
                  <NumberTicker value={target1} prefix="₹" />
                </div>
              </div>

              <div className="rounded-2xl border border-purple-500/30 bg-black/40 px-4 py-3 text-center min-w-[120px]">
                <div className="text-[10px] uppercase font-bold text-purple-400">Target 2 (3R)</div>
                <div className="text-base font-black font-mono text-purple-200 mt-0.5">
                  <NumberTicker value={target2} prefix="₹" />
                </div>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* ========================================================================= */}
      {/* 2. HIGH-TECH CHART MATRIX                                                 */}
      {/* ========================================================================= */}
      {data && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden rounded-3xl border border-cyan-500/20 bg-[#080d1f]/80 p-6 shadow-2xl backdrop-blur-3xl ring-1 ring-white/10"
        >
          <CanvasChart
            candles={data.chart?.candles || []}
            dma50={data.chart?.dma_50 || []}
            dma200={data.chart?.dma_200 || []}
            stopPrice={activeStrat.stop_price}
            ticker={data.ticker}
            markers={data.chart?.markers || []}
            signals={data.chart?.signals || []}
            signalStats={data.chart?.stats || {}}
          />
        </motion.div>
      )}

      {/* ========================================================================= */}
      {/* 3. AI RESEARCH DOSSIER                                                    */}
      {/* ========================================================================= */}
      {data && (
        <AIDossierCard
          ticker={data.ticker}
          aiDossier={data.ai_dossier}
          loading={aiLoading}
          onGenerateDossier={onGenerateStockDossier}
          onCancel={onCancelDossier}
          diagnostics={data.ai_dossier?.diagnostics || aiDiagnostics}
          errorMessage={aiError}
        />
      )}

      {/* ========================================================================= */}
      {/* 4. INSTITUTIONAL CORPORATE RADAR & EARNINGS GATE                          */}
      {/* ========================================================================= */}
      {data && data.corporate_radar && (
        <CorporateRadarCard radar={data.corporate_radar} />
      )}

      {/* ========================================================================= */}
      {/* 5. QUANTITATIVE RULES & TECHNICAL HEALTH MATRIX                          */}
      {/* ========================================================================= */}
      {data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <RuleChecklist rules={data.rule_breakdown || []} />

          {/* Technical Health Bento */}
          <div className="rounded-3xl border border-white/10 bg-[#080d1f]/75 p-6 backdrop-blur-3xl ring-1 ring-white/10">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
              <span className="text-xs font-black uppercase tracking-wider text-cyan-300">
                Technical Posture & Momentum
              </span>
              <span className="rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2.5 py-0.5 text-[10px] font-mono font-bold">
                {trend.Trend_Posture || 'BULLISH'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-2xl border border-white/5 bg-black/40 p-3.5">
                <span className="text-zinc-500 text-[10px] uppercase font-bold">50 DMA Level</span>
                <div className="font-mono font-black text-white text-base mt-0.5">
                  ₹{trend.DMA_50?.toFixed(2) || 'N/A'}
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-black/40 p-3.5">
                <span className="text-zinc-500 text-[10px] uppercase font-bold">200 DMA Level</span>
                <div className="font-mono font-black text-white text-base mt-0.5">
                  ₹{trend.DMA_200?.toFixed(2) || 'N/A'}
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-black/40 p-3.5">
                <span className="text-zinc-500 text-[10px] uppercase font-bold">14-Period ATR</span>
                <div className="font-mono font-black text-cyan-300 text-base mt-0.5">
                  {trend.ATR_14 ? `₹${trend.ATR_14.toFixed(2)} (${trend.ATR_Pct?.toFixed(1)}%)` : 'N/A'}
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-black/40 p-3.5">
                <span className="text-zinc-500 text-[10px] uppercase font-bold">RS vs Nifty</span>
                <div className="font-mono font-black text-emerald-400 text-base mt-0.5">
                  {t.Relative_Strength?.Relative_Strength_Classification || 'STRONG'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
