"""
technical_signal_debugger.py - Diagnostic experiment.

Determines whether the technical portions of Plan A (Breakout) and Plan B
(Pullback) generate signals when the fundamental filter is REMOVED.

This file does NOT modify any existing strategy files, backtester, or parameters.
It imports data-loading and indicator functions from backtest_engine.py and
replicates the EXACT technical conditions from BreakoutStrategy.check_signal()
and PullbackStrategy.check_signal(), minus the fundamental gate.

Run:
    python technical_signal_debugger.py
"""

import os
import sys
import warnings
from datetime import datetime

import numpy as np
import pandas as pd
import yfinance as yf

warnings.filterwarnings("ignore")

try:
    import oldcode.fundanalysis as fa
    import oldcode.backtest_engine as be
except ImportError as e:
    raise ImportError(
        f"Could not import project modules: {e}\n"
        f"Ensure backtest_engine.py and fundanalysis.py are in this folder."
    ) from e


# ==============================================================================
# Configuration (mirrors backtest_engine.py)
# ==============================================================================
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOADS_DIR = r"C:\Users\tarun\Downloads"

TARGET_TICKERS = ["ICICIBANK.NS", "IDEA.NS"]
BENCH_SYMBOL = "^NSEI"
START_DATE = "2019-01-01"
END_DATE = "2024-12-31"

# Technical thresholds (exact copy from strategy classes - DO NOT modify)
VOL_MULTIPLIER = 1.5
PULLBACK_DIST_THRESHOLD = 0.03  # 3%
RSI_RECOVERY_LEVEL = 40.0
RS_WINDOW = 60
RSI_PERIOD = 14


def _resolve_excel(filename: str) -> str:
    """Mirror path resolution from updated backtest_engine.py"""
    candidates = [
        os.path.join(SCRIPT_DIR, filename),
        os.path.join(DOWNLOADS_DIR, filename),
        filename,
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return os.path.join(SCRIPT_DIR, filename)


# ==============================================================================
# Data Loading (uses backtest_engine.compute_indicators as-is)
# ==============================================================================
def load_data():
    """Load OHLCV + Nifty benchmark + compute indicators, exactly as backtest does."""
    print("=" * 75)
    print("LOADING MARKET DATA")
    print("=" * 75)

    bench_raw = yf.download(BENCH_SYMBOL, start=START_DATE, end=END_DATE, progress=False)
    if isinstance(bench_raw.columns, pd.MultiIndex):
        bench_raw.columns = bench_raw.columns.get_level_values(0)
    bench_df = bench_raw.dropna()
    print(f"  Benchmark ({BENCH_SYMBOL}): {len(bench_df)} rows, "
          f"{bench_df.index[0].date()} to {bench_df.index[-1].date()}")

    stock_data = {}
    for sym in TARGET_TICKERS:
        print(f"  Downloading {sym}...", end=" ", flush=True)
        raw = yf.download(sym, start=START_DATE, end=END_DATE, progress=False)
        if isinstance(raw.columns, pd.MultiIndex):
            raw.columns = raw.columns.get_level_values(0)
        df_clean = raw.dropna()
        stock_data[sym] = be.compute_indicators(df_clean, bench_df)
        print(f"{len(stock_data[sym])} bars")

    return stock_data, bench_df


# ==============================================================================
# Technical Condition Checks (exact replication, no fundamental gate)
# ==============================================================================

def check_breakout_technicals(df: pd.DataFrame, idx: int) -> tuple[bool, float, str]:
    """
    Replicate BreakoutStrategy.check_signal() technical conditions exactly,
    BUT skip the fundamental gate.

    Returns: (signal_found, stop_loss, reason_for_no_signal)
    """
    row = df.iloc[idx]

    # Skip if base indicators are NaN
    if pd.isna(row["SMA_200"]) or pd.isna(row["HIGH_60"]):
        return False, 0.0, "NaN indicators (SMA_200 or HIGH_60)"

    # 1. Price > 200 DMA
    if not (row["Close"] > row["SMA_200"]):
        return False, 0.0, "Price not above 200 DMA"
    if pd.isna(row["SMA_50"]):
        return False, 0.0, "SMA_50 is NaN"

    # 2. 50 DMA >= 200 DMA
    if not (row["SMA_50"] >= row["SMA_200"]):
        return False, 0.0, "SMA_50 < SMA_200 (trend not aligned)"

    # 3. RS Positive
    if not bool(row["RS_Positive"]):
        return False, 0.0, "RS not positive vs Nifty"

    # 4. Breakout: Close > Previous 60-day High
    if not (row["Close"] > row["HIGH_60"]):
        return False, 0.0, "Close not above previous 60-day high"

    # 5. Volume >= 1.5 x 20-day Vol SMA
    if not (row["Volume"] >= (1.5 * row["VOL_SMA_20"])):
        return False, 0.0, f"Volume {row['Volume']:.0f} < 1.5x VolSMA20 {1.5 * row['VOL_SMA_20']:.0f}"

    # 6. Stop loss valid: SWING_LOW_20 < Close
    stop_loss = float(row["SWING_LOW_20"])
    if pd.notna(stop_loss) and stop_loss < row["Close"]:
        return True, stop_loss, "SIGNAL"
    else:
        return False, 0.0, f"Stop loss invalid (SL={stop_loss}, Close={row['Close']})"


def check_pullback_technicals(df: pd.DataFrame, idx: int) -> tuple[bool, float, str]:
    """
    Replicate PullbackStrategy.check_signal() technical conditions exactly,
    BUT skip the fundamental gate.

    Returns: (signal_found, stop_loss, reason_for_no_signal)
    """
    row = df.iloc[idx]

    # Skip if base indicators are NaN
    if pd.isna(row["SMA_200"]) or pd.isna(row["SMA_50"]):
        return False, 0.0, "NaN indicators (SMA_200 or SMA_50)"

    # 1. Price > 200 DMA
    if not (row["Close"] > row["SMA_200"]):
        return False, 0.0, "Price not above 200 DMA"

    # 2. 50 DMA > 200 DMA
    if not (row["SMA_50"] > row["SMA_200"]):
        return False, 0.0, "SMA_50 <= SMA_200 (downtrend or neutral)"

    # 3. Price within 3% of 50 DMA
    dist_50 = abs(row["Close"] - row["SMA_50"]) / row["SMA_50"]
    if dist_50 > 0.03:
        return False, 0.0, f"Dist from 50 DMA = {dist_50:.2%} (exceeds 3%)"

    # 4. Confirmation: any of 3 conditions
    c1 = bool(row["BULLISH_REVERSAL"])
    c2 = row["Close"] > row["PREV_HIGH"]
    c3 = (row["PREV_RSI"] < 40) and (row["RSI"] >= 40)

    if not (c1 or c2 or c3):
        reasons = []
        if not c1:
            reasons.append("no bullish reversal candle")
        if not c2:
            reasons.append(f"close {row['Close']:.2f} not above prev high {row['PREV_HIGH']:.2f}")
        if not c3:
            reasons.append(f"RSI not recovering (prev_rsi={row['PREV_RSI']:.1f}, rsi={row['RSI']:.1f})")
        return False, 0.0, "No confirmation: " + "; ".join(reasons)

    # 5. Stop loss valid: SWING_LOW_15 < Close
    stop_loss = float(row["SWING_LOW_15"])
    if pd.notna(stop_loss) and stop_loss < row["Close"]:
        return True, stop_loss, "SIGNAL"
    else:
        return False, 0.0, f"Stop loss invalid (SL={stop_loss}, Close={row['Close']})"


# ==============================================================================
# Sequential Filter Count for Plan A
# ==============================================================================
def diagnose_plan_a(stock_data: dict):
    print("\n" + "=" * 75)
    print("PLAN A: BREAKOUT SIGNAL DIAGNOSTICS (FUNDAMENTAL GATE REMOVED)")
    print("=" * 75)

    for ticker in TARGET_TICKERS:
        df = stock_data[ticker]
        print(f"\n--- {ticker} ---")

        # Only consider bars with valid SMA_200 and HIGH_60 (same as strategy guard)
        valid_mask = df["SMA_200"].notna() & df["HIGH_60"].notna() & df["SMA_50"].notna()
        df_valid = df[valid_mask]
        total = len(df_valid)
        print(f"\n  Total bars: {len(df)}")
        print(f"  Bars with valid SMA_200, HIGH_60, SMA_50: {total}")

        if total == 0:
            print("  NO VALID BARS - need at least 200 days of data")
            continue

        # Stage 1: Price > 200 DMA
        s1_mask = df_valid["Close"] > df_valid["SMA_200"]
        s1_pass = s1_mask.sum()
        print(f"\n  Condition counts (sequential AND):")
        print(f"    100% Bars with valid indicators:  {total}")

        s2_mask = s1_mask & (df_valid["SMA_50"] >= df_valid["SMA_200"])
        print(f"    -> Price > 200 DMA:                {s1_pass} ({s1_pass/total*100:.1f}%)")
        print(f"    -> SMA_50 >= SMA_200:              {s2_mask.sum()} ({s2_mask.sum()/total*100:.1f}%)")

        s3_mask = s2_mask & df_valid["RS_Positive"].astype(bool)
        print(f"    -> RS_Positive:                    {s3_mask.sum()} ({s3_mask.sum()/total*100:.1f}%)")

        s4_mask = s3_mask & (df_valid["Close"] > df_valid["HIGH_60"])
        print(f"    -> Close > Prev 60-day High:       {s4_mask.sum()} ({s4_mask.sum()/total*100:.1f}%)")
        bp_dates = df_valid.index[s4_mask].tolist()
        print(f"       Example dates: {[d.strftime('%Y-%m-%d') for d in bp_dates[:10]]}")

        s5_mask = s4_mask & (df_valid["Volume"] >= 1.5 * df_valid["VOL_SMA_20"])
        print(f"    -> Volume >= 1.5 x VolSMA20:      {s5_mask.sum()} ({s5_mask.sum()/total*100:.1f}%)")

        s6_mask = s5_mask & (df_valid["SWING_LOW_20"] < df_valid["Close"])
        print(f"    -> Stop Loss < Close:             {s6_mask.sum()} ({s6_mask.sum()/total*100:.1f}%)")

        final_mask = s6_mask
        print(f"\n  FINAL SIGNALS: {final_mask.sum()} ({final_mask.sum()/total*100:.1f}%)")

        # Collect signal examples with next-day entry
        print_signal_examples(df, df_valid, final_mask, "Plan A", ticker)


def diagnose_plan_b(stock_data: dict):
    print("\n" + "=" * 75)
    print("PLAN B: PULLBACK SIGNAL DIAGNOSTICS (FUNDAMENTAL GATE REMOVED)")
    print("=" * 75)

    for ticker in TARGET_TICKERS:
        df = stock_data[ticker]
        print(f"\n--- {ticker} ---")

        valid_mask = df["SMA_200"].notna() & df["SMA_50"].notna()
        df_valid = df[valid_mask]
        total = len(df_valid)
        print(f"\n  Total bars: {len(df)}")
        print(f"  Bars with valid SMA_200 and SMA_50: {total}")

        if total == 0:
            print("  NO VALID BARS")
            continue

        s1_mask = df_valid["Close"] > df_valid["SMA_200"]
        print(f"\n  Condition counts (sequential AND):")
        print(f"    100% Bars with valid indicators:  {total}")

        s2_mask = s1_mask & (df_valid["SMA_50"] > df_valid["SMA_200"])
        s1_pass = s1_mask.sum()
        print(f"    -> Price > 200 DMA:                {s1_pass} ({s1_pass/total*100:.1f}%)")
        print(f"    -> SMA_50 > SMA_200:              {s2_mask.sum()} ({s2_mask.sum()/total*100:.1f}%)")

        dist_50 = (df_valid["Close"] - df_valid["SMA_50"]).abs() / df_valid["SMA_50"]
        s3_mask = s2_mask & (dist_50 <= 0.03)
        print(f"    -> Price within 3% of 50 DMA:     {s3_mask.sum()} ({s3_mask.sum()/total*100:.1f}%)")
        w3_dates = df_valid.index[s3_mask].tolist()
        print(f"       Example dates: {[d.strftime('%Y-%m-%d') for d in w3_dates[:10]]}")

        c1_mask = df_valid["BULLISH_REVERSAL"].astype(bool)
        c2_mask = df_valid["Close"] > df_valid["PREV_HIGH"]
        c3_mask = (df_valid["PREV_RSI"] < 40) & (df_valid["RSI"] >= 40)
        confirmation_mask = c1_mask | c2_mask | c3_mask
        s4_mask = s3_mask & confirmation_mask
        print(f"    -> Confirmation (reversal/prev_high/RSI): {s4_mask.sum()} ({s4_mask.sum()/total*100:.1f}%)")

        s5_mask = s4_mask & (df_valid["SWING_LOW_15"] < df_valid["Close"])
        print(f"    -> Stop Loss < Close:             {s5_mask.sum()} ({s5_mask.sum()/total*100:.1f}%)")

        final_mask = s5_mask
        print(f"\n  FINAL SIGNALS: {final_mask.sum()} ({final_mask.sum()/total*100:.1f}%)")

        print_signal_examples(df, df_valid, final_mask, "Plan B", ticker)


def print_signal_examples(df: pd.DataFrame, df_valid: pd.DataFrame, signal_mask, plan: str, ticker: str):
    """
    Print up to 20 signal examples with corresponding next-day entry details.
    Distinguishes SIGNAL DATE from ENTRY DATE.
    """
    signal_dates = df_valid.index[signal_mask]
    print(f"\n  Signal examples (up to 20, Plan {plan}, {ticker}):")

    if len(signal_dates) == 0:
        print("    No signals found.")
        return

    count = 0
    last_entry_idx = -2  # Ensure we don't print duplicate consecutive signals

    for sig_idx_pos, sig_date in enumerate(signal_dates):
        sig_idx = df.index.get_loc(sig_date)

        # Find next trading day for entry
        if sig_idx + 1 < len(df):
            entry_idx = sig_idx + 1
            entry_date = df.index[entry_idx]
            entry_row = df.iloc[entry_idx]

            # Prevent repeated signals for same entry (skip if same entry date as last)
            if entry_idx == last_entry_idx:
                continue
            last_entry_idx = entry_idx

            sig_row = df.iloc[sig_idx]
            stop_loss = float(sig_row["SWING_LOW_20"]) if plan == "A" else float(sig_row["SWING_LOW_15"])

            print(f"\n  [{count + 1}] SIGNAL DATE: {sig_date.strftime('%Y-%m-%d')}")
            print(f"      ENTRY DATE:   {entry_date.strftime('%Y-%m-%d')} (next trading day)")
            print(f"      Entry Price (Open):  {entry_row['Open']:.2f}")
            print(f"      Signal Close:        {sig_row['Close']:.2f}")
            print(f"      Stop Loss:           {stop_loss:.2f}")
            if plan == "A":
                print(f"      HIGH_60:             {sig_row['HIGH_60']:.2f}")
                print(f"      Volume:              {sig_row['Volume']:.0f}")
                print(f"      Vol SMA20:           {sig_row['VOL_SMA_20']:.0f}")
            else:
                print(f"      SMA_50:              {sig_row['SMA_50']:.2f}")
                print(f"      PREV_HIGH:           {sig_row['PREV_HIGH']:.2f}")
                print(f"      RSI:                 {sig_row['RSI']:.1f}")
                print(f"      PREV_RSI:            {sig_row['PREV_RSI']:.1f}")

            count += 1
            if count >= 20:
                break

    print(f"\n  Total unique entry opportunities shown: {count}")


# ==============================================================================
# Signal Repetition Check
# ==============================================================================
def check_signal_repetition(stock_data: dict):
    """
    Check if signals fire repeatedly while conditions remain true.
    The backtest simulator prevents this via 'pending_signal' flag.
    We replicate: once a signal fires, skip until it's entered.
    """
    print("\n" + "=" * 75)
    print("SIGNAL REPETITION CHECK")
    print("=" * 75)

    for ticker in TARGET_TICKERS:
        df = stock_data[ticker]

        for plan_name, check_fn, swing_col in [
            ("Plan A (Breakout)", check_breakout_technicals, "SWING_LOW_20"),
            ("Plan B (Pullback)", check_pullback_technicals, "SWING_LOW_15"),
        ]:
            valid_mask = df["SMA_200"].notna() & df["HIGH_60"].notna()
            if "SWING_LOW_15" in df.columns:
                valid_mask = valid_mask & df["SWING_LOW_15"].notna()

            df_valid = df[valid_mask]
            signal_dates = []
            pending = False

            for i in range(len(df)):
                if i not in df_valid.index:
                    idx = df.index.get_loc(df.index[i])
                else:
                    idx = i

                # Replicate simulator: once pending, don't check until filled
                if pending:
                    # Entry happens at next bar open, so we need at least 1 bar
                    if i > 0:  # After the entry bar
                        pending = False
                    else:
                        continue

                sig, sl, _ = check_fn(df, idx)
                if sig:
                    signal_dates.append(df.index[idx])
                    pending = True  # Simulates pending_signal=True in simulator

            print(f"\n  {ticker} - {plan_name}:")
            print(f"    Total signals (preventing repetition): {len(signal_dates)}")
            if signal_dates:
                consecutive_count = 0
                for i in range(1, len(signal_dates)):
                    days_diff = (signal_dates[i] - signal_dates[i-1]).days
                    if days_diff == 1:
                        consecutive_count += 1
                print(f"    Consecutive-signal days: {consecutive_count}")
                print(f"    First 5 signal dates: {[d.strftime('%Y-%m-%d') for d in signal_dates[:5]]}")


# ==============================================================================
# Main execution
# ==============================================================================
if __name__ == "__main__":
    print("=" * 75)
    print("TECHNICAL SIGNAL DEBUGGER")
    print("Purpose: Test whether technical conditions generate signals")
    print("         when the fundamental filter is REMOVED.")
    print("=" * 75)
    print(f"\nStocks: {TARGET_TICKERS}")
    print(f"Date range: {START_DATE} to {END_DATE}")
    print(f"Nifty benchmark: {BENCH_SYMBOL}")

    # Load data
    stock_data, bench_df = load_data()

    # Run Plan A diagnostics
    diagnose_plan_a(stock_data)

    # Run Plan B diagnostics
    diagnose_plan_b(stock_data)

    # Check signal repetition
    check_signal_repetition(stock_data)

    # Final conclusion
    print("\n" + "=" * 75)
    print("FINAL CONCLUSION")
    print("=" * 75)

    # Quick check for any signals
    total_signals_a = 0
    total_signals_b = 0
    for ticker in TARGET_TICKERS:
        df = stock_data[ticker]
        valid_mask = df["SMA_200"].notna() & df["HIGH_60"].notna() & df["SMA_50"].notna()
        df_valid = df[valid_mask]

        # Plan A count
        s = df_valid["Close"] > df_valid["SMA_200"]
        s = s & (df_valid["SMA_50"] >= df_valid["SMA_200"])
        s = s & df_valid["RS_Positive"].astype(bool)
        s = s & (df_valid["Close"] > df_valid["HIGH_60"])
        s = s & (df_valid["Volume"] >= 1.5 * df_valid["VOL_SMA_20"])
        s = s & (df_valid["SWING_LOW_20"] < df_valid["Close"])
        total_signals_a += s.sum()

        # Plan B count
        s = df_valid["Close"] > df_valid["SMA_200"]
        s = s & (df_valid["SMA_50"] > df_valid["SMA_200"])
        dist = (df_valid["Close"] - df_valid["SMA_50"]).abs() / df_valid["SMA_50"]
        s = s & (dist <= 0.03)
        c1 = df_valid["BULLISH_REVERSAL"].astype(bool)
        c2 = df_valid["Close"] > df_valid["PREV_HIGH"]
        c3 = (df_valid["PREV_RSI"] < 40) & (df_valid["RSI"] >= 40)
        s = s & (c1 | c2 | c3)
        s = s & (df_valid["SWING_LOW_15"] < df_valid["Close"])
        total_signals_b += s.sum()

    print(f"\nPlan A total signals (no fundamental gate): {total_signals_a}")
    print(f"Plan B total signals (no fundamental gate): {total_signals_b}")

    if total_signals_a > 0 or total_signals_b > 0:
        print("\n==> CONCLUSION: A. Technical rules generate signals")
        print("    The zero-trade condition is caused by the fundamental filter.")
        print("    ICICIBANK Opportunity Score = 48 (below 50 threshold)")
        print("    IDEA Quality Score = 35 (below 50 threshold)")
        print("    Removing the fundamental gate reveals actionable technical signals.")
    else:
        print("\n==> CONCLUSION: B. Technical rules generate zero signals")
        print("    The zero-trade condition is NOT caused by the fundamental filter.")
        print("    Technical conditions themselves produce no valid signals.")

    print("\n" + "=" * 75)
    print("DEBUG COMPLETE")
    print("=" * 75)
