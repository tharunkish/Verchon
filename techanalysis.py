"""
Technical Analyzer Engine (Module 2 - Swing Trading Confirmation)
Holding Horizon: 3 weeks to 2 months (NSE Cash / Swing Setups)

Objective:
Verify whether current market price action confirms the underlying fundamental thesis.

Key Capabilities:
1. Trend Structure: 50 & 200 DMA positioning and directional slopes (with adaptive fallback
   for newly listed/demerged stocks having < 200 bars).
2. Momentum & Relative Strength: 1M, 3M, 6M, and 1Y alpha over Nifty 50 (^NSEI).
3. Institutional Volume Confirmation: Up-day vs down-day volume skew & volume expansion.
4. Swing Setup Classifier: 52-week high proximity, breakouts, range contractions, and pullbacks.
5. Modular 100-Point Technical Score & Posture Classification.
"""

import sys
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np
import pandas as pd
import yfinance as yf


# ==============================================================================
# 1. DATA INGESTION ENGINE
# ==============================================================================

def format_nse_ticker(ticker: str) -> str:
    """Normalizes NSE ticker symbols for Yahoo Finance ingestion."""
    clean = ticker.strip().upper()
    if clean.startswith("^"):
        return clean
    if not clean.endswith(".NS"):
        return f"{clean}.NS"
    return clean


# Global batch memory cache for fast prefetching across entire universes
_BATCH_OHLCV_CACHE: Dict[str, pd.DataFrame] = {}


def prefetch_batch_ohlcv(tickers: List[str], benchmark: str = "^NSEI", period: str = "2y") -> None:
    """
    Downloads daily adjusted OHLCV data for an entire list of tickers in a single batch HTTP request.
    Stores extracted DataFrames in _BATCH_OHLCV_CACHE for fast instant access.
    """
    global _BATCH_OHLCV_CACHE
    bench_sym = benchmark.strip().upper()
    formatted_symbols = [format_nse_ticker(t) for t in tickers]
    all_symbols = list(dict.fromkeys(formatted_symbols + [bench_sym]))

    try:
        # Chunk requests into groups of 60 tickers to keep yfinance downloads fast, stable, and avoid rate limits
        chunk_size = 60
        for i in range(0, len(all_symbols), chunk_size):
            chunk_symbols = all_symbols[i:i + chunk_size]
            data = yf.download(
                tickers=chunk_symbols,
                period=period,
                interval="1d",
                auto_adjust=True,
                progress=False,
                group_by="ticker"
            )
            if data.empty:
                continue

            # If only 1 ticker in chunk, data columns are single-level
            if not isinstance(data.columns, pd.MultiIndex):
                single_sym = chunk_symbols[0]
                try:
                    df = pd.DataFrame({
                        "Open": data["Open"],
                        "High": data["High"],
                        "Low": data["Low"],
                        "Close": data["Close"],
                        "Volume": data["Volume"]
                    }).dropna()
                    if not df.empty:
                        _BATCH_OHLCV_CACHE[single_sym] = df
                except Exception:
                    pass
                continue

            # MultiIndex columns for multiple tickers
            for sym in chunk_symbols:
                try:
                    if sym in data.columns.levels[0]:
                        df = pd.DataFrame({
                            "Open": data[sym]["Open"],
                            "High": data[sym]["High"],
                            "Low": data[sym]["Low"],
                            "Close": data[sym]["Close"],
                            "Volume": data[sym]["Volume"]
                        }).dropna()
                        if not df.empty:
                            _BATCH_OHLCV_CACHE[sym] = df
                except KeyError:
                    continue
    except Exception:
        pass


def fetch_daily_ohlcv(ticker: str, benchmark: str = "^NSEI", period: str = "2y") -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Downloads daily adjusted OHLCV data for the stock and benchmark.
    Uses _BATCH_OHLCV_CACHE if pre-fetched in batch, avoiding redundant HTTP calls.
    """
    stock_sym = format_nse_ticker(ticker)
    bench_sym = benchmark.strip().upper()

    # Check batch cache first
    stock_df = _BATCH_OHLCV_CACHE.get(stock_sym)
    bench_df = _BATCH_OHLCV_CACHE.get(bench_sym, pd.DataFrame())

class StrategyPredicate:
    """
    Deterministic predicate representation for strategy qualification and signal evaluation.
    Answers: What was checked? What value did we observe? What threshold/rule was required?
    Did it pass? If not, why?
    """
    def __init__(
        self,
        name: str,
        description: str,
        observed: Any,
        required: str,
        passed: bool,
        failure_reason: Optional[str] = None
    ):
        self.name = name
        self.description = description
        self.observed = observed
        self.required = required
        self.passed = bool(passed)
        self.failure_reason = failure_reason if not passed else None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "observed": self.observed,
            "required": self.required,
            "passed": self.passed,
            "failure_reason": self.failure_reason
        }


def validate_ohlcv_data(df: pd.DataFrame, ticker: str = "TICKER") -> Tuple[bool, List[str]]:
    """
    Audits OHLCV dataframe integrity against impossible relationships, corrupt rows,
    insufficient history, duplicate/non-monotonic dates, and data staleness.
    Returns (is_valid, list_of_errors).
    """
    errors: List[str] = []
    if df is None or df.empty:
        return False, ["OHLCV dataframe is empty or None"]

    required_cols = ["Open", "High", "Low", "Close", "Volume"]
    missing_cols = [c for c in required_cols if c not in df.columns]
    if missing_cols:
        return False, [f"Missing required OHLCV columns: {missing_cols}"]

    # Minimum history check
    if len(df) < 50:
        errors.append(f"Insufficient history ({len(df)} bars < 50 bars minimum required for swing analysis)")

    # Date index integrity
    if not isinstance(df.index, pd.DatetimeIndex):
        try:
            df_index = pd.to_datetime(df.index)
        except Exception:
            errors.append("Index cannot be parsed as DatetimeIndex")
            df_index = None
    else:
        df_index = df.index

    if df_index is not None:
        if df_index.has_duplicates:
            errors.append("Duplicate timestamps detected in date index")
        if not df_index.is_monotonic_increasing:
            errors.append("Date index is not strictly monotonically increasing")

    # Impossible OHLC price bounds
    high = df["High"]
    low = df["Low"]
    close = df["Close"]
    open_p = df["Open"]

    if (close <= 0).any():
        errors.append("Non-positive Close price detected (Close <= 0)")
    if (low <= 0).any():
        errors.append("Non-positive Low price detected (Low <= 0)")
    if (high < low).any():
        errors.append("Impossible price bar detected where High < Low")
    if (close > high).any():
        errors.append("Impossible price bar detected where Close > High")
    if (close < low).any():
        errors.append("Impossible price bar detected where Close < Low")
    if (open_p > high).any():
        errors.append("Impossible price bar detected where Open > High")
    if (open_p < low).any():
        errors.append("Impossible price bar detected where Open < Low")

    # NaN / Inf checks
    if df[required_cols].isna().any().any():
        errors.append("NaN values detected in required OHLCV series")

    # Suspicious multi-day trading halt (e.g. 5+ consecutive trading sessions with 0 volume)
    vol = df["Volume"]
    if len(vol) >= 5 and (vol.iloc[-5:] == 0).all():
        errors.append("Recent trading activity suspended: Volume is 0 across last 5 consecutive sessions")

    return len(errors) == 0, errors


def align_stock_and_benchmark(
    stock_series: pd.Series,
    bench_series: pd.Series
) -> Tuple[pd.Series, pd.Series]:
    """
    Explicitly aligns stock and benchmark series on normalized trading calendar dates.
    Never relies on positional or vector-length coincidence.
    """
    if stock_series.empty or bench_series.empty:
        return stock_series, bench_series

    # Normalize indexes to date-only without timezone
    s = stock_series.copy()
    b = bench_series.copy()

    s.index = pd.to_datetime(s.index).normalize()
    b.index = pd.to_datetime(b.index).normalize()

    # Drop any duplicate calendar days
    s = s[~s.index.duplicated(keep="last")]
    b = b[~b.index.duplicated(keep="last")]

    # Inner join on common dates
    common_idx = s.index.intersection(b.index).sort_values()
    return s.loc[common_idx], b.loc[common_idx]


def fetch_daily_ohlcv(
    ticker: str,
    benchmark: str = "^NSEI",
    period: str = "2y",
    as_of_date: Optional[str] = None
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Fetches daily OHLCV dataframe for ticker and benchmark index from Yahoo Finance.
    First checks _BATCH_OHLCV_CACHE. Validates data integrity before returning.
    Enforces temporal look-ahead boundary if as_of_date is provided.
    """
    global _BATCH_OHLCV_CACHE
    stock_sym = format_nse_ticker(ticker)
    bench_sym = benchmark.strip().upper()

    stock_df: Optional[pd.DataFrame] = _BATCH_OHLCV_CACHE.get(stock_sym)
    bench_df: Optional[pd.DataFrame] = _BATCH_OHLCV_CACHE.get(bench_sym, pd.DataFrame())

    if stock_df is not None and not stock_df.empty:
        df_copy = stock_df.copy()
        b_copy = bench_df.copy() if bench_df is not None and not bench_df.empty else pd.DataFrame()
        if as_of_date:
            cutoff = pd.to_datetime(as_of_date)
            df_copy = df_copy[df_copy.index <= cutoff]
            if not b_copy.empty:
                b_copy = b_copy[b_copy.index <= cutoff]
        is_val, errs = validate_ohlcv_data(df_copy, stock_sym)
        if not is_val:
            raise ValueError(f"Data validation failed for cached {stock_sym}: {'; '.join(errs)}")
        return df_copy, b_copy

    # Fallback to single-symbol download if not in batch cache
    data = yf.download(
        tickers=[stock_sym, bench_sym],
        period=period,
        interval="1d",
        auto_adjust=True,
        progress=False
    )

    if data.empty:
        raise ValueError(f"No market data returned for '{stock_sym}'. Symbol may be delisted or invalid on NSE.")

    # Flatten yfinance MultiIndex columns if present
    if isinstance(data.columns, pd.MultiIndex):
        try:
            stock_df = pd.DataFrame({
                "Open": data["Open"][stock_sym],
                "High": data["High"][stock_sym],
                "Low": data["Low"][stock_sym],
                "Close": data["Close"][stock_sym],
                "Volume": data["Volume"][stock_sym]
            }).dropna()
        except KeyError:
            raise ValueError(f"Symbol '{stock_sym}' was not returned in download payload.")

        try:
            bench_df = pd.DataFrame({
                "Close": data["Close"][bench_sym]
            }).dropna()
        except KeyError:
            bench_df = pd.DataFrame()
    else:
        stock_df = data.dropna()
        bench_df = pd.DataFrame()

    if as_of_date:
        cutoff = pd.to_datetime(as_of_date)
        stock_df = stock_df[stock_df.index <= cutoff]
        if not bench_df.empty:
            bench_df = bench_df[bench_df.index <= cutoff]

    # Safety checks and rigorous data integrity validation
    is_val, errs = validate_ohlcv_data(stock_df, stock_sym)
    if not is_val:
        raise ValueError(f"Data validation failed for {stock_sym}: {'; '.join(errs)}")

    return stock_df, bench_df


# ==============================================================================
# 2. TREND STRUCTURE ANALYSIS
# ==============================================================================

def analyze_trend(df: pd.DataFrame) -> dict:
    """
    Evaluates 50 DMA, 200 DMA, distance spreads, and slope angles over 20 sessions.
    Handles newly listed/demerged stocks adaptively if length < 200 bars.
    Classifies overall trend as: Strong uptrend, Uptrend, Neutral, or Downtrend.
    """
    close = df["Close"]
    curr_price = float(close.iloc[-1])

    # 50 DMA
    dma_50 = close.rolling(window=50).mean()
    curr_50 = float(dma_50.iloc[-1])
    dist_50 = round(((curr_price - curr_50) / curr_50) * 100, 2)
    
    # Canonical V1 50 DMA slope: current_50DMA - 50DMA_5_sessions_ago (in currency units)
    if len(dma_50) >= 6 and pd.notna(dma_50.iloc[-6]):
        slope_50 = round(curr_50 - float(dma_50.iloc[-6]), 2)
        dir_50 = "Rising" if slope_50 > 0 else ("Falling" if slope_50 < 0 else "Flat")
    else:
        slope_50 = 0.0
        dir_50 = "Flat"

    # 200 DMA (with adaptive fallback if company is newly listed/split)
    has_200_bars = len(close) >= 200
    if has_200_bars:
        dma_200 = close.rolling(window=200).mean()
        curr_200 = float(dma_200.iloc[-1])
        dist_200 = round(((curr_price - curr_200) / curr_200) * 100, 2)
        if len(dma_200) >= 6 and pd.notna(dma_200.iloc[-6]):
            slope_200 = round(curr_200 - float(dma_200.iloc[-6]), 2)
            dir_200 = "Rising" if slope_200 > 0 else ("Falling" if slope_200 < 0 else "Flat")
        else:
            slope_200 = 0.0
            dir_200 = "Flat"
    else:
        curr_200 = curr_50
        dist_200 = dist_50
        slope_200 = slope_50
        dir_200 = dir_50

    # Trend categorization
    if curr_price > curr_50 >= curr_200 and dir_50 == "Rising" and dir_200 != "Falling":
        classification = "Strong uptrend"
    elif curr_price > curr_200 and (curr_price > curr_50 or dir_50 == "Rising"):
        classification = "Uptrend"
    elif curr_price < curr_50 and curr_price < curr_200 and dir_50 == "Falling":
        classification = "Downtrend"
    else:
        classification = "Neutral"

    return {
        "Current_Price": round(curr_price, 2),
        "50_DMA": round(curr_50, 2),
        "200_DMA": round(curr_200, 2) if has_200_bars else "N/A (<200d)",
        "Dist_50_DMA_%": dist_50,
        "Dist_200_DMA_%": dist_200,
        "50_DMA_Trend": dir_50,
        "200_DMA_Trend": dir_200,
        "50_DMA_Slope_5d": slope_50,
        "200_DMA_Slope_5d": slope_200,
        "Trend_Classification": classification,
        "Has_200_Bars": has_200_bars
    }


# ==============================================================================
# 3. MOMENTUM & BENCHMARK RELATIVE STRENGTH
# ==============================================================================

def analyze_momentum(stock_df: pd.DataFrame, bench_df: pd.DataFrame) -> dict:
    """
    Computes absolute rolling returns across 1M, 3M, 6M, and 1Y periods.
    Measures Relative Strength = Stock Return - Nifty Return.
    Classifies Relative Strength as: Strong relative strength, Positive, Neutral, or Weak.
    """
    def calc_period_returns(series: pd.Series) -> dict:
        n = len(series)
        horizons = {"1M": 21, "3M": 63, "6M": 126, "1Y": 252}
        rets = {}
        for label, bars in horizons.items():
            if n > bars:
                ret = ((series.iloc[-1] / series.iloc[-bars - 1]) - 1.0) * 100
                rets[label] = round(float(ret), 2)
            else:
                rets[label] = np.nan
        return rets

    # Date-align stock and benchmark before comparative return calculation
    if not bench_df.empty and "Close" in bench_df.columns:
        aligned_stock, aligned_bench = align_stock_and_benchmark(stock_df["Close"], bench_df["Close"])
        stock_rets = calc_period_returns(aligned_stock)
        bench_rets = calc_period_returns(aligned_bench)
    else:
        stock_rets = calc_period_returns(stock_df["Close"])
        bench_rets = {k: 0.0 for k in stock_rets}

    # Relative Alpha (Stock - Nifty)
    rel_strength = {}
    for k in stock_rets:
        s_val = stock_rets[k]
        b_val = bench_rets.get(k, 0.0)
        rel_strength[k] = round(s_val - b_val, 2) if pd.notna(s_val) and pd.notna(b_val) else np.nan

    # Classification focuses on 1M & 3M horizons for swing trading
    rs_1m = rel_strength.get("1M", 0.0)
    rs_3m = rel_strength.get("3M", 0.0)
    rs_6m = rel_strength.get("6M", 0.0)

    rs_1m_valid = rs_1m if pd.notna(rs_1m) else 0.0
    rs_3m_valid = rs_3m if pd.notna(rs_3m) else 0.0
    rs_6m_valid = rs_6m if pd.notna(rs_6m) else 0.0

    if (rs_1m_valid > 3.0 and rs_3m_valid > 5.0) or (rs_3m_valid > 10.0 and rs_6m_valid > 10.0):
        classification = "Strong relative strength"
    elif rs_1m_valid > 0.0 or rs_3m_valid > 0.0:
        classification = "Positive"
    elif rs_1m_valid < -4.0 and rs_3m_valid < -6.0:
        classification = "Weak"
    else:
        classification = "Neutral"

    return {
        "Stock_Returns_%": stock_rets,
        "Nifty_Returns_%": bench_rets,
        "Relative_Strength_Alpha_%": rel_strength,
        "Relative_Strength_Classification": classification
    }


# ==============================================================================
# 4. INSTITUTIONAL VOLUME PROFILE
# ==============================================================================

def analyze_volume(df: pd.DataFrame) -> dict:
    """
    Evaluates institutional buying vs selling pressure:
    - 50-day average volume baseline
    - Recent volume expansion (5-day vs 50-day average)
    - Up-day volume vs down-day volume skew over last 20 sessions
    Classifies volume as: Strong volume confirmation, Normal, or Weak.
    """
    vol = df["Volume"]
    close = df["Close"]

    vol_avg_50 = float(vol.rolling(window=50).mean().iloc[-1])
    vol_recent_5 = float(vol.iloc[-5:].mean())
    vol_expansion_ratio = round(vol_recent_5 / vol_avg_50, 2) if vol_avg_50 > 0 else 1.0

    # Up-day vs down-day volume skew (Accumulation vs Distribution check)
    changes = close.diff().iloc[-20:]
    vols_20 = vol.iloc[-20:]

    up_vol = vols_20[changes > 0].mean()
    down_vol = vols_20[changes < 0].mean()

    up_down_ratio = round(float(up_vol / down_vol), 2) if pd.notna(down_vol) and down_vol > 0 else 1.0

    # Volume classification
    if up_down_ratio >= 1.30 and vol_expansion_ratio >= 1.0:
        classification = "Strong volume confirmation"
    elif up_down_ratio < 0.80 or (vol_expansion_ratio < 0.65 and changes.iloc[-1] > 0):
        classification = "Weak"
    else:
        classification = "Normal"

    return {
        "50_Day_Avg_Volume": int(vol_avg_50),
        "Recent_5_Day_Avg_Volume": int(vol_recent_5),
        "Volume_Expansion_Ratio": vol_expansion_ratio,
        "Up_Down_Volume_Ratio": up_down_ratio,
        "Volume_Classification": classification
    }


# ==============================================================================
# 5. CONFIRMED SWING LOW ENGINE & STRATEGY UTILITIES
# ==============================================================================

def find_confirmed_swing_lows(df: pd.DataFrame, start_idx: int, end_idx: int) -> list[dict]:
    """
    Finds all confirmed 2-left / 2-right swing lows strictly within [start_idx, end_idx]:
    Low[i] < Low[i-1] and Low[i] < Low[i-2] and Low[i] <= Low[i+1] and Low[i] <= Low[i+2]
    
    Returns list of dicts: [{"index": i, "date": date_str, "low": float(low_val)}]
    ordered chronologically.
    """
    lows = df["Low"].values
    dates = df.index
    n = len(lows)
    confirmed = []

    # A 2-left / 2-right swing low requires i >= 2 and i + 2 < n
    effective_start = max(2, start_idx)
    effective_end = min(n - 3, end_idx)

    for i in range(effective_start, effective_end + 1):
        if (lows[i] < lows[i - 1] and 
            lows[i] < lows[i - 2] and 
            lows[i] <= lows[i + 1] and 
            lows[i] <= lows[i + 2]):
            d_val = dates[i]
            d_str = d_val.strftime("%Y-%m-%d") if hasattr(d_val, "strftime") else str(d_val)[:10]
            confirmed.append({
                "index": i,
                "date": d_str,
                "low": round(float(lows[i]), 2)
            })

    return confirmed


def check_trend_qualification(df: pd.DataFrame, trend_info: dict) -> tuple[bool, list[str], list[dict]]:
    """
    Common Technical Trend Qualification (Section 5):
    - Current Price > 200 DMA
    - 50 DMA > 200 DMA
    - 50 DMA slope > 0 (using current_50DMA - 50DMA_5_sessions_ago > 0)
    Returns: (is_qualified, list_of_failed_reasons, list_of_predicate_dicts)
    """
    failed = []
    truth_table: list[dict] = []
    close = df["Close"]
    curr_price = float(close.iloc[-1])

    if len(close) < 200:
        msg = f"Insufficient history for 200 DMA ({len(close)} bars < 200)"
        failed.append(msg)
        p = StrategyPredicate(
            name="history_length_200",
            description="At least 200 bars for 200 DMA",
            observed=len(close),
            required=">= 200 bars",
            passed=False,
            failure_reason=msg
        )
        truth_table.append(p.to_dict())
        return False, failed, truth_table

    dma_50 = close.rolling(window=50).mean()
    dma_200 = close.rolling(window=200).mean()

    curr_50 = float(dma_50.iloc[-1])
    curr_200 = float(dma_200.iloc[-1])

    if pd.isna(curr_50) or pd.isna(curr_200):
        failed.append("50 DMA or 200 DMA contains NaN")
        p = StrategyPredicate(
            name="dma_validity",
            description="50 DMA and 200 DMA are non-NaN",
            observed=f"50 DMA={curr_50}, 200 DMA={curr_200}",
            required="Non-NaN values",
            passed=False,
            failure_reason="50 DMA or 200 DMA contains NaN"
        )
        truth_table.append(p.to_dict())
        return False, failed, truth_table

    # 1. Current Price > 200 DMA
    p1_pass = curr_price > curr_200
    p1_fail = None if p1_pass else f"Price (₹{curr_price:.2f}) <= 200 DMA (₹{curr_200:.2f})"
    if not p1_pass:
        failed.append(p1_fail)
    truth_table.append(StrategyPredicate(
        name="price_gt_200dma",
        description="Current Price > 200 DMA",
        observed=round(curr_price, 2),
        required=f"> {curr_200:.2f}",
        passed=p1_pass,
        failure_reason=p1_fail
    ).to_dict())

    # 2. 50 DMA > 200 DMA
    p2_pass = curr_50 > curr_200
    p2_fail = None if p2_pass else f"50 DMA (₹{curr_50:.2f}) <= 200 DMA (₹{curr_200:.2f})"
    if not p2_pass:
        failed.append(p2_fail)
    truth_table.append(StrategyPredicate(
        name="50dma_gt_200dma",
        description="50 DMA > 200 DMA",
        observed=round(curr_50, 2),
        required=f"> {curr_200:.2f}",
        passed=p2_pass,
        failure_reason=p2_fail
    ).to_dict())

    # 3. 50 DMA slope > 0 (current - 5 sessions ago)
    if len(dma_50) >= 6 and pd.notna(dma_50.iloc[-6]):
        dma_50_5d_ago = float(dma_50.iloc[-6])
        slope_50 = curr_50 - dma_50_5d_ago
        p3_pass = slope_50 > 0
        p3_fail = None if p3_pass else f"50 DMA slope (5-session Δ: ₹{slope_50:+.2f}) is not positive"
        if not p3_pass:
            failed.append(p3_fail)
        truth_table.append(StrategyPredicate(
            name="50dma_slope_positive",
            description="50 DMA 5-session slope > 0",
            observed=round(slope_50, 2),
            required="> 0",
            passed=p3_pass,
            failure_reason=p3_fail
        ).to_dict())
    else:
        failed.append("Insufficient data for 5-session 50 DMA slope calculation")
        truth_table.append(StrategyPredicate(
            name="50dma_slope_positive",
            description="50 DMA 5-session slope > 0",
            observed=None,
            required="> 0",
            passed=False,
            failure_reason="Insufficient data for 5-session 50 DMA slope calculation"
        ).to_dict())

    return len(failed) == 0, failed, truth_table


# ==============================================================================
# 5.1 STRATEGY 1 — TREND PULLBACK / CONTINUATION
# ==============================================================================

def evaluate_trend_pullback(df: pd.DataFrame, trend_info: dict, trend_qual: bool, trend_reasons: list[str]) -> dict:
    """
    Strategy 1 — Trend Pullback / Continuation
    Purpose: Detect an uptrend that temporarily retraces toward its 50 DMA and shows renewed strength.
    """
    res = {
        "strategy_name": "TREND_PULLBACK",
        "qualified": trend_qual,
        "setup_detected": False,
        "signal_triggered": False,
        "state": "QUALIFIED" if trend_qual else "NOT_QUALIFIED",
        "signal_date": None,
        "signal_close": None,
        "expected_entry": None,
        "actual_entry": None,
        "stop_price": None,
        "risk_percent": None,
        "pullback_start_date": None,
        "pullback_touch_date": None,
        "pullback_touch_low": None,
        "pullback_touch_50dma": None,
        "invalidation_reason": None,
        "rejection_reason": None,
    }

    if not trend_qual:
        res["invalidation_reason"] = "; ".join(trend_reasons)
        return res

    close = df["Close"]
    high = df["High"]
    low = df["Low"]
    open_p = df["Open"]
    dates = df.index
    n = len(df)

    truth_table: list[dict] = []

    if n < 55:
        res["qualified"] = False
        res["state"] = "NOT_QUALIFIED"
        res["invalidation_reason"] = "INSUFFICIENT_DATA"
        truth_table.append(StrategyPredicate(
            name="history_length_55",
            description="At least 55 bars for pullback evaluation",
            observed=n,
            required=">= 55 bars",
            passed=False,
            failure_reason="INSUFFICIENT_DATA"
        ).to_dict())
        res["truth_table"] = truth_table
        return res

    dma_50 = close.rolling(window=50).mean()

    # Previous 10 completed sessions: indices (n-11) to (n-2) inclusive
    # Signal day is today: index n-1
    pullback_window_indices = list(range(n - 11, n - 1))
    qualifying_touch_sessions = []

    for idx in pullback_window_indices:
        dma_val = float(dma_50.iloc[idx])
        low_val = float(low.iloc[idx])
        if pd.notna(dma_val) and (0.95 * dma_val <= low_val <= 1.03 * dma_val):
            d_val = dates[idx]
            d_str = d_val.strftime("%Y-%m-%d") if hasattr(d_val, "strftime") else str(d_val)[:10]
            qualifying_touch_sessions.append({
                "index": idx,
                "date": d_str,
                "low": round(low_val, 2),
                "dma_50": round(dma_val, 2)
            })

    touch_passed = len(qualifying_touch_sessions) > 0
    truth_table.append(StrategyPredicate(
        name="pullback_touch_50dma",
        description="Low touches 50 DMA within 0.95x - 1.03x in prev 10 sessions",
        observed=len(qualifying_touch_sessions),
        required=">= 1 touch session",
        passed=touch_passed,
        failure_reason=None if touch_passed else "NO_PULLBACK_TOUCH_IN_PREV_10_SESSIONS"
    ).to_dict())

    if not touch_passed:
        res["invalidation_reason"] = "NO_PULLBACK_TOUCH_IN_PREV_10_SESSIONS"
        res["truth_table"] = truth_table
        return res

    # Earliest qualifying session defines pullback_start_date
    start_session = qualifying_touch_sessions[0]
    last_touch = qualifying_touch_sessions[-1]
    res["pullback_start_date"] = start_session["date"]
    res["pullback_touch_date"] = last_touch["date"]
    res["pullback_touch_low"] = last_touch["low"]
    res["pullback_touch_50dma"] = last_touch["dma_50"]

    # 7.3 Current price requirement: Close >= Current 50 DMA
    curr_close = float(close.iloc[-1])
    curr_50 = float(dma_50.iloc[-1])
    close_above_50 = curr_close >= curr_50
    truth_table.append(StrategyPredicate(
        name="close_gte_50dma",
        description="Current Close >= 50 DMA",
        observed=round(curr_close, 2),
        required=f">= {curr_50:.2f}",
        passed=close_above_50,
        failure_reason=None if close_above_50 else f"Current Close (₹{curr_close:.2f}) < 50 DMA (₹{curr_50:.2f})"
    ).to_dict())

    if not close_above_50:
        res["setup_detected"] = False
        res["invalidation_reason"] = f"Current Close (₹{curr_close:.2f}) < 50 DMA (₹{curr_50:.2f})"
        res["state"] = "INVALIDATED"
        res["truth_table"] = truth_table
        return res

    # Setup is detected and forming
    res["setup_detected"] = True
    res["state"] = "SETUP_FORMING"

    # 7.4 Entry trigger: Today's Close > Prev Day High AND Today's Close > Today's Open
    prev_high = float(high.iloc[-2])
    today_open = float(open_p.iloc[-1])

    trigger_bullish = (curr_close > prev_high) and (curr_close > today_open)
    truth_table.append(StrategyPredicate(
        name="bullish_reversal_trigger",
        description="Close > Prev High AND Close > Open",
        observed=f"Close={curr_close:.2f}, PrevHigh={prev_high:.2f}, Open={today_open:.2f}",
        required="Close > PrevHigh and Close > Open",
        passed=trigger_bullish,
        failure_reason=None if trigger_bullish else "TRIGGER_CONDITIONS_NOT_MET"
    ).to_dict())

    if not trigger_bullish:
        res["truth_table"] = truth_table
        return res

    # 7.5 Swing-low calculation:
    # Most recent confirmed 2-left / 2-right swing low occurring on or after pullback_start_date and before signal day (index < n-1)
    start_idx = start_session["index"]
    end_idx = n - 2  # strictly before signal day
    swing_lows = find_confirmed_swing_lows(df, start_idx, end_idx)

    has_swing_low = len(swing_lows) > 0
    truth_table.append(StrategyPredicate(
        name="confirmed_swing_low_available",
        description="Confirmed 2-left/2-right swing low found in pullback window",
        observed=len(swing_lows),
        required=">= 1 confirmed swing low",
        passed=has_swing_low,
        failure_reason=None if has_swing_low else "NO_VALID_SWING_LOW"
    ).to_dict())

    if not has_swing_low:
        res["signal_triggered"] = False
        res["rejection_reason"] = "NO_VALID_SWING_LOW"
        res["truth_table"] = truth_table
        return res

    # Most recent qualifying swing low
    chosen_stop = swing_lows[-1]["low"]
    sig_date_val = dates[-1]
    sig_date_str = sig_date_val.strftime("%Y-%m-%d") if hasattr(sig_date_val, "strftime") else str(sig_date_val)[:10]

    res["signal_date"] = sig_date_str
    res["signal_close"] = round(curr_close, 2)
    res["expected_entry"] = "NEXT_TRADING_DAY_OPEN"
    res["stop_price"] = chosen_stop

    # Initial risk % measured from signal_close
    risk_pct = round(((curr_close - chosen_stop) / curr_close) * 100, 2)
    res["risk_percent"] = risk_pct

    # Pre-entry risk filter check (0 < risk_pct <= 8%)
    risk_valid = (0 < risk_pct <= 8.0)
    truth_table.append(StrategyPredicate(
        name="risk_pct_within_bounds",
        description="Risk percent between 0% and 8%",
        observed=risk_pct,
        required="0% < Risk <= 8%",
        passed=risk_valid,
        failure_reason=None if risk_valid else f"RISK_OUT_OF_BOUNDS ({risk_pct:.2f}%)"
    ).to_dict())

    if not risk_valid:
        res["state"] = "ENTRY_REJECTED"
        res["signal_triggered"] = False
        res["rejection_reason"] = f"RISK_OUT_OF_BOUNDS ({risk_pct:.2f}%)"
    else:
        res["signal_triggered"] = True
        res["state"] = "SIGNAL_TRIGGERED"

    res["truth_table"] = truth_table
    return res


# ==============================================================================
# 5.2 STRATEGY 2 — CONSOLIDATION → BREAKOUT
# ==============================================================================

def evaluate_consolidation_breakout(df: pd.DataFrame, trend_info: dict, trend_qual: bool, trend_reasons: list[str]) -> dict:
    """
    Strategy 2 — Consolidation → Breakout
    Purpose: Detect an uptrend that forms a tight consolidation (<=12%) and breaks out with volume (>=1.5x 20d avg).
    """
    res = {
        "strategy_name": "CONSOLIDATION_BREAKOUT",
        "qualified": trend_qual,
        "setup_detected": False,
        "signal_triggered": False,
        "state": "QUALIFIED" if trend_qual else "NOT_QUALIFIED",
        "consolidation_start": None,
        "consolidation_end": None,
        "range_percent": None,
        "breakout_level": None,
        "signal_date": None,
        "signal_close": None,
        "signal_volume": None,
        "average_volume_20": None,
        "expected_entry": None,
        "actual_entry": None,
        "stop_price": None,
        "risk_percent": None,
        "invalidation_reason": None,
        "rejection_reason": None,
    }

    if not trend_qual:
        res["invalidation_reason"] = "; ".join(trend_reasons)
        return res

    close = df["Close"]
    high = df["High"]
    low = df["Low"]
    open_p = df["Open"]
    vol = df["Volume"]
    dates = df.index
    n = len(df)

    truth_table: list[dict] = []

    if n < 30:
        res["qualified"] = False
        res["state"] = "NOT_QUALIFIED"
        res["invalidation_reason"] = "INSUFFICIENT_DATA"
        truth_table.append(StrategyPredicate(
            name="history_length_30",
            description="At least 30 bars for consolidation evaluation",
            observed=n,
            required=">= 30 bars",
            passed=False,
            failure_reason="INSUFFICIENT_DATA"
        ).to_dict())
        res["truth_table"] = truth_table
        return res

    # 8.2 Consolidation measurement: Previous 20 completed sessions: (n-21) to (n-2) inclusive
    prev_20_highs = high.iloc[n - 21 : n - 1]
    prev_20_lows = low.iloc[n - 21 : n - 1]
    prev_20_vols = vol.iloc[n - 21 : n - 1]

    highest_high = float(prev_20_highs.max())
    lowest_low = float(prev_20_lows.min())

    if lowest_low <= 0:
        res["invalidation_reason"] = "INVALID_CONSOLIDATION_PRICE_BOUNDS"
        truth_table.append(StrategyPredicate(
            name="valid_price_bounds",
            description="Consolidation lowest low > 0",
            observed=lowest_low,
            required="> 0",
            passed=False,
            failure_reason="INVALID_CONSOLIDATION_PRICE_BOUNDS"
        ).to_dict())
        res["truth_table"] = truth_table
        return res

    range_percent = round(((highest_high - lowest_low) / lowest_low) * 100, 2)
    res["range_percent"] = range_percent
    res["breakout_level"] = round(highest_high, 2)

    d_start = dates[n - 21]
    d_end = dates[n - 2]
    res["consolidation_start"] = d_start.strftime("%Y-%m-%d") if hasattr(d_start, "strftime") else str(d_start)[:10]
    res["consolidation_end"] = d_end.strftime("%Y-%m-%d") if hasattr(d_end, "strftime") else str(d_end)[:10]

    # Consolidation condition: range_percent <= 12%
    range_pass = range_percent <= 12.0
    truth_table.append(StrategyPredicate(
        name="consolidation_range_lte_12",
        description="20-session consolidation range <= 12%",
        observed=range_percent,
        required="<= 12.0%",
        passed=range_pass,
        failure_reason=None if range_pass else f"CONSOLIDATION_RANGE_EXCEEDS_12_PCT ({range_percent:.1f}%)"
    ).to_dict())

    if not range_pass:
        res["invalidation_reason"] = f"CONSOLIDATION_RANGE_EXCEEDS_12_PCT ({range_percent:.1f}%)"
        res["truth_table"] = truth_table
        return res

    # 8.3 Near-resistance requirement: distance_to_high <= 5% (or already above high)
    curr_close = float(close.iloc[-1])
    distance_to_high = ((highest_high - curr_close) / highest_high) * 100
    near_res_pass = distance_to_high <= 5.0
    truth_table.append(StrategyPredicate(
        name="near_resistance_lte_5pct",
        description="Distance to resistance <= 5%",
        observed=round(distance_to_high, 2),
        required="<= 5.0%",
        passed=near_res_pass,
        failure_reason=None if near_res_pass else f"PRICE_TOO_FAR_FROM_RESISTANCE ({distance_to_high:.1f}% > 5%)"
    ).to_dict())

    if not near_res_pass:
        res["invalidation_reason"] = f"PRICE_TOO_FAR_FROM_RESISTANCE ({distance_to_high:.1f}% > 5%)"
        res["truth_table"] = truth_table
        return res

    # Setup is detected and forming
    res["setup_detected"] = True
    res["state"] = "SETUP_FORMING"

    # 8.4 Breakout trigger:
    # Today's Close > Previous 20-Session High
    # Today's Volume >= 1.5 * average volume of previous 20 sessions
    # Today's Close > Today's Open
    avg_vol_20 = float(prev_20_vols.mean())
    curr_vol = float(vol.iloc[-1])
    today_open = float(open_p.iloc[-1])

    res["average_volume_20"] = round(avg_vol_20, 0)
    res["signal_volume"] = round(curr_vol, 0)

    breakout_price = curr_close > highest_high
    breakout_vol = curr_vol >= (1.5 * avg_vol_20)
    bullish_candle = curr_close > today_open

    truth_table.append(StrategyPredicate(
        name="breakout_price_gt_high",
        description="Today's Close > Previous 20-Session High",
        observed=round(curr_close, 2),
        required=f"> {highest_high:.2f}",
        passed=breakout_price,
        failure_reason=None if breakout_price else "WAITING_FOR_BREAKOUT_ABOVE_RESISTANCE"
    ).to_dict())

    truth_table.append(StrategyPredicate(
        name="breakout_vol_gte_1_5x",
        description="Today's Volume >= 1.5x 20-session average volume",
        observed=round(curr_vol / avg_vol_20, 2) if avg_vol_20 > 0 else 0.0,
        required=">= 1.50x",
        passed=breakout_vol,
        failure_reason=None if breakout_vol else f"INSUFFICIENT_VOLUME_CONFIRMATION ({curr_vol/avg_vol_20:.2f}x < 1.5x)"
    ).to_dict())

    truth_table.append(StrategyPredicate(
        name="breakout_close_gt_open",
        description="Today's Close > Today's Open",
        observed=f"Close={curr_close:.2f}, Open={today_open:.2f}",
        required="Close > Open",
        passed=bullish_candle,
        failure_reason=None if bullish_candle else "CLOSE_NOT_GREATER_THAN_OPEN"
    ).to_dict())

    if not (breakout_price and breakout_vol and bullish_candle):
        if not breakout_price:
            res["rejection_reason"] = "WAITING_FOR_BREAKOUT_ABOVE_RESISTANCE"
        elif not breakout_vol:
            res["rejection_reason"] = f"INSUFFICIENT_VOLUME_CONFIRMATION ({curr_vol/avg_vol_20:.2f}x < 1.5x)"
        else:
            res["rejection_reason"] = "CLOSE_NOT_GREATER_THAN_OPEN"
        res["truth_table"] = truth_table
        return res

    # 8.5 Stop: most recent confirmed 2-left / 2-right swing low inside the previous 20-session consolidation
    start_idx = n - 21
    end_idx = n - 2
    swing_lows = find_confirmed_swing_lows(df, start_idx, end_idx)

    has_swing_low = len(swing_lows) > 0
    truth_table.append(StrategyPredicate(
        name="consolidation_swing_low_available",
        description="Confirmed swing low in 20-session consolidation",
        observed=len(swing_lows),
        required=">= 1 swing low",
        passed=has_swing_low,
        failure_reason=None if has_swing_low else "NO_VALID_CONSOLIDATION_SWING_LOW"
    ).to_dict())

    if not has_swing_low:
        res["signal_triggered"] = False
        res["rejection_reason"] = "NO_VALID_CONSOLIDATION_SWING_LOW"
        res["truth_table"] = truth_table
        return res

    chosen_stop = swing_lows[-1]["low"]
    sig_date_val = dates[-1]
    sig_date_str = sig_date_val.strftime("%Y-%m-%d") if hasattr(sig_date_val, "strftime") else str(sig_date_val)[:10]

    res["signal_date"] = sig_date_str
    res["signal_close"] = round(curr_close, 2)
    res["expected_entry"] = "NEXT_TRADING_DAY_OPEN"
    res["stop_price"] = chosen_stop

    # Initial risk % measured from signal_close
    risk_pct = round(((curr_close - chosen_stop) / curr_close) * 100, 2)
    res["risk_percent"] = risk_pct

    risk_valid = (0 < risk_pct <= 8.0)
    truth_table.append(StrategyPredicate(
        name="risk_pct_within_bounds",
        description="Risk percent between 0% and 8%",
        observed=risk_pct,
        required="0% < Risk <= 8%",
        passed=risk_valid,
        failure_reason=None if risk_valid else f"RISK_OUT_OF_BOUNDS ({risk_pct:.2f}%)"
    ).to_dict())

    if not risk_valid:
        res["state"] = "ENTRY_REJECTED"
        res["signal_triggered"] = False
        res["rejection_reason"] = f"RISK_OUT_OF_BOUNDS ({risk_pct:.2f}%)"
    else:
        res["signal_triggered"] = True
        res["state"] = "SIGNAL_TRIGGERED"

    res["truth_table"] = truth_table
    return res


# ==============================================================================
# 5.3 STRATEGY 3 — RELATIVE-STRENGTH CONTINUATION
# ==============================================================================

def evaluate_rs_continuation(
    df: pd.DataFrame, 
    momo_info: dict, 
    trend_qual: bool, 
    trend_reasons: list[str]
) -> dict:
    """
    Strategy 3 — Relative-Strength Continuation
    Purpose: Detect a stock with persistent RS alpha (1M > 0, 3M > 0, 1M >= +2%)
    that pauses briefly (5D range <= 8%, 5D low > 20D low) and resumes momentum.
    """
    res = {
        "strategy_name": "RELATIVE_STRENGTH_CONTINUATION",
        "qualified": False,
        "setup_detected": False,
        "signal_triggered": False,
        "state": "NOT_QUALIFIED",
        "alpha_1m": None,
        "alpha_3m": None,
        "range_5d_percent": None,
        "low_5d": None,
        "low_20d": None,
        "signal_date": None,
        "signal_close": None,
        "signal_volume": None,
        "average_volume_20": None,
        "expected_entry": None,
        "actual_entry": None,
        "stop_price": None,
        "risk_percent": None,
        "invalidation_reason": None,
        "rejection_reason": None,
    }

    # 9.1 Qualification: Trend Qual + RS criteria
    rs_alpha = momo_info.get("Relative_Strength_Alpha_%", {})
    alpha_1m = rs_alpha.get("1M")
    alpha_3m = rs_alpha.get("3M")

    res["alpha_1m"] = alpha_1m
    res["alpha_3m"] = alpha_3m

    truth_table: list[dict] = []

    rs_1m_gt_0 = pd.notna(alpha_1m) and alpha_1m > 0
    rs_3m_gt_0 = pd.notna(alpha_3m) and alpha_3m > 0
    rs_1m_gte_2 = pd.notna(alpha_1m) and alpha_1m >= 2.0
    rs_qual = rs_1m_gt_0 and rs_3m_gt_0 and rs_1m_gte_2

    truth_table.append(StrategyPredicate(
        name="rs_alpha_persistent",
        description="RS Alpha: 1M > 0%, 3M > 0%, 1M >= +2.0%",
        observed=f"1M={alpha_1m}%, 3M={alpha_3m}%",
        required="1M > 0, 3M > 0, 1M >= 2.0%",
        passed=rs_qual,
        failure_reason=None if rs_qual else f"RS criteria failed (1M: {alpha_1m}%, 3M: {alpha_3m}%)"
    ).to_dict())

    if not trend_qual or not rs_qual:
        res["qualified"] = False
        reasons = list(trend_reasons)
        if not rs_qual:
            reasons.append(f"RS Alpha requirement failed (1M: {alpha_1m}%, 3M: {alpha_3m}%; needs 1M>0, 3M>0, 1M>=+2%)")
        res["invalidation_reason"] = "; ".join(reasons)
        res["truth_table"] = truth_table
        return res

    res["qualified"] = True
    res["state"] = "QUALIFIED"

    close = df["Close"]
    high = df["High"]
    low = df["Low"]
    open_p = df["Open"]
    vol = df["Volume"]
    dates = df.index
    n = len(df)

    if n < 25:
        res["qualified"] = False
        res["state"] = "NOT_QUALIFIED"
        res["invalidation_reason"] = "INSUFFICIENT_DATA"
        truth_table.append(StrategyPredicate(
            name="history_length_25",
            description="At least 25 bars for RS continuation evaluation",
            observed=n,
            required=">= 25 bars",
            passed=False,
            failure_reason="INSUFFICIENT_DATA"
        ).to_dict())
        res["truth_table"] = truth_table
        return res

    # 9.2 Continuation structure: Previous 5 completed sessions: (n-6) to (n-2) inclusive
    prev_5_highs = high.iloc[n - 6 : n - 1]
    prev_5_lows = low.iloc[n - 6 : n - 1]
    prev_20_lows = low.iloc[n - 21 : n - 1]
    prev_20_vols = vol.iloc[n - 21 : n - 1]

    high_5d = float(prev_5_highs.max())
    low_5d = float(prev_5_lows.min())
    low_20d = float(prev_20_lows.min())

    if low_5d <= 0:
        res["invalidation_reason"] = "INVALID_5D_LOW_BOUND"
        truth_table.append(StrategyPredicate(
            name="valid_5d_low",
            description="5D low > 0",
            observed=low_5d,
            required="> 0",
            passed=False,
            failure_reason="INVALID_5D_LOW_BOUND"
        ).to_dict())
        res["truth_table"] = truth_table
        return res

    range_5d = round(((high_5d - low_5d) / low_5d) * 100, 2)
    res["range_5d_percent"] = range_5d
    res["low_5d"] = round(low_5d, 2)
    res["low_20d"] = round(low_20d, 2)

    # Require: 5D_range <= 8% and 5D_low > previous_20D_low
    range_5d_pass = range_5d <= 8.0
    low_gt_20d_pass = low_5d > low_20d

    truth_table.append(StrategyPredicate(
        name="range_5d_lte_8pct",
        description="5-day consolidation range <= 8%",
        observed=range_5d,
        required="<= 8.0%",
        passed=range_5d_pass,
        failure_reason=None if range_5d_pass else f"5D_RANGE_EXCEEDS_8_PCT ({range_5d:.1f}%)"
    ).to_dict())

    truth_table.append(StrategyPredicate(
        name="low_5d_gt_low_20d",
        description="5D low > previous 20D low (higher low structure)",
        observed=f"5D={low_5d:.2f}, 20D={low_20d:.2f}",
        required="5D low > 20D low",
        passed=low_gt_20d_pass,
        failure_reason=None if low_gt_20d_pass else f"5D_LOW_NOT_ABOVE_20D_LOW (5D: ₹{low_5d:.2f} <= 20D: ₹{low_20d:.2f})"
    ).to_dict())

    if not range_5d_pass:
        res["invalidation_reason"] = f"5D_RANGE_EXCEEDS_8_PCT ({range_5d:.1f}%)"
        res["truth_table"] = truth_table
        return res

    if not low_gt_20d_pass:
        res["invalidation_reason"] = f"5D_LOW_NOT_ABOVE_20D_LOW (5D: ₹{low_5d:.2f} <= 20D: ₹{low_20d:.2f})"
        res["truth_table"] = truth_table
        return res

    # Setup is detected and forming
    res["setup_detected"] = True
    res["state"] = "SETUP_FORMING"

    # 9.3 Trigger:
    # Today's Close > Previous Day High
    # Today's Close > Today's Open
    # Today's Volume >= average volume of previous 20 sessions
    curr_close = float(close.iloc[-1])
    prev_high = float(high.iloc[-2])
    today_open = float(open_p.iloc[-1])
    curr_vol = float(vol.iloc[-1])
    avg_vol_20 = float(prev_20_vols.mean())

    res["average_volume_20"] = round(avg_vol_20, 0)
    res["signal_volume"] = round(curr_vol, 0)

    trigger_price = (curr_close > prev_high) and (curr_close > today_open)
    trigger_vol = curr_vol >= avg_vol_20

    truth_table.append(StrategyPredicate(
        name="rs_continuation_price_trigger",
        description="Today's Close > Prev Day High AND Today's Close > Today's Open",
        observed=f"Close={curr_close:.2f}, PrevHigh={prev_high:.2f}, Open={today_open:.2f}",
        required="Close > PrevHigh and Close > Open",
        passed=trigger_price,
        failure_reason=None if trigger_price else "WAITING_FOR_BULLISH_PRICE_TRIGGER"
    ).to_dict())

    truth_table.append(StrategyPredicate(
        name="rs_continuation_volume_trigger",
        description="Today's Volume >= 20-session average volume",
        observed=round(curr_vol / avg_vol_20, 2) if avg_vol_20 > 0 else 0.0,
        required=">= 1.0x",
        passed=trigger_vol,
        failure_reason=None if trigger_vol else f"INSUFFICIENT_VOLUME ({curr_vol/avg_vol_20:.2f}x < 1.0x)"
    ).to_dict())

    if not (trigger_price and trigger_vol):
        if not trigger_price:
            res["rejection_reason"] = "WAITING_FOR_BULLISH_PRICE_TRIGGER"
        else:
            res["rejection_reason"] = f"INSUFFICIENT_VOLUME ({curr_vol/avg_vol_20:.2f}x < 1.0x)"
        res["truth_table"] = truth_table
        return res

    # 9.4 Stop: most recent confirmed 2-left / 2-right swing low within the 5-day continuation structure
    # (n-6) to (n-2)
    start_idx = n - 6
    end_idx = n - 2
    swing_lows = find_confirmed_swing_lows(df, start_idx, end_idx)

    has_swing_low = len(swing_lows) > 0
    truth_table.append(StrategyPredicate(
        name="continuation_swing_low_available",
        description="Confirmed swing low in 5-day continuation structure",
        observed=len(swing_lows),
        required=">= 1 swing low",
        passed=has_swing_low,
        failure_reason=None if has_swing_low else "NO_VALID_CONTINUATION_SWING_LOW"
    ).to_dict())

    if not has_swing_low:
        res["signal_triggered"] = False
        res["rejection_reason"] = "NO_VALID_CONTINUATION_SWING_LOW"
        res["truth_table"] = truth_table
        return res

    chosen_stop = swing_lows[-1]["low"]
    sig_date_val = dates[-1]
    sig_date_str = sig_date_val.strftime("%Y-%m-%d") if hasattr(sig_date_val, "strftime") else str(sig_date_val)[:10]

    res["signal_date"] = sig_date_str
    res["signal_close"] = round(curr_close, 2)
    res["expected_entry"] = "NEXT_TRADING_DAY_OPEN"
    res["stop_price"] = chosen_stop

    # Initial risk % measured from signal_close
    risk_pct = round(((curr_close - chosen_stop) / curr_close) * 100, 2)
    res["risk_percent"] = risk_pct

    risk_valid = (0 < risk_pct <= 8.0)
    truth_table.append(StrategyPredicate(
        name="risk_pct_within_bounds",
        description="Risk percent between 0% and 8%",
        observed=risk_pct,
        required="0% < Risk <= 8%",
        passed=risk_valid,
        failure_reason=None if risk_valid else f"RISK_OUT_OF_BOUNDS ({risk_pct:.2f}%)"
    ).to_dict())

    if not risk_valid:
        res["state"] = "ENTRY_REJECTED"
        res["signal_triggered"] = False
        res["rejection_reason"] = f"RISK_OUT_OF_BOUNDS ({risk_pct:.2f}%)"
    else:
        res["signal_triggered"] = True
        res["state"] = "SIGNAL_TRIGGERED"

    res["truth_table"] = truth_table
    return res


# ==============================================================================
# 5.4 ENTRY, RISK FILTER & POSITION SIZING ENGINE
# ==============================================================================

def evaluate_entry_gap(signal_close: float, next_open: float) -> tuple[bool, Optional[str]]:
    """
    Gap-Up Entry Filter (Section 11):
    If next open > signal_close * 1.05: reject entry with EXCESSIVE_ENTRY_GAP.
    """
    if signal_close <= 0:
        return False, "INVALID_SIGNAL_CLOSE"
    if next_open > (signal_close * 1.05):
        return False, "EXCESSIVE_ENTRY_GAP"
    return True, None


def calculate_position_size(
    entry_price: float,
    stop_price: float,
    portfolio_value: float = 1000000.0,
    risk_percent: float = 0.01,
    available_cash: float = 200000.0,
) -> dict:
    """
    Deterministic Position Sizing for Paper Trading (Section 13).
    All parameters configurable. Default risk_percent = 1% (0.01).
    """
    if entry_price <= stop_price or entry_price <= 0:
        return {
            "risk_budget": 0.0,
            "risk_per_share": 0.0,
            "risk_percent": 0.0,
            "risk_based_quantity": 0,
            "capital_based_quantity": 0,
            "actual_quantity": 0,
            "valid": False,
            "reason": "INVALID_PRICE_SPREAD"
        }

    trade_risk_pct = round(((entry_price - stop_price) / entry_price) * 100, 2)
    if trade_risk_pct <= 0 or trade_risk_pct > 8.0:
        return {
            "risk_budget": 0.0,
            "risk_per_share": round(entry_price - stop_price, 2),
            "risk_percent": trade_risk_pct,
            "risk_based_quantity": 0,
            "capital_based_quantity": 0,
            "actual_quantity": 0,
            "valid": False,
            "reason": f"RISK_OUT_OF_BOUNDS ({trade_risk_pct:.2f}%)"
        }

    risk_budget = portfolio_value * risk_percent
    risk_per_share = entry_price - stop_price
    risk_based_qty = int(np.floor(risk_budget / risk_per_share))
    capital_based_qty = int(np.floor(available_cash / entry_price))
    actual_qty = min(risk_based_qty, capital_based_qty)

    return {
        "risk_budget": round(risk_budget, 2),
        "risk_per_share": round(risk_per_share, 2),
        "risk_percent": trade_risk_pct,
        "risk_based_quantity": risk_based_qty,
        "capital_based_quantity": capital_based_qty,
        "actual_quantity": actual_qty,
        "valid": actual_qty > 0,
        "reason": None if actual_qty > 0 else "ZERO_ALLOCATED_QUANTITY"
    }


def evaluate_paper_position_exit(
    day_open: float,
    day_low: float,
    day_close: float,
    stop_price: float,
    entry_price: float,
    holding_sessions: int,
    consecutive_closes_below_50dma: int,
    dma_50_slope: float
) -> tuple[bool, Optional[float], Optional[str]]:
    """
    Paper Position Exit Monitor (Sections 18, 19, 20):
    1. Stop Loss: day_low <= stop_price. Gap-down logic: if day_open < stop_price -> day_open, else stop_price.
    2. Max Holding Period: 60 completed sessions -> exit at next open.
    3. Trend-Failure Exit: Close < 50 DMA for 2 consecutive sessions AND 50 DMA slope <= 0.
    """
    # 1. Stop Loss check
    if day_low <= stop_price:
        exit_p = day_open if day_open < stop_price else stop_price
        return True, exit_p, "STOP_LOSS"

    # 2. Max Holding Period check (60 completed sessions)
    if holding_sessions >= 60:
        return True, day_open, "MAX_HOLDING_PERIOD"

    # 3. Trend Failure check (2 consecutive sessions < 50 DMA + declining/flat slope)
    if consecutive_closes_below_50dma >= 2 and dma_50_slope <= 0:
        return True, day_open, "TREND_FAILURE"

    return False, None, None


# ==============================================================================
# 5.5 MASTER STRATEGY ORCHESTRATOR & RESOLUTION
# ==============================================================================

def evaluate_all_strategies(df: pd.DataFrame, trend_info: dict, momo_info: dict) -> dict:
    """
    Executes all three V1 strategies on the unified OHLCV data.
    Enforces deterministic strategy priority (Section 14 & 33):
    1. CONSOLIDATION_BREAKOUT
    2. TREND_PULLBACK
    3. RELATIVE_STRENGTH_CONTINUATION
    """
    trend_qual, trend_reasons, trend_tt = check_trend_qualification(df, trend_info)

    s1 = evaluate_trend_pullback(df, trend_info, trend_qual, trend_reasons)
    s2 = evaluate_consolidation_breakout(df, trend_info, trend_qual, trend_reasons)
    s3 = evaluate_rs_continuation(df, momo_info, trend_qual, trend_reasons)

    all_strategies = {
        "CONSOLIDATION_BREAKOUT": s2,
        "TREND_PULLBACK": s1,
        "RELATIVE_STRENGTH_CONTINUATION": s3,
    }

    # Determine matching strategies that have triggered signals or active setups
    priority_order = [
        "CONSOLIDATION_BREAKOUT",
        "TREND_PULLBACK",
        "RELATIVE_STRENGTH_CONTINUATION",
    ]

    triggered_strategies = [s for s in priority_order if all_strategies[s]["signal_triggered"]]
    forming_strategies = [s for s in priority_order if all_strategies[s]["setup_detected"]]

    if triggered_strategies:
        primary_name = triggered_strategies[0]
        primary_strat = all_strategies[primary_name]
    elif forming_strategies:
        primary_name = forming_strategies[0]
        primary_strat = all_strategies[primary_name]
    else:
        primary_name = priority_order[0]
        primary_strat = all_strategies[primary_name]

    # Compute default position sizing preview based on primary strategy if signal triggered
    pos_preview = {}
    if primary_strat.get("signal_close") and primary_strat.get("stop_price"):
        pos_preview = calculate_position_size(
            entry_price=primary_strat["signal_close"],
            stop_price=primary_strat["stop_price"]
        )

    return {
        "trend_qualified": trend_qual,
        "trend_failed_reasons": trend_reasons,
        "trend_truth_table": trend_tt,
        "primary_strategy": primary_name if (triggered_strategies or forming_strategies) else None,
        "matching_strategies": triggered_strategies if triggered_strategies else forming_strategies,
        "active_strategy_result": primary_strat,
        "all_strategy_results": all_strategies,
        "position_sizing_preview": pos_preview,
    }


def detect_swing_setups(df: pd.DataFrame, trend_info: dict, strategy_eval: Optional[dict] = None) -> list[str]:
    """
    Identifies clean, rule-based swing structures without indicator noise:
    Seamlessly integrates the 3 authoritative V1 strategy statuses into setups list.
    """
    setups = []
    close = df["Close"]
    high = df["High"]
    curr_price = float(close.iloc[-1])

    # 1. Near 52-Week High
    high_52w = float(high.iloc[-252:].max()) if len(high) >= 252 else float(high.max())
    dist_52w = ((curr_price - high_52w) / high_52w) * 100
    if -5.0 <= dist_52w <= 0.5:
        setups.append(f"Near 52W High ({dist_52w:.1f}% from peak)")

    # 2. Add detected V1 strategies
    if strategy_eval:
        all_res = strategy_eval.get("all_strategy_results", {})
        for name, res in all_res.items():
            if res.get("signal_triggered"):
                setups.append(f"SIGNAL: {name} (Stop: ₹{res.get('stop_price')}, Risk: {res.get('risk_percent')}%)")
            elif res.get("setup_detected"):
                setups.append(f"SETUP: {name} ({res.get('state')})")

    if not setups:
        setups.append("No active swing setup detected")

    return setups



# ==============================================================================
# 6. MODULAR TECHNICAL SCORING ENGINE (Max: 100 Points)
# ==============================================================================

def score_trend(trend_info: dict) -> float:
    """Evaluates Trend Structure (Weight: 40 Points)."""
    score = 0.0
    cls = trend_info.get("Trend_Classification", "Neutral")
    dist_50 = trend_info.get("Dist_50_DMA_%", 0.0)
    dist_200 = trend_info.get("Dist_200_DMA_%", 0.0)
    dir_50 = trend_info.get("50_DMA_Trend", "Flat")
    dir_200 = trend_info.get("200_DMA_Trend", "Flat")

    # Category Base
    if cls == "Strong uptrend":
        score += 24.0
    elif cls == "Uptrend":
        score += 17.0
    elif cls == "Neutral":
        score += 9.0
    else:  # Downtrend
        score += 0.0

    # Moving Average Slope Confirmation (8 pts)
    if dir_50 == "Rising":
        score += 5.0
    if dir_200 == "Rising":
        score += 3.0

    # Price Location Buffer (8 pts)
    if dist_200 > 0:
        score += 4.0
    if 0.0 <= dist_50 <= 7.0:  # In sweet-spot, not overextended
        score += 4.0
    elif dist_50 > 15.0:  # Overextended penalty
        score -= 2.0

    return float(np.clip(score, 0.0, 40.0))


def score_momentum(momo_info: dict) -> float:
    """Evaluates Momentum and Benchmark Relative Strength (Weight: 35 Points)."""
    score = 0.0
    rs_cls = momo_info.get("Relative_Strength_Classification", "Neutral")
    rs_dict = momo_info.get("Relative_Strength_Alpha_%", {})
    stock_rets = momo_info.get("Stock_Returns_%", {})

    # RS Category Base (20 pts)
    if rs_cls == "Strong relative strength":
        score += 20.0
    elif rs_cls == "Positive":
        score += 13.0
    elif rs_cls == "Neutral":
        score += 7.0
    else:
        score += 2.0

    # Absolute Stock Momentum (10 pts)
    ret_1m = stock_rets.get("1M", 0.0)
    ret_3m = stock_rets.get("3M", 0.0)

    if pd.notna(ret_1m):
        if ret_1m >= 6.0:
            score += 5.0
        elif ret_1m > 0.0:
            score += 3.0

    if pd.notna(ret_3m):
        if ret_3m >= 12.0:
            score += 5.0
        elif ret_3m > 0.0:
            score += 3.0

    # Sustained Alpha (5 pts)
    rs_1m = rs_dict.get("1M", 0.0)
    rs_3m = rs_dict.get("3M", 0.0)
    if pd.notna(rs_1m) and pd.notna(rs_3m) and rs_1m > 0.0 and rs_3m > 0.0:
        score += 5.0

    return float(np.clip(score, 0.0, 35.0))


def score_volume(vol_info: dict) -> float:
    """Evaluates Volume Confirmation and Buying Skew (Weight: 15 Points)."""
    score = 0.0
    vol_cls = vol_info.get("Volume_Classification", "Normal")
    up_down_ratio = vol_info.get("Up_Down_Volume_Ratio", 1.0)
    exp_ratio = vol_info.get("Volume_Expansion_Ratio", 1.0)

    if vol_cls == "Strong volume confirmation":
        score += 10.0
    elif vol_cls == "Normal":
        score += 6.0
    else:
        score += 2.0

    if up_down_ratio >= 1.25:
        score += 3.0
    if exp_ratio >= 1.0:
        score += 2.0

    return float(np.clip(score, 0.0, 15.0))


def score_setups(setups: list[str]) -> float:
    """Evaluates Actionable Swing Setup Alignment (Weight: 10 Points)."""
    if not setups or any("No active" in s for s in setups):
        return 2.0

    score = 0.0
    for s in setups:
        s_up = s.upper()
        # Near 52-Week High proximity (structural strength)
        if "NEAR 52W HIGH" in s_up:
            score += 3.5

        # Triggered signals get primary setup weight
        if "SIGNAL:" in s_up:
            if "BREAKOUT" in s_up or "RESISTANCE" in s_up:
                score += 5.0
            elif "PULLBACK" in s_up:
                score += 4.5
            elif "RELATIVE_STRENGTH" in s_up or "CONTINUATION" in s_up:
                score += 4.5
            else:
                score += 4.0

        # Forming setups get partial setup weight
        elif "SETUP:" in s_up:
            if "BREAKOUT" in s_up or "CONSOLIDATION" in s_up:
                score += 3.0
            elif "PULLBACK" in s_up:
                score += 2.5
            elif "RELATIVE_STRENGTH" in s_up or "CONTINUATION" in s_up:
                score += 2.5
            else:
                score += 2.0

        # Legacy setup tags fallback
        elif "RESISTANCE BREAKOUT" in s_up:
            score += 3.5
        elif "TIGHT CONSOLIDATION" in s_up:
            score += 2.5
        elif "PULLBACK" in s_up:
            score += 3.0

    return float(np.clip(score, 0.0, 10.0))


def calculate_technical_score(trend_i: dict, momo_i: dict, vol_i: dict, setups: list[str]) -> dict:
    """
    Computes overall technical score and assigns final technical posture.
    Classifications: Strong (>= 75), Positive (>= 55), Neutral (>= 40), Weak (< 40).
    """
    t_score = score_trend(trend_i)
    m_score = score_momentum(momo_i)
    v_score = score_volume(vol_i)
    s_score = score_setups(setups)

    total_score = round(t_score + m_score + v_score + s_score, 1)

    if total_score >= 75.0:
        overall_classification = "Strong"
    elif total_score >= 55.0:
        overall_classification = "Positive"
    elif total_score >= 40.0:
        overall_classification = "Neutral"
    else:
        overall_classification = "Weak"

    return {
        "Trend_Score (40)": t_score,
        "Momentum_Score (35)": m_score,
        "Volume_Score (15)": v_score,
        "Setup_Score (10)": s_score,
        "Technical_Score": total_score,
        "Technical_Classification": overall_classification
    }


# ==============================================================================
# 6.5 OBSERVATIONAL EVIDENCE LAYERS (Non-filtering contextual evidence)
# ==============================================================================

def calculate_weekly_trend(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Computes weekly trend context using 10W and 30W Exponential Moving Averages (EMA).
    Resamples daily OHLCV to weekly ('W-FRI').
    Observational context only; NOT a qualification gate.
    """
    if df is None or len(df) < 30:
        return {
            "weekly_10_ema": None,
            "weekly_30_ema": None,
            "alignment": "INSUFFICIENT_DATA",
            "slope_10w": None,
            "slope_30w": None,
            "trend_status": "Insufficient historical bars to compute weekly trend",
            "is_evidence_only": True
        }

    try:
        # Resample daily bars to weekly ending Friday
        weekly = df.resample("W-FRI").agg({
            "Open": "first",
            "High": "max",
            "Low": "min",
            "Close": "last",
            "Volume": "sum"
        }).dropna()

        if len(weekly) < 10:
            return {
                "weekly_10_ema": None,
                "weekly_30_ema": None,
                "alignment": "INSUFFICIENT_DATA",
                "slope_10w": None,
                "slope_30w": None,
                "trend_status": "Fewer than 10 weekly bars available",
                "is_evidence_only": True
            }

        close = weekly["Close"]
        ema_10 = close.ewm(span=10, adjust=False).mean()
        curr_10 = round(float(ema_10.iloc[-1]), 2)
        slope_10 = round(curr_10 - float(ema_10.iloc[-6]), 2) if len(ema_10) >= 6 else 0.0

        if len(weekly) >= 30:
            ema_30 = close.ewm(span=30, adjust=False).mean()
            curr_30 = round(float(ema_30.iloc[-1]), 2)
            slope_30 = round(curr_30 - float(ema_30.iloc[-6]), 2) if len(ema_30) >= 6 else 0.0
            
            if curr_10 > curr_30 and slope_10 > 0 and slope_30 > 0:
                alignment = "BULLISH_ALIGNED"
                status = "Strong weekly bull structure (10W > 30W, both rising)"
            elif curr_10 > curr_30:
                alignment = "MODERATELY_BULLISH"
                status = "10W EMA above 30W EMA"
            elif curr_10 < curr_30 and slope_10 < 0:
                alignment = "BEARISH_ALIGNED"
                status = "Bearish weekly structure (10W < 30W, 10W declining)"
            else:
                alignment = "NEUTRAL"
                status = "Weekly EMAs mixed or consolidating"
        else:
            curr_30 = None
            slope_30 = None
            alignment = "PARTIAL_HISTORY"
            status = "Only 10W EMA available due to bar count (<30 weekly bars)"

        return {
            "weekly_10_ema": curr_10,
            "weekly_30_ema": curr_30,
            "alignment": alignment,
            "slope_10w": slope_10,
            "slope_30w": slope_30,
            "trend_status": status,
            "is_evidence_only": True
        }
    except Exception as e:
        return {
            "weekly_10_ema": None,
            "weekly_30_ema": None,
            "alignment": "CALCULATION_ERROR",
            "slope_10w": None,
            "slope_30w": None,
            "trend_status": f"Weekly calculation failed: {e}",
            "is_evidence_only": True
        }


def calculate_rvol(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Computes Relative Volume (RVOL) against 20-day and 50-day baseline averages.
    Uses the 20 and 50 sessions preceding the latest session to prevent the current bar
    from skewing its own baseline.
    Observational context only; NOT a qualification gate.
    """
    if df is None or len(df) < 5 or "Volume" not in df.columns:
        return {
            "rvol_20d": None,
            "rvol_50d": None,
            "volume_expansion_confirmed": False,
            "context": "Insufficient volume data",
            "is_evidence_only": True
        }

    vol = df["Volume"]
    latest_vol = float(vol.iloc[-1])

    # 20D baseline: 20 sessions preceding latest bar
    window_20 = vol.iloc[-21:-1] if len(vol) >= 21 else vol.iloc[:-1]
    avg_20 = float(window_20.mean()) if len(window_20) > 0 else 0.0

    # 50D baseline: 50 sessions preceding latest bar
    window_50 = vol.iloc[-51:-1] if len(vol) >= 51 else vol.iloc[:-1]
    avg_50 = float(window_50.mean()) if len(window_50) > 0 else 0.0

    rvol_20 = round(latest_vol / avg_20, 2) if avg_20 > 0 else 1.0
    rvol_50 = round(latest_vol / avg_50, 2) if avg_50 > 0 else 1.0

    # Qualitative context
    if rvol_20 >= 2.0:
        ctx = "Exceptional volume expansion (> 2.0x 20D avg)"
    elif rvol_20 >= 1.5:
        ctx = "Healthy breakout volume expansion (>= 1.5x 20D avg)"
    elif rvol_20 >= 1.0:
        ctx = "Normal average volume (~ 1.0x)"
    else:
        ctx = "Below-average volume contraction (< 1.0x 20D avg)"

    return {
        "rvol_20d": rvol_20,
        "rvol_50d": rvol_50,
        "volume_expansion_confirmed": bool(rvol_20 >= 1.5),
        "context": ctx,
        "is_evidence_only": True
    }


def calculate_atr(df: pd.DataFrame, period: int = 14) -> Dict[str, Any]:
    """
    Calculates Wilder's Average True Range (ATR-14) and ATR% for volatility context.
    Provides comparison multiples (1.5x, 2.0x ATR) for benchmarking against structural stops.
    Observational context only; NOT a qualification gate.
    """
    if df is None or len(df) < period + 1:
        return {
            "atr_14": None,
            "atr_pct": None,
            "atr_1_5x": None,
            "atr_2_0x": None,
            "volatility_regime": "INSUFFICIENT_DATA",
            "is_evidence_only": True
        }

    high = df["High"]
    low = df["Low"]
    close = df["Close"]
    prev_close = close.shift(1)

    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    # Wilder's smoothed ATR (EMA with alpha = 1 / period)
    atr_series = tr.ewm(alpha=1.0 / period, adjust=False).mean()
    curr_atr = round(float(atr_series.iloc[-1]), 2)
    curr_price = float(close.iloc[-1])
    atr_pct = round((curr_atr / curr_price) * 100, 2) if curr_price > 0 else 0.0

    atr_1_5x = round(1.5 * curr_atr, 2)
    atr_2_0x = round(2.0 * curr_atr, 2)

    if atr_pct >= 4.0:
        regime = "HIGH_VOLATILITY"
    elif atr_pct >= 2.0:
        regime = "NORMAL_VOLATILITY"
    else:
        regime = "LOW_VOLATILITY"

    return {
        "atr_14": curr_atr,
        "atr_pct": atr_pct,
        "atr_1_5x": atr_1_5x,
        "atr_2_0x": atr_2_0x,
        "volatility_regime": regime,
        "is_evidence_only": True
    }


# ==============================================================================
# 7. ORCHESTRATION PIPELINE
# ==============================================================================

def analyze_technical(ticker: str, benchmark: str = "^NSEI", as_of_date: Optional[str] = None) -> dict:
    """
    Main execution pipeline for technical swing analysis of an NSE ticker.
    Returns clean dictionary with metrics, setup tags, and scores.
    Enforces temporal boundary if as_of_date is provided.
    """
    stock_df, bench_df = fetch_daily_ohlcv(ticker, benchmark=benchmark, period="2y", as_of_date=as_of_date)

    # Run analytical engines
    trend_info = analyze_trend(stock_df)
    momo_info = analyze_momentum(stock_df, bench_df)
    vol_info = analyze_volume(stock_df)

    # Run deterministic V1 strategy engine across all 3 strategies
    strat_eval = evaluate_all_strategies(stock_df, trend_info, momo_info)
    setups = detect_swing_setups(stock_df, trend_info, strategy_eval=strat_eval)

    # Compute modular scores
    score_summary = calculate_technical_score(trend_info, momo_info, vol_info, setups)

    # Compute observational evidence layers (strictly non-filtering context)
    weekly_trend = calculate_weekly_trend(stock_df)
    rvol_info = calculate_rvol(stock_df)
    atr_info = calculate_atr(stock_df, period=14)

    evidence_context = {
        "weekly_trend": weekly_trend,
        "rvol": rvol_info,
        "atr": atr_info,
        "is_evidence_only": True,
        "disclaimer": "Observational evidence layers for context; not hard strategy qualification filters."
    }

    return {
        "Ticker": format_nse_ticker(ticker),
        "Trend_Analysis": trend_info,
        "Momentum_Analysis": momo_info,
        "Volume_Analysis": vol_info,
        "Setups_Detected": setups,
        "Strategy_Evaluation": strat_eval,
        "Scoring_Summary": score_summary,
        "Evidence_Context": evidence_context
    }


def print_technical_report(report: dict):
    """Formats and prints technical analysis metrics to the console."""
    ticker = report["Ticker"]
    t = report["Trend_Analysis"]
    m = report["Momentum_Analysis"]
    v = report["Volume_Analysis"]
    s = report["Scoring_Summary"]
    setups = report["Setups_Detected"]

    dma_200_str = f"₹{t['200_DMA']}" if isinstance(t['200_DMA'], (int, float)) else str(t['200_DMA'])

    print("\n" + "=" * 65)
    print(f"TECHNICAL ANALYSIS REPORT (SWING HORIZON): {ticker}")
    print("=" * 65)
    print(f"Current Price:          ₹{t['Current_Price']}")
    print(f"50 DMA:                 ₹{t['50_DMA']} (Spread: {t['Dist_50_DMA_%']:+0.2f}%, Slope: {t['50_DMA_Trend']})")
    print(f"200 DMA:                {dma_200_str} (Spread: {t['Dist_200_DMA_%']:+0.2f}%, Slope: {t['200_DMA_Trend']})")
    print(f"Trend Classification:   {t['Trend_Classification']}")
    print("-" * 65)
    print("MOMENTUM & RELATIVE STRENGTH (vs NIFTY 50):")
    for horizon in ["1M", "3M", "6M", "1Y"]:
        s_ret = m['Stock_Returns_%'].get(horizon, np.nan)
        b_ret = m['Nifty_Returns_%'].get(horizon, np.nan)
        alpha = m['Relative_Strength_Alpha_%'].get(horizon, np.nan)
        s_str = f"{s_ret:+0.2f}%" if pd.notna(s_ret) else "N/A"
        b_str = f"{b_ret:+0.2f}%" if pd.notna(b_ret) else "N/A"
        a_str = f"{alpha:+0.2f}%" if pd.notna(alpha) else "N/A"
        print(f"  {horizon:>2} Return: Stock {s_str:>7} | Nifty {b_str:>7} | RS Alpha: {a_str:>7}")
    print(f"  Relative Strength:    {m['Relative_Strength_Classification']}")
    print("-" * 65)
    print("VOLUME PROFILE:")
    print(f"  50 DMA Volume:        {v['50_Day_Avg_Volume']:,}")
    print(f"  Expansion Ratio:      {v['Volume_Expansion_Ratio']}x")
    print(f"  Up/Down Volume Ratio: {v['Up_Down_Volume_Ratio']}x")
    print(f"  Volume Confirmation:  {v['Volume_Classification']}")
    print("-" * 65)
    print("SWING SETUPS DETECTED:")
    for setup in setups:
        print(f"  • {setup}")
    print("-" * 65)
    print("TECHNICAL SCORECARD:")
    print(f"  Trend Score:          {s['Trend_Score (40)']}/40")
    print(f"  Momentum Score:       {s['Momentum_Score (35)']}/35")
    print(f"  Volume Score:         {s['Volume_Score (15)']}/15")
    print(f"  Setup Score:          {s['Setup_Score (10)']}/10")
    print(f"  TOTAL TECHNICAL SCORE: {s['Technical_Score']}/100")
    print(f"  TECHNICAL POSTURE:    {s['Technical_Classification']}")
    print("=" * 65 + "\n")


# ==============================================================================
# 8. STANDALONE TEST RUNNER (BENCHMARK STOCKS)
# ==============================================================================

if __name__ == "__main__":
    # Test stocks:
    # Use TMPV.NS (Tata Motors Passenger Vehicles/EV/JLR) or TMCV.NS (Commercial Vehicles)
    # Use ETERNAL.NS or ZOMATO.NS depending on current Yahoo Finance symbol mapping
    target_stocks = [
        "TCS.NS",
        "TMPV.NS",          # Tata Motors Passenger Vehicles (replaces delisted TATAMOTORS.NS)
        "IDEA.NS",          # Vodafone Idea
        "ICICIBANK.NS"
    ]

    if len(sys.argv) > 1:
        symbols_to_run = [sys.argv[1]]
    else:
        symbols_to_run = target_stocks

    print("\n" + "=" * 65)
    print("RUNNING BATCH TECHNICAL ANALYSIS (SWING CONFIRMATION)")
    print("=" * 65)

    batch_results = []

    for sym in symbols_to_run:
        try:
            print(f"[*] Fetching technical data for {sym}...")
            report = analyze_technical(sym)
            print_technical_report(report)

            batch_results.append({
                "Ticker": sym,
                "Price": report["Trend_Analysis"]["Current_Price"],
                "Trend": report["Trend_Analysis"]["Trend_Classification"],
                "Relative_Strength": report["Momentum_Analysis"]["Relative_Strength_Classification"],
                "Volume": report["Volume_Analysis"]["Volume_Classification"],
                "Setups": "; ".join(report["Setups_Detected"]),
                "Tech_Score": report["Scoring_Summary"]["Technical_Score"],
                "Posture": report["Scoring_Summary"]["Technical_Classification"]
            })
        except Exception as e:
            print(f"[!] Could not process {sym}: {e}")

    if batch_results:
        summary_table = pd.DataFrame(batch_results)
        print("\n" + "=" * 90)
        print("CONSOLIDATED TECHNICAL SUMMARY TABLE")
        print("=" * 90)
        print(summary_table.to_string(index=False))
        print("=" * 90)