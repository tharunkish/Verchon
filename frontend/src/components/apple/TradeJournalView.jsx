import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Target,
  Shield,
  Layers,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Scale,
  DollarSign,
  Activity,
  FileText,
  Tag,
  Save,
  Check,
  Search,
  RotateCcw,
  Sparkles,
  Info
} from 'lucide-react';

const COMMON_TAGS = [
  'Followed Plan',
  'Clean 2R Take',
  'Disciplined Stop',
  'Volume Expansion',
  'Early Exit',
  'Chased Entry',
  'Moved Stop Loss',
  'Earnings Volatility',
  'Overnight Gap Down',
  'Trailing DMA Hit',
];

export default function TradeJournalView({
  journalData: propJournalData = null,
  onRefreshJournal,
  loading: propLoading = false,
}) {
  const [internalData, setInternalData] = useState(null);
  const [internalLoading, setInternalLoading] = useState(false);

  useEffect(() => {
    if (!propJournalData) {
      setInternalLoading(true);
      fetch('/api/paper-trades/journal')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setInternalData(data);
        })
        .catch((err) => console.error('Failed to fetch journal data:', err))
        .finally(() => setInternalLoading(false));
    }
  }, [propJournalData]);

  const journalData = propJournalData || internalData;
  const loading = propLoading || (internalLoading && !journalData);

  const [selectedDate, setSelectedDate] = useState(null);
  const [strategyFilter, setStrategyFilter] = useState('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCampaignId, setExpandedCampaignId] = useState(null);

  // Note editing state: { [campaignId]: { notes: string, tags: string[], saving: boolean, saved: boolean, error: string | null } }
  const [editState, setEditState] = useState({});

  // Calendar month navigation: default to current month
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  const summary = journalData?.summary || {
    expectancy_r: 0.0,
    total_campaigns: 0,
    win_rate_pct: 0.0,
    win_count: 0,
    loss_count: 0,
    breakeven_count: 0,
    profit_factor: 1.0,
    avg_win_r: 0.0,
    avg_loss_r: 0.0,
    gross_realized_gains: 0.0,
    gross_realized_losses: 0.0,
    total_gross_pnl: 0.0,
    total_statutory_charges: 0.0,
    total_net_pnl: 0.0,
    frictional_drag_pct: 0.0,
    avg_holding_sessions_win: 0.0,
    avg_holding_sessions_loss: 0.0,
  };

  const campaigns = useMemo(() => journalData?.campaigns || [], [journalData]);
  const heatmap = useMemo(() => journalData?.heatmap || {}, [journalData]);
  const regimeMatrix = useMemo(() => journalData?.regime_matrix || [], [journalData]);
  const strategyAttribution = useMemo(() => journalData?.strategy_attribution || [], [journalData]);

  // Initialize edit state when campaigns change
  useEffect(() => {
    if (campaigns && campaigns.length > 0) {
      setEditState((prev) => {
        const next = { ...prev };
        campaigns.forEach((c) => {
          if (!next[c.campaign_id]) {
            next[c.campaign_id] = {
              notes: c.journal_notes || '',
              tags: Array.isArray(c.journal_tags) ? [...c.journal_tags] : [],
              saving: false,
              saved: false,
              error: null,
            };
          }
        });
        return next;
      });
    }
  }, [campaigns]);

  // Filtered campaigns
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      // Date filter from heatmap
      if (selectedDate && c.exit_date !== selectedDate) {
        return false;
      }
      // Strategy filter
      if (strategyFilter !== 'ALL' && c.strategy_name !== strategyFilter) {
        return false;
      }
      // Outcome filter
      if (outcomeFilter === 'WINS' && (c.net_pnl <= 0 || c.campaign_r <= 0.05)) return false;
      if (outcomeFilter === 'LOSSES' && (c.net_pnl >= 0 && c.campaign_r >= -0.05)) return false;
      if (outcomeFilter === 'BREAKEVEN' && (Math.abs(c.campaign_r) > 0.05 && c.net_pnl !== 0)) return false;
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTicker = c.ticker.toLowerCase().includes(q);
        const matchesStrat = (c.strategy_name || '').toLowerCase().includes(q);
        const matchesNotes = (c.journal_notes || '').toLowerCase().includes(q);
        const matchesTags = (c.journal_tags || []).some((t) => t.toLowerCase().includes(q));
        if (!matchesTicker && !matchesStrat && !matchesNotes && !matchesTags) return false;
      }
      return true;
    });
  }, [campaigns, selectedDate, strategyFilter, outcomeFilter, searchQuery]);

  // Calendar matrix calculations
  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const days = [];
    // Day of week: 0 is Sun, 1 is Mon, ..., 6 is Sat
    // Convert to Monday-based: 0 is Mon, 6 is Sun
    const startDayOfWeek = (firstDay.getDay() + 6) % 7;

    // Pad previous month days
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ isCurrentMonth: false, dateStr: null, dayNum: null });
    }

    // Current month days
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dt = new Date(year, month, d);
      // Format as YYYY-MM-DD in local time
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        isCurrentMonth: true,
        dateStr,
        dayNum: d,
        data: heatmap[dateStr] || null,
      });
    }

    return days;
  }, [calendarMonth, heatmap]);

  const handlePrevMonth = () => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Toggle tag on a campaign
  const handleToggleTag = (campaignId, tag) => {
    setEditState((prev) => {
      const cur = prev[campaignId] || { notes: '', tags: [], saving: false, saved: false, error: null };
      const exists = cur.tags.includes(tag);
      const nextTags = exists ? cur.tags.filter((t) => t !== tag) : [...cur.tags, tag];
      return {
        ...prev,
        [campaignId]: { ...cur, tags: nextTags, saved: false },
      };
    });
  };

  // Save notes and tags to backend
  const handleSaveJournalEntry = async (campaignId) => {
    const entry = editState[campaignId];
    if (!entry) return;

    setEditState((prev) => ({
      ...prev,
      [campaignId]: { ...prev[campaignId], saving: true, error: null },
    }));

    try {
      const res = await fetch(`/api/paper-trades/journal/${campaignId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tags: entry.tags,
          notes: entry.notes,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to save: ${res.statusText}`);
      }

      setEditState((prev) => ({
        ...prev,
        [campaignId]: { ...prev[campaignId], saving: false, saved: true, error: null },
      }));

      setTimeout(() => {
        setEditState((prev) => ({
          ...prev,
          [campaignId]: { ...prev[campaignId], saved: false },
        }));
      }, 2500);

      if (onRefreshJournal) {
        onRefreshJournal();
      }
    } catch (err) {
      setEditState((prev) => ({
        ...prev,
        [campaignId]: {
          ...prev[campaignId],
          saving: false,
          error: err.message || 'Failed to persist journal entry',
        },
      }));
    }
  };

  const formatCurrency = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '—';
    return Number(val).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  };

  return (
    <div className="space-y-6 text-[#2d1f17] dark:text-[#e0d1b9]">
      {/* 1. Header & Mathematical Expectancy HUD Ribbon */}
      <div className="rounded-2xl border border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#1c232d] p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#b8a597]/60 dark:border-[#363c44] pb-3">
          <div>
            <div className="flex items-center space-x-2">
              <Scale className="h-4 w-4 text-[#806350] dark:text-[#e0d1b9]" />
              <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-[#2d1f17] dark:text-[#e0d1b9]">
                Trade Performance & Mathematical Expectancy Journal
              </h2>
            </div>
            <p className="text-[11px] text-[#806350] dark:text-[#958a7a] mt-0.5">
              Grounded in initial inception risk $1R$ · Audited against statutory delivery friction · Zero backtest bias
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-[#b8a597]/60 bg-[#edd9cc] dark:border-[#363c44] dark:bg-[#222b37] text-[#806350] dark:text-[#958a7a]">
              Prospective Ledger · {summary.total_campaigns} Settled Campaign{summary.total_campaigns !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={onRefreshJournal}
              disabled={loading}
              className="p-1 rounded text-[#806350] hover:text-[#2d1f17] dark:text-[#958a7a] hover:dark:text-[#e0d1b9] transition"
              title="Refresh Journal Analytics"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 5-Column High-Density Expectancy Metric Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 font-mono">
          {/* 1. Expectancy E_R */}
          <div className="rounded-xl border border-[#b8a597]/60 dark:border-[#363c44] bg-[#edd9cc]/60 dark:bg-[#13171e] p-3 text-center">
            <div className="text-[10px] uppercase font-bold text-[#806350] dark:text-[#958a7a]">
              Expectancy ($E_R$)
            </div>
            <div className={`text-2xl font-black mt-0.5 ${summary.expectancy_r >= 0 ? 'text-[#2d6a4f] dark:text-emerald-400' : 'text-[#b20808] dark:text-rose-400'}`}>
              {summary.expectancy_r >= 0 ? '+' : ''}{summary.expectancy_r.toFixed(2)}R
            </div>
            <div className="text-[10px] text-[#806350] dark:text-[#958a7a] mt-0.5">
              per trade average
            </div>
          </div>

          {/* 2. Win Rate */}
          <div className="rounded-xl border border-[#b8a597]/60 dark:border-[#363c44] bg-[#edd9cc]/60 dark:bg-[#13171e] p-3 text-center">
            <div className="text-[10px] uppercase font-bold text-[#806350] dark:text-[#958a7a]">
              Win Rate %
            </div>
            <div className="text-2xl font-black text-[#2d1f17] dark:text-[#e0d1b9] mt-0.5">
              {summary.win_rate_pct.toFixed(1)}%
            </div>
            <div className="text-[10px] text-[#806350] dark:text-[#958a7a] mt-0.5">
              {summary.win_count}W · {summary.loss_count}L · {summary.breakeven_count}BE
            </div>
          </div>

          {/* 3. Profit Factor */}
          <div className="rounded-xl border border-[#b8a597]/60 dark:border-[#363c44] bg-[#edd9cc]/60 dark:bg-[#13171e] p-3 text-center">
            <div className="text-[10px] uppercase font-bold text-[#806350] dark:text-[#958a7a]">
              Profit Factor
            </div>
            <div className="text-2xl font-black text-[#2d1f17] dark:text-[#e0d1b9] mt-0.5">
              {summary.profit_factor >= 90 ? '∞' : `${summary.profit_factor.toFixed(2)}x`}
            </div>
            <div className="text-[10px] text-[#806350] dark:text-[#958a7a] mt-0.5">
              Gains: ₹{formatCurrency(summary.gross_realized_gains)}
            </div>
          </div>

          {/* 4. Avg Win R vs Avg Loss R */}
          <div className="rounded-xl border border-[#b8a597]/60 dark:border-[#363c44] bg-[#edd9cc]/60 dark:bg-[#13171e] p-3 text-center">
            <div className="text-[10px] uppercase font-bold text-[#806350] dark:text-[#958a7a]">
              Avg Win / Loss $R$
            </div>
            <div className="text-sm font-bold text-[#2d1f17] dark:text-[#e0d1b9] mt-1 space-y-0.5">
              <div className="text-[#2d6a4f] dark:text-emerald-400">+{summary.avg_win_r.toFixed(2)}R Win</div>
              <div className="text-[#b20808] dark:text-rose-400">{summary.avg_loss_r.toFixed(2)}R Loss</div>
            </div>
          </div>

          {/* 5. Holding Duration */}
          <div className="rounded-xl border border-[#b8a597]/60 dark:border-[#363c44] bg-[#edd9cc]/60 dark:bg-[#13171e] p-3 text-center">
            <div className="text-[10px] uppercase font-bold text-[#806350] dark:text-[#958a7a]">
              Avg Hold Duration
            </div>
            <div className="text-sm font-bold text-[#2d1f17] dark:text-[#e0d1b9] mt-1 space-y-0.5">
              <div className="text-[#2d6a4f] dark:text-emerald-400">{summary.avg_holding_sessions_win.toFixed(1)}d Winners</div>
              <div className="text-[#806350] dark:text-[#958a7a]">{summary.avg_holding_sessions_loss.toFixed(1)}d Losers</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Interactive Realized Calendar Heatmap */}
      <div className="rounded-2xl border border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#1c232d] p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#b8a597]/60 dark:border-[#363c44] pb-3">
          <div className="flex items-center space-x-2">
            <CalendarIcon className="h-4 w-4 text-[#806350] dark:text-[#e0d1b9]" />
            <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-[#2d1f17] dark:text-[#e0d1b9]">
              Settled P&L Calendar Heatmap
            </h3>
            {selectedDate && (
              <span className="inline-flex items-center space-x-1 font-mono text-[10px] px-2 py-0.5 rounded bg-amber-600/10 text-amber-800 dark:text-amber-400 border border-amber-600/30">
                <span>Filter: {selectedDate}</span>
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="hover:opacity-80"
                >
                  ✕
                </button>
              </span>
            )}
          </div>

          {/* Month Navigator */}
          <div className="flex items-center space-x-2 font-mono text-xs">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded border border-[#b8a597] dark:border-[#363c44] hover:bg-[#edd9cc] dark:hover:bg-[#222b37]"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="font-bold min-w-[110px] text-center">
              {calendarMonth.toLocaleString('default', { month: 'short', year: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded border border-[#b8a597] dark:border-[#363c44] hover:bg-[#edd9cc] dark:hover:bg-[#222b37]"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] text-[#806350] dark:text-[#958a7a] font-bold py-1">
          <div>MON</div>
          <div>TUE</div>
          <div>WED</div>
          <div>THU</div>
          <div>FRI</div>
          <div className="text-zinc-400 dark:text-zinc-600">SAT</div>
          <div className="text-zinc-400 dark:text-zinc-600">SUN</div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1 font-mono text-xs">
          {calendarDays.map((cd, idx) => {
            if (!cd.isCurrentMonth) {
              return (
                <div
                  key={`pad-${idx}`}
                  className="h-16 rounded-lg bg-transparent border border-transparent"
                />
              );
            }

            const hasTrades = cd.data && cd.data.trade_count > 0;
            const net = hasTrades ? cd.data.realized_net : 0;
            const rMult = hasTrades ? cd.data.r_multiple : 0;
            const isSelected = selectedDate === cd.dateStr;

            // Background color intensity
            let cellBg = 'bg-[#edd9cc]/40 dark:bg-[#13171e]/50 border-[#b8a597]/30 dark:border-[#363c44]/40';
            if (hasTrades) {
              if (net > 0) {
                cellBg = 'bg-emerald-600/15 border-emerald-600/40 text-emerald-900 dark:bg-emerald-500/15 dark:border-emerald-500/40 dark:text-emerald-300';
              } else if (net < 0) {
                cellBg = 'bg-rose-600/15 border-rose-600/40 text-rose-900 dark:bg-rose-500/15 dark:border-rose-500/40 dark:text-rose-300';
              } else {
                cellBg = 'bg-[#806350]/15 border-[#806350]/30 text-[#2d1f17] dark:bg-[#958a7a]/15 dark:text-[#e0d1b9]';
              }
            }

            if (isSelected) {
              cellBg += ' ring-2 ring-amber-600 dark:ring-amber-400';
            }

            return (
              <button
                key={cd.dateStr}
                type="button"
                onClick={() => {
                  if (hasTrades) {
                    setSelectedDate(isSelected ? null : cd.dateStr);
                  }
                }}
                disabled={!hasTrades}
                className={`h-16 rounded-lg p-1.5 border transition text-left flex flex-col justify-between ${cellBg} ${
                  hasTrades ? 'cursor-pointer hover:opacity-90' : 'cursor-default opacity-60'
                }`}
                title={
                  hasTrades
                    ? `${cd.dateStr}: ${net >= 0 ? '+' : ''}₹${net.toFixed(1)} (${rMult >= 0 ? '+' : ''}${rMult}R) · ${cd.data.trade_count} trade(s) [${cd.data.tickers.join(', ')}]`
                    : cd.dateStr
                }
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-[#806350] dark:text-[#958a7a]">{cd.dayNum}</span>
                  {hasTrades && (
                    <span className="text-[9px] px-1 rounded bg-[#edd9cc] dark:bg-[#222b37] font-bold">
                      {cd.data.trade_count}
                    </span>
                  )}
                </div>

                {hasTrades ? (
                  <div className="text-[11px] leading-tight">
                    <div className="font-bold truncate">
                      {net >= 0 ? '+' : ''}₹{Math.round(net).toLocaleString('en-IN')}
                    </div>
                    <div className="text-[10px] opacity-80">
                      {rMult >= 0 ? '+' : ''}{rMult.toFixed(1)}R
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-center text-[#806350]/30 dark:text-[#958a7a]/30">—</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Strategy-by-Market-Regime Matrix & Statutory Friction Audit (2-Column Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Strategy-by-Market-Regime Cross-Tabulation Matrix (7 Cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#1c232d] p-5 shadow-sm space-y-3">
          <div className="flex items-center space-x-2 border-b border-[#b8a597]/60 dark:border-[#363c44] pb-2.5">
            <Activity className="h-4 w-4 text-[#806350] dark:text-[#e0d1b9]" />
            <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-[#2d1f17] dark:text-[#e0d1b9]">
              Strategy-by-Market-Regime Matrix
            </h3>
          </div>
          <p className="text-[11px] text-[#806350] dark:text-[#958a7a]">
            Cross-tabulates edge ($Avg\ R\ (N)$) against the macro Nifty regime active at trade inception.
          </p>

          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left font-mono text-xs border-collapse min-w-[450px]">
              <thead>
                <tr className="border-b border-[#b8a597]/60 dark:border-[#363c44] text-[10px] font-bold text-[#806350] dark:text-[#958a7a] uppercase">
                  <th className="py-2 px-2.5">Strategy</th>
                  <th className="py-2 px-2.5 text-center text-emerald-700 dark:text-emerald-400">Bullish</th>
                  <th className="py-2 px-2.5 text-center text-blue-700 dark:text-blue-400">Sideways</th>
                  <th className="py-2 px-2.5 text-center text-rose-700 dark:text-rose-400">Bearish</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#b8a597]/30 dark:divide-[#363c44]/40">
                {regimeMatrix.map((rm) => (
                  <tr key={rm.strategy} className="hover:bg-[#edd9cc]/40 dark:hover:bg-[#13171e]/50">
                    <td className="py-2.5 px-2.5 font-bold text-[#2d1f17] dark:text-[#e0d1b9] text-[11px]">
                      {rm.strategy.replace('_', ' ')}
                    </td>
                    <td className="py-2.5 px-2.5 text-center">
                      {rm.bullish ? (
                        <span className={`font-semibold ${rm.bullish.avg_r >= 0 ? 'text-[#2d6a4f] dark:text-emerald-400' : 'text-[#b20808] dark:text-rose-400'}`}>
                          {rm.bullish.avg_r >= 0 ? '+' : ''}{rm.bullish.avg_r}R ({rm.bullish.count})
                        </span>
                      ) : (
                        <span className="text-[#806350]/40 dark:text-[#958a7a]/40">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2.5 text-center">
                      {rm.sideways ? (
                        <span className={`font-semibold ${rm.sideways.avg_r >= 0 ? 'text-[#2d6a4f] dark:text-emerald-400' : 'text-[#b20808] dark:text-rose-400'}`}>
                          {rm.sideways.avg_r >= 0 ? '+' : ''}{rm.sideways.avg_r}R ({rm.sideways.count})
                        </span>
                      ) : (
                        <span className="text-[#806350]/40 dark:text-[#958a7a]/40">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2.5 text-center">
                      {rm.bearish ? (
                        <span className={`font-semibold ${rm.bearish.avg_r >= 0 ? 'text-[#2d6a4f] dark:text-emerald-400' : 'text-[#b20808] dark:text-rose-400'}`}>
                          {rm.bearish.avg_r >= 0 ? '+' : ''}{rm.bearish.avg_r}R ({rm.bearish.count})
                        </span>
                      ) : (
                        <span className="text-[#806350]/40 dark:text-[#958a7a]/40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Auditable Statutory Friction Reality Check (5 Cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#1c232d] p-5 shadow-sm space-y-3 font-mono">
          <div className="flex items-center space-x-2 border-b border-[#b8a597]/60 dark:border-[#363c44] pb-2.5">
            <DollarSign className="h-4 w-4 text-[#806350] dark:text-[#e0d1b9]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#2d1f17] dark:text-[#e0d1b9]">
              Statutory Friction Reality Check
            </h3>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[#806350] dark:text-[#958a7a]">Gross Gains (Wins):</span>
              <span className="font-bold text-[#2d6a4f] dark:text-emerald-400">
                +₹{formatCurrency(summary.gross_realized_gains)}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-[#806350] dark:text-[#958a7a]">Gross Losses:</span>
              <span className="font-bold text-[#b20808] dark:text-rose-400">
                -₹{formatCurrency(summary.gross_realized_losses)}
              </span>
            </div>

            <div className="flex justify-between border-t border-[#b8a597]/40 dark:border-[#363c44] pt-1.5">
              <span className="text-[#806350] dark:text-[#958a7a]">Total Gross P&L:</span>
              <span className="font-bold text-[#2d1f17] dark:text-[#e0d1b9]">
                {summary.total_gross_pnl >= 0 ? '+' : ''}₹{formatCurrency(summary.total_gross_pnl)}
              </span>
            </div>

            <div className="flex justify-between text-amber-700 dark:text-amber-400">
              <span>Total Statutory Charges (STT/GST):</span>
              <span className="font-bold">-₹{formatCurrency(summary.total_statutory_charges)}</span>
            </div>

            <div className="flex justify-between border-t-2 border-[#b8a597] dark:border-[#363c44] pt-2 text-sm">
              <span className="font-bold">Net Retained P&L:</span>
              <span className={`font-black ${summary.total_net_pnl >= 0 ? 'text-[#2d6a4f] dark:text-emerald-400' : 'text-[#b20808] dark:text-rose-400'}`}>
                {summary.total_net_pnl >= 0 ? '+' : ''}₹{formatCurrency(summary.total_net_pnl)}
              </span>
            </div>

            <div className="text-[10px] text-[#806350] dark:text-[#958a7a] pt-1">
              Frictional Drag on Winning Gains: <strong>{summary.frictional_drag_pct}%</strong>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Strategy Attribution Table with Sample-Size Confidence */}
      <div className="rounded-2xl border border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#1c232d] p-5 shadow-sm space-y-3">
        <div className="flex items-center space-x-2 border-b border-[#b8a597]/60 dark:border-[#363c44] pb-2.5">
          <Layers className="h-4 w-4 text-[#806350] dark:text-[#e0d1b9]" />
          <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-[#2d1f17] dark:text-[#e0d1b9]">
            Strategy Attribution & Sample-Size Context
          </h3>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left font-mono text-xs border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-[#b8a597]/60 dark:border-[#363c44] text-[10px] font-bold text-[#806350] dark:text-[#958a7a] uppercase">
                <th className="py-2 px-3">Strategy Setup</th>
                <th className="py-2 px-3">Sample Context</th>
                <th className="py-2 px-3 text-center">Trades (N)</th>
                <th className="py-2 px-3 text-center">Win Rate</th>
                <th className="py-2 px-3 text-center">Net Realized P&L</th>
                <th className="py-2 px-3 text-center">Avg $R$</th>
                <th className="py-2 px-3 text-center">Profit Factor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#b8a597]/30 dark:divide-[#363c44]/40">
              {strategyAttribution.map((sa) => {
                let badgeClass = 'bg-amber-600/10 text-amber-800 dark:text-amber-400 border-amber-600/30';
                let label = `Insufficient (${sa.trade_count} < 5)`;
                if (sa.sample_confidence === 'EARLY_EVIDENCE') {
                  badgeClass = 'bg-blue-600/10 text-blue-800 dark:text-blue-400 border-blue-600/30';
                  label = `Early Evidence (${sa.trade_count})`;
                } else if (sa.sample_confidence === 'DEVELOPING_SAMPLE') {
                  badgeClass = 'bg-purple-600/10 text-purple-800 dark:text-purple-400 border-purple-600/30';
                  label = `Developing (${sa.trade_count})`;
                } else if (sa.sample_confidence === 'STATISTICALLY_MEANINGFUL') {
                  badgeClass = 'bg-emerald-600/10 text-emerald-800 dark:text-emerald-400 border-emerald-600/30';
                  label = `Statistically Meaningful (${sa.trade_count})`;
                }

                return (
                  <tr key={sa.strategy} className="hover:bg-[#edd9cc]/40 dark:hover:bg-[#13171e]/50">
                    <td className="py-3 px-3 font-bold text-[#2d1f17] dark:text-[#e0d1b9]">
                      {sa.strategy.replace('_', ' ')}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-block text-[10px] px-2 py-0.5 rounded border font-semibold ${badgeClass}`}>
                        {label}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-bold">{sa.trade_count}</td>
                    <td className="py-3 px-3 text-center">{sa.win_rate_pct.toFixed(1)}%</td>
                    <td className={`py-3 px-3 text-center font-bold ${sa.net_pnl >= 0 ? 'text-[#2d6a4f] dark:text-emerald-400' : 'text-[#b20808] dark:text-rose-400'}`}>
                      {sa.net_pnl >= 0 ? '+' : ''}₹{formatCurrency(sa.net_pnl)}
                    </td>
                    <td className={`py-3 px-3 text-center font-semibold ${sa.avg_r >= 0 ? 'text-[#2d6a4f] dark:text-emerald-400' : 'text-[#b20808] dark:text-rose-400'}`}>
                      {sa.avg_r >= 0 ? '+' : ''}{sa.avg_r.toFixed(2)}R
                    </td>
                    <td className="py-3 px-3 text-center">{sa.profit_factor >= 90 ? '∞' : `${sa.profit_factor.toFixed(2)}x`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Campaign Blotter & Post-Mortem Reflection Dossier */}
      <div className="rounded-2xl border border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#1c232d] p-5 shadow-sm space-y-4">
        {/* Controls: Search, Strategy, and Outcome filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#b8a597]/60 dark:border-[#363c44] pb-3 text-xs">
          <div className="flex items-center space-x-2">
            <FileText className="h-4 w-4 text-[#806350] dark:text-[#e0d1b9]" />
            <h3 className="font-bold uppercase tracking-wider font-mono text-[#2d1f17] dark:text-[#e0d1b9]">
              Settled Campaign Blotter ({filteredCampaigns.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute top-2 left-2.5 h-3 w-3 text-[#806350] dark:text-[#958a7a]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ticker, strategy, note..."
                className="w-48 sm:w-56 rounded-lg border border-[#b8a597] dark:border-[#363c44] bg-[#edd9cc]/60 dark:bg-[#13171e] py-1 pl-7 pr-2.5 text-xs font-mono outline-none focus:border-[#806350] dark:focus:border-[#e0d1b9]"
              />
            </div>

            {/* Outcome Filter */}
            <select
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              className="rounded-lg border border-[#b8a597] dark:border-[#363c44] bg-[#edd9cc]/60 dark:bg-[#13171e] py-1 px-2 text-xs font-mono outline-none"
            >
              <option value="ALL">All Outcomes</option>
              <option value="WINS">Wins Only (&gt;0.05R)</option>
              <option value="LOSSES">Losses Only</option>
              <option value="BREAKEVEN">Breakevens</option>
            </select>
          </div>
        </div>

        {/* Campaign Cards List */}
        {filteredCampaigns.length === 0 ? (
          <div className="p-12 text-center text-xs font-mono text-[#806350] dark:text-[#958a7a] space-y-2">
            <Info className="h-6 w-6 mx-auto opacity-50" />
            <p className="font-bold">No settled campaigns match the active filters.</p>
            <p className="text-[11px] opacity-75">
              Closed paper trading positions automatically consolidate here into verifiable execution records.
            </p>
          </div>
        ) : (
          <div className="space-y-3 font-mono">
            {filteredCampaigns.map((camp) => {
              const isExpanded = expandedCampaignId === camp.campaign_id;
              const edit = editState[camp.campaign_id] || { notes: '', tags: [], saving: false, saved: false, error: null };

              let execBadgeColor = 'border-amber-600/30 bg-amber-600/10 text-amber-800 dark:text-amber-400';
              if (camp.execution_type === 'PROGRAMMED_TARGET') {
                execBadgeColor = 'border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-400';
              } else if (camp.execution_type === 'PROGRAMMED_STOP') {
                execBadgeColor = 'border-rose-600/30 bg-rose-600/10 text-rose-800 dark:text-rose-400';
              } else if (camp.execution_type === 'PROGRAMMED_TRAIL') {
                execBadgeColor = 'border-blue-600/30 bg-blue-600/10 text-blue-800 dark:text-blue-400';
              }

              return (
                <div
                  key={camp.campaign_id}
                  className="rounded-xl border border-[#b8a597]/70 dark:border-[#363c44] bg-[#edd9cc]/40 dark:bg-[#13171e]/70 p-4 transition-all"
                >
                  {/* Campaign Header Row */}
                  <div
                    onClick={() => setExpandedCampaignId(isExpanded ? null : camp.campaign_id)}
                    className="flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-base font-bold text-[#2d1f17] dark:text-[#e0d1b9]">
                        {camp.ticker.replace('.NS', '')}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded border border-[#b8a597]/60 bg-[#edd9cc] dark:border-[#363c44] dark:bg-[#222b37] text-[#806350] dark:text-[#958a7a]">
                        {camp.strategy_name.replace('_', ' ')}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${execBadgeColor}`}>
                        {camp.execution_type.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-[#806350] dark:text-[#958a7a]">
                        {camp.entry_date} → {camp.exit_date} ({camp.holding_sessions}d)
                      </span>
                    </div>

                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <div className={`text-sm font-black ${camp.net_pnl >= 0 ? 'text-[#2d6a4f] dark:text-emerald-400' : 'text-[#b20808] dark:text-rose-400'}`}>
                          {camp.net_pnl >= 0 ? '+' : ''}₹{formatCurrency(camp.net_pnl)}
                        </div>
                        <div className="text-[10px] text-[#806350] dark:text-[#958a7a]">
                          {camp.campaign_r >= 0 ? '+' : ''}{camp.campaign_r.toFixed(2)}R
                        </div>
                      </div>

                      <button type="button" className="text-[#806350] dark:text-[#958a7a]">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Campaign Dossier */}
                  {isExpanded && (
                    <div className="mt-4 pt-3.5 border-t border-[#b8a597]/50 dark:border-[#363c44] space-y-4 text-xs">
                      {/* 1. Tactical Execution Runway */}
                      <div className="rounded-lg bg-[#edd9cc]/60 dark:bg-[#1a222c] p-3 border border-[#b8a597]/40 dark:border-[#363c44] grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                        <div>
                          <div className="text-[10px] text-[#806350] dark:text-[#958a7a]">Inception Stop</div>
                          <div className="font-bold text-rose-700 dark:text-rose-400 mt-0.5">₹{camp.initial_stop_price.toFixed(1)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[#806350] dark:text-[#958a7a]">Entry Price</div>
                          <div className="font-bold text-[#2d1f17] dark:text-[#e0d1b9] mt-0.5">₹{camp.entry_price.toFixed(1)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[#806350] dark:text-[#958a7a]">Blended Exit</div>
                          <div className="font-bold text-[#2d1f17] dark:text-[#e0d1b9] mt-0.5">₹{camp.blended_exit_price.toFixed(1)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[#806350] dark:text-[#958a7a]">Total Volume</div>
                          <div className="font-bold text-[#2d1f17] dark:text-[#e0d1b9] mt-0.5">{camp.total_quantity} shares</div>
                        </div>
                      </div>

                      {/* 2. Multi-Stage Exit Legs Table (if partial scaling occurred) */}
                      {camp.legs && camp.legs.length > 1 && (
                        <div>
                          <div className="text-[10px] uppercase font-bold text-[#806350] dark:text-[#958a7a] mb-1.5">
                            Multi-Stage Execution Legs ({camp.legs.length} partial exits)
                          </div>
                          <div className="rounded-lg border border-[#b8a597]/40 dark:border-[#363c44] overflow-hidden">
                            <table className="w-full text-left text-[11px]">
                              <thead className="bg-[#edd9cc]/80 dark:bg-[#1a222c] text-[10px] text-[#806350] dark:text-[#958a7a]">
                                <tr>
                                  <th className="py-1.5 px-2.5">Date</th>
                                  <th className="py-1.5 px-2.5">Qty</th>
                                  <th className="py-1.5 px-2.5">Exit Price</th>
                                  <th className="py-1.5 px-2.5">Reason</th>
                                  <th className="py-1.5 px-2.5 text-right">Net P&L</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#b8a597]/30 dark:divide-[#363c44]/40">
                                {camp.legs.map((leg, lIdx) => (
                                  <tr key={leg.id || lIdx}>
                                    <td className="py-1.5 px-2.5">{leg.exit_date}</td>
                                    <td className="py-1.5 px-2.5">{leg.quantity}</td>
                                    <td className="py-1.5 px-2.5">₹{leg.exit_price.toFixed(1)}</td>
                                    <td className="py-1.5 px-2.5 text-[#806350] dark:text-[#958a7a]">{leg.exit_reason}</td>
                                    <td className={`py-1.5 px-2.5 text-right font-bold ${leg.net_pnl >= 0 ? 'text-[#2d6a4f] dark:text-emerald-400' : 'text-[#b20808] dark:text-rose-400'}`}>
                                      {leg.net_pnl >= 0 ? '+' : ''}₹{leg.net_pnl.toFixed(1)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* 3. Statutory Fee Breakdown Receipt */}
                      <div className="rounded-lg border border-[#b8a597]/40 dark:border-[#363c44] bg-[#edd9cc]/30 dark:bg-[#1a222c]/50 p-3 text-[11px] space-y-1">
                        <div className="text-[10px] uppercase font-bold text-[#806350] dark:text-[#958a7a] mb-1">
                          Audited Statutory Friction Receipt
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#806350] dark:text-[#958a7a]">Gross P&L before taxes:</span>
                          <span className="font-bold">₹{camp.gross_pnl.toFixed(1)}</span>
                        </div>
                        <div className="flex justify-between text-amber-700 dark:text-amber-400">
                          <span>Brokerage & Statutory Charges:</span>
                          <span>-₹{camp.total_charges.toFixed(1)}</span>
                        </div>
                        <div className="flex justify-between font-bold border-t border-[#b8a597]/40 dark:border-[#363c44] pt-1">
                          <span>Net Settled P&L:</span>
                          <span className={camp.net_pnl >= 0 ? 'text-[#2d6a4f] dark:text-emerald-400' : 'text-[#b20808] dark:text-rose-400'}>
                            {camp.net_pnl >= 0 ? '+' : ''}₹{camp.net_pnl.toFixed(1)}
                          </span>
                        </div>
                      </div>

                      {/* 4. Trader Reflection & Behavioral Tags */}
                      <div className="space-y-2">
                        <div className="flex items-center space-x-1.5 text-[10px] uppercase font-bold text-[#806350] dark:text-[#958a7a]">
                          <Tag className="h-3 w-3" />
                          <span>Trader Reflection & Behavioral Tags</span>
                        </div>

                        {/* Tag Pills */}
                        <div className="flex flex-wrap gap-1.5">
                          {COMMON_TAGS.map((t) => {
                            const isTagged = edit.tags.includes(t);
                            return (
                              <button
                                key={t}
                                type="button"
                                onClick={() => handleToggleTag(camp.campaign_id, t)}
                                className={`text-[10px] px-2 py-0.5 rounded border transition ${
                                  isTagged
                                    ? 'bg-[#806350] text-[#edd9cc] border-[#806350] dark:bg-[#e0d1b9] dark:text-[#1c232d] dark:border-[#e0d1b9] font-bold'
                                    : 'border-[#b8a597] bg-transparent text-[#806350] hover:text-[#2d1f17] dark:border-[#363c44] dark:text-[#958a7a] hover:dark:text-[#e0d1b9]'
                                }`}
                              >
                                {isTagged ? '✓ ' : '+ '}{t}
                              </button>
                            );
                          })}
                        </div>

                        {/* Notes Textarea */}
                        <div className="space-y-1.5 pt-1">
                          <textarea
                            value={edit.notes}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditState((prev) => ({
                                ...prev,
                                [camp.campaign_id]: { ...prev[camp.campaign_id], notes: val, saved: false },
                              }));
                            }}
                            placeholder="Write post-mortem reflection notes: execution lessons, mental discipline, volume cues..."
                            rows={2}
                            className="w-full rounded-lg border border-[#b8a597] dark:border-[#363c44] bg-[#edd9cc]/60 dark:bg-[#1a222c] p-2 text-xs font-mono outline-none focus:border-[#806350] dark:focus:border-[#e0d1b9]"
                          />

                          <div className="flex items-center justify-between">
                            <div>
                              {edit.error && (
                                <span className="text-[10px] text-rose-600 dark:text-rose-400">
                                  {edit.error}
                                </span>
                              )}
                              {edit.saved && (
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center space-x-1">
                                  <Check className="h-3 w-3 inline" />
                                  <span>Journal Entry Saved</span>
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSaveJournalEntry(camp.campaign_id)}
                              disabled={edit.saving}
                              className="flex items-center space-x-1 px-3 py-1 rounded bg-[#806350] hover:bg-[#6c5342] text-[#edd9cc] dark:bg-[#e0d1b9] dark:hover:bg-[#e0d1b9]/90 dark:text-[#1c232d] font-bold text-xs transition disabled:opacity-50"
                            >
                              <Save className="h-3 w-3" />
                              <span>{edit.saving ? 'Saving...' : 'Save Reflection'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
