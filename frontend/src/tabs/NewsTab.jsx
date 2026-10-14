import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
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
  Radio,
} from 'lucide-react';

export default function NewsTab({ onSelectStock }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filingSearch, setFilingSearch] = useState('');

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

  const upcomingEarnings = data?.upcoming_earnings || [];
  const recentFilings = data?.recent_filings || [];
  const marketNews = data?.market_news || [];

  const filteredFilings = recentFilings.filter((f) => {
    const matchesCat = filterCategory === 'ALL' || f.category === filterCategory;
    const matchesSearch =
      filingSearch === '' ||
      f.ticker.toLowerCase().includes(filingSearch.toLowerCase()) ||
      (f.company_name && f.company_name.toLowerCase().includes(filingSearch.toLowerCase())) ||
      f.title.toLowerCase().includes(filingSearch.toLowerCase()) ||
      (f.description && f.description.toLowerCase().includes(filingSearch.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-8 pb-32 pt-8">
      {/* 1. Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-[#080d1f]/80 p-6 backdrop-blur-3xl shadow-2xl ring-1 ring-white/10">
        <div className="flex items-center space-x-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500/20 to-purple-600/20 text-rose-400 ring-1 ring-rose-500/30">
            <Radio className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-black uppercase tracking-wider text-white">
                Corporate Actions & Market News Radar
              </h1>
              <span className="rounded-full bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-[10px] font-mono font-bold text-rose-300">
                LIVE TERMINAL
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Official BSE/NSE Regulation 30 Disclosures, Earnings Countdown, and Financial News
            </p>
          </div>
        </div>

        <button
          onClick={fetchNewsHub}
          disabled={loading}
          className="flex items-center space-x-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10 hover:border-white/20 active:scale-95 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-rose-400' : ''}`} />
          <span>{loading ? 'Refreshing...' : 'Refresh Radar'}</span>
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs text-rose-300">
          Failed to load corporate radar feed: {error}
        </div>
      )}

      {/* 2. Top Section: Upcoming Earnings Calendar & Event Risk Gate */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-purple-400" />
            <h2 className="text-xs font-black uppercase tracking-wider text-zinc-300">
              Upcoming Results Calendar & Event-Risk Gate
            </h2>
          </div>
          <span className="text-[11px] font-mono text-zinc-500">
            {upcomingEarnings.length} companies tracked
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {upcomingEarnings.slice(0, 8).map((stock, i) => {
            const isHigh = stock.badge === 'HIGH_RISK';
            const isCaution = stock.badge === 'CAUTION';
            return (
              <div
                key={i}
                onClick={() => onSelectStock && onSelectStock(stock.ticker)}
                className="group relative cursor-pointer overflow-hidden rounded-2xl border border-white/5 bg-[#0a0f26]/80 p-4 transition-all hover:border-purple-500/40 hover:bg-[#0d1433] hover:shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-black text-white group-hover:text-purple-300 transition">
                    {stock.ticker}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase border ${
                      isHigh
                        ? 'border-rose-500/40 bg-rose-500/20 text-rose-300 animate-pulse'
                        : isCaution
                        ? 'border-amber-500/40 bg-amber-500/20 text-amber-300'
                        : 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                    }`}
                  >
                    {stock.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="mt-3">
                  <span className="text-[10px] uppercase font-bold text-zinc-500">Results Date</span>
                  <div className="font-mono text-sm font-bold text-purple-200">
                    {stock.next_earnings_date}
                  </div>
                  <span className="text-[11px] font-semibold text-zinc-400">
                    {stock.days_to_earnings !== null ? `In ${stock.days_to_earnings} days` : 'Pending'}
                  </span>
                </div>

                {stock.reason && (
                  <p className="mt-2 text-[10px] text-zinc-400 line-clamp-2 border-t border-white/[0.04] pt-2">
                    {stock.reason}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Main 2-Column Deck: BSE/NSE Corporate Filings (Left) vs Market News Feed (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Official BSE/NSE Regulation 30 Filings Feed (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <FileText className="h-4 w-4 text-cyan-400" />
              <h2 className="text-xs font-black uppercase tracking-wider text-zinc-300">
                Official BSE/NSE Regulation 30 Filings
              </h2>
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'ALL', label: 'All Filings' },
                { id: 'RESULTS', label: 'Results' },
                { id: 'EXPANSION', label: 'M&A' },
                { id: 'DEALS_ORDERS', label: 'Deals/Orders' },
                { id: 'CAUTION', label: 'Notices' },
              ].map((c) => (
                <button
                  key={c.id}
                  onClick={() => setFilterCategory(c.id)}
                  className={`rounded-xl px-2.5 py-1 text-[10px] font-bold uppercase transition ${
                    filterCategory === c.id
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'bg-white/5 text-zinc-400 hover:text-zinc-200 border border-transparent'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search Bar for Filings */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              value={filingSearch}
              onChange={(e) => setFilingSearch(e.target.value)}
              placeholder="Search announcements (e.g. HAL, dividend, acquisition, order)..."
              className="w-full rounded-2xl border border-white/10 bg-black/40 pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-cyan-400"
            />
          </div>

          {/* Filings List */}
          <div className="space-y-3">
            {filteredFilings.length === 0 ? (
              <div className="rounded-2xl border border-white/5 bg-black/30 p-8 text-center text-xs text-zinc-500">
                No corporate filings match the selected criteria.
              </div>
            ) : (
              filteredFilings.slice(0, 15).map((f, i) => (
                <div
                  key={i}
                  onClick={() => onSelectStock && onSelectStock(f.ticker)}
                  className="group cursor-pointer rounded-2xl border border-white/5 bg-[#0a0f26]/80 p-4 transition-all hover:border-cyan-500/30 hover:bg-[#0d1433]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-black text-cyan-300 group-hover:underline">
                        {f.ticker}
                      </span>
                      <span className="text-zinc-500 text-xs">·</span>
                      <span className="text-xs font-medium text-zinc-300 line-clamp-1">
                        {f.company_name}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase border ${f.badge_class}`}
                      >
                        {f.badge_label}
                      </span>
                      {f.date && (
                        <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400">
                          {f.date}
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="mt-1.5 text-xs font-semibold text-zinc-200 line-clamp-2 leading-relaxed">
                    {f.title}
                  </h3>

                  {f.description && (
                    <p className="mt-1 text-[11px] text-zinc-400 line-clamp-2 leading-normal">
                      {f.description}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Public Financial News Feed (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Newspaper className="h-4 w-4 text-rose-400" />
              <h2 className="text-xs font-black uppercase tracking-wider text-zinc-300">
                Live Financial Headlines (Google News)
              </h2>
            </div>
            <span className="text-[10px] font-mono text-zinc-500">Unfiltered Feed</span>
          </div>

          <div className="space-y-3">
            {marketNews.length === 0 ? (
              <div className="rounded-2xl border border-white/5 bg-black/30 p-8 text-center text-xs text-zinc-500">
                Loading public news headlines...
              </div>
            ) : (
              marketNews.slice(0, 12).map((n, i) => (
                <a
                  key={i}
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-2xl border border-white/5 bg-[#0a0f26]/80 p-3.5 transition-all hover:border-rose-500/30 hover:bg-[#0d1433]"
                >
                  <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
                    <span className="font-semibold text-zinc-400">{n.source}</span>
                    <span className="font-mono">{n.pub_date}</span>
                  </div>

                  <p className="text-xs font-semibold text-zinc-200 group-hover:text-rose-200 leading-snug line-clamp-2">
                    {n.title}
                  </p>

                  <div className="mt-2 flex items-center justify-between pt-1 border-t border-white/[0.04]">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold border ${n.tag_badge}`}>
                      {n.tag}
                    </span>
                    <span className="flex items-center space-x-1 text-[10px] text-zinc-500 group-hover:text-zinc-300">
                      <span>Read Article</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </span>
                  </div>
                </a>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
