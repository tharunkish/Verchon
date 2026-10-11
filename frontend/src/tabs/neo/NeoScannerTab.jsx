import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { 
  Play, Sparkles, Filter, ChevronRight, X, AlertCircle, ShieldAlert, ShieldCheck, 
  Clock, Zap, ArrowUpRight, CheckCircle2, TrendingUp, Layers, Target, Compass, 
  Activity, BarChart3, Search, ChevronDown, Check, ArrowRight
} from 'lucide-react';
import SpotlightTiltCard from '../../components/neo/SpotlightTiltCard';
import BorderBeam from '../../components/neo/BorderBeam';
import NumberTicker from '../../components/neo/NumberTicker';

export default function NeoScannerTab({
  candidates = [],
  loadingScan = false,
  onRunScan,
  onSelectCandidate,
  onOpenTradeModal,
  aiReport,
  loadingAI = false,
  onGenerateAIReport,
}) {
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [universeSelect, setUniverseSelect] = useState('fast3');
  const [limitCount, setLimitCount] = useState(3);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCandidates = candidates.filter((c) => {
    const matchesPriority = filterPriority === 'ALL' || c.priority === filterPriority;
    const matchesSearch = searchQuery === '' || 
      c.ticker.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (c.company_name && c.company_name.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesPriority && matchesSearch;
  });

  const handleScanSubmit = () => {
    if (universeSelect === 'fast3') {
      onRunScan({ tickers: ['ICICIBANK.NS', 'TCS.NS', 'IDEA.NS'], limit: 3 });
    } else {
      onRunScan({ universe: universeSelect, limit: Number(limitCount) });
    }
  };

  const priorityTabs = [
    { id: 'ALL', label: 'All Candidates', count: candidates.length, color: 'text-zinc-200' },
    { id: 'SIGNAL TRIGGERED', label: '⚡ Signal Triggered', count: candidates.filter((c) => c.priority === 'SIGNAL TRIGGERED').length, color: 'text-emerald-400' },
    { id: 'HIGH PRIORITY', label: '💎 High Alpha', count: candidates.filter((c) => c.priority === 'HIGH PRIORITY').length, color: 'text-cyan-400' },
    { id: 'WATCHLIST', label: '👁️ Watchlist', count: candidates.filter((c) => c.priority === 'WATCHLIST').length, color: 'text-amber-400' },
    { id: 'AVOID / FILTERED OUT', label: '🛡️ Filtered Out', count: candidates.filter((c) => c.priority === 'AVOID / FILTERED OUT').length, color: 'text-rose-400' },
  ];

  const topPick = filteredCandidates.length > 0 ? filteredCandidates[0] : null;

  return (
    <div className="space-y-8 pb-32 pt-14">
      {/* ========================================================================= */}
      {/* 1. TOP MISSION CONTROL BENTO MATRIX (3-COLUMN HIGH-TECH DECK)           */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Bento 1: Scanner Ignition Station (5 cols) */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="relative lg:col-span-5 overflow-hidden rounded-3xl border border-cyan-500/20 bg-[#080d1f]/75 p-6 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,242,254,0.06)] ring-1 ring-white/10"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/30">
                <Zap className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-extrabold tracking-wider uppercase text-cyan-300">
                Universe Ignition Station
              </h2>
            </div>
            <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          </div>

          <p className="text-xs text-zinc-400 mt-2">
            7-Pillar Quantitative Momentum & Fundamental Filtration
          </p>

          {/* Preset Selector Grid */}
          <div className="mt-5 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: 'fast3', label: '⚡ 3-Stock Test', desc: 'ICICI, TCS, IDEA', limit: 3 },
                { id: 'nifty50', label: '📈 Nifty 50', desc: 'Elite Bluechips', limit: 15 },
                { id: 'niftynext50', label: '🚀 Next 50', desc: 'High Growth', limit: 20 },
                { id: 'nifty200', label: '🌐 Nifty 200', desc: 'Broad Universe', limit: 25 },
                { id: 'niftymidcap50', label: '💎 Midcap 50', desc: 'Alpha Gems', limit: 20 },
              ].map((uni) => (
                <button
                  key={uni.id}
                  onClick={() => {
                    setUniverseSelect(uni.id);
                    setLimitCount(uni.limit);
                  }}
                  disabled={loadingScan}
                  className={`relative flex flex-col items-start rounded-2xl border p-2.5 text-left transition-all ${
                    universeSelect === uni.id
                      ? 'border-cyan-400/60 bg-gradient-to-br from-cyan-500/25 to-blue-600/15 text-white shadow-[0_0_20px_rgba(0,242,254,0.2)]'
                      : 'border-white/5 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:bg-white/[0.05] hover:text-zinc-200'
                  }`}
                >
                  <span className="text-xs font-bold">{uni.label}</span>
                  <span className="text-[10px] text-zinc-500 mt-0.5">{uni.desc}</span>
                </button>
              ))}
            </div>

            {/* Candidate Limit & Launch Button */}
            <div className="flex items-center space-x-3 pt-2">
              {universeSelect !== 'fast3' && (
                <div className="flex items-center space-x-2 rounded-2xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-xs text-zinc-300">
                  <span className="text-zinc-500 font-mono">Limit:</span>
                  <input
                    type="number"
                    min="3"
                    max="50"
                    value={limitCount}
                    onChange={(e) => setLimitCount(e.target.value)}
                    disabled={loadingScan}
                    className="w-8 bg-transparent font-mono font-bold text-cyan-300 outline-none"
                  />
                </div>
              )}

              <button
                onClick={handleScanSubmit}
                disabled={loadingScan}
                className="relative group flex-1 overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 px-6 py-3 text-xs font-black uppercase tracking-wider text-white shadow-xl shadow-cyan-950/50 hover:scale-[1.02] active:scale-95 transition disabled:opacity-50"
              >
                <div className="relative z-10 flex items-center justify-center space-x-2">
                  <Play className={`h-3.5 w-3.5 fill-current ${loadingScan ? 'animate-spin' : ''}`} />
                  <span>{loadingScan ? 'Scanning...' : 'Ignite Quantum Scan'}</span>
                </div>
                <BorderBeam size={80} duration={4} colorFrom="#00f2fe" colorTo="#7928ca" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Bento 2: Market Regime Radar (3 cols) */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="relative lg:col-span-3 flex flex-col justify-between overflow-hidden rounded-3xl border border-indigo-500/20 bg-[#0a0f28]/75 p-6 backdrop-blur-3xl shadow-[0_8px_32px_rgba(99,102,241,0.06)] ring-1 ring-white/10"
        >
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Compass className="h-4 w-4 text-indigo-400" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-indigo-300">
                  Regime Radar
                </h3>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400 border border-emerald-500/30">
                ACTIVE
              </span>
            </div>

            <div className="mt-4 flex items-baseline justify-between">
              <div className="text-2xl font-black tracking-tight text-white">SUPPORTIVE</div>
              <div className="text-xs font-mono font-bold text-emerald-400">Score 85/100</div>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              Favorable swing conditions. Pullback & breakout setups permitted.
            </p>
          </div>

          <div className="mt-4 space-y-2 border-t border-white/5 pt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Trend Strength</span>
              <span className="font-mono font-bold text-cyan-300">+1.4% &gt; 50DMA</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              <div className="h-full w-[85%] rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400" />
            </div>
          </div>
        </motion.div>

        {/* Bento 3: Neural AI Advisor Capsule (4 cols) */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="relative lg:col-span-4 flex flex-col justify-between overflow-hidden rounded-3xl border border-purple-500/20 bg-[#0e0c26]/75 p-6 backdrop-blur-3xl shadow-[0_8px_32px_rgba(168,85,247,0.06)] ring-1 ring-white/10"
        >
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-purple-400" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-purple-300">
                  Institutional AI Copilot
                </h3>
              </div>
              <span className="text-[10px] font-mono text-purple-400/80">GEMINI NEURAL</span>
            </div>

            <p className="text-xs text-zinc-300 mt-3 line-clamp-2">
              {aiReport?.executive_summary || 'Autonomous qualitative catalyst synthesis and institutional order-flow assessment ready.'}
            </p>
          </div>

          <div className="mt-4 flex items-center space-x-2 border-t border-white/5 pt-3">
            <button
              onClick={() => onGenerateAIReport(candidates.map((c) => c.ticker))}
              disabled={loadingAI || candidates.length === 0}
              className="flex-1 rounded-2xl border border-purple-500/30 bg-purple-500/15 py-2.5 text-xs font-bold text-purple-200 hover:bg-purple-500/25 active:scale-95 transition disabled:opacity-40"
            >
              {loadingAI ? 'Synthesizing...' : '⚡ Generate AI Briefing'}
            </button>
            {aiReport && (
              <button
                onClick={() => setIsAiDrawerOpen(true)}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs font-bold text-zinc-300 hover:bg-white/[0.08] transition"
              >
                View
              </button>
            )}
          </div>
        </motion.div>
      </div>

      {/* ========================================================================= */}
      {/* 2. FILTER & SEARCH CONTROL BAR                                           */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-white/[0.08] py-4">
        {/* Priority Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {priorityTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterPriority(tab.id)}
              className={`flex items-center space-x-2 rounded-2xl border px-3.5 py-1.5 text-xs font-bold transition-all ${
                filterPriority === tab.id
                  ? 'border-cyan-400/50 bg-cyan-500/20 text-white shadow-[0_0_15px_rgba(0,242,254,0.15)]'
                  : 'border-white/5 bg-white/[0.02] text-zinc-400 hover:border-white/15 hover:text-zinc-200'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono bg-black/40 ${tab.color}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Quick Search Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search candidates..."
            className="w-48 sm:w-64 rounded-2xl border border-white/10 bg-black/40 pl-9 pr-4 py-1.5 text-xs font-bold text-white placeholder-zinc-500 outline-none focus:border-cyan-400/60 transition"
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. DYNAMIC BENTO STOCK CARDS GRID                                         */}
      {/* ========================================================================= */}
      {filteredCandidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-[#080d1f]/40 p-16 text-center backdrop-blur-2xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/20">
            <Compass className="h-7 w-7" />
          </div>
          <h3 className="text-base font-extrabold text-white mt-4">No Candidates in Current Filter</h3>
          <p className="text-xs text-zinc-400 mt-1 max-w-sm">
            Launch a quantum scan above or change the priority filter tab to inspect stocks.
          </p>
          <button
            onClick={handleScanSubmit}
            disabled={loadingScan}
            className="mt-6 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-2.5 text-xs font-extrabold text-white shadow-lg hover:scale-105 active:scale-95 transition"
          >
            Launch 3-Stock Fast Test
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCandidates.map((c, index) => {
            const isTopRanked = index === 0 && filterPriority === 'ALL';
            const score = c.score ?? 0;
            const price = c.current_price ?? 0;
            const setupType = c.setup_type || 'SWING_MOMENTUM';
            const stopPrice = c.stop_loss || (price ? price * 0.95 : 0);
            const target1 = c.target_1 || (price ? price * 1.08 : 0);
            const target2 = c.target_2 || (price ? price * 1.15 : 0);
            const rrRatio = c.risk_reward_ratio || 2.4;

            const isHighPriority = c.priority === 'HIGH PRIORITY' || c.priority === 'SIGNAL TRIGGERED';

            return (
              <motion.div
                key={c.ticker}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className={isTopRanked ? 'md:col-span-2 lg:col-span-3' : ''}
              >
                <SpotlightTiltCard
                  className={`relative flex flex-col justify-between overflow-hidden rounded-3xl border transition-all duration-300 ${
                    isHighPriority
                      ? 'border-cyan-500/30 bg-[#0a0f28]/80 shadow-[0_8px_32px_rgba(0,242,254,0.08)] ring-1 ring-cyan-400/20'
                      : 'border-white/10 bg-[#080d1f]/60 hover:border-white/20'
                  } p-6 backdrop-blur-3xl`}
                >
                  {/* Glowing Border Beam for Top Alpha Cards */}
                  {isHighPriority && (
                    <BorderBeam size={100} duration={6} colorFrom="#00f2fe" colorTo="#7928ca" />
                  )}

                  <div>
                    {/* Top Card Bar: Rank Badge + Score + Setup Tag */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className={`rounded-xl px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-wider ${
                          isTopRanked
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow-md shadow-orange-500/20'
                            : 'bg-white/10 text-zinc-300'
                        }`}>
                          #{index + 1 < 10 ? `0${index + 1}` : index + 1} {isTopRanked ? 'ALPHA LEADER' : 'PICK'}
                        </span>
                        <span className="rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold text-zinc-300">
                          {setupType.replace(/_/g, ' ')}
                        </span>
                      </div>

                      {/* Score Badge */}
                      <div className="flex items-center space-x-1.5 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 font-mono text-xs font-black text-cyan-300">
                        <span>SCORE</span>
                        <span className="text-sm font-extrabold text-white">{score.toFixed(1)}</span>
                      </div>
                    </div>

                    {/* Stock Identity: Ticker & Price */}
                    <div className="mt-5 flex items-baseline justify-between">
                      <div>
                        <h4 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                          {c.ticker}
                        </h4>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {c.company_name || 'NSE Equity'}
                        </p>
                      </div>

                      <div className="text-right">
                        <div className="text-xl font-mono font-black text-white">
                          ₹{price ? price.toLocaleString('en-IN') : '---'}
                        </div>
                        <span className="text-[10px] font-mono text-emerald-400 font-bold">
                          R:R {rrRatio.toFixed(1)}x
                        </span>
                      </div>
                    </div>

                    {/* Visual Key Levels Spectrum Bar */}
                    <div className="mt-5 rounded-2xl border border-white/5 bg-black/40 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <div className="flex items-center space-x-1 text-rose-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                          <span>SL: ₹{stopPrice.toFixed(1)}</span>
                        </div>
                        <div className="flex items-center space-x-1 text-cyan-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                          <span>Entry: ₹{price.toFixed(1)}</span>
                        </div>
                        <div className="flex items-center space-x-1 text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          <span>T1: ₹{target1.toFixed(1)}</span>
                        </div>
                      </div>

                      {/* Visual Progress Bar */}
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                        <div className="absolute left-0 top-0 h-full w-[25%] bg-rose-500/80" />
                        <div className="absolute left-[25%] top-0 h-full w-[45%] bg-gradient-to-r from-cyan-400 to-emerald-400" />
                        <div className="absolute left-[70%] top-0 h-full w-[30%] bg-gradient-to-r from-emerald-400 to-purple-500" />
                      </div>
                    </div>

                    {/* 7-Pillar Health Indicators */}
                    {c.pillars && (
                      <div className="mt-4 flex flex-wrap items-center gap-1.5">
                        {Object.entries(c.pillars).slice(0, 5).map(([pillar, passed]) => (
                          <span
                            key={pillar}
                            className={`rounded-lg px-2 py-0.5 text-[9px] font-mono font-bold ${
                              passed
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-zinc-800/60 text-zinc-500 border border-zinc-700/40'
                            }`}
                          >
                            {passed ? '✓' : '✗'} {pillar.replace(/_/g, ' ').substring(0, 10)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Card Action HUD (Direct Paper Trade & Deep Dive) */}
                  <div className="mt-6 flex items-center space-x-2 border-t border-white/5 pt-4">
                    <button
                      onClick={() => onOpenTradeModal(c.ticker, setupType)}
                      className="flex-1 flex items-center justify-center space-x-1.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-950/40 hover:scale-[1.02] active:scale-95 transition"
                    >
                      <Zap className="h-3.5 w-3.5 fill-current" />
                      <span>Paper Trade</span>
                    </button>

                    <button
                      onClick={() => onSelectCandidate(c.ticker)}
                      className="flex items-center space-x-1 rounded-2xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-xs font-extrabold text-zinc-200 hover:bg-white/[0.1] hover:text-white active:scale-95 transition"
                    >
                      <span>Deep Dive</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </SpotlightTiltCard>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. SLIDE-OVER AI DOSSIER DRAWER                                           */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isAiDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAiDrawerOpen(false)}
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed right-0 top-0 z-50 h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#080d1f] p-8 shadow-2xl backdrop-blur-3xl"
            >
              <div className="flex items-center justify-between pb-6 border-b border-white/10">
                <div className="flex items-center space-x-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">Institutional AI Intelligence</h3>
                    <p className="text-xs text-purple-300/80">Gemini Multi-Factor Synthesis Briefing</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAiDrawerOpen(false)}
                  className="rounded-full p-2 text-zinc-400 hover:bg-white/10 hover:text-white transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 prose prose-invert max-w-none text-xs leading-relaxed text-zinc-300">
                {aiReport?.briefing_markdown ? (
                  <ReactMarkdown>{aiReport.briefing_markdown}</ReactMarkdown>
                ) : (
                  <p>No briefing content generated yet.</p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
