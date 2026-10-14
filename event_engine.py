"""
event_engine.py - Corporate Actions, Earnings Calendar & Event Risk Radar
========================================================================
Institutional corporate event tracking for 3-week to 2-month swing trading:
1. Upcoming earnings announcement date & days-to-event countdown.
2. Event risk gate (< 14 days = high binary overnight risk).
3. Past quarterly earnings track record (consensus estimate vs actual reported surprise %).
4. Official BSE/NSE Regulation 30 corporate filings from Screener.
5. Post-Earnings Announcement Drift (PEAD) reaction evaluation.
"""

from __future__ import annotations

import datetime
import logging
from typing import Any, Dict, List, Optional
import yfinance as yf
import techanalysis as ta

logger = logging.getLogger("event_engine")

# Memory cache for corporate events (TTL: 6 hours to keep UI instantaneous)
_EVENT_CACHE: Dict[str, Dict[str, Any]] = {}
_EVENT_CACHE_EXPIRY: Dict[str, float] = {}
CACHE_TTL_SECONDS = 6 * 3600  # 6 hours


def fetch_corporate_radar(ticker: str, recent_announcements: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
    """
    Fetches official earnings dates, consensus surprises, and exchange filings for a stock.
    Calculates event risk classification for swing trading.
    """
    sym = ta.format_nse_ticker(ticker)
    clean_sym = sym.replace(".NS", "").replace(".BO", "").strip().upper()

    # Check cache
    now_ts = datetime.datetime.now().timestamp()
    if clean_sym in _EVENT_CACHE and now_ts < _EVENT_CACHE_EXPIRY.get(clean_sym, 0):
        res = dict(_EVENT_CACHE[clean_sym])
        if recent_announcements:
            res["recent_filings"] = recent_announcements
        return res

    next_earnings: Optional[str] = None
    days_to_earnings: Optional[int] = None
    ex_dividend_date: Optional[str] = None
    past_surprises: List[Dict[str, Any]] = []

    try:
        t = yf.Ticker(sym)
        cal = t.calendar or {}
        ed_list = cal.get("Earnings Date", [])
        div_date = cal.get("Ex-Dividend Date")

        if ed_list:
            if isinstance(ed_list, list) and len(ed_list) > 0:
                next_earnings = str(ed_list[0])[:10]
            else:
                next_earnings = str(ed_list)[:10]

        if next_earnings:
            try:
                target_d = datetime.datetime.strptime(next_earnings, "%Y-%m-%d").date()
                today_d = datetime.date.today()
                diff_days = (target_d - today_d).days
                # If negative, it already passed or date is outdated
                days_to_earnings = diff_days if diff_days >= 0 else None
            except Exception:
                pass

        if div_date:
            ex_dividend_date = str(div_date)[:10]

        # Extract past 4 earnings dates and surprise history
        try:
            ed_df = t.get_earnings_dates(limit=6)
            if ed_df is not None and not ed_df.empty:
                for dt, row in ed_df.iterrows():
                    d_str = str(dt)[:10]
                    # Skip future date in historical surprise list
                    if d_str == next_earnings:
                        continue

                    est = row.get("EPS Estimate")
                    rep = row.get("Reported EPS")
                    surp = row.get("Surprise(%)")

                    past_surprises.append({
                        "date": d_str,
                        "eps_estimate": None if str(est).lower() == "nan" else round(float(est), 2),
                        "eps_reported": None if str(rep).lower() == "nan" else round(float(rep), 2),
                        "surprise_pct": None if str(surp).lower() == "nan" else round(float(surp), 1),
                    })
        except Exception:
            pass

    except Exception as e:
        logger.warning(f"Failed to fetch yfinance calendar for {sym}: {e}")

    # Determine Event Risk Stance for 3-week to 2-month swing trades
    event_risk_status = "CLEAR_WINDOW"
    event_risk_badge = "SAFE"
    event_risk_reason = "No high-impact corporate results within the immediate 21-day swing window."

    if days_to_earnings is not None:
        if days_to_earnings <= 5:
            event_risk_status = "PRE_EARNINGS_LOCKOUT"
            event_risk_badge = "HIGH_RISK"
            event_risk_reason = f"Q2/Q3 earnings announcement in {days_to_earnings} days. Severe binary overnight gap risk."
        elif days_to_earnings <= 14:
            event_risk_status = "PRE_EARNINGS_RADAR"
            event_risk_badge = "CAUTION"
            event_risk_reason = f"Earnings announcement in {days_to_earnings} days. Trade holding window is restricted."
        elif days_to_earnings <= 28:
            event_risk_status = "MODERATE_WINDOW"
            event_risk_badge = "MONITOR"
            event_risk_reason = f"Earnings scheduled on {next_earnings} ({days_to_earnings} days away)."

    # Filter and format filings
    clean_filings = []
    if recent_announcements:
        for f in recent_announcements[:5]:
            clean_filings.append({
                "date": f.get("date", ""),
                "title": f.get("title", ""),
                "description": f.get("description", ""),
            })

    result = {
        "ticker": sym,
        "next_earnings_date": next_earnings,
        "days_to_earnings": days_to_earnings,
        "ex_dividend_date": ex_dividend_date,
        "event_risk_status": event_risk_status,
        "event_risk_badge": event_risk_badge,
        "event_risk_reason": event_risk_reason,
        "past_earnings_track_record": past_surprises[:4],
        "recent_filings": clean_filings,
    }

    # Cache result
    _EVENT_CACHE[clean_sym] = result
    _EVENT_CACHE_EXPIRY[clean_sym] = now_ts + CACHE_TTL_SECONDS

    return result
