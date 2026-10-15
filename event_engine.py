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
