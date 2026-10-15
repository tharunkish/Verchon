"""
resultanalysis.py - Final Consolidation & Research Dossier Layer
Combines outputs from:
  1. improvedfundanalysis.py (Fundamental Evidence)
  2. techanalysis.py         (Technical Price Action & Setups)
  3. marketregime.py         (Macro Market Environment & Posture)
Produces an evidence-based terminal research shortlist for candidate stocks.
"""

from __future__ import annotations

import os
import sys
from typing import Any, Dict, List, Optional, Tuple, Union

# Ensure UTF-8 stdout encoding on Windows consoles
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import improvedfundanalysis as ifa
import screener_scraper as scraper
import marketregime as mr

from datetime import datetime

try:
    import techanalysis as ta
except ImportError:
    ta = None

# =====================================================================
# 1. VERSIONING & AUDIT METADATA
# =====================================================================
ENGINE_VERSION = "2.1.0"
STRATEGY_VERSION = "1.0.0"
SCORING_VERSION = "1.1.0"

# =====================================================================
# 1.1 CONFIGURATION & WEIGHTS
# =====================================================================

# Individual Stock Score Weights (0.60 Fundamental / 0.40 Technical)
WEIGHT_FUNDAMENTAL = 0.60
WEIGHT_TECHNICAL = 0.40

# Priority classification thresholds (Individual Stock)
HIGH_PRIORITY_MIN_FUND = 65.0
HIGH_PRIORITY_MIN_TECH = 55.0
AVOID_MAX_FUND = 40.0
AVOID_MAX_TECH = 40.0


# =====================================================================
# 1.2 EVENT RISK EVALUATION (Contextual Evidence Layer)
# =====================================================================

def evaluate_event_risk(
    announcements: List[Dict[str, str]],
    as_of_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Evaluates corporate event proximity (e.g. quarterly earnings, board meetings, dividends).
    Observational risk management context only; does NOT force an entry/exit decision.
    """
    if not announcements:
        return {
            "has_event_risk": False,
            "risk_level": "LOW",
            "event_warning": None,
            "relevant_events": [],
            "is_evidence_only": True
        }

    target_date = datetime.strptime(as_of_date, "%Y-%m-%d") if as_of_date else datetime.now()
    
    keywords = [
        "financial results", "quarterly results", "board meeting", "audited results",
        "unaudited results", "financial performance", "earnings", "outcome of board",
        "notice of board", "dividend"
    ]
    
    relevant = []
    has_risk = False
    warning_msg = None

    for ann in announcements:
        title = (ann.get("title") or "").lower()
        desc = (ann.get("description") or "").lower()
        date_str = (ann.get("date") or "").strip()
        
        matches = any(k in title or k in desc for k in keywords)
        if matches:
            proximity_days = None
            if date_str:
                for fmt in ("%d %b %Y", "%d-%b-%Y", "%Y-%m-%d", "%d/%m/%Y", "%b %d, %Y"):
                    try:
                        d = datetime.strptime(date_str, fmt)
                        proximity_days = abs((target_date - d).days)
                        break
                    except ValueError:
                        continue
            
            event_entry = {
                "date": date_str,
                "title": ann.get("title", ""),
                "description": ann.get("description", ""),
                "proximity_days": proximity_days
            }
            relevant.append(event_entry)

            # If within 10 days of event, flag event risk warning
            if proximity_days is not None and proximity_days <= 10:
                has_risk = True
                warning_msg = f"Corporate event ({ann.get('title', '')}) within {proximity_days} days of evaluation date."

    if not has_risk and relevant:
        if any(e.get("proximity_days") is not None and e["proximity_days"] <= 20 for e in relevant):
            warning_msg = "Upcoming corporate event within 20 days; monitor board announcements."
        elif not any(e.get("proximity_days") is not None for e in relevant):
            warning_msg = "Recent corporate filings detected; verify board meeting / results calendar before entry."

    return {
        "has_event_risk": has_risk,
        "risk_level": "WARNING" if has_risk else "LOW",
        "event_warning": warning_msg,
        "relevant_events": relevant[:5],
        "is_evidence_only": True
    }



# =====================================================================
# 2. FORMATTING HELPERS
# =====================================================================

def _fmt_pct(val: Any) -> str:
    """Format numeric percentages cleanly without fabricating."""
    if val is None or val == "N/A" or val == "" or str(val).lower() == "nan":
        return "N/A"
    try:
        f = float(val)
        return f"{f:+.1f}%" if f != 0 else f"{f:.1f}%"
    except (ValueError, TypeError):
        return str(val)


def _fmt_curr(val: Any) -> str:
    """Format currency values cleanly."""
    if val is None or val == "N/A" or val == "" or str(val).lower() == "nan":
        return "N/A"
    try:
        f = float(val)
        return f"₹{f:,.2f}"
    except (ValueError, TypeError):
        return str(val)


def _fmt_val(val: Any, suffix: str = "", decimals: int = 1) -> str:
    """Format general scalar values or display N/A."""
    if val is None or val == "N/A" or val == "" or str(val).lower() == "nan":
        return "N/A"
    try:
        f = float(val)
        return f"{f:.{decimals}f}{suffix}"
    except (ValueError, TypeError):
        return f"{val}{suffix}"


def _safe_float(val: Any, default: float = 0.0) -> float:
    """Safely cast values to float."""
    if val is None or str(val).lower() == "nan":
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


# =====================================================================
# 3. FUNDAMENTAL QUALIFICATION & EVIDENCE INTERPRETATION ENGINE
# =====================================================================

def check_fundamental_qualification(f: Dict[str, Any]) -> Tuple[bool, List[str], List[Dict[str, Any]]]:
    """
    Common Fundamental Qualification (Section 4):
    - Business Quality >= 50
    - Growth & Earnings >= 50
    - Current Momentum >= 40
    - Data Completeness >= 60%
    - Confidence != LOW
    Returns: (is_qualified, list_of_failed_reasons, list_of_predicate_dicts)
    """
    failed = []
    truth_table: List[Dict[str, Any]] = []

    # Check for underlying data quality failure
    dq = f.get("data_quality", {})
    if dq.get("is_valid") is False:
        err = "; ".join(dq.get("errors", ["Data quality failure"]))
        failed.append(f"Data quality invalid: {err}")
        truth_table.append({
            "name": "data_quality_valid",
            "description": "Fundamental scraper data quality is valid",
            "observed": False,
            "required": "True",
            "passed": False,
            "failure_reason": err,
        })
        return False, failed, truth_table

    comps = f.get("components", {})

    bq = comps.get("Business Quality")
    bq_val = bq.score if bq else None
    bq_pass = (bq_val is not None) and (bq_val >= 50.0)
    bq_fail = "Business Quality unavailable" if bq_val is None else (f"Business Quality score ({bq_val:.1f}) < 50" if not bq_pass else None)
    if not bq_pass:
        failed.append(bq_fail)
    truth_table.append({
        "name": "business_quality_gte_50",
        "description": "Business Quality score >= 50",
        "observed": round(bq_val, 1) if bq_val is not None else None,
        "required": ">= 50.0",
        "passed": bq_pass,
        "failure_reason": bq_fail,
    })

    ge = comps.get("Growth & Earnings")
    ge_val = ge.score if ge else None
    ge_pass = (ge_val is not None) and (ge_val >= 50.0)
    ge_fail = "Growth & Earnings unavailable" if ge_val is None else (f"Growth & Earnings score ({ge_val:.1f}) < 50" if not ge_pass else None)
    if not ge_pass:
        failed.append(ge_fail)
    truth_table.append({
        "name": "growth_earnings_gte_50",
        "description": "Growth & Earnings score >= 50",
        "observed": round(ge_val, 1) if ge_val is not None else None,
        "required": ">= 50.0",
        "passed": ge_pass,
        "failure_reason": ge_fail,
    })

    cm = comps.get("Current Momentum")
    cm_val = cm.score if cm else None
    cm_pass = (cm_val is not None) and (cm_val >= 40.0)
    cm_fail = "Current Momentum unavailable" if cm_val is None else (f"Current Momentum score ({cm_val:.1f}) < 40" if not cm_pass else None)
    if not cm_pass:
        failed.append(cm_fail)
    truth_table.append({
        "name": "current_momentum_gte_40",
        "description": "Current Momentum score >= 40",
        "observed": round(cm_val, 1) if cm_val is not None else None,
        "required": ">= 40.0",
        "passed": cm_pass,
        "failure_reason": cm_fail,
    })

    comp_pct = _safe_float(f.get("data_completeness"), 0.0)
    comp_pass = comp_pct >= 60.0
    comp_fail = None if comp_pass else f"Data Completeness ({comp_pct:.1f}%) < 60%"
    if not comp_pass:
        failed.append(comp_fail)
    truth_table.append({
        "name": "data_completeness_gte_60",
        "description": "Data Completeness >= 60%",
        "observed": round(comp_pct, 1),
        "required": ">= 60.0%",
        "passed": comp_pass,
        "failure_reason": comp_fail,
    })

    conf = str(f.get("analysis_confidence", "LOW")).upper()
    conf_pass = (conf != "LOW")
    conf_fail = None if conf_pass else "Analysis confidence is LOW"
    if not conf_pass:
        failed.append(conf_fail)
    truth_table.append({
        "name": "analysis_confidence_not_low",
        "description": "Analysis confidence != LOW",
        "observed": conf,
        "required": "!= LOW",
        "passed": conf_pass,
        "failure_reason": conf_fail,
    })

    return len(failed) == 0, failed, truth_table


def generate_reasons(f: Dict[str, Any], t: Dict[str, Any], m: Dict[str, Any]) -> List[str]:
    """Generate 'Why this stock appeared' from fundamentals, technicals, and market context."""
    reasons: List[str] = []

    # Fundamentals
    for pos in f.get("positives", []):
        reasons.append(pos)

    # Technicals
    trend_info = t.get("Trend_Analysis", {})
    if trend_info.get("Trend_Classification") in ("Strong uptrend", "Uptrend"):
        reasons.append(f"Technical structure is in an established {trend_info.get('Trend_Classification').lower()}.")

    dist_200 = _safe_float(trend_info.get("Dist_200_DMA_%"))
    if dist_200 > 0:
        reasons.append(f"Price is trading {dist_200:+.1f}% above the rising 200 DMA.")

    momo_info = t.get("Momentum_Analysis", {})
    rs_class = momo_info.get("Relative_Strength_Classification")
    if rs_class in ("Strong relative strength", "Positive"):
        reasons.append(f"Relative strength vs Nifty 50 is {rs_class.lower()}.")

    vol_info = t.get("Volume_Analysis", {})
    if vol_info.get("Volume_Classification") == "Strong volume confirmation":
        reasons.append("Institutional volume confirmation on upside accumulation.")

    setups = t.get("Setups_Detected", [])
    for setup in setups:
        if "No active" not in setup:
            reasons.append(f"Swing setup identified: {setup}.")

    return reasons if reasons else ["Stock matched basic scan threshold criteria."]


def generate_strengths(f: Dict[str, Any], t: Dict[str, Any], m: Dict[str, Any]) -> List[str]:
    """Generate concise, evidence-based strengths."""
    strengths: List[str] = []

    # Fundamentals
    comps = f.get("components", {})
    bq = comps.get("Business Quality")
    if bq and bq.score is not None and bq.score >= 70:
        strengths.append(f"High franchise quality: {bq.assessment}")

    ge = comps.get("Growth & Earnings")
    if ge and ge.score is not None and ge.score >= 70:
        strengths.append(f"Operational momentum: {ge.assessment}")

    og = comps.get("Ownership & Governance")
    if og and og.score is not None and og.score >= 75:
        strengths.append(f"Shareholder backing: {og.assessment}")

    # Technicals
    trend_info = t.get("Trend_Analysis", {})
    if trend_info.get("Trend_Classification") in ("Strong uptrend", "Uptrend"):
        strengths.append(f"Favorable intermediate trend ({trend_info.get('Trend_Classification')}).")

    momo_info = t.get("Momentum_Analysis", {})
    rs_alpha = momo_info.get("Relative_Strength_Alpha_%", {})
    rs_3m = _safe_float(rs_alpha.get("3M"))
    if rs_3m > 0:
        strengths.append(f"Positive 3-month relative alpha of {rs_3m:+.1f}% against Nifty 50.")

    vol_info = t.get("Volume_Analysis", {})
    if vol_info.get("Volume_Classification") == "Strong volume confirmation":
        strengths.append("Buying volume skew confirms price action.")

    return strengths[:6] if strengths else ["No distinct analytical strengths observed in current data."]


def generate_weaknesses(f: Dict[str, Any], t: Dict[str, Any], m: Dict[str, Any]) -> List[str]:
    """Generate evidence-based weaknesses, red flags, and macro friction points."""
    weaknesses: List[str] = []

    # Macro Context Headwinds
    regime = m.get("regime", "NEUTRAL")
    if regime == "HOSTILE":
        weaknesses.append(f"[MACRO] Broader market is HOSTILE (Nifty Score: {m.get('regime_score', 'N/A')}/100 in {m.get('trend', {}).get('classification')}). Long swing breakout failure rates are elevated.")
    elif regime == "CAUTION":
        weaknesses.append(f"[MACRO] Market regime is CAUTION (Nifty Score: {m.get('regime_score', 'N/A')}/100); require high-conviction relative strength.")

    # Fundamentals - Red Flags
    for flag in f.get("red_flags", []):
        weaknesses.append(f"[{flag.get('severity', 'WARN')}] {flag.get('name')}: {flag.get('explanation')}")

    comps = f.get("components", {})
    cm = comps.get("Current Momentum")
    if cm and cm.score is not None and cm.score <= 40:
        weaknesses.append(f"Sluggish near-term momentum: {cm.assessment}")

    val = f.get("valuation", {})
    if val.get("risk") in ("High", "HIGH"):
        weaknesses.append(f"Valuation multiple risk is high ({val.get('category')}).")

    # Technicals
    trend_info = t.get("Trend_Analysis", {})
    dist_50 = _safe_float(trend_info.get("Dist_50_DMA_%"))
    if dist_50 < 0:
        weaknesses.append(f"Price is currently trading below its 50 DMA ({dist_50:.1f}%).")

    if trend_info.get("Trend_Classification") == "Downtrend":
        weaknesses.append("Primary technical trend is classified as a downtrend.")

    momo_info = t.get("Momentum_Analysis", {})
    if momo_info.get("Relative_Strength_Classification") == "Weak":
        weaknesses.append("Lacking relative strength; underperforming the benchmark index.")

    setups = t.get("Setups_Detected", [])
    if any("No active" in s for s in setups) or not setups:
        weaknesses.append("No actionable swing setup pattern currently confirmed.")

    return weaknesses[:6] if weaknesses else ["No critical statistical weaknesses detected."]


def generate_checklist(f: Dict[str, Any], t: Dict[str, Any], m: Dict[str, Any]) -> List[str]:
    """Generate conditional research questions for human verification."""
    checklist: List[str] = []

    # Market context verification
    if m.get("regime") in ("HOSTILE", "CAUTION"):
        checklist.append(f"Given the {m.get('regime')} market regime, is this stock showing independent relative strength and decoupled volume?")

    # Fundamental questions
    for q in f.get("questions", []):
        checklist.append(q)

    # Technical setup checks
    setups = t.get("Setups_Detected", [])
    active_setups = [s for s in setups if "No active" not in s]
    if active_setups:
        checklist.append(f"What precise price invalidation level applies to '{active_setups[0]}'?")
    else:
        checklist.append("What price/volume breakout trigger is required before committing swing capital?")

    return checklist[:5]


# =====================================================================
# 4. REPORT RENDERERS
# =====================================================================

def render_market_regime_banner(m: Dict[str, Any]) -> str:
    """Renders the executive macro backdrop at the top of the research batch."""
    t = m.get("trend", {})
    mom = m.get("momentum", {})
    vol = m.get("volatility", {})

    lines = [
        "#" * 65,
        "                     MARKET REGIME BACKDROP",
        f"  Benchmark Index    : {m.get('benchmark', 'NIFTY 50')} ({m.get('ticker', '^NSEI')})",
        f"  Current Price      : {_fmt_curr(m.get('price'))}",
        f"  Regime State       : {m.get('regime', 'N/A')} (Score: {m.get('regime_score', 'N/A')}/100 | Confidence: {m.get('confidence', 'N/A')})",
        f"  Trend Structure    : {t.get('classification', 'N/A')} (20 DMA: {_fmt_pct(t.get('price_vs_20dma'))}, 50 DMA: {_fmt_pct(t.get('price_vs_50dma'))}, 200 DMA: {_fmt_pct(t.get('price_vs_200dma'))})",
        f"  Momentum (1M / 3M) : {_fmt_pct(mom.get('return_1m'))} / {_fmt_pct(mom.get('return_3m'))} (State: {mom.get('state', 'N/A')})",
        f"  Realized Volatility: {_fmt_val(vol.get('realized_vol_20d'), '%')} (State: {vol.get('state', 'N/A')})",
        "#" * 65,
        "",
    ]
    return "\n".join(lines)


def render_stock_report(stock_data: Dict[str, Any], market_context: Dict[str, Any]) -> str:
    """Produces the structured terminal research dossier for an individual stock."""
    f = stock_data.get("fundamentals", {})
    t = stock_data.get("technicals", {})
    m = market_context

    name = stock_data.get("name", f.get("company", "Unknown Stock"))
    ticker = stock_data.get("ticker", f.get("symbol", "UNKNOWN"))
    comp_type = f.get("company_type", "GENERAL")

    # Overall Scores
    f_score = _safe_float(f.get("fundamental_score"))
    t_summary = t.get("Scoring_Summary", {})
    t_score = _safe_float(t_summary.get("Technical_Score"))
    overall_score = stock_data.get("overall_score", 0.0)
    priority = stock_data.get("priority", "MONITOR")

    # Technical Components
    trend = t.get("Trend_Analysis", {})
    momo = t.get("Momentum_Analysis", {})
    vol = t.get("Volume_Analysis", {})
    setups = t.get("Setups_Detected", ["N/A"])

    stock_rets = momo.get("Stock_Returns_%", {})
    bench_rets = momo.get("Nifty_Returns_%", {})

    # Fundamental Components
    comps = f.get("components", {})
    val = f.get("valuation", {})
    
    bq_score = comps.get("Business Quality").score if comps.get("Business Quality") else None
    ge_score = comps.get("Growth & Earnings").score if comps.get("Growth & Earnings") else None
    fh_score = comps.get("Financial Health").score if comps.get("Financial Health") else None

    # Evidence Sections
    reasons = generate_reasons(f, t, m)
    strengths = generate_strengths(f, t, m)
    weaknesses = generate_weaknesses(f, t, m)
    checklist = generate_checklist(f, t, m)

    lines = [
        "=" * 65,
        f"{name.upper()} ({ticker}) | Archetype: {comp_type}",
        "=" * 65,
        "",
        "OVERALL SWING PROFILE",
        f"  Fundamental Score : {f_score:.1f}/100 (Confidence: {f.get('analysis_confidence', 'N/A')}, Data: {f.get('data_completeness', 0):.1f}%)",
        f"  Technical Score   : {t_score:.1f}/100",
        f"  Consolidated Score: {overall_score:.1f}/100",
        f"  Swing Action      : {priority}",
        f"  Macro Backdrop    : {m.get('regime', 'N/A')} (Nifty Score: {m.get('regime_score', 'N/A')}/100)",
        "",
        "FUNDAMENTAL SUMMARY",
        f"  Business Quality  : {_fmt_val(bq_score)}/100",
        f"  Growth & Earnings : {_fmt_val(ge_score)}/100",
        f"  Financial Health  : {_fmt_val(fh_score)}/100",
        f"  Valuation         : P/E {_fmt_val(val.get('pe'))}x | P/B {_fmt_val(val.get('pb'))}x ({val.get('category', 'N/A')})",
        "",
        "TECHNICAL SUMMARY",
        f"  Trend Structure   : {trend.get('Trend_Classification', 'N/A')}",
        f"  Price             : {_fmt_curr(trend.get('Current_Price'))}",
        f"  50 DMA            : {_fmt_curr(trend.get('50_DMA'))} ({_fmt_pct(trend.get('Dist_50_DMA_%'))})",
        f"  200 DMA           : {_fmt_curr(trend.get('200_DMA'))} ({_fmt_pct(trend.get('Dist_200_DMA_%'))})",
        f"  Returns vs Nifty  : 1M: {_fmt_pct(stock_rets.get('1M'))} vs {_fmt_pct(bench_rets.get('1M'))} | 3M: {_fmt_pct(stock_rets.get('3M'))} vs {_fmt_pct(bench_rets.get('3M'))}",
        f"  Relative Strength : {momo.get('Relative_Strength_Classification', 'N/A')}",
        f"  Volume Status     : {vol.get('Volume_Classification', 'N/A')}",
        f"  Identified Setup  : {'; '.join(setups) if setups else 'None'}",
    ]

    # Strategy Results (Section 24)
    strat_eval = t.get("Strategy_Evaluation", {})
    primary_strat_name = strat_eval.get("primary_strategy", "None")
    matching_strats = strat_eval.get("matching_strategies", [])
    active_res = strat_eval.get("active_strategy_result", {})
    pos_sizing = strat_eval.get("position_sizing_preview", {})

    lines.append("")
    lines.append("STRATEGY STATUS & SIGNALS")
    lines.append(f"  Primary Strategy  : {primary_strat_name}")
    lines.append(f"  Matching Setups   : {', '.join(matching_strats) if matching_strats else 'None'}")
    lines.append(f"  Strategy State    : {active_res.get('state', 'N/A')}")
    lines.append(f"  Signal Status     : {'TRIGGERED' if active_res.get('signal_triggered') else ('FORMING' if active_res.get('setup_detected') else 'INACTIVE')}")
    
    if active_res.get("signal_triggered"):
        lines.append(f"  Signal Date       : {active_res.get('signal_date')}")
        lines.append(f"  Signal Close      : {_fmt_curr(active_res.get('signal_close'))}")
        lines.append(f"  Expected Entry    : {active_res.get('expected_entry')}")
        lines.append(f"  Technical Stop    : {_fmt_curr(active_res.get('stop_price'))}")
        lines.append(f"  Risk Per Share    : {_fmt_curr(pos_sizing.get('risk_per_share'))} ({active_res.get('risk_percent')}%)")
        lines.append(f"  Paper Position Qty: {pos_sizing.get('actual_quantity', 0)} shares (Risk Budget: {_fmt_curr(pos_sizing.get('risk_budget'))})")
    elif active_res.get("setup_detected"):
        lines.append(f"  Setup In Progress : Trigger pending ({active_res.get('rejection_reason') or 'Awaiting confirmation candle/volume'})")
        if active_res.get("breakout_level"):
            lines.append(f"  Breakout Level    : {_fmt_curr(active_res.get('breakout_level'))}")
    else:
        lines.append(f"  No Active Setup   : {active_res.get('invalidation_reason') or active_res.get('rejection_reason') or 'No technical setup structure detected'}")

    lines.append("")
    lines.append("WHY IT QUALIFIES / DRIVERS")

    for r in reasons:
        lines.append(f"  • {r}")

    lines.append("")
    lines.append("KEY STRENGTHS")
    for s in strengths:
        lines.append(f"  • {s}")

    lines.append("")
    lines.append("RISKS & WEAKNESSES")
    for w in weaknesses:
        lines.append(f"  • {w}")

    lines.append("")
    lines.append("WHAT TO INVESTIGATE BEFORE ENTRY")
    for c in checklist:
        lines.append(f"  □ {c}")

    lines.append("=" * 65)
    lines.append("")
    return "\n".join(lines)


# =====================================================================
# 5. INTEGRATION PIPELINE
# =====================================================================

def analyze_candidate(
    ticker: str,
    display_name: Optional[str] = None,
    as_of_date: Optional[str] = None,
    market_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Runs live fundamental scraper/analyzer and technical analyzer."""
    clean_sym = ticker.replace(".NS", "").replace(".BO", "").strip().upper()

    # 1. Fundamental Engine (Live scrape -> improvedfundanalysis)
    fund_results: Dict[str, Any] = {}
    raw_data: Dict[str, Any] = {}
    try:
        raw_data = scraper.scrape_screener_data(clean_sym)
        fund_results = ifa.analyze_fundamentals(raw_data)
        fund_results["sector"] = raw_data.get("COMPANY", {}).get("sector", "N/A")
        fund_results["industry"] = raw_data.get("COMPANY", {}).get("industry", "N/A")
        fund_results["market_cap"] = raw_data.get("COMPANY", {}).get("market_cap")
    except Exception as e:
        failed_raw = scraper.create_failed_fundamental_data(clean_sym, str(e), status="SCRAPER_EXCEPTION")
        raw_data = failed_raw
        fund_results = ifa.analyze_fundamentals(failed_raw)
        fund_results["company"] = display_name or clean_sym

    # 2. Technical Engine
    tech_results: Dict[str, Any] = {}
    if ta and hasattr(ta, "analyze_technical"):
        try:
            tech_results = ta.analyze_technical(ticker, as_of_date=as_of_date)
        except Exception as e:
            tech_results = {"Error": f"Technical error: {e}"}
    else:
        tech_results = {"Scoring_Summary": {"Technical_Score": 50.0}, "Setups_Detected": ["Technical module bypassed"]}

    # 3. Component Scores (Weighted strictly 60/40)
    f_score = _safe_float(fund_results.get("fundamental_score"))
    t_summary = tech_results.get("Scoring_Summary", {})
    t_score = _safe_float(t_summary.get("Technical_Score"))

    overall_score = round((f_score * WEIGHT_FUNDAMENTAL) + (t_score * WEIGHT_TECHNICAL), 1)

    # 4. Common Fundamental Qualification (Section 4)
    fund_qual, fund_failed_reasons, fund_tt = check_fundamental_qualification(fund_results)

    # 5. Priority Classification for 3-Week to 2-Month Swing Trades
    val_risk = str(fund_results.get("valuation", {}).get("risk", "LOW")).strip().upper()
    val_cat = str(fund_results.get("valuation", {}).get("category", "")).strip()
    val_pe = fund_results.get("valuation", {}).get("pe")
    val_pb = fund_results.get("valuation", {}).get("pb")
    strat_eval = tech_results.get("Strategy_Evaluation", {})
    active_strat_res = strat_eval.get("active_strategy_result", {}) if isinstance(strat_eval, dict) else {}
    raw_primary = strat_eval.get("primary_strategy") or active_strat_res.get("strategy_name")
    if not raw_primary or raw_primary in ("None", "NO_ACTIVE_SETUP"):
        primary_strat_name = "NO_ACTIVE_SETUP"
    else:
        primary_strat_name = raw_primary

    # Multi-Factor Fundamental Protection for new institutional strategies:
    # If Rubber Band Snapback triggered, ensure Business Quality >= 40 so we never buy garbage falling knives
    fund_comps = fund_results.get("components", {}) if isinstance(fund_results, dict) else {}
    bq_val = fund_comps.get("Business Quality")
    bq_score = bq_val.score if hasattr(bq_val, "score") else (bq_val.get("score") if isinstance(bq_val, dict) else None)
    if primary_strat_name == "RUBBER_BAND_SNAPBACK" and bq_score is not None and bq_score < 40:
        if active_strat_res.get("signal_triggered"):
            active_strat_res["signal_triggered"] = False
            active_strat_res["state"] = "ENTRY_REJECTED"
            active_strat_res["rejection_reason"] = f"WEAK_BUSINESS_QUALITY ({bq_score}/100)"

    has_active_signal = any(
        res.get("signal_triggered") for res in strat_eval.get("all_strategy_results", {}).values()
    ) if isinstance(strat_eval, dict) else False

    # Macro Regime Governor Assessment
    regime_state = market_context.get("regime", "") if market_context else ""
    regime_score = market_context.get("regime_score") if market_context else None
    is_hostile_regime = (regime_state == "HOSTILE") or (regime_score is not None and regime_score < 30)

    macro_governor = {
        "is_hostile": is_hostile_regime,
        "regime_state": regime_state or "NEUTRAL",
        "regime_score": regime_score if regime_score is not None else 50,
        "sizing_multiplier": 0.5 if is_hostile_regime else 1.0,
        "warning": "⚠️ HOSTILE REGIME: 50% Position Sizing Recommended. High-beta breakouts restricted." if is_hostile_regime else None,
    }

    priority_reason = ""
    if fund_qual and has_active_signal and val_risk != "HIGH":
        priority = "SIGNAL TRIGGERED"
        priority_reason = f"Safety checks passed and active technical entry trigger confirmed ({primary_strat_name})."
    elif (f_score is not None and f_score >= HIGH_PRIORITY_MIN_FUND) and (t_score is not None and t_score >= HIGH_PRIORITY_MIN_TECH) and val_risk != "HIGH":
        priority = "HIGH PRIORITY"
        priority_reason = "High fundamental quality & strong trend; waiting for entry breakout/pullback trigger."
    elif val_risk == "HIGH":
        priority = "AVOID / FILTERED OUT"
        pe_str = f"P/E {val_pe}x" if val_pe else (f"P/B {val_pb}x" if val_pb else "extreme multiples")
        priority_reason = f"High Valuation Risk ({val_cat} at {pe_str}). Safe-entry rules reject buying overvalued stocks."
    elif (f_score is not None and f_score < AVOID_MAX_FUND) or f_score is None:
        priority = "AVOID / FILTERED OUT"
        priority_reason = f"Weak Fundamentals (Score {f_score or 'N/A'}/100 < 40). Company finances do not meet minimum safety bar."
    elif not fund_qual:
        priority = "AVOID / FILTERED OUT"
        reasons_summary = "; ".join(fund_failed_reasons[:2]) if fund_failed_reasons else "Failed fundamental criteria"
        priority_reason = f"Fundamental criteria failed ({reasons_summary})."
    else:
        priority = "WATCHLIST"
        if not has_active_signal:
            priority_reason = "Solid fundamentals, but no active swing trigger formed yet."
        else:
            priority_reason = "Under review on watchlist."

    # Assemble unified deterministic truth table
    deterministic_truth_table: Dict[str, Any] = {
        "fundamentals": fund_tt,
        "trend_qualification": strat_eval.get("trend_truth_table", []),
        "active_strategy": active_strat_res.get("truth_table", []),
    }

    # Contextual Evidence Layers (Observational only)
    announcements = raw_data.get("OTHER_DATA", {}).get("recent_announcements", []) if isinstance(raw_data, dict) else []
    event_risk_info = evaluate_event_risk(announcements, as_of_date=as_of_date)
    tech_evidence = tech_results.get("Evidence_Context", {}) if isinstance(tech_results, dict) else {}

    evidence_context = {
        "weekly_trend": tech_evidence.get("weekly_trend", {}),
        "rvol": tech_evidence.get("rvol", {}),
        "atr": tech_evidence.get("atr", {}),
        "event_risk": event_risk_info,
        "is_evidence_only": True,
        "disclaimer": "Observational evidence layers for context; not hard strategy qualification filters."
    }

    # Extract exact trade levels for root candidate object
    current_price = tech_results.get("Trend_Analysis", {}).get("Current_Price")
    stop_price = active_strat_res.get("stop_price")
    target_1 = active_strat_res.get("target_1")
    target_2 = active_strat_res.get("target_2")
    risk_reward_ratio = active_strat_res.get("risk_reward_ratio")

    # Temporal & Reproducibility metadata
    is_live = as_of_date is None
    eval_as_of = as_of_date if as_of_date else datetime.now().strftime("%Y-%m-%d")
    audit_metadata = {
        "engine_version": ENGINE_VERSION,
        "strategy_version": STRATEGY_VERSION,
        "scoring_version": SCORING_VERSION,
        "as_of_date": eval_as_of,
        "generated_at": datetime.now().isoformat(),
        "point_in_time_technicals": True,
        "fundamental_point_in_time": is_live,
        "temporal_disclaimer": "Live evaluation using current market and fundamental reports." if is_live else "TTM fundamentals sourced from latest available report; historical point-in-time filing dates are unanchored."
    }

    return {
        "name": display_name or fund_results.get("company", clean_sym),
        "company_name": display_name or fund_results.get("company", clean_sym),
        "ticker": clean_sym,
        "overall_score": overall_score,
        "priority": priority,
        "priority_reason": priority_reason,
        "setup_type": primary_strat_name,
        "current_price": current_price,
        "stop_loss": stop_price,
        "target_1": target_1,
        "target_2": target_2,
        "risk_reward_ratio": risk_reward_ratio,
        "fundamental_qualified": fund_qual,
        "fundamental_failed_reasons": fund_failed_reasons,
        "fundamental_truth_table": fund_tt,
        "deterministic_truth_table": deterministic_truth_table,
        "evidence_context": evidence_context,
        "audit_metadata": audit_metadata,
        "sector": fund_results.get("sector", "N/A"),
        "industry": fund_results.get("industry", "N/A"),
        "fundamentals": fund_results,
        "technicals": tech_results,
        "strategy": strat_eval,
        "macro_governor": macro_governor,
    }


def analyze_universe(
    candidates: List[Union[Dict[str, str], str]],
    market_context: Optional[Dict[str, Any]] = None,
    verbose: bool = True,
    as_of_date: Optional[str] = None
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Evaluates a universe of candidates, returning a tuple of:
    (evaluated_candidates_list, market_regime_context)
    """
    if market_context is None:
        if verbose:
            print("[*] Fetching Market Regime (NIFTY 50)...")
        market_context = mr.analyze_market_regime(as_of_date=as_of_date)

    evaluated_candidates: List[Dict[str, Any]] = []
    total = len(candidates)

    tickers_to_fetch = [c.get("ticker", "") if isinstance(c, dict) else str(c) for c in candidates]
    # 1. Batch prefetch technicals across universe in 1 single HTTP download
    if ta and hasattr(ta, "prefetch_batch_ohlcv"):
        if verbose:
            print(f"[*] Batch downloading live price charts for {len(tickers_to_fetch)} stocks from Yahoo Finance...")
        ta.prefetch_batch_ohlcv(tickers_to_fetch)

    # 2. Batch prefetch Screener fundamental HTML & charts in parallel threads (8 max_workers)
    if hasattr(scraper, "prefetch_screener_universe"):
        scraper.prefetch_screener_universe(tickers_to_fetch, max_workers=8, verbose=verbose)

    if verbose:
        print(f"[*] Commencing candidate screening across {total} stocks...\n")

    for idx, c in enumerate(candidates, 1):
        if isinstance(c, dict):
            sym = c.get("ticker", "")
            dname = c.get("name")
        else:
            sym = str(c)
            dname = None

        if verbose:
            print(f"[{idx}/{total}] Processing {sym}...")
        result = analyze_candidate(sym, dname, as_of_date=as_of_date, market_context=market_context)
        evaluated_candidates.append(result)

    # Sort descending by overall consolidated swing score
    evaluated_candidates.sort(key=lambda x: x["overall_score"], reverse=True)
    return evaluated_candidates, market_context


def main() -> None:
    # 1. Candidates to evaluate
    candidates = [
        {"name": "ICICI Bank Ltd.", "ticker": "ICICIBANK.NS"},
        {"name": "Tata Consultancy Services Ltd.", "ticker": "TCS.NS"},
        {"name": "Vodafone Idea Ltd.", "ticker": "IDEA.NS"},
    ]

    evaluated_candidates, market_context = analyze_universe(candidates, verbose=True)

    # 2. Print Unified Report
    print("\n" + render_market_regime_banner(market_context))

    for item in evaluated_candidates:
        print(render_stock_report(item, market_context))


if __name__ == "__main__":
    main()