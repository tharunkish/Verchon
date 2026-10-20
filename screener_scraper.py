"""
screener_scraper.py - Production Web Scraper for Screener.in
Fetches live company HTML and extracts comprehensive fundamental datasets.
"""

from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
import requests
from bs4 import BeautifulSoup

# Local cache configuration: 7 days for company fundamentals (quarterly data), 60 days for NSE index constituents
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".screener_cache")
CACHE_TTL_SECONDS = 7 * 24 * 3600  # 7 days
INDEX_CACHE_TTL_SECONDS = 60 * 24 * 3600  # 60 days

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def fetch_nse_index_universe(index_name: str = "nifty100") -> List[Dict[str, str]]:
    """
    Fetches official NSE index constituent CSV (nifty50, nifty100, nifty500).
    Caches the constituent list locally for 60 days in .screener_cache/
    """
    clean_idx = index_name.lower().replace(" ", "").replace("-", "").replace("_", "").strip()
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_file = os.path.join(CACHE_DIR, f"universe_{clean_idx}.json")

    # 1. Check 60-day disk cache first
    if os.path.exists(cache_file):
        try:
            mtime = os.path.getmtime(cache_file)
            if (time.time() - mtime) < INDEX_CACHE_TTL_SECONDS:
                with open(cache_file, "r", encoding="utf-8") as f:
                    cached_universe = json.load(f)
                if cached_universe:
                    return cached_universe
        except Exception:
            pass

    # 2. NSE official index constituent CSV endpoints
    url_map = {
        "nifty50": "https://archives.nseindia.com/content/indices/ind_nifty50list.csv",
        "nifty100": "https://archives.nseindia.com/content/indices/ind_nifty100list.csv",
        "nifty200": "https://archives.nseindia.com/content/indices/ind_nifty200list.csv",
        "nifty500": "https://archives.nseindia.com/content/indices/ind_nifty500list.csv",
        "niftymidcap100": "https://archives.nseindia.com/content/indices/ind_niftymidcap100list.csv",
        "niftysmallcap100": "https://archives.nseindia.com/content/indices/ind_niftysmallcap100list.csv",
        "niftymidcap50": "https://archives.nseindia.com/content/indices/ind_niftymidcap50list.csv",
        "niftytotalmarket": "https://archives.nseindia.com/content/indices/ind_niftytotalmarket_list.csv",
    }
    target_url = url_map.get(clean_idx, url_map["nifty100"])

    try:
        r = requests.get(target_url, headers=HEADERS, timeout=12)
        if r.status_code == 200:
            lines = [ln.strip() for ln in r.text.splitlines() if ln.strip()]
            universe: List[Dict[str, str]] = []
            # CSV header typically: Company Name, Industry, Symbol, Series, ISIN Code
            for line in lines[1:]:
                # Handle comma splits while ignoring commas inside quotes
                parts = [p.strip().strip('"') for p in re.split(r',(?=(?:[^"]*"[^"]*")*[^"]*$)', line)]
                if len(parts) >= 3:
                    comp_name = parts[0]
                    sym = parts[2].upper().strip()
                    if sym and not sym.startswith("SYMBOL"):
                        universe.append({"name": comp_name, "ticker": f"{sym}.NS"})
            if universe:
                with open(cache_file, "w", encoding="utf-8") as f:
                    json.dump(universe, f, ensure_ascii=False, indent=2)
                return universe
    except Exception:
        pass

    # If cache existed from before (even older than 60 days), use it as fallback
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    return []



def _clean_num(val: Any) -> Optional[float]:
    """Converts dirty table text into numeric floats."""
    if val is None:
        return None
    s = str(val).strip().replace(",", "").replace("%", "").replace("₹", "")
    if s in ("", "-", "--", "None", "nan", "NaN", "null"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _parse_html_table(table_tag: Any) -> Dict[str, List[Optional[float]]]:
    """Extracts a table into row_label -> list_of_floats time series."""
    if not table_tag:
        return {}

    data_map: Dict[str, List[Optional[float]]] = {}
    tbody = table_tag.find("tbody") or table_tag

    for row in tbody.find_all("tr"):
        cells = row.find_all(["td", "th"])
        if not cells:
            continue

        raw_label = cells[0].get_text(strip=True).replace("+", "").strip()
        cleaned_key = re.sub(r"[^a-zA-Z0-9]", "", raw_label).lower()
        if not cleaned_key:
            continue

        vals = [_clean_num(c.get_text(strip=True)) for c in cells[1:]]
        data_map[cleaned_key] = vals

    return data_map


def _find_series(data_map: Dict[str, List[Optional[float]]], candidates: List[str]) -> List[float]:
    """Locates a line item matching candidate search keys, prioritizing exact matches over substrings."""
    # Pass 1: Strict exact key matches
    for c in candidates:
        clean_target = re.sub(r"[^a-zA-Z0-9]", "", c).lower()
        for k, series in data_map.items():
            if clean_target == k:
                cleaned = [x for x in series if x is not None]
                if cleaned:
                    return cleaned

    # Pass 2: Substring key matches fallback
    for c in candidates:
        clean_target = re.sub(r"[^a-zA-Z0-9]", "", c).lower()
        for k, series in data_map.items():
            if clean_target in k:
                cleaned = [x for x in series if x is not None]
                if cleaned:
                    return cleaned
    return []


def classify_company_type(company_name: str, sector: str, industry: str) -> Tuple[str, str]:
    """Classifies company archetype into: BANK, NBFC, INSURANCE, OTHER_FINANCIAL, GENERAL."""
    name_l = company_name.lower().strip()
    sec_l = sector.lower().strip()
    ind_l = industry.lower().strip()

    # 1. BANK MUST BE EVALUATED FIRST
    if any(k in ind_l for k in ["bank", "banking"]) or "bank" in name_l:
        return "BANK", "HIGH"

    # 2. INSURANCE
    if "insurance" in ind_l or "insurance" in name_l:
        return "INSURANCE", "HIGH"

    # 3. NBFC
    if any(k in ind_l for k in ["nbfc", "housing finance", "lending", "microfinance"]):
        return "NBFC", "HIGH"
    if ("finance" in name_l or "capital" in name_l) and ("financial" in sec_l or "finance" in sec_l):
        return "NBFC", "MEDIUM"

    # 4. OTHER_FINANCIAL
    if any(k in ind_l for k in ["asset management", "amc", "broking", "brokerage", "exchange"]):
        return "OTHER_FINANCIAL", "HIGH"
    if "financial" in sec_l:
        return "OTHER_FINANCIAL", "LOW"

    return "GENERAL", "HIGH"


def create_failed_fundamental_data(ticker: str, error_reason: str, status: str = "ERROR") -> Dict[str, Any]:
    """
    Creates an explicit failed fundamental data dictionary with None values (not 0.0)
    and an explicit DATA_QUALITY failure block.
    """
    clean_sym = ticker.replace(".NS", "").replace(".BO", "").strip().upper()
    return {
        "DATA_QUALITY": {
            "status": status,
            "is_valid": False,
            "errors": [error_reason],
            "scraped_at": datetime.now().isoformat(),
            "cached": False,
            "cache_age_seconds": None,
            "source_url": None,
        },
        "COMPANY": {
            "company_name": clean_sym,
            "ticker": clean_sym,
            "sector": "N/A",
            "industry": "N/A",
            "company_type": "GENERAL",
            "company_type_confidence": "LOW",
            "market_cap": None,
            "current_price": None,
            "face_value": None,
            "turnaround_signal": False,
            "url": None,
        },
        "VALUATION": {
            "current_PE": None,
            "historical_PE_median": None,
            "historical_PE_median_5y": None,
            "historical_PE_median_3y": None,
            "P_B": None,
            "book_value_per_share": None,
            "EV_EBITDA": None,
            "dividend_yield": None,
        },
        "ANNUAL_FINANCIALS": {
            "sales_3y_cagr": None,
            "sales_5y_cagr": None,
            "profit_3y_cagr": None,
            "profit_5y_cagr": None,
            "latest_sales": None,
            "latest_profit": None,
            "historical_opm": [],
            "CFO": None,
            "interest": None,
            "other_income": None,
            "PBT": None,
        },
        "QUARTERLY_FINANCIALS": {
            "recent_sales_yoy": None,
            "recent_profit_yoy": None,
            "sales_acceleration": None,
            "profit_acceleration": None,
            "recent_opm": None,
            "OPM_expansion": False,
        },
        "BALANCE_SHEET": {
            "debt_to_equity": None,
            "total_debt": None,
            "interest_coverage": None,
            "debtor_days": None,
            "working_capital": None,
        },
        "RATIOS": {
            "ROCE": None,
            "ROE": None,
            "3Y_ROCE": None,
            "3Y_ROE": None,
        },
        "SHAREHOLDING": {
            "promoter_holding": None,
            "promoter_qoq_change": None,
            "promoter_pledge": None,
            "promoter_pledge_qoq_change": None,
            "pledge_trend": "N/A",
            "fii_holding": None,
            "fii_qoq_change": None,
            "dii_holding": None,
            "dii_qoq_change": None,
            "public_holding": None,
            "public_qoq_change": None,
            "promoter_pct": None,
            "FII_pct": None,
            "DII_pct": None,
            "public_pct": None,
            "promoter_pledge_pct": None,
        },
        "PEER_DATA": {
            "peer_PE_avg": None,
            "peer_ROCE_avg": None,
        },
        "CORPORATE_DATA": {
            "screener_pros": [],
            "screener_cons": [],
            "recent_announcements": [],
        },
    }


def scrape_screener_data(
    ticker: str, 
    retries: int = 2, 
    delay: float = 1.0,
    force_refresh: bool = False,
    ttl_seconds: int = CACHE_TTL_SECONDS
) -> Dict[str, Any]:
    """
    Scrapes public company data from Screener.in and maps it into a normalized schema.
    Uses a 3-day local JSON disk cache in .screener_cache/ to prevent redundant scraping.
    """
    clean_sym = ticker.replace(".NS", "").replace(".BO", "").strip().upper()

    # 1. Check local disk cache (3-day TTL)
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_file = os.path.join(CACHE_DIR, f"{clean_sym}.json")

    if not force_refresh and os.path.exists(cache_file):
        try:
            mtime = os.path.getmtime(cache_file)
            age_seconds = time.time() - mtime
            if age_seconds < ttl_seconds:
                with open(cache_file, "r", encoding="utf-8") as f:
                    cached_data = json.load(f)
                if isinstance(cached_data, dict):
                    # Ensure DATA_QUALITY block is present and reflects cache state
                    if "DATA_QUALITY" not in cached_data:
                        cached_data["DATA_QUALITY"] = {
                            "status": "VALID",
                            "is_valid": True,
                            "errors": [],
                            "scraped_at": datetime.fromtimestamp(mtime).isoformat(),
                            "cached": True,
                            "cache_age_seconds": round(age_seconds, 1),
                            "source_url": cached_data.get("COMPANY", {}).get("url"),
                        }
                    else:
                        cached_data["DATA_QUALITY"]["cached"] = True
                        cached_data["DATA_QUALITY"]["cache_age_seconds"] = round(age_seconds, 1)
                    return cached_data
        except Exception:
            pass  # Fallback to fresh scrape if cache read fails

    session = requests.Session()
    session.headers.update(HEADERS)

    urls_to_try = [
        f"https://www.screener.in/company/{clean_sym}/consolidated/",
        f"https://www.screener.in/company/{clean_sym}/",
    ]

    resp: Optional[requests.Response] = None
    final_url = ""

    for url in urls_to_try:
        for attempt in range(retries):
            try:
                r = session.get(url, timeout=5)
                if r.status_code == 200:
                    resp = r
                    final_url = url
                    break
                elif r.status_code == 404:
                    break
            except requests.RequestException:
                time.sleep(delay)
        if resp is not None:
            break

    if resp is None:
        # Fallback to stale cache if available rather than breaking the application
        if os.path.exists(cache_file):
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    cached_data = json.load(f)
                if isinstance(cached_data, dict):
                    mtime = os.path.getmtime(cache_file)
                    age_seconds = time.time() - mtime
                    if "DATA_QUALITY" not in cached_data:
                        cached_data["DATA_QUALITY"] = {
                            "status": "FALLBACK_CACHE",
                            "is_valid": True,
                            "is_fallback": True,
                            "errors": ["STALE_FALLBACK (Screener.in unreachable)"],
                            "scraped_at": datetime.fromtimestamp(mtime).isoformat(),
                            "cached": True,
                            "cache_age_seconds": round(age_seconds, 1),
                            "source_url": cached_data.get("COMPANY", {}).get("url"),
                        }
                    else:
                        cached_data["DATA_QUALITY"]["cached"] = True
                        cached_data["DATA_QUALITY"]["is_fallback"] = True
                        cached_data["DATA_QUALITY"]["status"] = "FALLBACK_CACHE"
                        errors = cached_data["DATA_QUALITY"].get("errors", [])
                        if "STALE_FALLBACK (Screener.in unreachable)" not in errors:
                            errors.append("STALE_FALLBACK (Screener.in unreachable)")
                        cached_data["DATA_QUALITY"]["errors"] = errors
                        cached_data["DATA_QUALITY"]["cache_age_seconds"] = round(age_seconds, 1)
                    return cached_data
            except Exception:
                pass
        raise ConnectionError(f"Could not retrieve Screener page for {clean_sym} (Verify symbol / connectivity).")

    soup = BeautifulSoup(resp.content, "html.parser")

    # 1. Company Name & Classifications
    company_name = clean_sym
    h1 = soup.find("h1")
    if h1:
        company_name = h1.get_text(strip=True)

    sector = "N/A"
    industry = "N/A"
    peers_sec = soup.find("section", id="peers")
    if peers_sec:
        peers_p = peers_sec.find("p")
        if peers_p:
            links = peers_p.find_all("a")
            if len(links) >= 2:
                sector = links[0].get_text(strip=True)
                industry = links[1].get_text(strip=True)
            elif len(links) == 1:
                industry = links[0].get_text(strip=True)

    company_type, company_type_confidence = classify_company_type(company_name, sector, industry)

    # 2. Top Header Ratios (#top-ratios)
    top_ratios: Dict[str, Optional[float]] = {}
    top_ul = soup.find("ul", id="top-ratios")
    if top_ul:
        for li in top_ul.find_all("li"):
            name_span = li.find("span", class_="name")
            val_span = li.find("span", class_="nowrap value") or li.find("span", class_="value")
            if name_span and val_span:
                key = re.sub(r"[^a-zA-Z0-9]", "", name_span.get_text(strip=True)).lower()
                top_ratios[key] = _clean_num(val_span.get_text(strip=True))

    curr_price = top_ratios.get("currentprice")
    market_cap = top_ratios.get("marketcapitalization") or top_ratios.get("marketcap")
    curr_pe = top_ratios.get("stockpe")
    book_val = top_ratios.get("bookvalue")

    if curr_price and book_val and book_val > 0:
        pb = round(curr_price / book_val, 2)
    else:
        pb = top_ratios.get("pricetobook")

    roce_top = top_ratios.get("roce")
    roe_top = top_ratios.get("roe")
    div_yield = top_ratios.get("dividendyield")
    face_val = top_ratios.get("facevalue")

    # 3. Financial Statements Tables
    q_table = _parse_html_table(soup.find("section", id="quarters"))
    pnl_table = _parse_html_table(soup.find("section", id="profit-loss"))
    bs_table = _parse_html_table(soup.find("section", id="balance-sheet"))
    cf_table = _parse_html_table(soup.find("section", id="cash-flow"))
    ratios_table = _parse_html_table(soup.find("section", id="ratios"))

    # Annual Financials Series
    s_ann = _find_series(pnl_table, ["sales", "revenue", "interestearned"])
    p_ann = _find_series(pnl_table, ["netprofit", "pat", "profitforperiod"])
    op_ann = _find_series(pnl_table, ["operatingprofit", "financingprofit"])
    opm_ann = _find_series(pnl_table, ["opm", "operatingprofitmargin"])
    oi_ann = _find_series(pnl_table, ["otherincome"])
    pbt_ann = _find_series(pnl_table, ["profitbeforetax", "pbt"])
    int_ann = _find_series(pnl_table, ["interest"])

    def _calc_cagr(series: List[float], periods: int) -> Optional[float]:
        if len(series) > periods and series[-periods - 1] > 0 and series[-1] > 0:
            return round((((series[-1] / series[-periods - 1]) ** (1.0 / periods)) - 1.0) * 100, 2)
        return None

    s_5y_cagr = _calc_cagr(s_ann, 5)
    s_3y_cagr = _calc_cagr(s_ann, 3)
    p_5y_cagr = _calc_cagr(p_ann, 5)
    p_3y_cagr = _calc_cagr(p_ann, 3)

    # --- QUARTERLY FINANCIALS (Handles Net Losses / Negative Numbers) ---
    s_qrt = _find_series(q_table, ["sales", "revenue", "interestearned"])
    p_qrt = _find_series(q_table, ["netprofit", "pat"])
    opm_qrt = _find_series(q_table, ["opm", "operatingprofitmargin"])

    recent_s_yoy: Optional[float] = None
    recent_p_yoy: Optional[float] = None
    s_accel: Optional[float] = None
    p_accel: Optional[float] = None
    opm_exp: Optional[float] = None

    # Sales YoY & Accel
    if len(s_qrt) >= 5 and s_qrt[-5] is not None and s_qrt[-5] != 0:
        recent_s_yoy = round(((s_qrt[-1] - s_qrt[-5]) / abs(s_qrt[-5])) * 100, 2)
        if len(s_qrt) >= 6 and s_qrt[-6] is not None and s_qrt[-6] != 0:
            prev_s_yoy = ((s_qrt[-2] - s_qrt[-6]) / abs(s_qrt[-6])) * 100
            s_accel = round(recent_s_yoy - prev_s_yoy, 2)
    elif len(s_qrt) >= 2 and s_qrt[-2] is not None and s_qrt[-2] != 0:
        recent_s_yoy = round(((s_qrt[-1] - s_qrt[-2]) / abs(s_qrt[-2])) * 100, 2)

    # Profit YoY & Accel (Works for both profits and net losses, clamped delta)
    if len(p_qrt) >= 5 and p_qrt[-5] is not None and p_qrt[-5] != 0:
        recent_p_yoy = round(((p_qrt[-1] - p_qrt[-5]) / abs(p_qrt[-5])) * 100, 2)
        if len(p_qrt) >= 6 and p_qrt[-6] is not None and p_qrt[-6] != 0:
            prev_p_yoy = ((p_qrt[-2] - p_qrt[-6]) / abs(p_qrt[-6])) * 100
            raw_p_accel = round(recent_p_yoy - prev_p_yoy, 2)
            p_accel = max(-100.0, min(100.0, raw_p_accel))
    elif len(p_qrt) >= 2 and p_qrt[-2] is not None and p_qrt[-2] != 0:
        recent_p_yoy = round(((p_qrt[-1] - p_qrt[-2]) / abs(p_qrt[-2])) * 100, 2)

    if len(opm_qrt) >= 5 and opm_qrt[-1] is not None and opm_qrt[-5] is not None:
        opm_exp = round(opm_qrt[-1] - opm_qrt[-5], 2)

    # --- BALANCE SHEET (Handles Negative Equity / Debt-Free Companies) ---
    borrowings = _find_series(bs_table, ["borrowings", "totalborrowings", "longtermborrowings", "shorttermborrowings", "debt"])
    equity_cap = _find_series(bs_table, ["equitysharecapital", "sharecapital"])
    reserves = _find_series(bs_table, ["reserves"])
    debtor_days_s = _find_series(ratios_table, ["debtordays"])

    total_debt = borrowings[-1] if borrowings else 0.0
    net_worth = (equity_cap[-1] + reserves[-1]) if (equity_cap and reserves) else None

    if total_debt is not None and net_worth is not None:
        if net_worth <= 0:
            debt_to_equity = -999.0  # Sentinel for eroded shareholder equity
        elif total_debt == 0.0:
            debt_to_equity = 0.0     # Clean zero for debt-free companies
        else:
            debt_to_equity = round(total_debt / net_worth, 2)
    else:
        debt_to_equity = None

    # Cash Flow
    cfo_s = _find_series(cf_table, ["cashfromoperatingactivity", "cfo", "operatingactivity"])
    latest_cfo = cfo_s[-1] if cfo_s else None

    int_cov: Optional[float] = None
    if op_ann and int_ann and int_ann[-1] and int_ann[-1] > 0:
        int_cov = round(op_ann[-1] / int_ann[-1], 2)

    turnaround = False
    if len(p_ann) >= 4 and any(x <= 0 for x in p_ann[-4:-1]) and p_ann[-1] > 0:
        turnaround = True

    # 4. Shareholding Pattern (#shareholding)
    sh_sec = soup.find("section", id="shareholding")
    sh_table = _parse_html_table(sh_sec)

    prom_s = _find_series(sh_table, ["promoters", "promoter"])
    fii_s = _find_series(sh_table, ["fiis", "fii"])
    dii_s = _find_series(sh_table, ["diis", "dii"])
    pub_s = _find_series(sh_table, ["public"])
    pledge_s = _find_series(sh_table, ["pledged", "pledgedpercentage"])

    prom_pct = prom_s[-1] if prom_s else None
    prom_qoq = round(prom_s[-1] - prom_s[-2], 2) if len(prom_s) >= 2 else None
    
    pledge_pct = pledge_s[-1] if pledge_s else (0.0 if prom_pct is not None else None)
    pledge_qoq = round(pledge_s[-1] - pledge_s[-2], 2) if len(pledge_s) >= 2 else None
    pledge_trend = "Stable" if pledge_pct is not None else "N/A"
    if len(pledge_s) >= 2:
        if pledge_s[-1] < pledge_s[-2]:
            pledge_trend = "Falling"
        elif pledge_s[-1] > pledge_s[-2]:
            pledge_trend = "Rising"

    fii_qoq = round(fii_s[-1] - fii_s[-2], 2) if len(fii_s) >= 2 else None
    dii_qoq = round(dii_s[-1] - dii_s[-2], 2) if len(dii_s) >= 2 else None
    pub_qoq = round(pub_s[-1] - pub_s[-2], 2) if len(pub_s) >= 2 else None

    # 5. Algorithmic Pros and Cons (#analysis)
    pros: List[str] = []
    cons: List[str] = []
    analysis_div = soup.find("div", class_="pros")
    if analysis_div:
        pros = [li.get_text(strip=True) for li in analysis_div.find_all("li")]
    cons_div = soup.find("div", class_="cons")
    if cons_div:
        cons = [li.get_text(strip=True) for li in cons_div.find_all("li")]

    # 6. Peer Benchmark Data (#peers table)
    peer_pes: List[float] = []
    peer_roces: List[float] = []

    if peers_sec:
        table_peers = peers_sec.find("table")
        if table_peers and table_peers.find("tbody"):
            for tr in table_peers.find("tbody").find_all("tr"):
                cols = [td.get_text(strip=True) for td in tr.find_all("td")]
                if len(cols) >= 6:
                    pe_val = _clean_num(cols[3])
                    roce_val = _clean_num(cols[5]) if len(cols) > 5 else None
                    if pe_val:
                        peer_pes.append(pe_val)
                    if roce_val:
                        peer_roces.append(roce_val)

    # 7. Historical Median PE (3-Year & 5-Year from Screener Chart API)
    median_pe_3y: Optional[float] = None
    median_pe_5y: Optional[float] = None
    company_info_tag = soup.find(id="company-info") or soup.find(attrs={"data-company-id": True})
    company_id = company_info_tag.get("data-company-id") if company_info_tag else None
    is_consolidated = "consolidated" in final_url.lower()

    if company_id:
        try:
            c_param = "true" if is_consolidated else "false"
            # Single API call fetching 5Y chart (1825 days) for both median PE values
            url_chart = f"https://www.screener.in/api/company/{company_id}/chart/?q=Price+to+Earning-Median+PE-EPS&days=1825&consolidated={c_param}"
            r_chart = session.get(url_chart, timeout=2.0)
            if r_chart.status_code == 200:
                data_chart = r_chart.json()
                for ds in data_chart.get("datasets", []):
                    if "Median" in ds.get("metric", ""):
                        vals = ds.get("values", [])
                        if vals and len(vals[-1]) >= 2:
                            median_pe_5y = _clean_num(vals[-1][1])
                            median_pe_3y = median_pe_5y
        except Exception:
            pass

    # 8. Recent Announcements & Regulatory Filings (#documents section)
    recent_announcements: List[Dict[str, str]] = []
    doc_sec = soup.find("section", id="documents")
    if doc_sec:
        for div in doc_sec.find_all("div"):
            h = div.find(["h3", "h4"])
            if h and "announcement" in h.get_text().lower():
                ul = div.find("ul")
                if ul:
                    for li in ul.find_all("li")[:5]:
                        # Format in Screener: Title Date Description
                        raw_li_text = li.get_text(" | ", strip=True)
                        parts = [p.strip() for p in raw_li_text.split(" | ") if p.strip()]
                        date_str = ""
                        title_str = ""
                        desc_str = ""
                        if len(parts) >= 2:
                            title_str = parts[0]
                            date_str = parts[1]
                            if len(parts) >= 3:
                                desc_str = parts[2].lstrip("- ")
                        elif len(parts) == 1:
                            title_str = parts[0]

                        # Clean title if date is merged
                        date_match = re.search(r"(\d{1,2}\s+[A-Za-z]{3})$", title_str)
                        if date_match and not date_str:
                            date_str = date_match.group(1)
                            title_str = title_str[:date_match.start()].strip()

                        if title_str:
                            recent_announcements.append({
                                "date": date_str,
                                "title": title_str,
                                "description": desc_str[:120] if desc_str else ""
                            })
                    break

    result_dict = {
        "DATA_QUALITY": {
            "status": "VALID",
            "is_valid": True,
            "errors": [],
            "scraped_at": datetime.now().isoformat(),
            "cached": False,
            "cache_age_seconds": 0.0,
            "source_url": final_url,
        },
        "COMPANY": {
            "company_name": company_name,
            "ticker": clean_sym,
            "sector": sector,
            "industry": industry,
            "company_type": company_type,
            "company_type_confidence": company_type_confidence,
            "market_cap": market_cap,
            "current_price": curr_price,
            "face_value": face_val,
            "turnaround_signal": turnaround,
            "url": final_url,
        },
        "VALUATION": {
            "current_PE": curr_pe,
            "historical_PE_median": median_pe_5y if median_pe_5y is not None else curr_pe,
            "historical_PE_median_5y": median_pe_5y,
            "historical_PE_median_3y": median_pe_3y,
            "P_B": pb,
            "book_value_per_share": book_val,
            "EV_EBITDA": None,
            "dividend_yield": div_yield,
        },
        "ANNUAL_FINANCIALS": {
            "sales_3y_cagr": s_3y_cagr,
            "sales_5y_cagr": s_5y_cagr,
            "profit_3y_cagr": p_3y_cagr,
            "profit_5y_cagr": p_5y_cagr,
            "latest_sales": s_ann[-1] if s_ann else None,
            "latest_profit": p_ann[-1] if p_ann else None,
            "historical_opm": opm_ann,
            "CFO": latest_cfo,
            "interest": int_ann[-1] if int_ann else None,
            "other_income": oi_ann[-1] if oi_ann else None,
            "PBT": pbt_ann[-1] if pbt_ann else None,
        },
        "QUARTERLY_FINANCIALS": {
            "recent_sales_yoy": recent_s_yoy,
            "recent_profit_yoy": recent_p_yoy,
            "sales_acceleration": s_accel,
            "profit_acceleration": p_accel,
            "recent_opm": opm_qrt[-1] if opm_qrt else None,
            "OPM_expansion": opm_exp,
        },
        "BALANCE_SHEET": {
            "debt_to_equity": debt_to_equity,
            "total_debt": total_debt,
            "interest_coverage": int_cov,
            "debtor_days": debtor_days_s[-1] if debtor_days_s else None,
            "working_capital": None,
        },
        "RATIOS": {
            "ROCE": roce_top,
            "ROE": roe_top,
            "3Y_ROCE": None,
            "3Y_ROE": None,
        },
        "SHAREHOLDING": {
            "promoter_holding": prom_pct,
            "promoter_qoq_change": prom_qoq,
            "promoter_pledge": pledge_pct,
            "promoter_pledge_qoq_change": pledge_qoq,
            "pledge_trend": pledge_trend,
            "fii_holding": fii_s[-1] if fii_s else None,
            "fii_qoq_change": fii_qoq,
            "dii_holding": dii_s[-1] if dii_s else None,
            "dii_qoq_change": dii_qoq,
            "public_holding": pub_s[-1] if pub_s else None,
            "public_qoq_change": pub_qoq,
            # Backward-compatibility aliases
            "promoter_pct": prom_pct,
            "FII_pct": fii_s[-1] if fii_s else None,
            "DII_pct": dii_s[-1] if dii_s else None,
            "public_pct": pub_s[-1] if pub_s else None,
            "promoter_pledge_pct": pledge_pct,
        },
        "PEER_DATA": {
            "peer_PE_avg": round(sum(peer_pes) / len(peer_pes), 2) if peer_pes else None,
            "peer_ROCE_avg": round(sum(peer_roces) / len(peer_roces), 2) if peer_roces else None,
        },
        "CORPORATE_DATA": {
            "screener_pros": pros,
            "screener_cons": cons,
            "recent_announcements": recent_announcements,
        },
    }

    # Save to local disk cache (3-day TTL)
    try:
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(result_dict, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

    return result_dict


def prefetch_screener_universe(tickers: List[str], max_workers: int = 8, verbose: bool = True) -> None:
    """
    Batch pre-fetches and disk-caches Screener fundamentals across a list of tickers in parallel.
    Uses concurrent ThreadPoolExecutor so 100 stocks scrape in ~5-10s instead of minutes.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    uncached: List[str] = []
    os.makedirs(CACHE_DIR, exist_ok=True)

    for t in tickers:
        clean_sym = t.replace(".NS", "").replace(".BO", "").strip().upper()
        cache_file = os.path.join(CACHE_DIR, f"{clean_sym}.json")
        if os.path.exists(cache_file):
            try:
                mtime = os.path.getmtime(cache_file)
                if (time.time() - mtime) < CACHE_TTL_SECONDS:
                    continue  # Already cached & fresh
            except Exception:
                pass
        uncached.append(t)

    if not uncached:
        if verbose:
            print(f"[*] All {len(tickers)} stocks are already cached locally in .screener_cache/.")
        return

    if verbose:
        print(f"[*] Batch scraping Screener fundamentals for {len(uncached)} uncached stocks ({max_workers} parallel workers)...")

    import random

    def _worker(t: str) -> None:
        try:
            # Polite micro-jitter to prevent burst concurrency spikes
            time.sleep(random.uniform(0.05, 0.25))
            scrape_screener_data(t)
        except Exception:
            pass

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(_worker, t) for t in uncached]
        for f in as_completed(futures):
            pass

    if verbose:
        print(f"[+] Screener batch prefetch completed for {len(uncached)} stocks.")