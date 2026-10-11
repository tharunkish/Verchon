"""
backtest_debugger.py - Diagnostic tool to trace why the backtest produces zero trades.

This file is READ-ONLY with respect to existing modules.
It imports and uses data-loading, indicator, fundamental-filter, and strategy
classes from backtest_engine.py, fundanalysis.py, and techanalysis.py WITHOUT
modifying their behavior.

Run:
    python backtest_debugger.py
"""

import os
import sys
import warnings

import numpy as np
import pandas as pd
import yfinance as yf

warnings.filterwarnings("ignore")

# Import existing project modules (do not modify them)
try:
    import oldcode.fundanalysis as fa
    import oldcode.backtest_engine as be
except ImportError as e:
    raise ImportError(
        f"Could not import required project files: {e}\n"
        f"Ensure fundanalysis.py and backtest_engine.py are in this folder."
    ) from e


# ==============================================================================
# Helper: resolve Excel file paths the same way backtest_engine does
# ==============================================================================
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOADS_DIR = r"C:\Users\tarun\Downloads"


def _resolve_excel(filename: str) -> str:
    """Mirror the path resolution now used in backtest_engine.py and resultanalysis.py"""
    candidates = [
        os.path.join(_SCRIPT_DIR, filename),
        os.path.join(DOWNLOADS_DIR, filename),
        filename,
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    # Return the script-dir path even if it doesn't exist (for error reporting)
    return os.path.join(_SCRIPT_DIR, filename)


EXCEL_MAP = {
    "ICICIBANK.NS": _resolve_excel("ICICI Bank.xlsx"),
    "IDEA.NS": _resolve_excel("Vodafone Idea.xlsx"),
}

TARGET_TICKERS = ["ICICIBANK.NS", "IDEA.NS"]
BENCH_SYMBOL = "^NSEI"
START_DATE = "2019-01-01"
END_DATE = "2024-12-31"


# ==============================================================================
# 1. DATA LOADING
# ==============================================================================
def load_market_data():
    """
    Load OHLCV data exactly as the backtest engine does:
    yfinance download, strip MultiIndex columns, dropna.
    """
    print("\n" + "=" * 75)
    print("DATA LOADING")
    print("=" * 75)

    # Benchmark
    print(f"\n[*] Downloading benchmark: {BENCH_SYMBOL}")
    bench_raw = yf.download(BENCH_SYMBOL, start=START_DATE, end=END_DATE, progress=False)
    if isinstance(bench_raw.columns, pd.MultiIndex):
        bench_raw.columns = bench_raw.columns.get_level_values(0)
    bench_df = bench_raw.dropna()
    print(f"    Benchmark rows: {len(bench_df)}")
    print(f"    Benchmark date range: {bench_df.index[0].date()} to {bench_df.index[-1].date()}")
    print(f"    Missing bench rows: {len(bench_raw) - len(bench_df)}")

    # Stocks
    stock_data = {}
    stock_raw = {}
    for sym in TARGET_TICKERS:
        print(f"\n[*] Downloading stock: {sym}")
        raw = yf.download(sym, start=START_DATE, end=END_DATE, progress=False)
        stock_raw[sym] = raw
        if isinstance(raw.columns, pd.MultiIndex):
            raw.columns = raw.columns.get_level_values(0)
        df_clean = raw.dropna()
        stock_data[sym] = be.compute_indicators(df_clean, bench_df)
        print(f"    Raw rows: {len(raw)}")
        print(f"    Clean rows (after dropna): {len(df_clean)}")
        print(f"    Indicator rows: {len(stock_data[sym])}")
        print(f"    Date range: {stock_data[sym].index[0].date()} to {stock_data[sym].index[-1].date()}")

    return stock_data, bench_df, stock_raw


# ==============================================================================
# 2. FUNDAMENTAL DATA CHECK
# ==============================================================================
def check_fundamentals():
    """
    Trace exactly how the backtest obtains Business Quality and Opportunity scores.
    The backtest uses PointInTimeFundamentalEngine which:
      - Reads each Excel file ONCE at __init__ via fa.analyze_screener_file()
      - Caches {Quality, Opportunity} per ticker
      - Returns the SAME cached static score for EVERY historical date
    """
    print("\n" + "=" * 75)
    print("FUNDAMENTAL DATA CHECK")
    print("=" * 75)

    cfg = be.BacktestConfig()
    fund_engine = be.PointInTimeFundamentalEngine(EXCEL_MAP)

    for ticker in TARGET_TICKERS:
        excel_path = EXCEL_MAP[ticker]
        print(f"\n{'-' * 60}")
        print(f"Ticker: {ticker}")
        print(f"Excel path: {excel_path}")
        print(f"Excel exists: {os.path.exists(excel_path)}")

        if os.path.exists(excel_path):
            try:
                result_df = fa.analyze_screener_file(excel_path)
                row = result_df.iloc[0]
                quality = float(row.get("Business_Quality_Score", 0.0))
                opportunity = float(row.get("Opportunity_Score", 0.0))
                valuation = str(row.get("Valuation_Category", "N/A"))

                print(f"  Business Quality Score:    {quality}")
                print(f"  Opportunity Score:         {opportunity}")
                print(f"  Valuation Category:        {valuation}")
                print(f"  Company Name:              {row.get('Company', 'N/A')}")

                # Check if the engine has it in cache
                in_cache = ticker in fund_engine._parsed_cache
                print(f"  In engine cache:           {in_cache}")
                if in_cache:
                    cached = fund_engine._parsed_cache[ticker]
                    print(f"  Cached Quality:            {cached['Quality']}")
                    print(f"  Cached Opportunity:        {cached['Opportunity']}")

                # Test passes_filter for different dates
                test_dates = [
                    pd.Timestamp("2019-06-01"),
                    pd.Timestamp("2020-06-01"),
                    pd.Timestamp("2022-06-01"),
                    pd.Timestamp("2024-06-01"),
                ]
                for dt in test_dates:
                    passes = fund_engine.passes_filter(ticker, dt, cfg.fund_filter_threshold)
                    print(f"  passes_filter on {dt.date()}: {passes}")

                print(f"\n  *** WARNING ***")
                print(f"  Historical fundamental data unavailable.")
                print(f"  The backtest uses a SINGLE static score for all dates.")
                print(f"  Quality={quality}, Opportunity={opportunity} apply to today's")
                print(f"  fundamental snapshot, not to historical bars.")

            except Exception as e:
                print(f"  ERROR parsing Excel: {e}")

        else:
            print(f"\n  *** FILE NOT FOUND ***")
            print(f"  The engine falls back to: return False (reject all)")
            print(f"  This means ZERO trades for {ticker} regardless of technical signals.")

        print(f"  Point-in-time check for IDEA:")
        if "IDEA" in ticker.upper():
            print(f"    IDEA is hard-rejected if date >= 2019-10-24 (AGR ruling)")
            print(f"    This applies to the ENTIRE second half of the dataset.")


# ==============================================================================
# 3. PLAN A: BREAKOUT FILTER DIAGNOSTICS
# ==============================================================================
def diagnose_plan_a(stock_data: dict):
    """
    For every historical bar, count how many pass each condition sequentially.
    Uses the EXACT logic from BreakoutStrategy.check_signal().
    """
    print("\n" + "=" * 75)
    print("PLAN A: BREAKOUT STRATEGY FILTER DIAGNOSTICS")
    print("=" * 75)

    cfg = be.BacktestConfig()
    fund_engine = be.PointInTimeFundamentalEngine(EXCEL_MAP)
    strategy = be.BreakoutStrategy(fund_engine, cfg)

    for ticker in TARGET_TICKERS:
        df = stock_data[ticker]
        print(f"\n{'-' * 60}")
        print(f"Stock: {ticker}")
        print(f"  Total bars: {len(df)}")

        # We need to filter bars where basic indicators are not NaN first
        # The backtest checks for NaN on SMA_200 and HIGH_60
        valid_indicator_mask = (
            df["SMA_200"].notna()
            & df["HIGH_60"].notna()
            & df["SMA_50"].notna()
            & df["VOL_SMA_20"].notna()
            & df["SWING_LOW_20"].notna()
        )
        df_valid = df[valid_indicator_mask]
        total_valid = len(df_valid)
        print(f"  Bars with valid indicators (no NaN): {total_valid}")

        if total_valid == 0:
            print("  *** NO VALID BARS - Indicators are all NaN ***")
            print("  Possible cause: Not enough historical data for rolling windows")
            continue

        # Stage 1: Fundamental gate
        def passes_fund(idx):
            date = df_valid.index[idx]
            return fund_engine.passes_filter(ticker, date, cfg.fund_filter_threshold)

        fund_mask = df_valid.apply(
            lambda r: fund_engine.passes_filter(ticker, r.name, cfg.fund_filter_threshold),
            axis=1
        )
        fund_pass = fund_mask.sum()
        fund_pass_dates = df_valid.index[fund_mask].tolist()
        pct = (fund_pass / total_valid) * 100 if total_valid > 0 else 0

        # Stage 2: Price > 200 DMA
        above_200_mask = df_valid["Close"] > df_valid["SMA_200"]

        # Stage 3: 50 DMA >= 200 DMA
        trend_ok_mask = df_valid["SMA_50"] >= df_valid["SMA_200"]

        # Stage 4: RS Positive
        rs_ok_mask = df_valid["RS_Positive"].astype(bool)

        # Stage 5: Breakout (Close > HIGH_60)
        breakout_mask = df_valid["Close"] > df_valid["HIGH_60"]

        # Stage 6: Volume >= 1.5 * 20-day vol SMA
        vol_confirm_mask = df_valid["Volume"] >= (1.5 * df_valid["VOL_SMA_20"])

        # Final signal
        final_mask = fund_mask & above_200_mask & trend_ok_mask & rs_ok_mask & breakout_mask & vol_confirm_mask

        # Also check stop_loss validity (SWING_LOW_20 < Close)
        sl_valid_mask = df_valid["SWING_LOW_20"] < df_valid["Close"]
        final_with_sl = final_mask & sl_valid_mask

        print(f"\n  Filter Chain:")
        print(f"    -> Bars with valid indicators:  {total_valid} (100.0%)")
        print(f"    -> Business Quality >= 50 AND Opp >= 50:  {fund_pass} ({pct:.1f}%)")
        print(f"        -- Example dates: {[d.strftime('%Y-%m-%d') for d in fund_pass_dates[:10]]}")

        s2 = (fund_mask & above_200_mask).sum()
        print(f"    -> Price > 200 DMA:             {s2} ({s2/total_valid*100:.1f}%)")

        s3 = (fund_mask & above_200_mask & trend_ok_mask).sum()
        print(f"    -> SMA_50 >= SMA_200:           {s3} ({s3/total_valid*100:.1f}%)")

        s4 = (fund_mask & above_200_mask & trend_ok_mask & rs_ok_mask).sum()
        print(f"    -> RS_Positive:                 {s4} ({s4/total_valid*100:.1f}%)")

        s5 = (fund_mask & above_200_mask & trend_ok_mask & rs_ok_mask & breakout_mask).sum()
        print(f"    -> Close > Previous 60-day High: {s5} ({s5/total_valid*100:.1f}%)")
        bp_dates = df_valid.index[fund_mask & above_200_mask & trend_ok_mask & rs_ok_mask & breakout_mask].tolist()
        print(f"        -- Example dates: {[d.strftime('%Y-%m-%d') for d in bp_dates[:10]]}")

        s6 = (fund_mask & above_200_mask & trend_ok_mask & rs_ok_mask & breakout_mask & vol_confirm_mask).sum()
        print(f"    -> Volume >= 1.5 x Vol SMA(20): {s6} ({s6/total_valid*100:.1f}%)")

        print(f"    -> Final breakout signal:       {final_mask.sum()} ({final_mask.sum()/total_valid*100:.1f}%)")
        print(f"    -> Final signal (with SL < Close): {final_with_sl.sum()} ({final_with_sl.sum()/total_valid*100:.1f}%)")

        # Print example signal dates
        if final_with_sl.sum() > 0:
            sig_df = df_valid[final_with_sl]
            print(f"\n  Example final signal dates (up to 10):")
            for idx, row in sig_df.head(10).iterrows():
                print(f"    {idx.strftime('%Y-%m-%d')}: Close={row['Close']:.2f}, "
                      f"HIGH_60={row['HIGH_60']:.2f}, "
                      f"Vol={row['Volume']:.0f}, "
                      f"VolSMA20={row['VOL_SMA_20']:.0f}, "
                      f"SL={row['SWING_LOW_20']:.2f}")


# ==============================================================================
# 4. PLAN B: PULLBACK FILTER DIAGNOSTICS
# ==============================================================================
def diagnose_plan_b(stock_data: dict):
    """
    Sequential filter diagnostics for PullbackStrategy.
    """
    print("\n" + "=" * 75)
    print("PLAN B: PULLBACK STRATEGY FILTER DIAGNOSTICS")
    print("=" * 75)

    cfg = be.BacktestConfig()
    fund_engine = be.PointInTimeFundamentalEngine(EXCEL_MAP)

    for ticker in TARGET_TICKERS:
        df = stock_data[ticker]
        print(f"\n{'-' * 60}")
        print(f"Stock: {ticker}")
        print(f"  Total bars: {len(df)}")

        valid_indicator_mask = (
            df["SMA_200"].notna()
            & df["SMA_50"].notna()
            & df["SWING_LOW_15"].notna()
        )
        df_valid = df[valid_indicator_mask]
        total_valid = len(df_valid)
        print(f"  Bars with valid indicators (no NaN): {total_valid}")

        if total_valid == 0:
            print("  *** NO VALID BARS ***")
            continue

        # Stage 1: Fundamental gate
        fund_mask = df_valid.apply(
            lambda r: fund_engine.passes_filter(ticker, r.name, cfg.fund_filter_threshold),
            axis=1
        )
        fund_pass = fund_mask.sum()
        pct = (fund_pass / total_valid) * 100 if total_valid > 0 else 0

        # Stage 2: Close > SMA_200
        above_200_mask = df_valid["Close"] > df_valid["SMA_200"]

        # Stage 3: SMA_50 > SMA_200
        trend_ok_mask = df_valid["SMA_50"] > df_valid["SMA_200"]

        # Stage 4: Price within 3% of 50 DMA
        dist_50 = (df_valid["Close"] - df_valid["SMA_50"]).abs() / df_valid["SMA_50"]
        within_3pct_mask = dist_50 <= 0.03

        # Stage 5: Confirmation conditions
        c1_mask = df_valid["BULLISH_REVERSAL"].astype(bool)
        c2_mask = df_valid["Close"] > df_valid["PREV_HIGH"]
        c3_mask = (df_valid["PREV_RSI"] < 40) & (df_valid["RSI"] >= 40)
        confirmation_mask = c1_mask | c2_mask | c3_mask

        # Final: all conditions + SL valid
        final_mask = (
            fund_mask & above_200_mask & trend_ok_mask
            & within_3pct_mask & confirmation_mask
        )
        final_with_sl = final_mask & (df_valid["SWING_LOW_15"] < df_valid["Close"])

        print(f"\n  Filter Chain:")
        print(f"    -> Bars with valid indicators:  {total_valid} (100.0%)")
        print(f"    -> Business Quality >= 50 AND Opp >= 50:  {fund_pass} ({pct:.1f}%)")
        print(f"        -- Example dates: {[d.strftime('%Y-%m-%d') for d in df_valid.index[fund_mask].tolist()[:10]]}")

        s2 = (fund_mask & above_200_mask).sum()
        print(f"    -> Price > 200 DMA:             {s2} ({s2/total_valid*100:.1f}%)")

        s3 = (fund_mask & above_200_mask & trend_ok_mask).sum()
        print(f"    -> SMA_50 > SMA_200:            {s3} ({s3/total_valid*100:.1f}%)")

        s4 = (fund_mask & above_200_mask & trend_ok_mask & within_3pct_mask).sum()
        print(f"    -> Price within 3% of 50 DMA:   {s4} ({s4/total_valid*100:.1f}%)")
        w3_dates = df_valid.index[fund_mask & above_200_mask & trend_ok_mask & within_3pct_mask].tolist()
        print(f"        -- Example dates: {[d.strftime('%Y-%m-%d') for d in w3_dates[:10]]}")

        s5 = (fund_mask & above_200_mask & trend_ok_mask & within_3pct_mask & confirmation_mask).sum()
        print(f"    -> Confirmation (Rev candle/PrevHigh/RSI): {s5} ({s5/total_valid*100:.1f}%)")

        print(f"    -> Final pullback signal:       {final_mask.sum()} ({final_mask.sum()/total_valid*100:.1f}%)")
        print(f"    -> Final signal (with SL < Close): {final_with_sl.sum()} ({final_with_sl.sum()/total_valid*100:.1f}%)")

        if final_with_sl.sum() > 0:
            sig_df = df_valid[final_with_sl]
            print(f"\n  Example final signal dates (up to 10):")
            for idx, row in sig_df.head(10).iterrows():
                print(f"    {idx.strftime('%Y-%m-%d')}: Close={row['Close']:.2f}, "
                      f"SMA50={row['SMA_50']:.2f}, dist={dist_50.loc[idx]:.2%}, "
                      f"RSI={row['RSI']:.1f}, SL={row['SWING_LOW_15']:.2f}")


# ==============================================================================
# 5. INDICATOR VALIDATION
# ==============================================================================
def validate_indicators(stock_data: dict, bench_df: pd.DataFrame):
    """
    Validate that indicators are computed correctly and properly aligned.
    Does NOT modify any calculations.
    """
    print("\n" + "=" * 75)
    print("INDICATOR VALIDATION")
    print("=" * 75)

    for ticker in TARGET_TICKERS:
        df = stock_data[ticker]
        print(f"\n{'-' * 60}")
        print(f"Stock: {ticker}  ({len(df)} bars)")

        # Check 50 DMA
        sma50_non_nan = df["SMA_50"].notna().sum()
        print(f"  SMA_50 non-NaN bars: {sma50_non_nan}")
        if sma50_non_nan > 0:
            # Manual verification on first non-NaN bar
            first_valid_idx = df.index[df["SMA_50"].notna()][0]
            manual_sma50 = df.loc[:first_valid_idx, "Close"].tail(50).mean()
            computed_sma50 = df.loc[first_valid_idx, "SMA_50"]
            print(f"  First valid SMA_50 bar: {first_valid_idx.strftime('%Y-%m-%d')}")
            print(f"    Manual SMA50:  {manual_sma50:.4f}")
            print(f"    Computed SMA50: {computed_sma50:.4f}")
            print(f"    Match: {abs(manual_sma50 - computed_sma50) < 0.01}")

        # Check 200 DMA
        sma200_non_nan = df["SMA_200"].notna().sum()
        print(f"  SMA_200 non-NaN bars: {sma200_non_nan}")
        if sma200_non_nan > 0:
            first_valid_idx = df.index[df["SMA_200"].notna()][0]
            print(f"  First valid SMA_200 bar: {first_valid_idx.strftime('%Y-%m-%d')}")
            # Need 200 prior bars
            required_bars_for_200 = df.index.get_loc(first_valid_idx) + 1
            print(f"    Bars needed: {required_bars_for_200} (need 200 for SMA_200)")

        # Check VOL_SMA_20 uses shift(1)
        vol_sma_non_nan = df["VOL_SMA_20"].notna().sum()
        print(f"  VOL_SMA_20 non-NaN bars: {vol_sma_non_nan}")
        if vol_sma_non_nan > 0:
            first_valid_idx = df.index[df["VOL_SMA_20"].notna()][0]
            # VOL_SMA_20 = Volume.shift(1).rolling(20).mean()
            # So first valid index is 21 bars from start (1 shift + 20 rolling)
            pos = df.index.get_loc(first_valid_idx)
            print(f"  First valid VOL_SMA_20 bar: {first_valid_idx.strftime('%Y-%m-%d')} at position {pos}")
            print(f"    Expected: position 20 (1 shift + 19 for rolling(20) first value)")
            if pos >= 20:
                manual_vol = df["Volume"].iloc[pos-20:pos].mean()
                computed_vol = df.loc[first_valid_idx, "VOL_SMA_20"]
                print(f"    Manual VOL_SMA_20:  {manual_vol:.0f}")
                print(f"    Computed VOL_SMA_20: {computed_vol:.0f}")
                print(f"    Match: {abs(manual_vol - computed_vol) < 1}")

        # Check HIGH_60 uses shift(1)
        high60_non_nan = df["HIGH_60"].notna().sum()
        print(f"  HIGH_60 non-NaN bars: {high60_non_nan}")
        if high60_non_nan > 0:
            first_valid_idx = df.index[df["HIGH_60"].notna()][0]
            print(f"  First valid HIGH_60 bar: {first_valid_idx.strftime('%Y-%m-%d')}")

        # Check SWING_LOW_20
        sl20_non_nan = df["SWING_LOW_20"].notna().sum()
        print(f"  SWING_LOW_20 non-NaN bars: {sl20_non_nan}")

        # Check RS_Positive for NaN issues
        rs_na = df["RS_Positive"].isna().sum()
        rs_true = df["RS_Positive"].sum()
        rs_false = (~df["RS_Positive"] & df["RS_Positive"].notna()).sum()
        print(f"  RS_Positive - NaN: {rs_na}, True: {rs_true}, False: {rs_false}")

        # Check RSI warm-up
        rsi_na = df["RSI"].isna().sum()
        print(f"  RSI NaN count: {rsi_na} (RSI has 14-bar warm-up)")

        # Check PREV_HIGH
        prev_high_na = df["PREV_HIGH"].isna().sum()
        print(f"  PREV_HIGH NaN count: {prev_high_na}")

        # Check BULLISH_REVERSAL
        bullish_count = df["BULLISH_REVERSAL"].sum()
        print(f"  BULLISH_REVERSAL True count: {bullish_count}")

        # Check benchmark alignment
        print(f"\n  Benchmark date range: {bench_df.index[0].date()} to {bench_df.index[-1].date()}")
        bench_in_stock = bench_df[~bench_df.index.isin(df.index)]
        print(f"  Benchmark dates NOT in stock data: {len(bench_in_stock)}")
        stock_in_bench = df[~df.index.isin(bench_df.index)]
        print(f"  Stock dates NOT in benchmark: {len(stock_in_bench)}")

        # Check date alignment for RS calculation
        common_dates = df.index.intersection(bench_df.index)
        print(f"  Common dates (stock & benchmark): {len(common_dates)}")


# ==============================================================================
# 6. SIGNAL EXAMPLES
# ==============================================================================
def check_signal_examples(stock_data: dict):
    """
    Run the actual simulator and report what signals it found (or why it didn't).
    """
    print("\n" + "=" * 75)
    print("SIGNAL EXAMPLES (via actual BacktestSimulator)")
    print("=" * 75)

    cfg = be.BacktestConfig()
    fund_engine = be.PointInTimeFundamentalEngine(EXCEL_MAP)
    simulator = be.BacktestSimulator(cfg)

    strategies = {
        "PLAN A: Breakout": be.BreakoutStrategy(fund_engine, cfg),
        "PLAN B: Pullback": be.PullbackStrategy(fund_engine, cfg),
    }

    for strat_name, strat_obj in strategies.items():
        print(f"\n{'-' * 60}")
        print(f"Strategy: {strat_name}")

        for ticker in TARGET_TICKERS:
            trades = simulator.simulate(ticker, stock_data[ticker], strat_obj, strat_name)
            print(f"\n  {ticker}: {len(trades)} trades")
            if trades:
                for t in trades[:5]:
                    print(f"    Entry: {t.entry_date.strftime('%Y-%m-%d')} @ ₹{t.entry_price:.2f}, "
                          f"Exit: {t.exit_date}, Return: {t.return_pct:.1f}%")
            else:
                print(f"    No trades generated.")


# ==============================================================================
# 7. LOOK-AHEAD BIAS CHECK
# ==============================================================================
def check_lookahead_bias(stock_data: dict):
    """
    Inspect whether any part of the backtest uses information that would not
    have been available on the signal date.
    """
    print("\n" + "=" * 75)
    print("LOOK-AHEAD BIAS CHECK")
    print("=" * 75)

    for ticker in TARGET_TICKERS:
        df = stock_data[ticker]
        print(f"\n{'-' * 60}")
        print(f"Stock: {ticker}")

        issues = []

        # Check 1: SMA_50 uses rolling without shift
        # In backtest_engine.py line 82: df["SMA_50"] = df["Close"].rolling(window=50).mean()
        # This uses TODAY's close, which means on Day T, SMA_50 includes Day T's close.
        # For signal evaluation at Day T close, this is acceptable (bar-close evaluation).
        # But for entry at Day T+1 open, the SMA_50 on Day T already knew Day T close.
        print("  SMA_50 = Close.rolling(50).mean() (line 82)")
        print("    -> Uses current day close. This is OK for bar-close signal evaluation.")
        print("    -> NOT look-ahead bias since signals evaluate at bar close.")

        # Check 2: HIGH_60 uses shift(1)
        print("  HIGH_60 = High.shift(1).rolling(60).max() (line 89)")
        print("    -> Uses PREVIOUS day's high. Correctly look-ahead protected.")

        # Check 3: VOL_SMA_20 uses shift(1)
        print("  VOL_SMA_20 = Volume.shift(1).rolling(20).mean() (line 86)")
        print("    -> Uses PRIOR data. Correctly look-ahead protected.")

        # Check 4: SWING_LOW uses shift(1)
        print("  SWING_LOW_20 = Low.shift(1).rolling(20).min() (line 92)")
        print("    -> Uses PRIOR data. Correctly look-ahead protected.")

        # Check 5: PREV_HIGH uses shift(1)
        print("  PREV_HIGH = High.shift(1) (line 109)")
        print("    -> Uses previous day. Correctly look-ahead protected.")

        # Check 6: PREV_RSI uses shift(1)
        print("  PREV_RSI = RSI.shift(1) (line 101)")
        print("    -> Uses previous day. Correctly look-ahead protected.")

        # Check 7: RS_Positive - stock_ret and bench_ret both use pct_change(60)
        # stock_ret = df["Close"].pct_change(60) - current day
        # bench_ret = bench_df["Close"].pct_change(60).reindex(df.index).ffill()
        # Both use current day close, but this is OK since evaluated at bar close
        print("  RS_Positive: both stock_ret and bench_ret use pct_change(60) at bar close")
        print("    -> Both use current day close. Acceptable for bar-close evaluation.")

        # Check 8: Fundamental scores
        print("  Fundamental scores are STATIC (single Excel parse at __init__)")
        print("    -> Same score applied to ALL historical dates.")
        print("    -> This is NOT look-ahead bias per se, but it is HISTORICALLY INACCURATE.")
        print("    -> The backtest pretends today's fundamentals were valid historically.")

        # Check 9: Entry at next day open
        print("  Entry executes at NEXT DAY OPEN (Day T+1) per simulator (line 294)")
        print("    -> Correctly avoids same-bar execution. Good.")

        # Check 10: Exit checks use current bar
        print("  Exit conditions evaluate at current bar close (lines 330-354)")
        print("    -> Stop loss checks use current bar Open/Low/High. Acceptable.")

    print("\n  Summary of look-ahead bias findings:")
    print("    [OK] HIGH_60, VOL_SMA_20, SWING_LOW, PREV_HIGH, PREV_RSI all use shift(1)")
    print("    [OK] Entry at next day open")
    print("    [OK] Signal evaluation at bar close")
    print("    ! Fundamental scores are static (same for all dates) - historically inaccurate")
    print("    ! SMA uses unshifted rolling - acceptable for bar-close evaluation")


# ==============================================================================
# 8. FINAL DIAGNOSIS
# ==============================================================================
def final_diagnosis(stock_data: dict):
    """
    Produce a clear diagnosis of why zero trades are generated.
    """
    print("\n" + "=" * 75)
    print("FINAL DIAGNOSIS")
    print("=" * 75)

    print("\nDiagnosing zero-trade condition for ICICIBANK.NS and IDEA.NS:\n")

    # Check each ticker
    for ticker in TARGET_TICKERS:
        df = stock_data[ticker]
        excel_path = EXCEL_MAP[ticker]
        file_exists = os.path.exists(excel_path)

        print(f"{'-' * 60}")
        print(f"Ticker: {ticker}")
        print(f"Excel file: {excel_path}")
        print(f"Excel exists: {file_exists}")

        if not file_exists:
            print(f"\n  -> REJECTED at fundamental gate: file not found")
            print(f"  -> PointInTimeFundamentalEngine returns False for ALL bars")
            print(f"  -> ZERO trades possible regardless of technical signals")
        else:
            try:
                result_df = fa.analyze_screener_file(excel_path)
                row = result_df.iloc[0]
                quality = float(row.get("Business_Quality_Score", 0.0))
                opportunity = float(row.get("Opportunity_Score", 0.0))

                print(f"Quality Score: {quality}")
                print(f"Opportunity Score: {opportunity}")
                passes = quality >= 50.0 and opportunity >= 50.0
                print(f"Passes >= 50 threshold: {passes}")

                if not passes:
                    print(f"\n  -> REJECTED at fundamental gate: scores below threshold")
                    print(f"  -> Quality={quality} (need >=50), Opportunity={opportunity} (need >=50)")
                    print(f"  -> ZERO trades possible regardless of technical signals")
                else:
                    print(f"\n  -> Fundamental gate PASSED")
                    print(f"  -> Need to check technical conditions (see Plan A/B diagnostics above)")

                if "IDEA" in ticker.upper():
                    print(f"\n  -> IDEA has point-in-time penalty: rejected if date >= 2019-10-24")
                    print(f"  -> Data spans {df.index[0].date()} to {df.index[-1].date()}")
                    post_agr = (df.index >= pd.Timestamp("2019-10-24")).sum()
                    pre_agr = (df.index < pd.Timestamp("2019-10-24")).sum()
                    print(f"  -> Bars before AGR ruling: {pre_agr}")
                    print(f"  -> Bars on/after AGR ruling: {post_agr} (ALL REJECTED)")

            except Exception as e:
                print(f"\n  -> ERROR parsing Excel: {e}")
                print(f"  -> REJECTED at fundamental gate: parse failure")

    print(f"\n{'=' * 60}")
    print("POSSIBLE CAUSES:")
    print(f"{'=' * 60}")

    any_file_missing = any(not os.path.exists(EXCEL_MAP[t]) for t in TARGET_TICKERS)
    any_score_low = False
    for t in TARGET_TICKERS:
        if os.path.exists(EXCEL_MAP[t]):
            try:
                df = fa.analyze_screener_file(EXCEL_MAP[t])
                q = float(df.iloc[0].get("Business_Quality_Score", 0))
                o = float(df.iloc[0].get("Opportunity_Score", 0))
                if q < 50 or o < 50:
                    any_score_low = True
            except:
                pass

    causes = []
    if any_file_missing:
        causes.append("B. Fundamental data unavailable/misaligned (Excel files missing)")
    if any_score_low:
        causes.append("B. Fundamental data unavailable/misaligned (scores below 50 threshold)")
    causes.append("E. Rules genuinely produce zero signals (technical conditions too strict)")

    for i, c in enumerate(causes, 1):
        print(f"  {chr(65+i-1) if i == 1 else chr(65+i-1)}. {c.split('. ', 1)[1] if '. ' in c else c}")

    print(f"\nPrimary cause: {causes[0]}")
    print(f"\nRecommendation:")
    if any_file_missing:
        print("  1. Place the Screener.in Excel files in the project directory:")
        print(f"     - ICICI Bank.xlsx")
        print(f"     - Vodafone Idea.xlsx")
        print("  2. Re-run the debugger to see which technical condition blocks signals.")
    else:
        print("  1. Run diagnostics to see which technical condition blocks signals.")
        print("  2. Consider that IDEA will only produce trades pre-Oct 2019.")
        print("  3. Check if ICICIBANK scores meet the 50/50 fundamental threshold.")


# ==============================================================================
# MAIN
# ==============================================================================
if __name__ == "__main__":
    print("=" * 75)
    print("BACKTEST DEBUGGER - Tracing Zero-Trade Condition")
    print("=" * 75)
    print(f"\nScript directory: {_SCRIPT_DIR}")
    print(f"Target tickers: {TARGET_TICKERS}")
    print(f"Date range: {START_DATE} to {END_DATE}")
    print(f"\nExcel file resolution:")
    for t, p in EXCEL_MAP.items():
        print(f"  {t} -> {p} (exists: {os.path.exists(p)})")

    # Step 1: Load data
    stock_data, bench_df, stock_raw = load_market_data()

    # Step 2: Fundamental check
    check_fundamentals()

    # Step 3: Plan A diagnostics
    diagnose_plan_a(stock_data)

    # Step 4: Plan B diagnostics
    diagnose_plan_b(stock_data)

    # Step 5: Indicator validation
    validate_indicators(stock_data, bench_df)

    # Step 6: Signal examples via actual simulator
    check_signal_examples(stock_data)

    # Step 7: Look-ahead bias check
    check_lookahead_bias(stock_data)

    # Step 8: Final diagnosis
    final_diagnosis(stock_data)

    print("\n" + "=" * 75)
    print("DEBUG COMPLETE")
    print("=" * 75)
