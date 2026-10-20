import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radio,
  Calendar,
  AlertTriangle,
  Clock,
  ShieldCheck,
  FileText,
  Newspaper,
  ExternalLink,
  RefreshCw,
  Search,
  Filter,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Building,
  Layers,
  Flame,
  Award,
  Zap,
  CheckCircle2,
  XCircle,
  Eye,
  SlidersHorizontal,
  X
} from 'lucide-react';

export default function AppleNewsTab({ onSelectStock }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState('ALL'); // 'ALL', 'HIGH_ATTENTION', 'DIVIDEND_SPLIT', 'RESULTS', 'ORDERS', 'ACQUISITION'
  const [showMuted, setShowMuted] = useState(false);
  const [filingSearch, setFilingSearch] = useState('');
  const [newsSearch, setNewsSearch] = useState('');
  const [selectedEarningsTicker, setSelectedEarningsTicker] = useState(null);
  const [expandedFilingIndex, setExpandedFilingIndex] = useState(null);
  const [earningsView, setEarningsView] = useState('reviews'); // 'reviews' | 'upcoming'
  const [earningsTimelineFilter, setEarningsTimelineFilter] = useState('ALL'); // 'ALL' | 'HELD' | 'LOCKOUT' | 'NEAR_TERM'

  const fetchNewsHub = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/news-hub');
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to load news hub:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNewsHub();
  }, []);

  const upcomingEarnings = useMemo(() => data?.upcoming_earnings || [], [data]);
  const recentEarningsReviews = useMemo(() => data?.recent_earnings_reviews || [], [data]);
  const recentFilings = useMemo(() => data?.recent_filings || [], [data]);
  const marketNews = useMemo(() => data?.market_news || [], [data]);

  const heldUpcomingCount = useMemo(() => upcomingEarnings.filter((s) => s.is_held).length, [upcomingEarnings]);
  const lockoutEarningsCount = useMemo(() => upcomingEarnings.filter((s) => s.days_to_earnings !== null && s.days_to_earnings <= 5).length, [upcomingEarnings]);

  const filteredUpcomingEarnings = useMemo(() => {
    return upcomingEarnings.filter((stock) => {
      if (earningsTimelineFilter === 'HELD') return stock.is_held;
      if (earningsTimelineFilter === 'LOCKOUT') return stock.days_to_earnings !== null && stock.days_to_earnings <= 5;
      if (earningsTimelineFilter === 'NEAR_TERM') return stock.days_to_earnings !== null && stock.days_to_earnings > 5 && stock.days_to_earnings <= 14;
      return true;
    });
  }, [upcomingEarnings, earningsTimelineFilter]);

  // Telemetry aggregates
  const lockoutCount = useMemo(() => {
    return upcomingEarnings.filter((e) => e.days_to_earnings !== null && e.days_to_earnings <= 5).length;
  }, [upcomingEarnings]);

  const highAttentionCount = useMemo(() => {
    return recentFilings.filter((f) => f.tier === 'HIGH_ATTENTION').length;
  }, [recentFilings]);

  const mutedCount = useMemo(() => {
    return recentFilings.filter((f) => f.is_muted).length;
  }, [recentFilings]);

  const mutePct = useMemo(() => {
    if (!recentFilings.length) return 0;
    return Math.round((mutedCount / recentFilings.length) * 100);
  }, [recentFilings, mutedCount]);

  const sentimentStats = useMemo(() => {
    let bullish = 0;
    let bearish = 0;
    marketNews.forEach((n) => {
      if (n.tag === 'BULLISH') bullish++;
      else if (n.tag === 'BEARISH') bearish++;
    });
    const total = bullish + bearish || 1;
    return {
      bullish,
      bearish,
      bullishPct: Math.round((bullish / total) * 100),
      bearishPct: Math.round((bearish / total) * 100)
    };
  }, [marketNews]);

  // Filtered filings
  const filteredFilings = useMemo(() => {
    return recentFilings.filter((f) => {
      if (!showMuted && f.is_muted) return false;

      if (activeCategory === 'HIGH_ATTENTION') {
        if (f.tier !== 'HIGH_ATTENTION') return false;
      } else if (activeCategory !== 'ALL') {
        if (f.category !== activeCategory) return false;
      }

      if (!filingSearch) return true;
      const q = filingSearch.toLowerCase();
      return (
        f.ticker?.toLowerCase().includes(q) ||
        f.company_name?.toLowerCase().includes(q) ||
        f.title?.toLowerCase().includes(q) ||
        f.description?.toLowerCase().includes(q) ||
        f.rationale?.toLowerCase().includes(q)
      );
    });
  }, [recentFilings, showMuted, activeCategory, filingSearch]);

  // Filtered market news
  const filteredNews = useMemo(() => {
    if (!newsSearch) return marketNews;
    const q = newsSearch.toLowerCase();
    return marketNews.filter(
      (n) =>
        n.title?.toLowerCase().includes(q) ||
        n.source?.toLowerCase().includes(q) ||
        n.tag?.toLowerCase().includes(q)
    );
  }, [marketNews, newsSearch]);

  return (
    <div className="min-h-[calc(100vh-100px)] p-3 sm:p-5 lg:p-6 space-y-6">

      {/* =========================================================================
          1. THE INTELLIGENCE MASTHEAD & TELEMETRY BAR
         ========================================================================= */}
      <div className="relative overflow-hidden rounded-3xl apple-glass apple-card-elevated p-5 sm:p-6 space-y-5">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black/[0.06] dark:border-white/[0.06] pb-5">
          <div className="flex items-start sm:items-center space-x-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm shrink-0">
              <Radio className="h-5 w-5 animate-pulse text-rose-500" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-sm sm:text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                  Regulatory Wire & Corporate Radar
                </h1>
                <span className="inline-flex items-center space-x-1 rounded-full bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-[9px] font-mono font-bold text-rose-600 dark:text-rose-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
                  <span>SEBI Reg-30 Direct</span>
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Official BSE/NSE disclosures, binary event horizon, and high-signal financial wire
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 self-start md:self-center">
            {data?.updated_at && (
              <span className="text-[10px] font-mono text-zinc-400 hidden sm:inline">
                Synced: {new Date(data.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={fetchNewsHub}
              disabled={loading}
              className="flex items-center space-x-2 rounded-xl border border-black/[0.08] dark:border-[#363c44] bg-black/[0.02] dark:bg-[#1c232d] px-3.5 py-2 text-xs font-semibold text-zinc-700 dark:text-[#e0d1b9] hover:bg-black/[0.05] dark:hover:bg-[#283341] transition disabled:opacity-50 active:scale-95"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
              <span>{loading ? 'Refreshing Wire...' : 'Refresh Wire'}</span>
            </button>
          </div>
        </div>

        {/* 4 Telemetry Barometer Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 pt-5">
          {/* Card 1: Binary Risk Lockout */}
          <div className="rounded-2xl border border-black/[0.04] dark:border-[#363c44] bg-black/[0.015] dark:bg-[#1c232d] p-3.5">
            <div className="flex items-center justify-between text-zinc-500 dark:text-[#958a7a] text-[10px] font-bold tracking-wider">
              <span>Event Risk Lockout</span>
              <AlertTriangle className={`h-3.5 w-3.5 ${lockoutCount > 0 ? 'text-amber-500' : 'text-zinc-400 dark:text-[#958a7a]'}`} />
            </div>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className={`text-xl sm:text-2xl font-bold font-mono tabular-nums ${lockoutCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-800 dark:text-[#e0d1b9]'}`}>
                {lockoutCount}
              </span>
              <span className="text-[10px] text-zinc-400 dark:text-[#958a7a] font-medium">stocks ≤ 3d</span>
            </div>
            <p className="text-[10px] text-zinc-400 dark:text-[#958a7a] mt-1 truncate">
              Binary overnight gap hazard window
            </p>
          </div>

          {/* Card 2: High Conviction Disclosures */}
          <div className="rounded-2xl border border-black/[0.04] dark:border-[#363c44] bg-black/[0.015] dark:bg-[#1c232d] p-3.5">
            <div className="flex items-center justify-between text-zinc-500 dark:text-[#958a7a] text-[10px] font-bold tracking-wider">
              <span>High-Impact Filings</span>
              <Flame className="h-3.5 w-3.5 text-rose-500" />
            </div>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-zinc-900 dark:text-[#e0d1b9]">
                {highAttentionCount}
              </span>
              <span className="text-[10px] text-zinc-400 dark:text-[#958a7a] font-medium">Tier-1 catalysts</span>
            </div>
            <p className="text-[10px] text-zinc-400 dark:text-[#958a7a] mt-1 truncate">
              M&A, Capex, and Major Orders
            </p>
          </div>

          {/* Card 3: Noise Muting Shield */}
          <div className="rounded-2xl border border-black/[0.04] dark:border-[#363c44] bg-black/[0.015] dark:bg-[#1c232d] p-3.5">
            <div className="flex items-center justify-between text-zinc-500 dark:text-[#958a7a] text-[10px] font-bold tracking-wider">
              <span>Compliance Noise Shield</span>
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {mutePct}%
              </span>
              <span className="text-[10px] text-zinc-400 font-medium">filtered ({mutedCount})</span>
            </div>
            <p className="text-[10px] text-zinc-400 mt-1 truncate">
              Window closures & lost share spam muted
            </p>
          </div>

          {/* Card 4: Macro Sentiment Balance */}
          <div className="rounded-2xl border border-black/[0.04] dark:border-white/[0.05] bg-black/[0.015] dark:bg-white/[0.02] p-3.5">
            <div className="flex items-center justify-between text-zinc-500 text-[10px] font-bold tracking-wider">
              <span>Macro Pulse Sentiment</span>
              <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                {sentimentStats.bullishPct}%
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Bullish bias</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden flex">
              <div style={{ width: `${sentimentStats.bullishPct}%` }} className="bg-emerald-500 h-full" />
              <div style={{ width: `${sentimentStats.bearishPct}%` }} className="bg-rose-500 h-full" />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs font-semibold text-rose-700 dark:text-rose-400 flex items-center space-x-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Failed to connect to corporate radar feed: {error}</span>
        </div>
      )}

      {/* =========================================================================
          2. THE SEISMIC EVENT HORIZON: EARNINGS RUNWAY & SURPRISE TRACK
         ========================================================================= */}
      <div className="rounded-3xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#0f1626] p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-black/[0.05] dark:border-white/[0.05] pb-4">
          <div className="flex items-center space-x-2.5">
            <div className="h-8 w-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-wide">
                Earnings Intelligence: Delivery & Runway
              </h2>
              <p className="text-[11px] text-zinc-500">
                {earningsView === 'reviews' 
                  ? 'Summarised projected vs actual prints, management announcements, and review verdicts'
                  : 'Upcoming quarterly financial disclosure calendar and binary overnight gap hazards'}
              </p>
            </div>
          </div>

          {/* Segmented Control Pill (Apple Style) */}
          <div className="flex items-center p-1 rounded-2xl bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.05] self-start sm:self-center">
            <button
              onClick={() => setEarningsView('reviews')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5 ${
                earningsView === 'reviews'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              <Sparkles className="h-3 w-3 text-emerald-500" />
              <span>Reported Reviews</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/[0.05] dark:bg-white/[0.08]">
                {recentEarningsReviews.length}
              </span>
            </button>
            <button
              onClick={() => setEarningsView('upcoming')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5 ${
                earningsView === 'upcoming'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              <Clock className="h-3 w-3 text-purple-500" />
              <span>Upcoming Runway</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/[0.05] dark:bg-white/[0.08]">
                {upcomingEarnings.length}
              </span>
            </button>
          </div>
        </div>

        {/* VIEW 1: REPORTED EARNINGS REVIEWS (Projected vs Actual & Verdicts) */}
        {earningsView === 'reviews' && (
          <div>
            {recentEarningsReviews.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400 font-mono">
                No recent earnings reviews cached yet. Click any stock to fetch fresh financials.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recentEarningsReviews.map((rev) => {
                  const m = rev.metrics || {};
                  const isPositive = rev.verdict === 'POSITIVE';
                  const isNegative = rev.verdict === 'NEGATIVE';
                  const isMixed = rev.verdict === 'MIXED';

                  return (
                    <div
                      key={rev.ticker}
                      className={`rounded-2xl border p-4 flex flex-col justify-between transition-all hover:shadow-sm ${
                        isPositive
                          ? 'border-emerald-500/30 bg-emerald-500/[0.02] dark:bg-emerald-500/[0.03]'
                          : isNegative
                          ? 'border-rose-500/30 bg-rose-500/[0.02] dark:bg-rose-500/[0.03]'
                          : 'border-amber-500/30 bg-amber-500/[0.02] dark:bg-amber-500/[0.03]'
                      }`}
                    >
                      <div>
                        {/* Header: Identity & Review Verdict */}
                        <div className="flex items-center justify-between gap-2">
                          <button
                            onClick={() => onSelectStock && onSelectStock(rev.ticker)}
                            className="font-mono text-sm font-black text-zinc-900 dark:text-zinc-100 hover:text-blue-500 dark:hover:text-blue-400 transition flex items-center space-x-1"
                          >
                            <span>{rev.clean_ticker}</span>
                            <ArrowUpRight className="h-3.5 w-3.5 opacity-60" />
                          </button>

                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border flex items-center space-x-1 ${
                              isPositive
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                : isNegative
                                ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400'
                                : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {isPositive ? (
                              <CheckCircle2 className="h-2.5 w-2.5" />
                            ) : isNegative ? (
                              <XCircle className="h-2.5 w-2.5" />
                            ) : (
                              <Clock className="h-2.5 w-2.5" />
                            )}
                            <span>{rev.verdict_badge}</span>
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">{rev.company_name}</span>
                          <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-300 text-[10px]">
                            {rev.quarter}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-1.5 text-[10px] text-zinc-400 font-mono mt-1">
                          <span>Disclosed: <strong className="text-zinc-700 dark:text-zinc-200">{rev.report_date_display || rev.report_date}</strong></span>
                          {rev.period_ended_display && (
                            <>
                              <span>•</span>
                              <span>Period Ended: {rev.period_ended_display}</span>
                            </>
                          )}
                        </div>

                        {/* Rationale Pill */}
                        {rev.verdict_rationale && (
                          <div className="mt-2 text-[10px] text-zinc-600 dark:text-zinc-300 font-medium bg-black/[0.02] dark:bg-white/[0.03] p-1.5 rounded-lg border border-black/[0.03] dark:border-white/[0.04]">
                            {rev.verdict_rationale}
                          </div>
                        )}

                        {/* 4-Metric Comparison Matrix (Projected vs Actual) */}
                        <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-black/[0.04] dark:border-white/[0.04] text-[10px] font-mono">
                          {/* EPS Print */}
                          <div className="bg-black/[0.02] dark:bg-white/[0.02] p-2 rounded-xl border border-black/[0.03] dark:border-white/[0.03]">
                            <div className="text-zinc-400 text-[9px] font-bold">EPS ESTIMATE VS ACTUAL</div>
                            <div className="mt-1 flex items-baseline justify-between">
                              <span className="text-zinc-900 dark:text-zinc-100 font-bold">
                                ₹{m.eps_actual ?? '—'}
                              </span>
                              {m.eps_projected && (
                                <span className="text-[9px] text-zinc-400">
                                  Est ₹{m.eps_projected}
                                </span>
                              )}
                            </div>
                            {m.eps_surprise_pct !== null && (
                              <div className={`text-[9px] font-bold mt-0.5 ${m.eps_surprise_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {m.eps_surprise_pct > 0 ? '+' : ''}{m.eps_surprise_pct}% surprise
                              </div>
                            )}
                          </div>

                          {/* Net Profit YoY */}
                          <div className="bg-black/[0.02] dark:bg-white/[0.02] p-2 rounded-xl border border-black/[0.03] dark:border-white/[0.03]">
                            <div className="text-zinc-400 text-[9px] font-bold">NET PROFIT (PAT)</div>
                            <div className="mt-1 flex items-baseline justify-between">
                              <span className={`font-bold ${m.profit_yoy_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {m.profit_yoy_pct !== null ? `${m.profit_yoy_pct > 0 ? '+' : ''}${m.profit_yoy_pct}%` : '—'}
                              </span>
                              <span className="text-[9px] text-zinc-400">YoY</span>
                            </div>
                            <div className="text-[9px] text-zinc-400 mt-0.5">Bottom line delivery</div>
                          </div>

                          {/* Revenue YoY */}
                          <div className="bg-black/[0.02] dark:bg-white/[0.02] p-2 rounded-xl border border-black/[0.03] dark:border-white/[0.03]">
                            <div className="text-zinc-400 text-[9px] font-bold">REVENUE / SALES</div>
                            <div className="mt-1 flex items-baseline justify-between">
                              <span className={`font-bold ${m.sales_yoy_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {m.sales_yoy_pct !== null ? `${m.sales_yoy_pct > 0 ? '+' : ''}${m.sales_yoy_pct}%` : '—'}
                              </span>
                              <span className="text-[9px] text-zinc-400">YoY</span>
                            </div>
                            <div className="text-[9px] text-zinc-400 mt-0.5">Topline expansion</div>
                          </div>

                          {/* Operating Margin */}
                          <div className="bg-black/[0.02] dark:bg-white/[0.02] p-2 rounded-xl border border-black/[0.03] dark:border-white/[0.03]">
                            <div className="text-zinc-400 text-[9px] font-bold">OPERATING MARGIN</div>
                            <div className="mt-1 flex items-baseline justify-between">
                              <span className="text-zinc-900 dark:text-zinc-100 font-bold">
                                {m.opm_pct !== null ? `${m.opm_pct}%` : '—'}
                              </span>
                              {m.opm_expansion !== null && (
                                <span className={`text-[9px] font-bold ${m.opm_expansion >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {m.opm_expansion > 0 ? '+' : ''}{m.opm_expansion}%
                                </span>
                              )}
                            </div>
                            <div className="text-[9px] text-zinc-400 mt-0.5">Margin efficiency</div>
                          </div>
                        </div>

                        {/* What the Earnings Said (Summary Bullets) */}
                        {rev.highlights && rev.highlights.length > 0 && (
                          <div className="mt-3 space-y-1 text-[10px] text-zinc-600 dark:text-zinc-300">
                            {rev.highlights.map((hl, hIdx) => (
                              <div key={hIdx} className="flex items-start space-x-1.5">
                                <span className="text-zinc-400 mt-0.5">•</span>
                                <span className="leading-snug">{hl}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Footer: Corporate Action / Dividend Badge */}
                      {rev.dividend_note && (
                        <div className="mt-3 pt-2 border-t border-black/[0.04] dark:border-white/[0.04] flex items-center justify-between">
                          <span className="inline-flex items-center space-x-1 rounded-full bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-[9px] font-bold text-purple-700 dark:text-purple-300 font-mono">
                            <Award className="h-2.5 w-2.5" />
                            <span>{rev.dividend_note}</span>
                          </span>
                          <button
                            onClick={() => onSelectStock && onSelectStock(rev.ticker)}
                            className="text-[10px] font-semibold text-blue-500 hover:underline"
                          >
                            Deep Dive &rarr;
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: UPCOMING FLIGHT STRIP RUNWAY */}
        {earningsView === 'upcoming' && (
          <div className="space-y-4">
            {/* Timeline & Portfolio Filter Bar */}
            <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs font-mono">
              <button
                onClick={() => setEarningsTimelineFilter('ALL')}
                className={`rounded-lg px-3 py-1 font-semibold transition shrink-0 ${
                  earningsTimelineFilter === 'ALL'
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 bg-black/[0.03] dark:bg-white/[0.05]'
                }`}
              >
                All Runway ({upcomingEarnings.length})
              </button>

              {heldUpcomingCount > 0 && (
                <button
                  onClick={() => setEarningsTimelineFilter('HELD')}
                  className={`rounded-lg px-3 py-1 font-semibold transition shrink-0 flex items-center space-x-1.5 ${
                    earningsTimelineFilter === 'HELD'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/25'
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                  <span>Held in Portfolio ({heldUpcomingCount})</span>
                </button>
              )}

              {lockoutEarningsCount > 0 && (
                <button
                  onClick={() => setEarningsTimelineFilter('LOCKOUT')}
                  className={`rounded-lg px-3 py-1 font-semibold transition shrink-0 flex items-center space-x-1.5 ${
                    earningsTimelineFilter === 'LOCKOUT'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/25'
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
                  <span>Binary Lockout ≤5d ({lockoutEarningsCount})</span>
                </button>
              )}

              <button
                onClick={() => setEarningsTimelineFilter('NEAR_TERM')}
                className={`rounded-lg px-3 py-1 font-semibold transition shrink-0 ${
                  earningsTimelineFilter === 'NEAR_TERM'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/25'
                }`}
              >
                Near-Term 6–14d
              </button>
            </div>

            {filteredUpcomingEarnings.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400 font-mono">
                No corporate results matching "{earningsTimelineFilter}" timeline filter.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {filteredUpcomingEarnings.slice(0, 12).map((stock, i) => {
                  const isHigh = stock.badge === 'HIGH_RISK' || (stock.days_to_earnings !== null && stock.days_to_earnings <= 5);
                  const isCaution = stock.badge === 'CAUTION' || (stock.days_to_earnings !== null && stock.days_to_earnings <= 14);
                  const surprises = stock.past_surprises || [];
                  const gaps = stock.gap_reactions || [];
                  const isSelected = selectedEarningsTicker === stock.ticker;

                  return (
                    <div
                      key={i}
                      className={`rounded-2xl border p-4 transition-all flex flex-col justify-between ${
                        isHigh
                          ? 'border-rose-500/40 bg-rose-500/[0.03] dark:bg-rose-500/[0.05]'
                          : isCaution
                          ? 'border-amber-500/30 bg-amber-500/[0.02] dark:bg-amber-500/[0.04]'
                          : 'border-black/[0.06] dark:border-white/[0.07] bg-black/[0.01] dark:bg-white/[0.02]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1.5">
                            <button
                              onClick={() => onSelectStock && onSelectStock(stock.ticker)}
                              className="font-mono text-xs font-black text-zinc-900 dark:text-zinc-100 hover:text-blue-500 dark:hover:text-blue-400 transition flex items-center space-x-1"
                            >
                              <span>{stock.ticker.replace('.NS', '')}</span>
                              <ArrowUpRight className="h-3 w-3 opacity-60" />
                            </button>
                            {stock.is_held && (
                              <span className="rounded-full bg-blue-500/15 border border-blue-500/30 px-1.5 py-0.2 text-[8px] font-mono font-bold text-blue-700 dark:text-blue-400">
                                HELD
                              </span>
                            )}
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase border ${
                              isHigh
                                ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400 animate-pulse'
                                : isCaution
                                ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {stock.days_to_earnings === 0 ? 'D-0 TODAY' : stock.days_to_earnings !== null ? `D-${stock.days_to_earnings}` : 'PENDING'}
                          </span>
                        </div>

                        <div className="mt-3">
                          <div className="text-[10px] uppercase font-bold text-zinc-400">Scheduled Date</div>
                          <div className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center justify-between">
                            <span>
                              {stock.next_earnings_date
                                ? new Date(stock.next_earnings_date + 'T00:00:00').toLocaleDateString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  })
                                : 'TBD'}
                            </span>
                            {stock.days_to_earnings !== null && (
                              <span className="text-[10px] text-zinc-400 font-normal">
                                {stock.days_to_earnings === 0 ? 'Today' : `in ${stock.days_to_earnings}d`}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Gap Stats Summary Badge */}
                        {stock.gap_stats?.summary && (
                          <div className="mt-2 text-[10px] font-mono text-zinc-700 dark:text-[#e0d1b9] bg-black/[0.04] dark:bg-white/[0.05] p-2 rounded-lg border border-black/[0.04] dark:border-white/[0.05] leading-relaxed">
                            {stock.gap_stats.summary}
                          </div>
                        )}
                      </div>

                      {/* Day-1 Gap Reaction Strip & Audit */}
                      {(gaps.length > 0 || surprises.length > 0) && (
                        <div className="mt-3 pt-2.5 border-t border-black/[0.04] dark:border-white/[0.04]">
                          <div className="flex items-center justify-between text-[9px] font-mono font-bold text-zinc-400 mb-1.5">
                            <span>POST-EARNINGS GAPS</span>
                            <button
                              onClick={() => setSelectedEarningsTicker(isSelected ? null : stock.ticker)}
                              className="text-blue-500 hover:underline"
                            >
                              {isSelected ? 'Hide' : 'Audit'}
                            </button>
                          </div>

                          {/* Gap pills */}
                          {gaps.length > 0 ? (
                            <div className="flex items-center space-x-1.5">
                              {gaps.slice(0, 3).map((g, idx) => {
                                const isDown = g.gap_pct < -0.3;
                                const isUp = g.gap_pct > 0.3;
                                return (
                                  <div
                                    key={idx}
                                    title={`${g.announcement_date}: Gap ${g.gap_pct > 0 ? '+' : ''}${g.gap_pct}%, Close ${g.day1_pct > 0 ? '+' : ''}${g.day1_pct}%`}
                                    className={`flex-1 text-center py-1 rounded text-[9px] font-mono font-bold border ${
                                      isDown
                                        ? 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400'
                                        : isUp
                                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                        : 'border-zinc-500/20 bg-zinc-500/10 text-zinc-500'
                                    }`}
                                  >
                                    {g.gap_pct > 0 ? '+' : ''}{g.gap_pct}%
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="flex items-center space-x-1.5">
                              {surprises.slice(0, 3).map((sp, idx) => {
                                const beat = sp.surprise_pct !== null && sp.surprise_pct >= 0;
                                return (
                                  <div
                                    key={idx}
                                    className={`flex-1 text-center py-1 rounded text-[9px] font-mono font-bold border ${
                                      beat
                                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                        : 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400'
                                    }`}
                                  >
                                    {sp.surprise_pct !== null ? `${beat ? '+' : ''}${sp.surprise_pct.toFixed(1)}%` : '—'}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Expandable Historical Gap Breakdown Details */}
                          {isSelected && (
                            <div className="mt-2 bg-black/[0.03] dark:bg-white/[0.03] rounded-xl p-2.5 text-[9px] font-mono space-y-1.5">
                              <div className="text-[10px] font-bold text-zinc-700 dark:text-zinc-200 border-b border-black/[0.05] dark:border-white/[0.05] pb-1">
                                Historical Post-Earnings Outcomes
                              </div>
                              {(gaps.length > 0 ? gaps : surprises).map((item, sIdx) => {
                                const dStr = item.announcement_date || item.date;
                                const gapStr = item.gap_pct != null ? `${item.gap_pct > 0 ? '+' : ''}${item.gap_pct}%` : null;
                                const d1Str = item.day1_pct != null ? `${item.day1_pct > 0 ? '+' : ''}${item.day1_pct}%` : null;
                                const surpStr = item.surprise_pct != null ? `${item.surprise_pct > 0 ? '+' : ''}${item.surprise_pct}% EPS` : null;
                                return (
                                  <div key={sIdx} className="flex items-center justify-between text-zinc-600 dark:text-zinc-300">
                                    <span>{dStr}</span>
                                    {gapStr && (
                                      <span className={item.gap_pct < -0.3 ? 'text-rose-600 font-bold' : item.gap_pct > 0.3 ? 'text-emerald-600 font-bold' : ''}>
                                        Gap: {gapStr}
                                      </span>
                                    )}
                                    {d1Str && <span>Day-1: {d1Str}</span>}
                                    {surpStr && <span className="opacity-70">{surpStr}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* =========================================================================
          3. DUAL BROADSHEET: REGULATION 30 WIRE (LEFT) VS GLOBAL WIRE (RIGHT)
         ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* -----------------------------------------------------------------------
            LEFT COLUMN: BSE/NSE REGULATION 30 REGULATORY TELETYPE (7 cols)
           ----------------------------------------------------------------------- */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-3xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#0f1626] p-5 sm:p-6 shadow-sm space-y-4">
            
            {/* Header & Quick Category Pills */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/[0.06] dark:border-white/[0.06] pb-4">
              <div className="flex items-center space-x-2">
                <FileText className="h-4 w-4 text-blue-500" />
                <h2 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-wide">
                  Regulation 30 Disclosures Wire
                </h2>
              </div>

              {/* Noise Muting Filter Toggle */}
              <button
                onClick={() => setShowMuted(!showMuted)}
                className={`rounded-xl px-2.5 py-1 text-[10px] font-mono transition border self-start sm:self-auto ${
                  showMuted
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold'
                    : 'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
                title="Toggle routine compliance notices (trading window closures, share loss certificates)"
              >
                {showMuted ? `Hide Muted Compliance (${mutedCount})` : `Show Muted (${mutedCount})`}
              </button>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
              {[
                { id: 'ALL', label: 'All Announcements' },
                { id: 'HIGH_ATTENTION', label: '🔥 High Conviction' },
                { id: 'DIVIDEND_SPLIT', label: '💰 Capital Returns' },
                { id: 'RESULTS', label: '📊 Financial Results' },
                { id: 'ORDERS', label: '🚀 Major Orders' },
                { id: 'ACQUISITION', label: '🤝 M&A / Takeover' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition border ${
                    activeCategory === cat.id
                      ? 'border-zinc-900 dark:border-white bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm'
                      : 'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] text-zinc-600 dark:text-zinc-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Live Search Bar for Disclosures */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                value={filingSearch}
                onChange={(e) => setFilingSearch(e.target.value)}
                placeholder="Search disclosures by ticker, keyword (e.g. dividend, order, contract)..."
                className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.03] pl-9 pr-8 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none focus:border-zinc-900 dark:focus:border-white focus:bg-white dark:focus:bg-[#0c0d12] transition"
              />
              {filingSearch && (
                <button
                  onClick={() => setFilingSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Structured Live Teletype Grid (No Repetitive Boxes) */}
            <div className="border border-black/[0.06] dark:border-white/[0.06] rounded-2xl overflow-hidden bg-white dark:bg-[#0f1626]">
              {filteredFilings.length === 0 ? (
                <div className="p-10 text-center text-xs text-zinc-400">
                  No corporate disclosures found matching your criteria.
                </div>
              ) : (
                <div className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
                  {filteredFilings.slice(0, 20).map((f, i) => {
                    const isExpanded = expandedFilingIndex === i;
                    return (
                      <div
                        key={i}
                        className="group flex flex-col p-3.5 hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition"
                      >
                        <div className="flex items-start justify-between gap-3">
                          {/* Left metadata & content */}
                          <div className="flex items-start space-x-3 flex-1 min-w-0">
                            {/* Date Badge */}
                            <span className="font-mono text-[10px] text-zinc-400 shrink-0 w-12 pt-0.5">
                              {f.date || 'Today'}
                            </span>

                            {/* Ticker & Category */}
                            <div className="flex items-center space-x-1.5 shrink-0">
                              <button
                                onClick={() => onSelectStock && onSelectStock(f.ticker)}
                                className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-0.5"
                              >
                                <span>{f.ticker.replace('.NS', '')}</span>
                                <ArrowUpRight className="h-3 w-3 opacity-60" />
                              </button>
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase border ${f.badge_class}`}>
                                {f.badge_label}
                              </span>
                            </div>

                            {/* Headline & Company Name */}
                            <div className="flex-1 min-w-0 pl-1">
                              <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                                {f.title}
                              </h4>
                              <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                                {f.company_name}
                              </p>
                            </div>
                          </div>

                          {/* Right Quick Action */}
                          <div className="flex items-center space-x-2 shrink-0 pt-0.5">
                            <button
                              onClick={() => onSelectStock && onSelectStock(f.ticker)}
                              className="opacity-0 group-hover:opacity-100 transition rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] hidden sm:flex items-center space-x-1"
                            >
                              <span>Inspect</span>
                              <ChevronRight className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        {/* Catalyst Rationale Callout */}
                        {f.rationale && (
                          <div className="mt-1.5 ml-15 flex items-start space-x-1.5 text-[10px] text-blue-700 dark:text-blue-300 font-mono">
                            <Zap className="h-3 w-3 text-blue-500 shrink-0 mt-0.5" />
                            <span><strong className="font-semibold">Catalyst:</strong> {f.rationale}</span>
                          </div>
                        )}

                        {/* Description & Progressive Disclosure */}
                        {f.description && (
                          <div className="mt-1 ml-15 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                            <p className={isExpanded ? '' : 'line-clamp-1'}>
                              {f.description}
                            </p>
                            {f.description.length > 80 && (
                              <button
                                onClick={() => setExpandedFilingIndex(isExpanded ? null : i)}
                                className="text-[10px] font-semibold text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 mt-0.5 inline-block"
                              >
                                {isExpanded ? 'Collapse' : 'Show full disclosure'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* -----------------------------------------------------------------------
            RIGHT COLUMN: GLOBAL FINANCIAL WIRE & MACRO PULSE (5 cols)
           ----------------------------------------------------------------------- */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-3xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#0f1626] p-5 sm:p-6 shadow-sm space-y-4">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] pb-4">
              <div className="flex items-center space-x-2">
                <Newspaper className="h-4 w-4 text-rose-500" />
                <h2 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-wide">
                  Global Financial Wire
                </h2>
              </div>
              <span className="text-[10px] font-mono font-semibold text-zinc-400">
                {marketNews.length} Stories
              </span>
            </div>

            {/* News Search Bar */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                value={newsSearch}
                onChange={(e) => setNewsSearch(e.target.value)}
                placeholder="Search news headlines..."
                className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.03] pl-9 pr-8 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none focus:border-zinc-900 dark:focus:border-white focus:bg-white dark:focus:bg-[#0c0d12] transition"
              />
              {newsSearch && (
                <button
                  onClick={() => setNewsSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* News Headline Stories (Teletype List) */}
            <div className="border border-black/[0.06] dark:border-white/[0.06] rounded-2xl overflow-hidden bg-white dark:bg-[#0f1626]">
              {filteredNews.length === 0 ? (
                <div className="p-10 text-center text-xs text-zinc-400">
                  No news stories match your query.
                </div>
              ) : (
                <div className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
                  {filteredNews.slice(0, 18).map((n, i) => (
                    <a
                      key={i}
                      href={n.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex flex-col p-3 hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition"
                    >
                      <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono mb-1">
                        <span className="font-bold text-zinc-700 dark:text-zinc-300 font-sans">{n.source}</span>
                        <div className="flex items-center space-x-1.5">
                          <span>{n.pub_date}</span>
                          <ExternalLink className="h-2.5 w-2.5 opacity-60 group-hover:opacity-100" />
                        </div>
                      </div>

                      <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition leading-snug line-clamp-2">
                        {n.title}
                      </p>

                      <div className="mt-1.5 flex items-center justify-between">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold border ${n.tag_badge}`}>
                          {n.tag}
                        </span>
                        <span className="text-[10px] text-zinc-400 opacity-0 group-hover:opacity-100 transition">
                          View filing ↗
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
