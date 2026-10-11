"""
improvedfundanalysis.py - Production Fundamental Analysis Engine (Module 1)
Target Horizon: 3 weeks to 2 months (NSE Swing System)

Usage:
    python improvedfundanalysis.py <TICKER>
"""

from __future__ import annotations

import math
import sys
from typing import Any, Dict, List, Optional, Tuple

import screener_scraper as scraper

# =====================================================================
# 1. SCORING WEIGHTS & CONSTANTS
# =====================================================================

WEIGHTS = {
    "Business Quality": 0.20,
    "Growth & Earnings": 0.20,
    "Financial Health": 0.15,
    "Earnings Quality": 0.10,
    "Current Momentum": 0.20,
    "Ownership & Governance": 0.10,
    "Sector / Industry": 0.05,
}

EXPECTED_FIELDS_BY_TYPE = {
    "GENERAL": [
        "roe", "roce", "profit_5y_cagr", "sales_5y_cagr",
        "recent_sales_yoy", "recent_profit_yoy", "debt_to_equity",
        "interest_coverage", "cfo", "promoter_holding", "pe", "pb"
    ],
    "BANK": [
        "roe", "profit_5y_cagr", "recent_sales_yoy", "recent_profit_yoy",
        "car", "gnpa", "nnpa", "fii_holding", "dii_holding", "pe", "pb"
    ],
    "NBFC": [
        "roe", "profit_5y_cagr", "recent_sales_yoy", "recent_profit_yoy",
        "car", "gnpa", "nnpa", "fii_holding", "dii_holding", "pe", "pb"
    ],
    "INSURANCE": [
        "roe", "profit_5y_cagr", "recent_sales_yoy", "recent_profit_yoy",
        "fii_holding", "dii_holding", "pe", "pb"
    ],
    "OTHER_FINANCIAL": [
        "roe", "profit_5y_cagr", "recent_sales_yoy", "recent_profit_yoy",
        "fii_holding", "dii_holding", "pe", "pb"
    ]
}

# Fields that are legitimately N/A for specific financial archetypes and should never be penalized
LEGITIMATELY_NA_FIELDS = {
    "BANK": ["roce", "debt_to_equity", "interest_coverage", "cfo", "operating_margin", "opm", "ebitda"],
    "NBFC": ["roce", "debt_to_equity", "interest_coverage", "cfo", "operating_margin", "opm", "ebitda"],
    "INSURANCE": ["roce", "debt_to_equity", "interest_coverage", "cfo", "operating_margin", "opm", "ebitda"],
    "OTHER_FINANCIAL": ["roce", "debt_to_equity", "interest_coverage", "cfo"],
    "GENERAL": []
}


# =====================================================================
# 2. NUMERIC & NORMALIZATION UTILITIES
# =====================================================================

def safe_float(val: Any) -> Optional[float]:
    """Safely cast value to float or return None."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        if math.isnan(val) or math.isinf(val):
            return None
        return float(val)
    if isinstance(val, str):
        v = val.strip().replace(",", "").replace("₹", "").replace("%", "").replace("Cr.", "").replace("Cr", "").strip()
        if not v or v.upper() in ("N/A", "NA", "-", "NONE", "NULL"):
            return None
        try:
            return float(v)
        except ValueError:
            return None
    return None


def num(val: Any) -> float:
    """Safe helper exclusively for relational comparisons (> 0)."""
    res = safe_float(val)
    return res if res is not None else 0.0


def fmt_pct(val: Any, signed: bool = False) -> str:
    v = safe_float(val)
    if v is None:
        return "N/A"
    sign = "+" if (signed and v > 0) else ""
    return f"{sign}{v:.1f}%"


def fmt_val(val: Any, suffix: str = "", decimals: int = 1) -> str:
    v = safe_float(val)
    if v is None:
        return "N/A"
    return f"{v:.{decimals}f}{suffix}"


# =====================================================================
# 3. ARCHETYPE CLASSIFICATION
# =====================================================================

def classify_company_archetype(data: Dict[str, Any]) -> Tuple[str, str]:
    """Classifies into: BANK, NBFC, INSURANCE, OTHER_FINANCIAL, or GENERAL."""
    comp = data.get("COMPANY", {})
    if comp.get("company_type"):
        return str(comp["company_type"]).upper(), comp.get("company_type_confidence", "HIGH")

    name = str(comp.get("company_name", "")).strip().lower()
    ind = str(comp.get("industry", "")).strip().lower()
    sec = str(comp.get("sector", "")).strip().lower()

    if any(k in ind for k in ["banks - private", "banks - public", "banking", "bank"]) or "bank" in name:
        return "BANK", "HIGH"
    if any(k in ind for k in ["insurance"]) or "insurance" in name:
        return "INSURANCE", "HIGH"
    if any(k in ind for k in ["nbfc", "housing finance", "finance - housing", "microfinance", "lending"]):
        return "NBFC", "HIGH"
    if ("finance" in name or "capital" in name) and ("financial" in sec or "finance" in sec):
        return "NBFC", "MEDIUM"
    if any(k in ind for k in ["asset management", "amc", "broking", "brokerage", "capital markets", "exchange"]):
        return "OTHER_FINANCIAL", "HIGH"
    if "financial" in sec or "finance" in sec:
        return "OTHER_FINANCIAL", "MEDIUM"

    return "GENERAL", "HIGH"


# =====================================================================
# 4. DATA COMPLETENESS EVALUATION (ALIAS-AWARE)
# =====================================================================

def evaluate_data_completeness(data: Dict[str, Any], company_type: str) -> Tuple[float, str, Dict[str, Any]]:
    expected = EXPECTED_FIELDS_BY_TYPE.get(company_type, EXPECTED_FIELDS_BY_TYPE["GENERAL"])
    legit_na = LEGITIMATELY_NA_FIELDS.get(company_type, [])
    
    # Flatten source data
    flat = {}
    for block in ["VALUATION", "ANNUAL_FINANCIALS", "QUARTERLY_FINANCIALS", "BALANCE_SHEET", "RATIOS", "SHAREHOLDING"]:
        for k, v in data.get(block, {}).items():
            flat[k.lower()] = v

    # Inject standard aliases to fix completeness counter
    flat["pe"] = flat.get("current_pe", flat.get("pe"))
    flat["pb"] = flat.get("p_b", flat.get("pb"))
    flat["fii_holding"] = flat.get("fii_holding", flat.get("fii_pct"))
    flat["dii_holding"] = flat.get("dii_holding", flat.get("dii_pct"))
    flat["promoter_holding"] = flat.get("promoter_holding", flat.get("promoter_pct"))

    present_fields = []
    missing_fields = []
    malformed_fields = []

    for f in expected:
        raw_val = flat.get(f.lower())
        if raw_val is None:
            missing_fields.append(f)
        else:
            val_float = safe_float(raw_val)
            if val_float is not None:
                present_fields.append(f)
            else:
                malformed_fields.append(f)

    available = len(present_fields)
    completeness = round((available / len(expected)) * 100.0, 1) if expected else 0.0

    if completeness >= 75.0:
        confidence = "HIGH"
    elif completeness >= 45.0:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    details = {
        "expected_fields": expected,
        "present_fields": present_fields,
        "missing_fields": missing_fields,
        "legitimately_na_fields": legit_na,
        "malformed_fields": malformed_fields,
    }

    return completeness, confidence, details


# =====================================================================
# 5. COMPONENT SCORING (N/A-AWARE)
# =====================================================================

class ComponentResult:
    def __init__(self, score: Optional[float], coverage: float, assessment: str, metrics: Dict[str, Any]):
        self.score = score
        self.coverage = coverage
        self.assessment = assessment
        self.metrics = metrics


def score_business_quality(data: Dict[str, Any], company_type: str) -> ComponentResult:
    ratios = data.get("RATIOS", {})
    ann = data.get("ANNUAL_FINANCIALS", {})

    roce = safe_float(ratios.get("ROCE"))
    roe = safe_float(ratios.get("ROE"))
    s_cagr = safe_float(ann.get("sales_5y_cagr")) or safe_float(ann.get("sales_3y_cagr"))
    p_cagr = safe_float(ann.get("profit_5y_cagr")) or safe_float(ann.get("profit_3y_cagr"))

    applicable = ["roe", "profit_growth_5yr", "sales_growth_5yr"]
    if company_type == "GENERAL":
        applicable.append("roce")

    available = sum(1 for m in [roe, p_cagr, s_cagr] if m is not None)
    if company_type == "GENERAL" and roce is not None:
        available += 1
    coverage = available / len(applicable)

    if coverage < 0.33:
        return ComponentResult(None, coverage, "Insufficient historical compounding data to establish moat.", {})

    points = []
    if company_type in ("BANK", "NBFC"):
        if roe is not None:
            if roe >= 16.0: points.append(90)
            elif roe >= 12.0: points.append(75)
            elif roe >= 8.0: points.append(50)
            else: points.append(25)
        if p_cagr is not None:
            if p_cagr >= 15.0: points.append(90)
            elif p_cagr >= 10.0: points.append(75)
            elif p_cagr >= 0.0: points.append(50)
            else: points.append(20)
        points.append(75)  # Stability buffer for regulated credit entities
        desc = f"Regulated financial franchise delivering ROE of {fmt_pct(roe)} with multi-year PAT growth of {fmt_pct(p_cagr)}."
    else:
        if roce is not None:
            if roce >= 22.0: points.append(90)
            elif roce >= 15.0: points.append(75)
            elif roce >= 10.0: points.append(50)
            else: points.append(20)
        if roe is not None:
            if roe >= 18.0: points.append(90)
            elif roe >= 12.0: points.append(70)
            else: points.append(40)
        if p_cagr is not None:
            if p_cagr >= 15.0: points.append(85)
            elif p_cagr >= 8.0: points.append(65)
            else: points.append(30)
        desc = f"Franchise capital efficiency: ROCE {fmt_pct(roce)}, ROE {fmt_pct(roe)}, 5Y PAT CAGR {fmt_pct(p_cagr)}."

    score = round(sum(points) / len(points), 1) if points else None
    return ComponentResult(score, coverage, desc, {
        "ROCE": roce if company_type == "GENERAL" else f"{fmt_pct(roce)} (Not primary for {company_type})",
        "ROE": roe, "5Y Profit CAGR": p_cagr, "5Y Sales CAGR": s_cagr
    })


def score_growth_earnings(data: Dict[str, Any], company_type: str) -> ComponentResult:
    qrt = data.get("QUARTERLY_FINANCIALS", {})
    s_yoy = safe_float(qrt.get("recent_sales_yoy"))
    p_yoy = safe_float(qrt.get("recent_profit_yoy"))
    s_accel = safe_float(qrt.get("sales_acceleration"))
    p_accel = safe_float(qrt.get("profit_acceleration"))

    applicable = [s_yoy, p_yoy]
    available = sum(1 for m in applicable if m is not None)
    coverage = available / len(applicable)

    if coverage == 0:
        return ComponentResult(None, 0.0, "No recent quarterly revenue or earnings prints available.", {})

    # Coherent Acceleration & Deceleration Framework
    is_growth_pos = (p_yoy is not None and p_yoy > 0)
    
    if is_growth_pos and (p_accel is not None and p_accel >= 2.0) and (s_accel is not None and s_accel >= 0.0):
        regime = "Strong acceleration"
        base_score = 85.0
    elif is_growth_pos and (p_accel is not None and p_accel > 0):
        regime = "Moderate acceleration"
        base_score = 72.0
    elif is_growth_pos and (p_accel is not None and p_accel < -3.0):
        regime = "Weakening growth momentum (Decelerating earnings)"
        base_score = 42.0
    elif is_growth_pos:
        regime = "Stable/moderate growth"
        base_score = 58.0
    elif (p_yoy is not None and p_yoy < 0):
        regime = "Earnings contraction"
        base_score = 25.0
    else:
        regime = "Mixed growth profile"
        base_score = 50.0

    final_score = round(max(5.0, min(95.0, base_score)), 1)
    p_acc_str = f"{p_accel:+.1f}% pts" if p_accel is not None else "N/A"
    desc = f"{regime}: Latest earnings up {fmt_pct(p_yoy, signed=True)} YoY on revenue of {fmt_pct(s_yoy, signed=True)} (Profit Accel: {p_acc_str})."

    return ComponentResult(final_score, coverage, desc, {
        "Sales YoY": s_yoy, "Profit YoY": p_yoy, "Sales Accel": s_accel, "Profit Accel": p_accel
    })


def score_financial_health(data: Dict[str, Any], company_type: str) -> ComponentResult:
    bs = data.get("BALANCE_SHEET", {})
    ann = data.get("ANNUAL_FINANCIALS", {})
    cfo = safe_float(ann.get("CFO"))
    net_profit = safe_float(ann.get("latest_profit"))

    if company_type in ("BANK", "NBFC"):
        car = safe_float(data.get("RATIOS", {}).get("CAR"))
        gnpa = safe_float(data.get("RATIOS", {}).get("GNPA"))
        nnpa = safe_float(data.get("RATIOS", {}).get("NNPA"))

        metrics_dict = {
            "Debt/Equity": f"NOT_APPLICABLE ({company_type} deposit/borrowing model)",
            "Interest Coverage": "NOT_APPLICABLE (Operating spread/cost of funds)",
            "CFO": cfo
        }

        if car is None and gnpa is None and nnpa is None:
            score = 75.0 if (cfo is not None and cfo > 0) else 65.0
            desc = "Regulated credit institution. Generic D/E and ICR are marked NOT APPLICABLE."
            return ComponentResult(score, 0.4, desc, metrics_dict)

        points = []
        if car is not None: points.append(90 if car >= 15.0 else 60)
        if nnpa is not None: points.append(90 if nnpa <= 1.0 else 50)
        score = round(sum(points) / len(points), 1)
        return ComponentResult(score, 0.8, "Prudential capital adequacy and asset quality verified.", metrics_dict)

    # GENERAL Industrial Companies
    de = safe_float(bs.get("debt_to_equity"))
    ic = safe_float(bs.get("interest_coverage"))

    applicable = [de, ic]
    available = sum(1 for m in applicable if m is not None)
    coverage = available / len(applicable)

    if coverage == 0:
        return ComponentResult(None, 0.0, "Solvency and leverage metrics missing from feed.", {})

    points = []
    desc_extra = ""

    if de is not None:
        if de == -999.0:
            points.append(0.0)  # Max penalty: Equity wiped out
            desc_extra = "Severe distress: Negative Net Worth (Accumulated losses have completely eroded capital)."
        elif de == 0.0:
            points.append(100.0)
        elif de <= 0.2: points.append(95.0)
        elif de <= 0.6: points.append(80.0)
        elif de <= 1.0: points.append(60.0)
        elif de <= 1.8: points.append(35.0)
        else: points.append(10.0)

    if ic is not None:
        if ic >= 8.0: points.append(95.0)
        elif ic >= 4.0: points.append(75.0)
        elif ic >= 2.0: points.append(50.0)
        elif ic >= 1.0: points.append(25.0)
        else: points.append(5.0)

    score = round(sum(points) / len(points), 1) if points else None
    
    de_display = "NEGATIVE EQUITY" if de == -999.0 else (f"{de:.2f}x" if de is not None else "N/A")
    desc = desc_extra if desc_extra else f"Balance sheet gearing: D/E at {de_display} with Interest Coverage of {fmt_val(ic, 1)}x."
    
    return ComponentResult(score, coverage, desc, {"Debt/Equity": de_display, "Interest Coverage": ic, "CFO": cfo})


def score_earnings_quality(data: Dict[str, Any], company_type: str) -> ComponentResult:
    ann = data.get("ANNUAL_FINANCIALS", {})
    cfo = safe_float(ann.get("CFO"))
    net_profit = safe_float(ann.get("latest_profit"))
    other_income = safe_float(ann.get("other_income"))
    pbt = safe_float(ann.get("PBT"))

    cfo_pat = (cfo / net_profit) if (cfo is not None and net_profit is not None and net_profit > 0) else None

    if company_type in ("BANK", "NBFC"):
        if cfo_pat is None:
            return ComponentResult(None, 0.0, "Bank operational cash flow conversion unavailable.", {})
        
        score = 72.0 if cfo_pat >= 1.0 else (55.0 if cfo_pat >= 0.5 else 40.0)
        desc = f"Operating cash generation relative to profit stands at {fmt_val(cfo_pat, 2)}x. Non-interest income treated as operational."
        return ComponentResult(score, 0.5, desc, {"CFO / Net Profit": cfo_pat, "Other Income": "Operational (Fee/Treasury)"})

    # GENERAL Companies
    if cfo_pat is None:
        return ComponentResult(None, 0.0, "Operating cash flow realization data missing.", {})

    if cfo_pat >= 1.2: base = 85.0
    elif cfo_pat >= 0.9: base = 75.0
    elif cfo_pat >= 0.6: base = 55.0
    elif cfo_pat > 0: base = 35.0
    else: base = 15.0

    oi_ratio = (other_income / pbt) if (other_income is not None and pbt is not None and pbt > 0) else None
    if oi_ratio is not None and oi_ratio > 0.30:
        base -= 15.0

    final_score = round(max(5.0, min(95.0, base)), 1)
    desc = f"Cash flow conversion: CFO is {fmt_val(cfo_pat, 2)}x reported profit."
    return ComponentResult(final_score, 0.8, desc, {"CFO / Net Profit": cfo_pat, "Other Income / PBT": fmt_pct(oi_ratio * 100 if oi_ratio else None)})


def score_current_momentum(data: Dict[str, Any], company_type: str) -> ComponentResult:
    qrt = data.get("QUARTERLY_FINANCIALS", {})
    p_accel = safe_float(qrt.get("profit_acceleration"))
    s_accel = safe_float(qrt.get("sales_acceleration"))
    p_yoy = safe_float(qrt.get("recent_profit_yoy"))

    if p_accel is None and p_yoy is None:
        return ComponentResult(None, 0.0, "No quarterly momentum or acceleration metrics available.", {})

    score = 50.0
    if p_accel is not None:
        if p_accel >= 5.0: score += 25.0
        elif p_accel >= 2.0: score += 15.0
        elif p_accel >= 0.0: score += 5.0
        elif p_accel >= -5.0: score -= 10.0
        else: score -= 25.0

    if p_yoy is not None:
        if p_yoy >= 15.0: score += 12.0
        elif p_yoy >= 8.0: score += 6.0
        elif p_yoy < 0.0: score -= 15.0

    final_score = round(max(10.0, min(95.0, score)), 1)
    p_acc_str = f"{p_accel:+.1f}% pts" if p_accel is not None else "N/A"
    desc = f"Near-term operational inflection score {final_score:.0f}/100 with Profit Accel at {p_acc_str}."
    return ComponentResult(final_score, 0.8, desc, {"Profit Accel": p_accel, "Sales Accel": s_accel})


def score_ownership_governance(data: Dict[str, Any], company_type: str) -> ComponentResult:
    sh = data.get("SHAREHOLDING", {})
    
    # Safely pull exact keys or known aliases from scraper
    prom = safe_float(sh.get("promoter_holding", sh.get("promoter_pct")))
    prom_qoq = safe_float(sh.get("promoter_qoq_change"))
    pledge = safe_float(sh.get("promoter_pledge", sh.get("promoter_pledge_pct")))
    fii = safe_float(sh.get("fii_holding", sh.get("FII_pct")))
    fii_qoq = safe_float(sh.get("fii_qoq_change"))
    dii = safe_float(sh.get("dii_holding", sh.get("DII_pct")))
    dii_qoq = safe_float(sh.get("dii_qoq_change"))

    total_inst = (fii or 0.0) + (dii or 0.0)
    has_data = any(x is not None for x in [prom, fii, dii])

    if not has_data:
        return ComponentResult(None, 0.0, "Shareholding pattern details unstated.", {
            "Promoter": prom, "FII": fii, "DII": dii
        })

    is_widely_held = (company_type == "BANK") or ((prom is None or prom == 0.0) and total_inst >= 55.0)

    score = 60.0
    if is_widely_held and (prom is None or prom == 0.0):
        score += 20.0
        desc = f"Professionally managed, board-run enterprise backed by {fmt_pct(total_inst)} institutional float."
    elif prom is not None:
        if prom >= 65.0: score += 15.0
        elif prom >= 50.0: score += 10.0
        elif prom < 30.0: score -= 10.0
        desc = f"Promoter ownership stands at {fmt_pct(prom)} (QoQ change: {fmt_pct(prom_qoq, signed=True)})."
    else:
        desc = "Shareholding pattern evaluated primarily on institutional backing."

    if pledge is not None:
        if pledge == 0.0: score += 10.0
        elif pledge >= 25.0: score -= 25.0

    inst_delta = (fii_qoq or 0.0) + (dii_qoq or 0.0)
    if inst_delta >= 1.0: score += 8.0
    elif inst_delta <= -1.5: score -= 8.0

    final_score = round(max(10.0, min(95.0, score)), 1)
    return ComponentResult(final_score, 0.8, desc, {
        "Promoter": prom, "Promoter QoQ": prom_qoq, "Pledge": pledge,
        "FII": fii, "FII QoQ": fii_qoq, "DII": dii, "DII QoQ": dii_qoq
    })


SECTOR_PE_BENCHMARKS = {
    "information technology": 26.0,
    "it - software": 26.0,
    "software": 26.0,
    "computers": 25.0,
    "financial services": 18.0,
    "banking": 17.5,
    "bank": 17.5,
    "private sector bank": 18.0,
    "public sector bank": 10.0,
    "nbfc": 22.0,
    "finance": 20.0,
    "healthcare": 32.0,
    "pharmaceuticals": 32.0,
    "pharma": 32.0,
    "biotechnology": 34.0,
    "fast moving consumer goods": 38.0,
    "fmcg": 38.0,
    "consumer goods": 35.0,
    "automobile": 24.0,
    "auto": 24.0,
    "auto components": 26.0,
    "energy": 16.0,
    "oil": 15.0,
    "gas": 15.0,
    "petrochemicals": 15.0,
    "power": 20.0,
    "utilities": 19.0,
    "metals": 13.0,
    "steel": 12.0,
    "mining": 12.0,
    "capital goods": 32.0,
    "infrastructure": 24.0,
    "construction": 24.0,
    "chemicals": 30.0,
    "specialty chemicals": 32.0,
    "telecommunication": 28.0,
    "telecom": 28.0,
    "textiles": 19.0,
    "cement": 27.0,
    "realty": 28.0,
    "real estate": 28.0,
    "consumer durables": 42.0,
    "consumer services": 40.0,
    "retail": 45.0,
}


def score_sector_industry(data: Dict[str, Any], company_type: str) -> ComponentResult:
    pe = safe_float(data.get("VALUATION", {}).get("current_PE"))
    peer_pe = safe_float(data.get("PEER_DATA", {}).get("peer_PE_avg"))
    sec_name = str(data.get("COMPANY", {}).get("sector") or "").strip()
    ind_name = str(data.get("COMPANY", {}).get("industry") or "").strip()
    med_5y = safe_float(data.get("VALUATION", {}).get("historical_PE_median_5y", data.get("VALUATION", {}).get("historical_PE_median")))

    bench_pe: Optional[float] = peer_pe
    source_label = "direct peer average"

    if bench_pe is None:
        target_str = f"{ind_name} {sec_name}".lower()
        matched_benchmark = None
        for key, val in SECTOR_PE_BENCHMARKS.items():
            if key in target_str:
                matched_benchmark = val
                source_label = f"{sec_name or ind_name or key.title()} industry baseline"
                break
        
        if matched_benchmark is not None:
            bench_pe = matched_benchmark
        else:
            bench_pe = 18.0 if company_type in ("BANK", "NBFC") else 24.0
            source_label = f"{sec_name or 'Broad market'} sector baseline"

    if pe is None or pe <= 0:
        desc = f"Company is loss-making or has non-meaningful P/E, trailing {source_label} ({fmt_val(bench_pe)}x)."
        if med_5y is not None:
            desc += f" (5Y historical median: {fmt_val(med_5y)}x)."
        return ComponentResult(
            35.0,
            0.5,
            desc,
            {"Company PE": pe, "Benchmark PE": bench_pe, "Benchmark Type": source_label, "Sector": sec_name or ind_name}
        )

    rel_val = pe / bench_pe
    score = 60.0
    if 0.75 <= rel_val <= 1.25:
        score = 68.0
        desc = f"Valuation ({fmt_val(pe)}x) trades in-line with {source_label} ({fmt_val(bench_pe)}x)."
    elif rel_val < 0.75:
        score = 82.0
        desc = f"Attractive valuation discount against {source_label} ({fmt_val(pe)}x vs {fmt_val(bench_pe)}x)."
    elif rel_val <= 1.6:
        score = 52.0
        desc = f"Trades at a moderate premium to {source_label} ({fmt_val(pe)}x vs {fmt_val(bench_pe)}x)."
    else:
        score = 38.0
        desc = f"Trades at an elevated premium against {source_label} ({fmt_val(pe)}x vs {fmt_val(bench_pe)}x)."

    if med_5y is not None:
        desc += f" (5Y historical median: {fmt_val(med_5y)}x)."

    final_score = round(max(10.0, min(95.0, score)), 1)
    return ComponentResult(
        final_score,
        0.6,
        desc,
        {"Company PE": pe, "Benchmark PE": bench_pe, "Benchmark Type": source_label, "Sector": sec_name or ind_name}
    )



# =====================================================================
# 6. CONTEXTUAL ENGINES (VALUATION, SIGNALS, RED FLAGS)
# =====================================================================

def evaluate_valuation(data: Dict[str, Any], company_type: str) -> Dict[str, Any]:
    val = data.get("VALUATION", {})
    cmp = safe_float(data.get("COMPANY", {}).get("current_price"))
    pe = safe_float(val.get("current_PE"))
    pb = safe_float(val.get("P_B"))
    bvps = safe_float(val.get("book_value_per_share"))

    # Compute P/B if missing
    if pb is None and cmp is not None and bvps is not None and bvps > 0:
        pb = round(cmp / bvps, 2)

    # Check for Capital Erosion / Negative Net Worth / Distressed
    if (bvps is not None and bvps < 0) or (pb is not None and pb < 0):
        cat = "Capital Erosion / Negative Net Worth"
        risk = "HIGH"
    elif pe is None and (pb is None or pb <= 0):
        cat = "Loss-Making / Distressed"
        risk = "HIGH"
    elif company_type in ("BANK", "NBFC"):
        if pb is not None and pb > 0:
            if pb < 1.3: cat, risk = "Deep Value / Discounted", "LOW"
            elif pb <= 2.8: cat, risk = "Fairly Valued to Reasonable", "LOW"
            elif pb <= 4.2: cat, risk = "Quality Premium", "MODERATE"
            else: cat, risk = "Rich / Stretched Multiples", "HIGH"
        else:
            cat, risk = "Fairly Valued", "LOW"
    else:
        if pe is not None and pe > 0:
            if pe < 15.0: cat, risk = "Undervalued / Value", "LOW"
            elif pe <= 35.0: cat, risk = "Fair Valuation", "LOW"
            elif pe <= 60.0: cat, risk = "Growth Premium", "MODERATE"
            else: cat, risk = "Expensive Multiples", "HIGH"
        else:
            cat, risk = "Loss-Making / Distressed", "HIGH"

    med_5y = safe_float(val.get("historical_PE_median_5y", val.get("historical_PE_median")))
    med_3y = safe_float(val.get("historical_PE_median_3y"))

    return {
        "pe": pe, 
        "pb": pb, 
        "bvps": bvps, 
        "category": cat, 
        "risk": risk,
        "historical_pe_median_5y": med_5y,
        "historical_pe_median_3y": med_3y
    }


def extract_positive_signals(data: Dict[str, Any], company_type: str) -> List[str]:
    signals = []
    qrt = data.get("QUARTERLY_FINANCIALS", {})
    ann = data.get("ANNUAL_FINANCIALS", {})
    sh = data.get("SHAREHOLDING", {})
    ratios = data.get("RATIOS", {})

    p_yoy = safe_float(qrt.get("recent_profit_yoy"))
    p_accel = safe_float(qrt.get("profit_acceleration"))
    s_yoy = safe_float(qrt.get("recent_sales_yoy"))
    roe = safe_float(ratios.get("ROE"))
    roce = safe_float(ratios.get("ROCE"))
    p_cagr = safe_float(ann.get("profit_5y_cagr"))
    net_profit = safe_float(ann.get("latest_profit"))

    pledge = safe_float(sh.get("promoter_pledge", sh.get("promoter_pledge_pct")))
    fii = safe_float(sh.get("fii_holding", sh.get("FII_pct")))
    dii = safe_float(sh.get("dii_holding", sh.get("DII_pct")))

    # Determine if company is fundamentally loss-making or distressed
    is_loss_making = (net_profit is not None and net_profit <= 0) or (roce is not None and roce < 0) or (roe is not None and roe < 0)

    # 1. Profit Growth & Inflection (Differentiates true profits from narrowed losses)
    if p_yoy is not None and p_accel is not None and p_accel > 0:
        if not is_loss_making and (net_profit is not None and net_profit > 0):
            signals.append(f"Net profit grew rapidly by {fmt_pct(p_yoy, signed=True)} compared to last year (+{p_accel:.1f}% faster than prior quarter).")
        else:
            signals.append(f"Loss reduction trajectory: Quarterly net loss narrowed by {fmt_pct(p_yoy)} YoY.")
    elif p_yoy is not None and p_yoy >= 12.0:
        if not is_loss_making and (net_profit is not None and net_profit > 0):
            signals.append(f"Healthy net profit growth of {fmt_pct(p_yoy, signed=True)} compared to last year.")
        else:
            signals.append(f"Loss reduction: Quarterly net loss narrowed by {fmt_pct(p_yoy)} YoY.")

    # 2. Revenue Momentum
    if s_yoy is not None and s_yoy >= 8.0:
        signals.append(f"Sales revenue grew by {fmt_pct(s_yoy, signed=True)} compared to last year.")

    # 3. Capital Efficiency (ROE / ROCE)
    if roe is not None and roe >= 15.0:
        signals.append(f"High Return on Equity (ROE: {fmt_pct(roe)}): Generates strong profit on shareholder investment.")

    if company_type == "GENERAL" and roce is not None and roce >= 18.0:
        signals.append(f"Strong Return on Capital (ROCE: {fmt_pct(roce)}): Uses invested money efficiently to generate income.")

    # 4. Multi-Year Compounding (Only eligible if business is profitable)
    if p_cagr is not None and p_cagr >= 15.0 and not is_loss_making:
        signals.append(f"Consistent multi-year growth: 5-year average annual profit growth of {fmt_pct(p_cagr)}.")

    # 5. Ownership & Governance Signals
    if pledge is not None and pledge == 0.0:
        signals.append("Zero promoter debt pledge (0.0%): Company founders have not borrowed loans against their shares.")

    total_inst = (fii or 0.0) + (dii or 0.0)
    if total_inst >= 60.0:
        signals.append(f"Strong institutional ownership: {fmt_pct(total_inst)} of shares owned by institutional funds (Foreign: {fmt_pct(fii)}, Domestic: {fmt_pct(dii)}).")

    return signals


def extract_red_flags(data: Dict[str, Any], company_type: str) -> List[Dict[str, str]]:
    flags = []
    bs = data.get("BALANCE_SHEET", {})
    ann = data.get("ANNUAL_FINANCIALS", {})
    sh = data.get("SHAREHOLDING", {})
    corp = data.get("CORPORATE_DATA", {})

    pledge = safe_float(sh.get("promoter_pledge", sh.get("promoter_pledge_pct")))
    if pledge is not None and pledge >= 20.0:
        flags.append({"name": "High Promoter Pledge", "severity": "HIGH", "metric": f"{pledge:.1f}%", "explanation": "Founders have borrowed heavily using their company shares as collateral."})

    if company_type not in ("BANK", "NBFC"):
        de = safe_float(bs.get("debt_to_equity"))
        ic = safe_float(bs.get("interest_coverage"))
        if de is not None and de >= 1.5:
            flags.append({"name": "High Debt Load", "severity": "HIGH", "metric": f"D/E {de:.2f}x", "explanation": "Company has high borrowing relative to its net worth, increasing financial risk."})
        if ic is not None and ic < 2.0:
            flags.append({"name": "Weak Debt Servicing", "severity": "HIGH", "metric": f"ICR {ic:.1f}x", "explanation": "Earnings are low compared to loan interest payments."})

    cfo = safe_float(ann.get("CFO"))
    net_profit = safe_float(ann.get("latest_profit"))
    if company_type == "GENERAL" and cfo is not None and net_profit is not None and net_profit > 0 and cfo < 0:
        flags.append({"name": "Negative Cash Flow", "severity": "HIGH", "metric": f"CFO ₹{cfo:,.0f} Cr", "explanation": "Company shows paper profit on reports, but actual cash collected from operations is negative."})

    bank_suppressed = ["interest coverage", "working capital", "contingent liabilities", "other income of"]
    
    # Helpful human explanations for common Screener.in accounting notices
    accounting_glossary = {
        "capitalizing the interest cost": " (Note: Company may be adding loan interest to assets instead of expenses, making reported profits look higher than reality).",
        "low tax rate": " (Note: Reported tax is unusually low compared to standard corporate rates).",
        "working capital days": " (Note: Takes longer to collect cash from customers or turnover inventory).",
        "contingent liabilities": " (Note: Potential liabilities or pending legal claims that could require cash payouts if decided against company).",
        "low interest coverage": " (Note: Earnings are close to or below the cost of servicing loan interest).",
    }

    for con in corp.get("screener_cons", []):
        if company_type in ("BANK", "NBFC") and any(k in con.lower() for k in bank_suppressed):
            continue
        
        # Check if we can append a helpful explanation
        con_explanation = con
        for phrase, gloss in accounting_glossary.items():
            if phrase in con.lower() and gloss not in con:
                con_explanation = f"{con}{gloss}"
                break

        flags.append({"name": "Audit Notice", "severity": "MEDIUM", "metric": "Notice", "explanation": con_explanation})

    return flags


def generate_research_questions(data: Dict[str, Any], company_type: str) -> List[str]:
    qs = []
    p_accel = safe_float(data.get("QUARTERLY_FINANCIALS", {}).get("profit_acceleration"))
    prom_qoq = safe_float(data.get("SHAREHOLDING", {}).get("promoter_qoq_change"))

    if p_accel is not None and p_accel > 3.0:
        qs.append("What is driving the recent quarterly profit acceleration, and does it appear sustainable?")
    if prom_qoq is not None and prom_qoq < -1.0:
        qs.append("Why did promoter ownership decline this quarter?")

    if company_type in ("BANK", "NBFC"):
        qs.append("What is the recent trajectory of Gross NPAs and Net Interest Margins (NIM) in concall updates?")
    else:
        de = safe_float(data.get("BALANCE_SHEET", {}).get("debt_to_equity"))
        if de is not None and de > 1.0:
            qs.append("Is the high leverage ratio typical for this industry, and is operating cash sufficient to service debt?")

    if not qs:
        qs.append("Review management concall commentary regarding capacity utilization over the next 2 quarters.")

    return qs[:4]


# =====================================================================
# 7. ORCHESTRATION PIPELINE
# =====================================================================

def analyze_fundamentals(data: Dict[str, Any]) -> Dict[str, Any]:
    dq = data.get("DATA_QUALITY", {})
    if dq.get("is_valid") is False:
        comp_name = data.get("COMPANY", {}).get("company_name", "UNKNOWN")
        symbol = data.get("COMPANY", {}).get("ticker", "N/A")
        err_msg = "; ".join(dq.get("errors", ["Data quality failure"]))
        return {
            "company": comp_name,
            "symbol": symbol,
            "company_type": "GENERAL",
            "company_type_confidence": "LOW",
            "fundamental_score": None,
            "analysis_confidence": "LOW",
            "data_completeness": 0.0,
            "components": {},
            "unsupported": list(WEIGHTS.keys()),
            "valuation": {"category": "Error", "risk": "HIGH", "pe": None, "pb": None},
            "positives": [],
            "red_flags": [{"name": "Data Quality Failure", "severity": "HIGH", "metric": "INVALID", "explanation": err_msg}],
            "questions": [],
            "conclusion": f"Fundamental analysis failed due to data quality: {err_msg}",
            "recent_announcements": [],
            "data_quality": dq,
            "completeness_details": {
                "expected_fields": [],
                "present_fields": [],
                "missing_fields": [],
                "legitimately_na_fields": [],
                "malformed_fields": [],
            }
        }

    comp_type, type_conf = classify_company_archetype(data)
    completeness, analysis_conf, comp_details = evaluate_data_completeness(data, comp_type)

    components = {
        "Business Quality": score_business_quality(data, comp_type),
        "Growth & Earnings": score_growth_earnings(data, comp_type),
        "Financial Health": score_financial_health(data, comp_type),
        "Earnings Quality": score_earnings_quality(data, comp_type),
        "Current Momentum": score_current_momentum(data, comp_type),
        "Ownership & Governance": score_ownership_governance(data, comp_type),
        "Sector / Industry": score_sector_industry(data, comp_type),
    }

    active_weight = 0.0
    weighted_sum = 0.0
    unsupported = []

    for name, comp in components.items():
        w = WEIGHTS[name]
        if comp.score is not None:
            active_weight += w
            weighted_sum += comp.score * w
        else:
            unsupported.append(name)

    fund_score = round(weighted_sum / active_weight, 1) if active_weight >= 0.40 else None
    valuation = evaluate_valuation(data, comp_type)
    positives = extract_positive_signals(data, comp_type)
    red_flags = extract_red_flags(data, comp_type)
    questions = generate_research_questions(data, comp_type)

    p_comp = components.get("Growth & Earnings")
    conclusion = (
        f"Fundamental Score stands at {fund_score if fund_score is not None else 'N/A'}/100. "
        f"{p_comp.assessment if p_comp else ''} "
        f"Valuation multiple is categorized as '{valuation['category']}'. "
        f"Setup presents {len(positives)} positive driver(s) against {len(red_flags)} flagged risk(s) for a 3-week to 2-month swing horizon."
    )

    return {
        "company": data.get("COMPANY", {}).get("company_name", "UNKNOWN"),
        "symbol": data.get("COMPANY", {}).get("ticker", "N/A"),
        "company_type": comp_type,
        "company_type_confidence": type_conf,
        "fundamental_score": fund_score,
        "analysis_confidence": analysis_conf,
        "data_completeness": completeness,
        "completeness_details": comp_details,
        "data_quality": dq,
        "components": components,
        "unsupported": unsupported,
        "valuation": valuation,
        "positives": positives,
        "red_flags": red_flags,
        "questions": questions,
        "conclusion": conclusion,
        "recent_announcements": data.get("CORPORATE_DATA", {}).get("recent_announcements", [])
    }


def format_analysis_report(res: Dict[str, Any]) -> str:
    lines = []
    lines.append("=" * 65)
    lines.append(f"COMPANY: {res['company'].upper()} ({res['symbol']})")
    lines.append(f"Company Type: {res['company_type']} (Confidence: {res['company_type_confidence']})")
    lines.append("-" * 65)
    lines.append("FUNDAMENTAL OVERVIEW")
    lines.append(f"  Fundamental Score  : {res['fundamental_score'] if res['fundamental_score'] is not None else 'N/A'} / 100")
    lines.append(f"  Analysis Confidence: {res['analysis_confidence']}")
    lines.append(f"  Data Completeness  : {res['data_completeness']}%")
    lines.append("-" * 65)
    lines.append("COMPONENT SCORES (7 PRIMARY DIMENSIONS)")

    for name, comp in res["components"].items():
        w = WEIGHTS[name] * 100
        score_str = f"{comp.score:.1f}/100" if comp.score is not None else "N/A"
        cov_str = f"{comp.coverage * 100:.0f}%"
        lines.append(f"  • {name:<23} | Score: {score_str:<9} | Weight: {w:.0f}% | Coverage: {cov_str}")
        lines.append(f"    Assessment : {comp.assessment}")
        metrics_str = ", ".join([f"{k}: {fmt_val(v) if isinstance(v, float) else v}" for k, v in comp.metrics.items()])
        if metrics_str:
            lines.append(f"    Key Metrics: {metrics_str}")

    lines.append("-" * 65)
    val = res["valuation"]
    lines.append("VALUATION")
    lines.append(f"  Current P/E  : {fmt_val(val.get('pe'))}x")
    lines.append(f"  P/B Multiple : {fmt_val(val.get('pb'))}x")
    lines.append(f"  Category     : {val.get('category')}")
    lines.append(f"  Multiple Risk: {val.get('risk')}")

    lines.append("-" * 65)
    lines.append("POSITIVE SIGNALS")
    if res["positives"]:
        for s in res["positives"]: lines.append(f"  [+] {s}")
    else:
        lines.append("  None identified meeting strict significance criteria.")

    lines.append("-" * 65)
    lines.append("RED FLAGS")
    if res["red_flags"]:
        for f in res["red_flags"]:
            lines.append(f"  [-] [{f['severity']}] {f['name']}: {f['explanation']}")
    else:
        lines.append("  None identified meeting threshold.")

    lines.append("-" * 65)
    lines.append("WHAT NEEDS INVESTIGATION (3-WEEK TO 2-MONTH SWING)")
    for q in res["questions"]:
        lines.append(f"  □ {q}")

    lines.append("-" * 65)
    lines.append("FUNDAMENTAL CONCLUSION")
    lines.append(f"  {res['conclusion']}")
    lines.append("=" * 65)
    return "\n".join(lines)


# =====================================================================
# 8. DIRECT ENTRYPOINT
# =====================================================================

def analyze_company(ticker: str) -> None:
    print(f"[*] Fetching live Screener web data for {ticker}...")
    raw_payload = scraper.scrape_screener_data(ticker)
    result = analyze_fundamentals(raw_payload)
    print(format_analysis_report(result))


if __name__ == "__main__":
    if len(sys.argv) > 1:
        target_ticker = sys.argv[1].strip()
    else:
        target_ticker = input("Enter NSE Stock Ticker (e.g. ICICIBANK.NS, TCS): ").strip()

    if target_ticker:
        analyze_company(target_ticker)
    else:
        print("[!] No ticker provided. Exiting.")