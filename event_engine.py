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
        today_d = datetime.date.today()

        future_dates: List[datetime.date] = []
        if ed_list:
            raw_list = ed_list if isinstance(ed_list, list) else [ed_list]
            for item in raw_list:
                try:
                    if isinstance(item, datetime.date):
                        d_obj = item
                    else:
                        d_obj = datetime.datetime.strptime(str(item)[:10], "%Y-%m-%d").date()
                    if d_obj >= today_d:
                        future_dates.append(d_obj)
                except Exception:
                    pass

        # Peek in get_earnings_dates() if calendar didn't yield future dates
        ed_df = None
        try:
            ed_df = t.get_earnings_dates(limit=10)
            if not future_dates and ed_df is not None and not ed_df.empty:
                for dt_val, _ in ed_df.iterrows():
                    d_obj = dt_val.date() if hasattr(dt_val, "date") else datetime.datetime.strptime(str(dt_val)[:10], "%Y-%m-%d").date()
                    if d_obj >= today_d:
                        future_dates.append(d_obj)
        except Exception:
            pass

        if future_dates:
            future_dates.sort()
            next_target = future_dates[0]
            next_earnings = next_target.strftime("%Y-%m-%d")
            days_to_earnings = (next_target - today_d).days
        else:
            next_earnings = None
            days_to_earnings = None

        if div_date:
            ex_dividend_date = str(div_date)[:10]

        # Extract past 4 earnings dates and surprise history (strictly <= today_d)
        if ed_df is not None and not ed_df.empty:
            for dt, row in ed_df.iterrows():
                d_obj = dt.date() if hasattr(dt, "date") else datetime.datetime.strptime(str(dt)[:10], "%Y-%m-%d").date()
                if d_obj > today_d:
                    continue
                d_str = d_obj.strftime("%Y-%m-%d")

                est = row.get("EPS Estimate")
                rep = row.get("Reported EPS")
                surp = row.get("Surprise(%)")

                past_surprises.append({
                    "date": d_str,
                    "eps_estimate": None if str(est).lower() == "nan" else round(float(est), 2),
                    "eps_reported": None if str(rep).lower() == "nan" else round(float(rep), 2),
                    "surprise_pct": None if str(surp).lower() == "nan" else round(float(surp), 1),
                })
        # Compute empirical post-earnings Day-1 gap reactions
        gap_data = compute_historical_earnings_reactions(t, ed_df, today_d, limit=6)
    except Exception as e:
        logger.warning(f"Failed to fetch yfinance calendar for {sym}: {e}")
        gap_data = {
            "reactions": [],
            "stats": {
                "quarters_analyzed": 0,
                "gap_down_count": 0,
                "gap_up_count": 0,
                "avg_gap_pct": 0.0,
                "worst_gap_pct": 0.0,
                "avg_day1_pct": 0.0,
                "summary": "Historical earnings gap data unavailable."
            }
        }

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
        "gap_reactions": gap_data.get("reactions", []),
        "gap_stats": gap_data.get("stats", {}),
        "recent_filings": clean_filings,
    }

    # Cache result
    _EVENT_CACHE[clean_sym] = result
    _EVENT_CACHE_EXPIRY[clean_sym] = now_ts + CACHE_TTL_SECONDS

    return result


def compute_historical_earnings_reactions(ticker_obj, ed_df, today_d: datetime.date, limit: int = 6) -> Dict[str, Any]:
    """
    Computes empirical Day-1 market price gap and session close reaction following past earnings announcements.
    Returns:
      - reactions: List of quarters with date, eps_estimate, eps_reported, surprise_pct, gap_pct, day1_pct, direction
      - stats: summary stats (quarters_analyzed, gap_down_count, gap_up_count, avg_gap_pct, worst_gap_pct, avg_day1_pct, summary)
    """
    reactions: List[Dict[str, Any]] = []
    default_res = {
        "reactions": [],
        "stats": {
            "quarters_analyzed": 0,
            "gap_down_count": 0,
            "gap_up_count": 0,
            "avg_gap_pct": 0.0,
            "worst_gap_pct": 0.0,
            "avg_day1_pct": 0.0,
            "summary": "Insufficient historical earnings reaction data."
        }
    }
    if ed_df is None or ed_df.empty:
        return default_res

    try:
        hist = ticker_obj.history(period="2y")
        if hist.empty:
            return default_res

        if hist.index.tz is None:
            hist.index = hist.index.tz_localize(None)
        else:
            hist.index = hist.index.tz_convert(None)

        hist_dates = [d.date() for d in hist.index]

        for dt, row in ed_df.iterrows():
            d_obj = dt.date() if hasattr(dt, "date") else datetime.datetime.strptime(str(dt)[:10], "%Y-%m-%d").date()
            if d_obj > today_d:
                continue

            future_candles = [i for i, hd in enumerate(hist_dates) if hd >= d_obj]
            if not future_candles:
                continue

            idx = future_candles[0]
            if hist_dates[idx] == d_obj and idx + 1 < len(hist_dates):
                prev_idx = idx
                reaction_idx = idx + 1
            elif hist_dates[idx] > d_obj:
                prev_idx = idx - 1
                reaction_idx = idx
            else:
                continue

            if prev_idx < 0:
                continue

            prev_close = float(hist.iloc[prev_idx]["Close"])
            reaction_open = float(hist.iloc[reaction_idx]["Open"])
            reaction_close = float(hist.iloc[reaction_idx]["Close"])

            if prev_close <= 0:
                continue

            gap_pct = round(((reaction_open - prev_close) / prev_close) * 100, 2)
            day1_pct = round(((reaction_close - prev_close) / prev_close) * 100, 2)

            est = row.get("EPS Estimate")
            rep = row.get("Reported EPS")
            surp = row.get("Surprise(%)")

            direction = "GAP_UP" if gap_pct > 0.3 else ("GAP_DOWN" if gap_pct < -0.3 else "FLAT")

            reactions.append({
                "announcement_date": d_obj.strftime("%Y-%m-%d"),
                "reaction_date": hist_dates[reaction_idx].strftime("%Y-%m-%d"),
                "prev_close": round(prev_close, 2),
                "reaction_open": round(reaction_open, 2),
                "reaction_close": round(reaction_close, 2),
                "gap_pct": gap_pct,
                "day1_pct": day1_pct,
                "direction": direction,
                "eps_estimate": None if str(est).lower() == "nan" else round(float(est), 2),
                "eps_reported": None if str(rep).lower() == "nan" else round(float(rep), 2),
                "surprise_pct": None if str(surp).lower() == "nan" else round(float(surp), 1),
            })

            if len(reactions) >= limit:
                break

        if not reactions:
            return default_res

        gap_down_count = sum(1 for r in reactions if r["gap_pct"] < -0.3)
        gap_up_count = sum(1 for r in reactions if r["gap_pct"] > 0.3)
        avg_gap = round(sum(r["gap_pct"] for r in reactions) / len(reactions), 2)
        worst_gap = min(r["gap_pct"] for r in reactions)
        avg_day1 = round(sum(r["day1_pct"] for r in reactions) / len(reactions), 2)

        summary = (
            f"Gapped down in {gap_down_count}/{len(reactions)} quarters "
            f"(Avg gap: {avg_gap:+.1f}%, Worst: {worst_gap:+.1f}%, Day-1 net: {avg_day1:+.1f}%)"
        )

        return {
            "reactions": reactions,
            "stats": {
                "quarters_analyzed": len(reactions),
                "gap_down_count": gap_down_count,
                "gap_up_count": gap_up_count,
                "avg_gap_pct": avg_gap,
                "worst_gap_pct": worst_gap,
                "avg_day1_pct": avg_day1,
                "summary": summary,
            }
        }
    except Exception as e:
        logger.warning(f"Error computing historical earnings reactions: {e}")
        return default_res


def classify_filing_category(title: str, description: str = "") -> Dict[str, Any]:
    """
    Classifies an official NSE/BSE Regulation 30 corporate filing into 3 distinct attention tiers:
    1. HIGH_ATTENTION: Major orders/contracts, acquisitions, auditor resignations, pledge changes, regulatory/legal actions.
    2. RELEVANT: Financial results, material updates, senior management changes, capacity expansions.
    3. ROUTINE (Muted): Trading window closures, loss of share certificates, routine meeting notices, clerical filings.
    4. OTHER: Unclassified/ambiguous filings.

    Crucial: Direction (bullish/bearish) is kept separate from materiality tier.
    """
    text = f"{title} {description}".lower()

    # TIER 1: HIGH ATTENTION (Market-moving catalysts or critical governance/audit events)
    if any(k in text for k in ["auditor resignation", "resignation of statutory auditor", "resignation of auditor"]):
        return {
            "tier": "HIGH_ATTENTION",
            "category": "AUDIT_RISK",
            "badge": "border-rose-500/60 bg-rose-500/20 text-rose-300",
            "label": "Auditor Resignation",
            "rationale": "High-priority governance event: statutory auditor resignation.",
            "is_muted": False,
        }
    if any(k in text for k in ["pledge", "revocation of pledge", "creation of pledge", "encumbrance"]):
        return {
            "tier": "HIGH_ATTENTION",
            "category": "PROMOTER_PLEDGE",
            "badge": "border-amber-500/60 bg-amber-500/20 text-amber-300",
            "label": "Promoter Pledge Change",
            "rationale": "High-priority promoter financing: change in encumbered/pledged shares.",
            "is_muted": False,
        }
    if any(k in text for k in ["order win", "contract win", "bags order", "awarded contract", "receipt of order", "secures order", "major contract"]):
        return {
            "tier": "HIGH_ATTENTION",
            "category": "MAJOR_ORDER",
            "badge": "border-emerald-500/60 bg-emerald-500/20 text-emerald-300",
            "label": "Major Order Win",
            "rationale": "High-priority commercial catalyst: significant new contract award.",
            "is_muted": False,
        }
    if any(k in text for k in ["acquisition", "takeover", "merger", "amalgamation", "slump sale", "demerger"]):
        return {
            "tier": "HIGH_ATTENTION",
            "category": "MA_DEAL",
            "badge": "border-cyan-500/60 bg-cyan-500/20 text-cyan-300",
            "label": "M&A / Corporate Action",
            "rationale": "High-priority capital allocation: acquisition or corporate restructuring.",
            "is_muted": False,
        }
    if any(k in text for k in ["promoter buying", "insider purchase", "preferential allotment to promoter", "open offer"]):
        return {
            "tier": "HIGH_ATTENTION",
            "category": "PROMOTER_ACTIVITY",
            "badge": "border-emerald-500/60 bg-emerald-500/20 text-emerald-300",
            "label": "Promoter Open Market Buying",
            "rationale": "High-priority capital signaling: promoter equity acquisition.",
            "is_muted": False,
        }
    if any(k in text for k in ["cancellation of order", "terminated contract", "penalty", "sebi order", "tax search", "raid", "cbi", "ed investigation"]):
        return {
            "tier": "HIGH_ATTENTION",
            "category": "REGULATORY_LEGAL",
            "badge": "border-rose-500/60 bg-rose-500/20 text-rose-300",
            "label": "Regulatory / Legal Action",
            "rationale": "High-priority risk alert: regulatory enforcement or material litigation.",
            "is_muted": False,
        }

    # TIER 3: ROUTINE / LOW-SIGNAL (Muted by default to eliminate exchange noise)
    if any(k in text for k in [
        "trading window", "closure of trading window", "closing of trading window",
        "loss of share", "duplicate share", "share certificate", "issue of duplicate",
        "postal ballot notice", "newspaper publication", "advertisement", "audio recording of earnings call",
        "transcript of earnings", "investor meet intimation", "schedule of analyst",
    ]):
        return {
            "tier": "ROUTINE",
            "category": "ROUTINE_ADMIN",
            "badge": "border-zinc-800 bg-zinc-900/60 text-zinc-500",
            "label": "Routine Admin (Muted)",
            "rationale": "Low-information administrative/compliance notice.",
            "is_muted": True,
        }

    # TIER 2: RELEVANT (Consequential financial results and operational updates)
    if any(k in text for k in ["financial results", "quarterly results", "unaudited financial", "audited financial", "board meeting to consider financial"]):
        return {
            "tier": "RELEVANT",
            "category": "RESULTS",
            "badge": "border-purple-500/40 bg-purple-500/20 text-purple-300",
            "label": "Financial Results",
            "rationale": "Relevant financial disclosure: earnings statement or board meeting.",
            "is_muted": False,
        }
    if any(k in text for k in ["dividend", "interim dividend", "final dividend", "bonus issue", "stock split"]):
        return {
            "tier": "RELEVANT",
            "category": "DIVIDEND_SPLIT",
            "badge": "border-purple-500/40 bg-purple-500/20 text-purple-300",
            "label": "Dividend / Bonus / Split",
            "rationale": "Relevant shareholder return or share restructuring announcement.",
            "is_muted": False,
        }
    if any(k in text for k in ["joint venture", "incorporat", "plant commissioning", "capacity expansion", "commercial production"]):
        return {
            "tier": "RELEVANT",
            "category": "EXPANSION",
            "badge": "border-blue-500/40 bg-blue-500/20 text-blue-300",
            "label": "Capacity Expansion",
            "rationale": "Relevant operational update: expansion or production milestone.",
            "is_muted": False,
        }
    if any(k in text for k in ["resignation of director", "appointment of director", "appointment of ceo", "appointment of cfo", "key managerial personnel", "kmp"]):
        return {
            "tier": "RELEVANT",
            "category": "MANAGEMENT",
            "badge": "border-indigo-500/40 bg-indigo-500/20 text-indigo-300",
            "label": "Management Change",
            "rationale": "Relevant leadership update: changes in Key Managerial Personnel.",
            "is_muted": False,
        }

    # TIER 4: OTHER / UNCLASSIFIED (Unknown or ambiguous disclosures)
    return {
        "tier": "OTHER",
        "category": "GENERAL_DISCLOSURE",
        "badge": "border-zinc-700 bg-zinc-800 text-zinc-300",
        "label": "General Disclosure",
        "rationale": "Unclassified Regulation 30 corporate disclosure.",
        "is_muted": False,
    }


def get_aggregate_corporate_announcements(limit: int = 50) -> List[Dict[str, Any]]:
    """
    Aggregates official BSE/NSE Regulation 30 announcements across cached stocks in .screener_cache/.
    Sorts chronologically so the freshest filings appear first.
    """
    import json
    import os
    import re
    import screener_scraper as ss

    if not os.path.exists(ss.CACHE_DIR):
        return []

    aggregated: List[Dict[str, Any]] = []
    seen_keys = set()

    try:
        files = [f for f in os.listdir(ss.CACHE_DIR) if f.endswith(".json") and not f.startswith("universe_")]
        for fname in files:
            ticker = fname.replace(".json", "")
            fpath = os.path.join(ss.CACHE_DIR, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    anns = data.get("CORPORATE_DATA", {}).get("recent_announcements", [])
                    comp_name = data.get("COMPANY", {}).get("company_name", ticker)
                    for a in anns:
                        title = a.get("title", "").strip()
                        date_str = a.get("date", "").strip()
                        desc = a.get("description", "").strip()
                        if not title:
                            continue

                        dedup_key = f"{ticker}_{title}_{date_str}"
                        if dedup_key in seen_keys:
                            continue
                        seen_keys.add(dedup_key)

                        cat_info = classify_filing_category(title, desc)
                        aggregated.append({
                            "ticker": f"{ticker}.NS",
                            "company_name": comp_name,
                            "date": date_str,
                            "title": title,
                            "description": desc,
                            "tier": cat_info.get("tier", "OTHER"),
                            "category": cat_info["category"],
                            "badge_class": cat_info["badge"],
                            "badge_label": cat_info["label"],
                            "rationale": cat_info.get("rationale", ""),
                            "is_muted": cat_info.get("is_muted", False),
                        })
            except Exception:
                continue
    except Exception as e:
        logger.warning(f"Error aggregating announcements: {e}")

    # Return top items
    return aggregated[:limit]


_NEWS_CACHE: List[Dict[str, Any]] = []
_NEWS_CACHE_EXPIRY: float = 0.0


def fetch_market_news_feed(query: str = "NSE India stocks earnings OR deal OR order", limit: int = 20) -> List[Dict[str, Any]]:
    """
    Fetches real-time financial market news for Indian equities via Google News RSS.
    Unauthenticated, zero rate-limit risks, with 15-minute memory caching.
    """
    global _NEWS_CACHE, _NEWS_CACHE_EXPIRY
    import time
    import urllib.parse
    import urllib.request
    import xml.etree.ElementTree as ET

    now_ts = time.time()
    if _NEWS_CACHE and now_ts < _NEWS_CACHE_EXPIRY:
        return _NEWS_CACHE[:limit]

    encoded_query = urllib.parse.quote(query)
    rss_url = f"https://news.google.com/rss/search?q={encoded_query}&hl=en-IN&gl=IN&ceid=IN:en"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

    news_items: List[Dict[str, Any]] = []
    try:
        req = urllib.request.Request(rss_url, headers=headers)
        with urllib.request.urlopen(req, timeout=6) as response:
            xml_data = response.read()
            root = ET.fromstring(xml_data)
            items = root.findall(".//item")

            for it in items[:limit]:
                raw_title = it.find("title").text if it.find("title") is not None else ""
                link = it.find("link").text if it.find("link") is not None else ""
                pub_date = it.find("pubDate").text if it.find("pubDate") is not None else ""
                source = it.find("source").text if it.find("source") is not None else "Financial News"

                # Parse clean title and publication source
                title_clean = raw_title
                if " - " in raw_title:
                    parts = raw_title.rsplit(" - ", 1)
                    title_clean = parts[0].strip()
                    if len(parts) > 1 and not source:
                        source = parts[1].strip()

                # Basic heuristic catalyst tagging
                lower_t = title_clean.lower()
                tag = "GENERAL"
                tag_badge = "border-zinc-700 bg-zinc-800 text-zinc-300"
                if any(w in lower_t for w in ["profit up", "surge", "record high", "order win", "deal", "growth", "expands", "dividend"]):
                    tag = "BULLISH"
                    tag_badge = "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                elif any(w in lower_t for w in ["slump", "loss", "fall", "plunge", "penalty", "fraud", "probe", "downgrade", "scandal"]):
                    tag = "RISK"
                    tag_badge = "border-rose-500/40 bg-rose-500/20 text-rose-300"

                news_items.append({
                    "title": title_clean,
                    "url": link,
                    "pub_date": pub_date[:16] if len(pub_date) >= 16 else pub_date,
                    "source": source,
                    "tag": tag,
                    "tag_badge": tag_badge,
                })

        if news_items:
            _NEWS_CACHE = news_items
            _NEWS_CACHE_EXPIRY = now_ts + 900  # 15 minutes cache
    except Exception as e:
        logger.warning(f"Error fetching Google News RSS feed: {e}")

    return news_items[:limit]


# Cache for earnings report cards (TTL: 4 hours)
_REPORT_CARD_CACHE: Dict[str, Dict[str, Any]] = {}
_REPORT_CARD_CACHE_EXPIRY: Dict[str, float] = {}
REPORT_CARD_TTL_SECONDS = 4 * 3600


def format_fiscal_quarter(period_date_str: str) -> str:
    """
    Converts fiscal period end date (e.g. 2026-09-30) to human readable Indian fiscal quarter:
    - Month 1-3: Q4 FY{YY}
    - Month 4-6: Q1 FY{YY+1}
    - Month 7-9: Q2 FY{YY+1}
    - Month 10-12: Q3 FY{YY+1}
    """
    if not period_date_str:
        return "Latest Quarter"
    try:
        parts = period_date_str.split("-")
        year = int(parts[0])
        month = int(parts[1])
        if month <= 3:
            return f"Q4 FY{str(year)[2:]}"
        elif month <= 6:
            return f"Q1 FY{str(year + 1)[2:]}"
        elif month <= 9:
            return f"Q2 FY{str(year + 1)[2:]}"
        else:
            return f"Q3 FY{str(year + 1)[2:]}"
    except Exception:
        return period_date_str


def fetch_earnings_report_card(ticker: str) -> Dict[str, Any]:
    """
    Fetches and synthesizes an empirical, non-bloated Earnings Report Card:
    1. Projected vs Actual:
       - EPS: Consensus Estimate vs Reported Actual (Difference, Surprise %)
       - Revenue / Sales: YoY % growth & QoQ acceleration
       - Net Profit (PAT): YoY % growth & QoQ acceleration
       - Margins (OPM): Operating Margin % and expansion/contraction in bps
    2. What the Earnings Said:
       - 2-3 concise bullets on fundamental drivers and corporate actions (e.g. dividends)
    3. Overall Review Verdict:
       - POSITIVE (Strong Beat): EPS beat, double-digit profit growth, expanding margins
       - MIXED (In-Line): Neutral, matched consensus with stable margins
       - NEGATIVE (Miss / Weak): Missed estimates or contracting profits/margins
    """
    import os
    import json
    import re
    import time
    import pandas as pd
    import screener_scraper as ss

    sym = ta.format_nse_ticker(ticker)
    clean_sym = sym.replace(".NS", "").replace(".BO", "").strip().upper()

    now_ts = time.time()
    if clean_sym in _REPORT_CARD_CACHE and now_ts < _REPORT_CARD_CACHE_EXPIRY.get(clean_sym, 0):
        return dict(_REPORT_CARD_CACHE[clean_sym])

    # 1. Fundamental Cache data from Screener
    company_name = clean_sym
    qf: Dict[str, Any] = {}
    recent_filings_raw: List[Dict[str, str]] = []

    cpath = os.path.join(ss.CACHE_DIR, f"{clean_sym}.json")
    if os.path.exists(cpath):
        try:
            with open(cpath, "r", encoding="utf-8") as f:
                d = json.load(f)
                company_name = d.get("COMPANY", {}).get("company_name", clean_sym)
                qf = d.get("QUARTERLY_FINANCIALS", {})
                recent_filings_raw = d.get("CORPORATE_DATA", {}).get("recent_announcements", [])
        except Exception as e:
            logger.warning(f"Failed to read screener cache for {clean_sym}: {e}")

    # 2. Consensus & Actual EPS from yfinance
    eps_projected: Optional[float] = None
    eps_actual: Optional[float] = None
    eps_surprise_pct: Optional[float] = None
    quarter_raw: Optional[str] = None
    quarter_label = "Latest Quarter"
    period_ended_display: Optional[str] = None
    report_date_iso: Optional[str] = None
    report_date_display: Optional[str] = None

    try:
        t = yf.Ticker(sym)
        eh = getattr(t, "earnings_history", None)
        if eh is not None and not eh.empty:
            last_row = eh.iloc[-1]
            quarter_raw = str(eh.index[-1])[:10]
            quarter_label = format_fiscal_quarter(quarter_raw)
            try:
                period_ended_display = datetime.datetime.strptime(quarter_raw, "%Y-%m-%d").strftime("%d %b %Y")
            except Exception:
                period_ended_display = quarter_raw

            if not pd.isna(last_row.get("epsActual")):
                eps_actual = round(float(last_row["epsActual"]), 2)
            if not pd.isna(last_row.get("epsEstimate")):
                eps_projected = round(float(last_row["epsEstimate"]), 2)
            if not pd.isna(last_row.get("surprisePercent")):
                eps_surprise_pct = round(float(last_row["surprisePercent"]) * 100, 1)

        # Match exact announcement date from get_earnings_dates()
        ed_df = t.get_earnings_dates(limit=10)
        if quarter_raw and ed_df is not None and not ed_df.empty:
            try:
                p_date = datetime.datetime.strptime(quarter_raw, "%Y-%m-%d").date()
                for dt, _ in ed_df.iterrows():
                    a_date = dt.date() if hasattr(dt, "date") else datetime.datetime.strptime(str(dt)[:10], "%Y-%m-%d").date()
                    diff = (a_date - p_date).days
                    if 0 < diff <= 75:
                        report_date_iso = a_date.strftime("%Y-%m-%d")
                        report_date_display = a_date.strftime("%d %b %Y")
                        break
            except Exception:
                pass

        # Fallback to get_earnings_dates if earnings_history didn't populate actual
        if eps_actual is None and ed_df is not None and not ed_df.empty:
            for dt, row in ed_df.iterrows():
                rep = row.get("Reported EPS")
                if rep is not None and not pd.isna(rep):
                    a_date = dt.date() if hasattr(dt, "date") else datetime.datetime.strptime(str(dt)[:10], "%Y-%m-%d").date()
                    report_date_iso = a_date.strftime("%Y-%m-%d")
                    report_date_display = a_date.strftime("%d %b %Y")
                    eps_actual = round(float(rep), 2)
                    est = row.get("EPS Estimate")
                    if est is not None and not pd.isna(est):
                        eps_projected = round(float(est), 2)
                    surp = row.get("Surprise(%)")
                    if surp is not None and not pd.isna(surp):
                        eps_surprise_pct = round(float(surp), 1)
                    break

        if not report_date_iso:
            report_date_iso = quarter_raw
            report_date_display = period_ended_display or quarter_raw
    except Exception as e:
        logger.warning(f"yfinance estimate extraction failed for {sym}: {e}")

    # 3. Extract Quarterly Financials
    sales_yoy = qf.get("recent_sales_yoy")
    profit_yoy = qf.get("recent_profit_yoy")
    recent_opm = qf.get("recent_opm")
    opm_expansion = qf.get("OPM_expansion")

    # 4. Deterministic Scoring for Overall Review Verdict
    score = 0
    reasons = []

    if eps_surprise_pct is not None:
        if eps_surprise_pct >= 2.0:
            score += 1
            reasons.append(f"EPS beat estimates by +{eps_surprise_pct}%")
        elif eps_surprise_pct <= -2.0:
            score -= 1
            reasons.append(f"EPS missed estimates by {eps_surprise_pct}%")
        else:
            reasons.append("EPS matched consensus expectations")

    if profit_yoy is not None:
        if profit_yoy >= 15.0:
            score += 1
            reasons.append(f"Net profit grew +{profit_yoy}% YoY")
        elif profit_yoy < 0.0:
            score -= 1
            reasons.append(f"Net profit declined {profit_yoy}% YoY")
        else:
            reasons.append(f"Net profit steady (+{profit_yoy}% YoY)")

    if sales_yoy is not None:
        if sales_yoy >= 10.0:
            score += 1
            reasons.append(f"Revenue rose +{sales_yoy}% YoY")
        elif sales_yoy < 0.0:
            score -= 1
            reasons.append(f"Revenue contracted {sales_yoy}% YoY")

    if opm_expansion is not None and opm_expansion != 0:
        if opm_expansion > 0.0:
            score += 1
            reasons.append(f"Operating margin expanded by {opm_expansion}%")
        elif opm_expansion < -1.0:
            score -= 1
            reasons.append(f"Operating margin compressed by {abs(opm_expansion)}%")

    # Assign final verdict
    if score >= 2:
        # Prevent misleading STRONG BEAT classification if consensus EPS was actually missed
        if eps_surprise_pct is not None and eps_surprise_pct <= -1.0:
            verdict = "MIXED"
            verdict_badge = "MIXED (GROWTH / EPS MISS)"
            verdict_color = "amber"
        else:
            verdict = "POSITIVE"
            verdict_badge = "STRONG BEAT"
            verdict_color = "emerald"
    elif score <= -1:
        verdict = "NEGATIVE"
        verdict_badge = "MISS / WEAK"
        verdict_color = "rose"
    else:
        verdict = "MIXED"
        verdict_badge = "IN-LINE"
        verdict_color = "amber"

    # 5. Look for corporate actions / dividends in filings & announcements
    dividend_note = None
    for a in recent_filings_raw[:8]:
        text = f"{a.get('title', '')} {a.get('description', '')}".lower()
        if "dividend" in text:
            # Look for dividend amount (e.g., Rs 15 or 15 per share)
            match = re.search(r"(?:rs\.?|inr|dividend of)\s*([0-9\.]+)", text)
            if match:
                dividend_note = f"Declared ₹{match.group(1)} dividend"
            else:
                dividend_note = "Interim / Final Dividend Declared"
            break

    # 6. Concise Takeaway Bullets
    highlights: List[str] = []
    if eps_actual is not None and eps_projected is not None:
        diff_str = f"+{eps_surprise_pct}%" if eps_surprise_pct and eps_surprise_pct > 0 else f"{eps_surprise_pct}%"
        highlights.append(f"Reported EPS of ₹{eps_actual:.2f} vs ₹{eps_projected:.2f} projected ({diff_str}).")
    elif eps_actual is not None:
        highlights.append(f"Reported quarterly EPS of ₹{eps_actual:.2f}.")

    growth_parts = []
    if sales_yoy is not None:
        growth_parts.append(f"Revenue +{sales_yoy:.1f}% YoY" if sales_yoy >= 0 else f"Revenue {sales_yoy:.1f}% YoY")
    if profit_yoy is not None:
        growth_parts.append(f"Net Profit +{profit_yoy:.1f}% YoY" if profit_yoy >= 0 else f"Net Profit {profit_yoy:.1f}% YoY")
    if growth_parts:
        highlights.append(" & ".join(growth_parts) + ".")

    if recent_opm is not None:
        opm_text = f"Operating margin stood at {recent_opm:.1f}%"
        if opm_expansion:
            opm_text += f" ({'+' if opm_expansion > 0 else ''}{opm_expansion:.1f}% YoY expansion)"
        highlights.append(f"{opm_text}.")

    if dividend_note:
        highlights.append(f"{dividend_note}.")

    card = {
        "ticker": sym,
        "clean_ticker": clean_sym,
        "company_name": company_name,
        "quarter": quarter_label,
        "quarter_period_end": quarter_raw,
        "period_ended_display": period_ended_display,
        "report_date": report_date_iso,
        "report_date_display": report_date_display,
        "verdict": verdict,
        "verdict_badge": verdict_badge,
        "verdict_color": verdict_color,
        "verdict_rationale": " | ".join(reasons[:2]) if reasons else "Results evaluated against consensus estimates and YoY growth.",
        "metrics": {
            "eps_projected": eps_projected,
            "eps_actual": eps_actual,
            "eps_surprise_pct": eps_surprise_pct,
            "sales_yoy_pct": sales_yoy,
            "profit_yoy_pct": profit_yoy,
            "opm_pct": recent_opm,
            "opm_expansion": opm_expansion,
        },
        "highlights": highlights[:3],
        "dividend_note": dividend_note,
    }

    _REPORT_CARD_CACHE[clean_sym] = card
    _REPORT_CARD_CACHE_EXPIRY[clean_sym] = now_ts + REPORT_CARD_TTL_SECONDS

    return card


def get_recent_earnings_reviews(tickers: Optional[List[str]] = None, limit: int = 8) -> List[Dict[str, Any]]:
    """
    Returns recent earnings reviews across a supplied list of tickers or cached universe stocks,
    sorted chronologically by the freshest disclosure date.
    """
    import os
    import screener_scraper as ss

    target_tickers = []
    if tickers:
        target_tickers = tickers
    elif os.path.exists(ss.CACHE_DIR):
        files = [f for f in os.listdir(ss.CACHE_DIR) if f.endswith(".json") and not f.startswith("universe_")]
        # Prioritize widely held / screened stocks
        sample_priority = ["TECHM", "TCS", "PNB", "HDFCBANK", "RELIANCE", "INFY", "ICICIBANK", "SBIN", "HAL", "BEL"]
        found = []
        for p in sample_priority:
            if f"{p}.json" in files:
                found.append(p)
        target_tickers = found + [f.replace(".json", "") for f in files if f.replace(".json", "") not in found]

    reviews: List[Dict[str, Any]] = []
    for t in target_tickers:
        try:
            rc = fetch_earnings_report_card(t)
            if rc.get("metrics", {}).get("eps_actual") is not None or rc.get("metrics", {}).get("profit_yoy_pct") is not None:
                reviews.append(rc)
        except Exception as e:
            logger.debug(f"Failed to fetch earnings review for {t}: {e}")

    # Sort by announcement date descending (freshest disclosure first)
    reviews.sort(key=lambda x: x.get("report_date") or "", reverse=True)

    return reviews[:limit]

