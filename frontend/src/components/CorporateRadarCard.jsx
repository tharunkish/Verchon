import React from 'react';
import { Calendar, AlertTriangle, ShieldCheck, FileText, TrendingUp, Sparkles, Clock, CheckCircle } from 'lucide-react';

export default function CorporateRadarCard({ radar }) {
  if (!radar) return null;

  const {
    next_earnings_date,
    days_to_earnings,
    ex_dividend_date,
    event_risk_status,
    event_risk_badge,
    event_risk_reason,
    past_earnings_track_record = [],
    recent_filings = [],
  } = radar;

  const isHighRisk = event_risk_badge === 'HIGH_RISK';
  const isCaution = event_risk_badge === 'CAUTION';
  const isSafe = event_risk_badge === 'SAFE';

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#080d1f]/85 p-6 backdrop-blur-3xl shadow-2xl ring-1 ring-white/10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4 mb-6">
        <div className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/30">
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-purple-300">
              Corporate Events & Earnings Radar
            </h3>
            <p className="text-[11px] text-zinc-400">
              Institutional Event-Risk Gate & BSE/NSE Regulatory Disclosures
            </p>
          </div>
        </div>

        {/* Risk Badge */}
        <div
          className={`flex items-center space-x-1.5 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider border ${
            isHighRisk
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.3)] animate-pulse'
              : isCaution
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
          }`}
        >
          {isHighRisk ? (
            <AlertTriangle className="h-3.5 w-3.5" />
          ) : isCaution ? (
            <Clock className="h-3.5 w-3.5" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" />
          )}
          <span>{event_risk_status.replace(/_/g, ' ')}</span>
        </div>
      </div>

      {/* Main 2-Column Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Earnings Date & Historical Track Record */}
        <div className="lg:col-span-5 space-y-4">
          {/* Key Dates Bento */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/5 bg-black/40 p-3.5">
              <span className="text-[10px] font-bold uppercase text-zinc-500">Next Results Date</span>
              <div className="mt-1 font-mono text-base font-black text-white">
                {next_earnings_date || 'Unannounced'}
              </div>
              <span className="text-[11px] font-semibold text-purple-400 mt-0.5 block">
                {days_to_earnings !== null && days_to_earnings !== undefined
                  ? `In ${days_to_earnings} day${days_to_earnings === 1 ? '' : 's'}`
                  : 'Pending notice'}
              </span>
            </div>

            <div className="rounded-2xl border border-white/5 bg-black/40 p-3.5">
              <span className="text-[10px] font-bold uppercase text-zinc-500">Last / Ex-Dividend</span>
              <div className="mt-1 font-mono text-base font-black text-white">
                {ex_dividend_date || 'N/A'}
              </div>
              <span className="text-[11px] font-semibold text-zinc-400 mt-0.5 block">
                Corporate action
              </span>
            </div>
          </div>

          {/* Event Risk Alert Banner */}
          <div
            className={`rounded-2xl border p-3.5 text-xs ${
              isHighRisk
                ? 'border-rose-500/30 bg-rose-950/30 text-rose-200'
                : isCaution
                ? 'border-amber-500/30 bg-amber-950/30 text-amber-200'
                : 'border-emerald-500/20 bg-emerald-950/20 text-emerald-200'
            }`}
          >
            <p className="font-semibold leading-relaxed">{event_risk_reason}</p>
          </div>

          {/* Past Earnings Surprise History */}
          {past_earnings_track_record.length > 0 && (
            <div className="rounded-2xl border border-white/5 bg-black/30 p-4">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 block mb-2.5">
                Past Earnings Consensus vs Reported
              </span>
              <div className="space-y-2">
                {past_earnings_track_record.slice(0, 3).map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs py-1 border-b border-white/[0.04] last:border-0"
                  >
                    <span className="font-mono text-zinc-400">{item.date}</span>
                    <div className="flex items-center space-x-3">
                      <span className="text-zinc-500 text-[11px]">
                        Est: ₹{item.eps_estimate ?? '—'} | Act: ₹{item.eps_reported ?? '—'}
                      </span>
                      {item.surprise_pct !== null && item.surprise_pct !== undefined ? (
                        <span
                          className={`font-mono font-bold text-[11px] ${
                            item.surprise_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {item.surprise_pct > 0 ? `+${item.surprise_pct}%` : `${item.surprise_pct}%`}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: BSE/NSE Exchange Filings */}
        <div className="lg:col-span-7">
          <div className="rounded-2xl border border-white/5 bg-black/40 p-4 h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 flex items-center space-x-1.5">
                  <FileText className="h-3.5 w-3.5 text-purple-400" />
                  <span>Recent Exchange Filings (Reg 30)</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-500">Official Screener Feed</span>
              </div>

              {recent_filings.length === 0 ? (
                <p className="text-xs text-zinc-500 py-6 text-center">
                  No critical regulatory filings reported recently.
                </p>
              ) : (
                <div className="space-y-3">
                  {recent_filings.slice(0, 4).map((f, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-3 text-xs hover:border-purple-500/30 transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-zinc-200 line-clamp-1">{f.title}</span>
                        {f.date && (
                          <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-mono text-zinc-400 shrink-0">
                            {f.date}
                          </span>
                        )}
                      </div>
                      {f.description && (
                        <p className="mt-1 text-[11px] text-zinc-400 leading-normal line-clamp-2">
                          {f.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500">
              <span>Verified against BSE/NSE corporate disclosures</span>
              <span className="font-mono text-purple-400">Institutional Feed</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
