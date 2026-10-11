"""
Screener.in Fundamental Analysis Engine (Module 1 - Swing Trading Optimized)
Holding Horizon: 3 weeks to 2 months (NSE Swing Trading Filter)

Dual-Score Architecture:
1. Business Quality Score (0 - 100) -> "Is this a fundamentally viable, good business?"
2. Opportunity / Improvement Score (0 - 100) -> "Is something improving right now?"
3. Valuation Category -> Independent classification/warning (no artificial score boosting)
"""

import os
import re
import sys
import numpy as np
import pandas as pd


# ==============================================================================
# 1. INPUT HANDLING & CLEANING UTILITIES
# ==============================================================================

def clean_dragged_path(raw_path: str) -> str:
    """
    Cleans OS path artifacts from dragging files into terminal windows:
    - Strips quotes (' or ")
    - Removes PowerShell execution prefixes (&)
    - Unescapes terminal spaces (\ )
    """
    path = raw_path.strip()
    if path.startswith("&"):
        path = path[1:].strip()
    if (path.startswith("'") and path.endswith("'")) or (path.startswith('"') and path.endswith('"')):
        path = path[1:-1]
    return path.replace(r"\ ", " ").strip()


def clean_cell(val):
    """
    Converts raw financial cells into float values:
    - Handles ₹ symbols, commas, percent signs
    - Handles empty indicators: '-', '--', 'nan', None
    """
    if pd.isna(val):
        return np.nan
    if isinstance(val, (int, float)):
        return float(val)

    s = str(val).strip()
    if s in ["-", "--", "", "None", "nan", "NaN", "null"]:
        return np.nan

    # Percentages
    if s.endswith("%"):
        s = s.rstrip("%").strip()
        try:
            return float(s.replace(",", "")) / 100.0
        except ValueError:
            return np.nan

    # Currency & standard comma-separated figures
    s = s.replace("₹", "").replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return np.nan


def clean_pe_series(pe_series: pd.Series) -> pd.Series:
    """
    Fixes Screener PE scaling bug where values are scaled by 100
    (e.g., 6624.5 instead of 66.245) or formatted with extra multipliers.
    """
    if pe_series is None or pe_series.empty:
        return pd.Series(dtype=float)

    cleaned = pe_series.dropna().copy()
    cleaned = cleaned[cleaned > 0]
    if cleaned.empty:
        return pd.Series(dtype=float)

    # If the median is > 300, the series was scaled by 100x in export
    if cleaned.median() > 300:
        cleaned = cleaned / 100.0
    else:
        # Normalize individual outliers scaled by 100
        cleaned = cleaned.apply(lambda x: x / 100.0 if (x > 400 and (x / 100.0) < 250) else x)

    return cleaned.round(2)


# ==============================================================================
# 2. SCREENER EXCEL EXTRACTION ENGINE
# ==============================================================================

def parse_screener_workbook(file_path: str):
    """
    Reads Screener.in workbook and extracts raw historical financial rows.
    Falls back gracefully between 'Data Sheet' and statement tabs.
    """
    xls = pd.ExcelFile(file_path)
    sheet_name = 'Data Sheet' if 'Data Sheet' in xls.sheet_names else xls.sheet_names[0]
    df_raw = pd.read_excel(file_path, sheet_name=sheet_name, header=None)

    # 1. Extract Company Name
    company_name = "Unknown Company"
    for r in range(min(5, len(df_raw))):
        val0 = str(df_raw.iloc[r, 0]).strip()
        val1 = str(df_raw.iloc[r, 1]).strip()
        if 'COMPANY NAME' in val0.upper():
            company_name = val1
            break
        elif val0 and val0.lower() != 'nan':
            company_name = val0

    # 2. Extract Current Stock Price from Screener Meta info
    current_price = np.nan
    for r in range(min(12, len(df_raw))):
        val0 = str(df_raw.iloc[r, 0]).strip().upper()
        if 'CURRENT PRICE' in val0:
            current_price = clean_cell(df_raw.iloc[r, 1])
            break

    # 3. Locate the Date/Period Header Row
    date_row_idx = None
    for r in range(len(df_raw)):
        val0 = str(df_raw.iloc[r, 0]).strip().upper()
        if val0 in ['REPORT DATE', 'NARRATION']:
            date_row_idx = r
            break

    if date_row_idx is None:
        raise ValueError(f"Could not locate financial statement headers in: {file_path}")

    dates_row = df_raw.iloc[date_row_idx, 1:].dropna()
    col_indices = dates_row.index.tolist()

    periods = []
    for c in col_indices:
        val = dates_row[c]
        if hasattr(val, 'strftime'):
            periods.append(val.strftime('%b-%y'))
        else:
            periods.append(str(val).strip())

    # 4. Map line items flexibly by row name
    row_data = {}
    for r in range(date_row_idx + 1, len(df_raw)):
        raw_name = str(df_raw.iloc[r, 0]).strip()
        if not raw_name or raw_name.lower() == 'nan':
            continue
        cleaned_key = re.sub(r'[^a-zA-Z0-9]', '', raw_name).lower()
        if cleaned_key not in row_data:
            vals = [clean_cell(df_raw.iloc[r, c]) for c in col_indices]
            row_data[cleaned_key] = pd.Series(vals, index=periods, dtype=float)

    return {
        "company_name": company_name,
        "current_price": current_price,
        "row_data": row_data,
        "periods": periods
    }


def find_metric_series(row_data: dict, search_keys: list) -> pd.Series:
    """Finds a financial line item matching any candidate search keys."""
    for key in search_keys:
        clean_target = re.sub(r'[^a-zA-Z0-9]', '', key).lower()
        for k, series in row_data.items():
            if clean_target == k or clean_target in k:
                return series.dropna()
    return pd.Series(dtype=float)


# ==============================================================================
# 3. METRIC CALCULATIONS
# ==============================================================================

def calculate_cagr(start_val, end_val, periods):
    """Calculates Compound Annual Growth Rate."""
    if pd.isna(start_val) or pd.isna(end_val) or periods <= 0:
        return np.nan
    if start_val <= 0 or end_val <= 0:
        return np.nan
    return round(((end_val / start_val) ** (1.0 / periods) - 1.0) * 100, 2)


def compute_growth_metrics(row_data):
    """Calculates 5Y/10Y CAGRs and YoY recent growth for Sales, Net Profit, and EPS."""
    sales = find_metric_series(row_data, ['sales', 'revenue', 'interestearned'])
    profit = find_metric_series(row_data, ['netprofit', 'netprofitloss', 'pat'])

    eps = find_metric_series(row_data, ['eps', 'epsinrs', 'adjustedeps'])
    if eps.empty:
        shares = find_metric_series(row_data, ['adjustedequitysharesincr', 'noofequityshares'])
        if not profit.empty and not shares.empty:
            eps = (profit / shares).dropna()

    def get_growth_stats(s: pd.Series, prefix: str):
        n = len(s)
        cagr_5 = calculate_cagr(s.iloc[-6], s.iloc[-1], 5) if n >= 6 else np.nan
        cagr_10 = calculate_cagr(s.iloc[-11], s.iloc[-1], 10) if n >= 11 else np.nan
        recent_yoy = round(((s.iloc[-1] / s.iloc[-2]) - 1.0) * 100, 2) if n >= 2 and s.iloc[-2] > 0 else np.nan
        return {
            f"{prefix}_5Y_CAGR_%": cagr_5,
            f"{prefix}_10Y_CAGR_%": cagr_10,
            f"{prefix}_Recent_YoY_%": recent_yoy
        }

    metrics = {}
    metrics.update(get_growth_stats(sales, "Sales"))
    metrics.update(get_growth_stats(profit, "Profit"))
    metrics.update(get_growth_stats(eps, "EPS"))

    return metrics, sales, profit, eps


def compute_profitability_metrics(row_data, sales_s, profit_s):
    """Calculates OPM, Operating Profit trend, and Net Profit Margin trend."""
    op = find_metric_series(row_data, ['operatingprofit', 'operatingprofitloss'])
    opm = find_metric_series(row_data, ['opm', 'operatingprofitmargin'])

    if opm.empty and not op.empty and not sales_s.empty:
        opm = ((op / sales_s) * 100).dropna()

    npm = ((profit_s / sales_s) * 100).dropna() if not sales_s.empty and not profit_s.empty else pd.Series(dtype=float)

    curr_opm = opm.iloc[-1] if not opm.empty else np.nan
    if pd.notna(curr_opm) and curr_opm < 1.0:
        curr_opm = curr_opm * 100

    curr_npm = npm.iloc[-1] if not npm.empty else np.nan

    return {
        "Current_OPM_%": round(curr_opm, 2) if pd.notna(curr_opm) else np.nan,
        "Current_NPM_%": round(curr_npm, 2) if pd.notna(curr_npm) else np.nan,
        "OPM_Series": opm,
        "NPM_Series": npm,
        "OP_Series": op
    }


def compute_acceleration_metrics(sales_s, profit_s, op_s, opm_s, eps_s):
    """
    Measures short-term operational inflection and turnaround momentum:
    - Recent sales growth vs 3Y historical growth
    - Turnaround from negative profit to positive profit
    - Margin expansion (OPM recent vs 3Y baseline)
    - Consecutive operating profit increases
    """
    # 1. Sales acceleration vs 3Y historical baseline
    yoy_s = ((sales_s.iloc[-1] / sales_s.iloc[-2]) - 1.0) * 100 if len(sales_s) >= 2 and sales_s.iloc[-2] > 0 else 0
    hist_s_growth = sales_s.pct_change().iloc[-4:-1].mean() * 100 if len(sales_s) >= 4 else yoy_s
    s_accel = round(yoy_s - hist_s_growth, 2)

    # 2. Profit Turnaround flag
    was_loss = (profit_s.iloc[-4:-1] <= 0).any() if len(profit_s) >= 4 else False
    is_now_profit = profit_s.iloc[-1] > 0
    turnaround_flag = bool(was_loss and is_now_profit)

    # 3. Margin Expansion
    opm_diff = 0.0
    if len(opm_s) >= 3:
        curr_opm = opm_s.iloc[-1] * 100 if opm_s.iloc[-1] < 1.0 else opm_s.iloc[-1]
        base_opm = opm_s.iloc[-3:].mean()
        base_opm = base_opm * 100 if base_opm < 1.0 else base_opm
        opm_diff = round(curr_opm - base_opm, 2)

    # 4. Operating Profit consecutive expansion
    op_expanding = bool(len(op_s) >= 3 and op_s.iloc[-1] > op_s.iloc[-2] > op_s.iloc[-3])

    return {
        "Sales_Acceleration_Delta_%": s_accel,
        "Turnaround_Signal": turnaround_flag,
        "OPM_Expansion_Delta_%": opm_diff,
        "OP_Expanding_Trend": op_expanding
    }


def compute_valuation_metrics(row_data, current_price, eps_s, yoy_profit_growth):
    """
    Calculates PE metrics, fixes scaling bugs, and extracts historical range.
    """
    pe_raw = find_metric_series(row_data, ['pricetoearning', 'pricetoearnings', 'pe'])

    if pe_raw.empty:
        price_hist = find_metric_series(row_data, ['price', 'stockprice'])
        if not price_hist.empty and not eps_s.empty:
            pe_raw = (price_hist / eps_s).dropna()

    valid_pe = clean_pe_series(pe_raw)

    curr_pe = np.nan
    if pd.notna(current_price) and not eps_s.empty and eps_s.iloc[-1] > 0:
        raw_c_pe = current_price / eps_s.iloc[-1]
        curr_pe = round(raw_c_pe / 100.0 if (raw_c_pe > 400 and (raw_c_pe / 100.0) < 250) else raw_c_pe, 2)
    elif not valid_pe.empty:
        curr_pe = round(valid_pe.iloc[-1], 2)

    if valid_pe.empty and pd.isna(curr_pe):
        return {
            "Current_PE": np.nan,
            "PE_Median": np.nan,
            "PE_Min": np.nan,
            "PE_Max": np.nan
        }

    pe_med = round(valid_pe.median(), 2) if not valid_pe.empty else curr_pe
    pe_min = round(valid_pe.min(), 2) if not valid_pe.empty else curr_pe
    pe_max = round(valid_pe.max(), 2) if not valid_pe.empty else curr_pe

    return {
        "Current_PE": curr_pe,
        "PE_Median": pe_med,
        "PE_Min": pe_min,
        "PE_Max": pe_max
    }


# ==============================================================================
# 4. DUAL SCORING ARCHITECTURE (MODULAR)
# ==============================================================================

# ------------------------------------------------------------------------------
# 4A. BUSINESS QUALITY ENGINE (0 - 100 Points)
# Question: "Is this a fundamentally viable, reasonably good business?"
# ------------------------------------------------------------------------------

def score_business_quality(growth_data: dict, prof_data: dict, sales_s: pd.Series, profit_s: pd.Series) -> dict:
    """
    Evaluates long-term stability and fundamental quality:
    - Long-Term Sales Growth (25 pts)
    - Long-Term Profit Growth (25 pts)
    - Profitability Baseline (25 pts)
    - Consistency & Margin Stability (25 pts)
    """
    score = 0.0

    # 1. Long-Term Revenue Growth (25 pts)
    s_5y = growth_data.get("Sales_5Y_CAGR_%")
    s_10y = growth_data.get("Sales_10Y_CAGR_%")
    best_sales_cagr = s_5y if pd.notna(s_5y) else s_10y

    if pd.notna(best_sales_cagr):
        if best_sales_cagr >= 15.0: score += 25
        elif best_sales_cagr >= 10.0: score += 18
        elif best_sales_cagr >= 5.0: score += 10
        elif best_sales_cagr > 0.0: score += 5

    # 2. Long-Term Profit Growth (25 pts)
    p_5y = growth_data.get("Profit_5Y_CAGR_%")
    p_10y = growth_data.get("Profit_10Y_CAGR_%")
    best_profit_cagr = p_5y if pd.notna(p_5y) else p_10y

    if pd.notna(best_profit_cagr):
        if best_profit_cagr >= 15.0: score += 25
        elif best_profit_cagr >= 10.0: score += 18
        elif best_profit_cagr >= 5.0: score += 10
        elif best_profit_cagr > 0.0: score += 5
    elif len(profit_s) >= 4 and profit_s.iloc[-1] > 0 and (profit_s.iloc[-3:] > 0).all():
        score += 10  # Baseline credit for stabilizing into positive earnings

    # 3. Profitability Baseline (25 pts)
    cur_opm = prof_data.get("Current_OPM_%")
    cur_npm = prof_data.get("Current_NPM_%")

    if not profit_s.empty and profit_s.iloc[-1] > 0:
        # Operating Margin level (13 pts)
        if pd.notna(cur_opm):
            if cur_opm >= 20.0: score += 13
            elif cur_opm >= 12.0: score += 9
            elif cur_opm >= 5.0: score += 5

        # Net Margin level (12 pts)
        if pd.notna(cur_npm):
            if cur_npm >= 15.0: score += 12
            elif cur_npm >= 8.0: score += 8
            elif cur_npm > 0.0: score += 4

    # 4. Consistency & Margin Stability (25 pts)
    if len(profit_s) >= 5:
        profitable_years = (profit_s.iloc[-5:] > 0).sum()
        score += (profitable_years / 5.0) * 15.0  # Up to 15 pts

    opm_s = prof_data.get("OPM_Series")
    if opm_s is not None and len(opm_s.dropna()) >= 4:
        opm_cleaned = opm_s.dropna()
        if opm_cleaned.iloc[-1] < 1.0:
            opm_cleaned = opm_cleaned * 100
        opm_volatility = opm_cleaned.iloc[-5:].std() if len(opm_cleaned) >= 5 else opm_cleaned.std()

        if opm_volatility < 2.5: score += 10.0
        elif opm_volatility < 5.0: score += 6.0
        elif opm_volatility < 10.0: score += 3.0

    return {
        "Business_Quality_Score": round(min(score, 100.0), 1),
        "Quality_Band": "High Quality" if score >= 70 else ("Investable Quality" if score >= 45 else "Weak/Speculative")
    }


# ------------------------------------------------------------------------------
# 4B. OPPORTUNITY / IMPROVEMENT ENGINE (0 - 100 Points)
# Question: "Is something improving right now that the market may re-rate?"
# ------------------------------------------------------------------------------

def score_opportunity_improvement(growth_data: dict, accel_data: dict, sales_s: pd.Series, profit_s: pd.Series, op_s: pd.Series) -> dict:
    """
    Evaluates near-term catalysts and operational acceleration:
    - Recent Sales Acceleration vs Historical Baseline (20 pts)
    - Recent Profit Surge / Acceleration (25 pts)
    - Margin Expansion (20 pts)
    - Consecutive Operating Profit Expansion (15 pts)
    - Turnaround Signals (20 pts)
    """
    score = 0.0

    yoy_s = growth_data.get("Sales_Recent_YoY_%", 0)
    yoy_p = growth_data.get("Profit_Recent_YoY_%", 0)
    s_accel = accel_data.get("Sales_Acceleration_Delta_%", 0)
    turnaround = accel_data.get("Turnaround_Signal", False)
    opm_diff = accel_data.get("OPM_Expansion_Delta_%", 0)
    op_expanding = accel_data.get("OP_Expanding_Trend", False)

    # 1. Sales Acceleration vs Historical 3Y Trend (20 pts)
    if pd.notna(s_accel):
        if s_accel >= 5.0: score += 20
        elif s_accel >= 0.0: score += 12
        elif pd.notna(yoy_s) and yoy_s >= 15.0: score += 10

    # 2. Profit Surge & Acceleration (25 pts)
    if pd.notna(yoy_p):
        if yoy_p >= 25.0: score += 25
        elif yoy_p >= 12.0: score += 18
        elif yoy_p > 0.0: score += 10
    elif turnaround:
        score += 20  # Base was negative; swing into profitability

    # 3. Margin Expansion (20 pts)
    if pd.notna(opm_diff):
        if opm_diff >= 1.5: score += 20
        elif opm_diff >= 0.0: score += 12

    # 4. Operating Profit Sequential Expansion (15 pts)
    if op_expanding:
        score += 15
    elif len(op_s) >= 2 and op_s.iloc[-1] > op_s.iloc[-2]:
        score += 8

    # 5. Turnaround / Inflection Signal (20 pts)
    if turnaround:
        score += 20
    elif len(profit_s) >= 3 and profit_s.iloc[-1] > 0 and (profit_s.iloc[-3:] > 0).all():
        score += 10  # Multi-year sustained positive trajectory

    return {
        "Opportunity_Score": round(min(score, 100.0), 1),
        "Opportunity_Band": "Strong Catalyst/Turnaround" if score >= 70 else ("Moderate Momentum" if score >= 45 else "Stagnant/No Catalyst")
    }


# ------------------------------------------------------------------------------
# 4C. VALUATION WARNING ENGINE (Categorical Classification)
# ------------------------------------------------------------------------------

def evaluate_valuation_category(val_data: dict, profit_s: pd.Series) -> dict:
    """
    Classifies valuation into warning bands relative to historical ranges.
    Does NOT add or subtract points from stock quality.
    """
    curr_pe = val_data.get("Current_PE")
    pe_med = val_data.get("PE_Median")

    if profit_s.empty or profit_s.iloc[-1] <= 0 or pd.isna(curr_pe):
        category = "Loss Maker / Distressed (No P/E)"
        risk_level = "High Risk (Unprofitable)"
    elif pd.notna(pe_med) and pe_med > 0:
        if curr_pe > (pe_med * 1.40):
            category = "Extremely Expensive vs History"
            risk_level = "Elevated Valuation Risk"
        elif curr_pe > (pe_med * 1.15):
            category = "Expensive vs History"
            risk_level = "Moderate Valuation Risk"
        elif curr_pe < (pe_med * 0.85):
            category = "Cheap vs History"
            risk_level = "Potential Value / Re-rating Cushion"
        else:
            category = "Fair Valuation"
            risk_level = "Neutral"
    else:
        category = "Normal Range / Insufficient History"
        risk_level = "Neutral"

    return {
        "Current_PE": curr_pe,
        "PE_Historical_Median": pe_med,
        "PE_Min": val_data.get("PE_Min"),
        "PE_Max": val_data.get("PE_Max"),
        "Valuation_Category": category,
        "Valuation_Risk_Level": risk_level
    }


# ==============================================================================
# 5. ORCHESTRATION PIPELINE & BATCH RUNNER
# ==============================================================================

def analyze_screener_file(filepath: str, output_csv: str = None) -> pd.DataFrame:
    """End-to-end analyzer returning independent Quality, Opportunity, and Valuation metrics."""
    parsed = parse_screener_workbook(filepath)
    company_name = parsed["company_name"]
    current_price = parsed["current_price"]
    row_data = parsed["row_data"]

    # 1. Base Metric Computations
    growth_d, sales_s, profit_s, eps_s = compute_growth_metrics(row_data)
    prof_d = compute_profitability_metrics(row_data, sales_s, profit_s)
    accel_d = compute_acceleration_metrics(sales_s, profit_s, prof_d["OP_Series"], prof_d["OPM_Series"], eps_s)
    val_d = compute_valuation_metrics(row_data, current_price, eps_s, growth_d.get("Profit_Recent_YoY_%"))

    # 2. Dual Score & Valuation Category Computations
    quality_results = score_business_quality(growth_d, prof_d, sales_s, profit_s)
    opportunity_results = score_opportunity_improvement(growth_d, accel_d, sales_s, profit_s, prof_d["OP_Series"])
    valuation_results = evaluate_valuation_category(val_d, profit_s)

    # 3. Structured Output Assembly
    report = {"Company": company_name}
    report.update(quality_results)
    report.update(opportunity_results)
    report.update(valuation_results)

    # Underlying Detail Metrics
    report.update({
        "Sales_5Y_CAGR_%": growth_d.get("Sales_5Y_CAGR_%"),
        "Profit_5Y_CAGR_%": growth_d.get("Profit_5Y_CAGR_%"),
        "Sales_Recent_YoY_%": growth_d.get("Sales_Recent_YoY_%"),
        "Profit_Recent_YoY_%": growth_d.get("Profit_Recent_YoY_%"),
        "Current_OPM_%": prof_d.get("Current_OPM_%"),
        "Current_NPM_%": prof_d.get("Current_NPM_%"),
        "Sales_Acceleration_Delta_%": accel_d.get("Sales_Acceleration_Delta_%"),
        "OPM_Expansion_Delta_%": accel_d.get("OPM_Expansion_Delta_%"),
        "Turnaround_Signal": accel_d.get("Turnaround_Signal")
    })

    df_result = pd.DataFrame([report])

    if output_csv:
        df_result.to_csv(output_csv, index=False)
        print(f"\n[✓] Analysis saved to: {output_csv}")

    return df_result


if __name__ == "__main__":
    target_files = [
        r"& 'c:\Users\tarun\Downloads\Vodafone Idea.xlsx'",
        r" c:\Users\tarun\Downloads\Eternal.xlsx     ",
        r" c:\Users\tarun\Downloads\TCS.xlsx    ",
        r"'c:\Users\tarun\Downloads\ICICI Bank.xlsx'    "
    ]

    # Check if user dragged a single file via CLI or if target files exist
    files_to_run = []
    if len(sys.argv) > 1:
        files_to_run = [sys.argv[1]]
    else:
        # Check if pre-configured target_files exist on this machine
        existing_targets = [p for p in target_files if os.path.exists(clean_dragged_path(p))]
        if existing_targets:
            files_to_run = existing_targets
        elif os.path.exists("ICICI Bank.xlsx"):
            files_to_run = ["ICICI Bank.xlsx"]
        else:
            user_in = input("Drag and drop your Screener Excel file here, then press Enter: ")
            files_to_run = [user_in]

    for raw_p in files_to_run:
        clean_p = clean_dragged_path(raw_p)

        if os.path.exists(clean_p):
            base_name = os.path.splitext(os.path.basename(clean_p))[0]
            output_file = f"{base_name}_analysis.csv"

            result = analyze_screener_file(clean_p, output_csv=output_file)

            print("\n" + "=" * 60)
            print(f"FUNDAMENTAL ANALYSIS REPORT: {result['Company'].iloc[0]}")
            print("=" * 60)
            print(result.T.to_string(header=False))
            print("=" * 60)
        else:
            print(f"\n[!] Error: File not found at '{clean_p}'")