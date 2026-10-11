"""
VERCHON Short-Horizon Engine (EOD Data Science Core)
===================================================
Target Timeframe: 2-7 Day Swing Holds
Goal: Data-driven setup extraction with cost/slippage modeling & invalidation logic.
"""

import sys
import math
import logging
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
import yfinance as yfinance

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Default Parameters for Friction & Risk
DEFAULT_CAPITAL = 1000000.0  # ₹10,00,000 Starting Vault
MAX_RISK_PER_TRADE_PCT = 0.01  # 1.0% Max Risk per Trade (₹10,000)
ESTIMATED_FRICTION_PCT = 0.0015  # 0.15% STT + Brokerage + Taxes roundtrip
SLIPPAGE_PCT = 0.0020  # 0.20% Slippage buffer

# Stock Universe for Short-Horizon Evaluation
DEFAULT_UNIVERSE = [
    "ICICIBANK.NS", "TCS.NS", "RELIANCE.NS", "INFY.NS", "BHARTIARTL.NS",
    "HDFCBANK.NS", "TATAMOTORS.NS", "LT.NS", "AXISBANK.NS", "SBIN.NS",
    "HAL.NS", "BEL.NS", "MOTHERSON.NS", "TRENT.NS", "BAJFINANCE.NS"
]


def fetch_historical_data(symbol: str, period="6mo", interval="1d") -> pd.DataFrame:
    """Fetch daily OHLCV data using yfinance."""
    try:
        ticker = yfinance.Ticker(symbol)
        df = ticker.history(period=period, interval=interval)
        if df.empty or len(df) < 50:
            logging.warning(f"Insufficient data for {symbol}")
            return pd.DataFrame()
        return df
    except Exception as e:
        logging.error(f"Error fetching data for {symbol}: {e}")
        return pd.DataFrame()


def feature_engineering(df: pd.DataFrame) -> pd.DataFrame:
    """Extract Quantitative Features for Short-Horizon Evaluation."""
    df = df.copy()

    # Moving Averages
    df['EMA_20'] = df['Close'].ewm(span=20, adjust=False).mean()
    df['SMA_50'] = df['Close'].rolling(window=50).mean()
    df['SMA_200'] = df['Close'].rolling(window=200).mean()

    # ATR (14-period True Range)
    high_low = df['High'] - df['Low']
    high_close = (df['High'] - df['Close'].shift(1)).abs()
    low_close = (df['Low'] - df['Close'].shift(1)).abs()
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    df['ATR_14'] = tr.rolling(window=14).mean()

    # Volume Z-Score (vs 20-day Average Volume)
    vol_mean = df['Volume'].rolling(window=20).mean()
    vol_std = df['Volume'].rolling(window=20).std()
    df['Vol_ZScore'] = (df['Volume'] - vol_mean) / (vol_std + 1e-6)
    df['Vol_Ratio'] = df['Volume'] / (vol_mean + 1e-6)

    # 5-Day Distance to EMA 20
    df['Dist_EMA20_Pct'] = ((df['Close'] - df['EMA_20']) / df['EMA_20']) * 100.0

    return df


def evaluate_short_horizon_setup(symbol: str, df: pd.DataFrame, capital: float = DEFAULT_CAPITAL):
    """
    Evaluates whether a stock meets 2-7 day short-horizon setup criteria:
    Setup 1: EMA 20 Pullback (Uptrend consolidation near 20 EMA)
    Setup 2: Momentum Volume Breakout (High Vol Z-Score + Price Surge)
    """
    if df.empty or len(df) < 50:
        return None

    last_row = df.iloc[-1]
    prev_row = df.iloc[-2]

    close = float(last_row['Close'])
    ema20 = float(last_row['EMA_20'])
    sma50 = float(last_row['SMA_50']) if not pd.isna(last_row['SMA_50']) else close * 0.95
    sma200 = float(last_row['SMA_200']) if not pd.isna(last_row['SMA_200']) else close * 0.90
    atr = float(last_row['ATR_14']) if not pd.isna(last_row['ATR_14']) else close * 0.02
    vol_ratio = float(last_row['Vol_Ratio'])

    # Basic Trend Filter: Price > 50DMA or 200DMA
    is_uptrend = close > sma50 or close > sma200
    if not is_uptrend:
        return None

    setup_type = None
    priority = "WATCHLIST"
    score = 50.0

    # 1. Check EMA 20 Pullback Setup
    # Close is within 1.5% of 20 EMA, and previous bar was above 20 EMA
    dist_ema = abs(close - ema20) / ema20
    if dist_ema <= 0.018 and close >= ema20 * 0.985:
        setup_type = "20-EMA PULLBACK"
        score += 25.0
        if vol_ratio < 1.0:  # Contracting volume on pullback is bullish
            score += 15.0
            priority = "HIGH PRIORITY"

    # 2. Check Momentum Volume Breakout Setup
    elif vol_ratio >= 1.8 and close > prev_row['Close']:
        setup_type = "MOMENTUM BREAKOUT"
        score += 30.0
        priority = "SIGNAL TRIGGERED"

    if not setup_type:
        return None

    # Calculate Precise Trade Levels (2-7 Day Horizon)
    stop_loss = round(close - (1.8 * atr), 2)
    target_1 = round(close + (2.5 * atr), 2)
    target_2 = round(close + (4.0 * atr), 2)

    risk_per_share = close - stop_loss
    if risk_per_share <= 0:
        return None

    # Risk Management & Friction Calculations
    max_risk_amount = capital * MAX_RISK_PER_TRADE_PCT
    quantity = int(max_risk_amount / risk_per_share)
    if quantity <= 0:
        quantity = 1

    allocated_capital = round(quantity * close, 2)
    
    # Pre-calculated Friction (STT + Taxes + Slippage)
    friction_cost = round(allocated_capital * (ESTIMATED_FRICTION_PCT + SLIPPAGE_PCT), 2)
    gross_target1_gain = round(quantity * (target_1 - close), 2)
    net_target1_gain = max(0, gross_target1_gain - friction_cost)
    rr_ratio = round((target_1 - close) / risk_per_share, 2)

    # Generate Plain English Invalidation Condition
    gap_invalidation_price = round(close * 0.985, 2)
    invalidation_rule = f"Skip entry if market opens below ₹{gap_invalidation_price} (gap-down > 1.5%)."

    return {
        "ticker": symbol,
        "setup_type": setup_type,
        "priority": priority,
        "score": round(score, 1),
        "current_price": round(close, 2),
        "entry_range": f"₹{round(close * 0.998, 2)} - ₹{round(close * 1.005, 2)}",
        "stop_loss": stop_loss,
        "target_1": target_1,
        "target_2": target_2,
        "risk_reward_ratio": rr_ratio,
        "recommended_quantity": quantity,
        "allocated_capital": allocated_capital,
        "estimated_friction": friction_cost,
        "net_target1_gain": net_target1_gain,
        "invalidation_rule": invalidation_rule,
        "rationale": f"Stock is in an active {setup_type.lower()} setup near 20-day EMA (₹{round(ema20, 2)}) with ATR ₹{round(atr, 2)}. Expected holding horizon: 2–5 trading sessions."
    }


def run_short_horizon_scan(universe=None, capital=DEFAULT_CAPITAL):
    """Runs the full EOD Short-Horizon Engine across the universe."""
    symbols = universe or DEFAULT_UNIVERSE
    logging.info(f"Running VERCHON Short-Horizon Engine across {len(symbols)} stocks...")

    results = []
    for sym in symbols:
        df = fetch_historical_data(sym)
        if df.empty:
            continue
        df_feats = feature_engineering(df)
        setup = evaluate_short_horizon_setup(sym, df_feats, capital)
        if setup:
            results.append(setup)

    # Sort results by score descending
    results.sort(key=lambda x: x['score'], reverse=True)
    logging.info(f"Scan complete. Found {len(results)} short-horizon setup candidates.")
    return results


if __name__ == "__main__":
    scan_output = run_short_horizon_scan()
    print("\n=======================================================")
    print("VERCHON SHORT-HORIZON ENGINE (EOD CANDIDATES)")
    print("=======================================================\n")
    for idx, item in enumerate(scan_output, 1):
        print(f"#{idx} | {item['ticker']} ({item['setup_type']}) - Score: {item['score']}")
        print(f"   LTP: ₹{item['current_price']} | Buy Zone: {item['entry_range']}")
        print(f"   Qty: {item['recommended_quantity']} shares (₹{item['allocated_capital']})")
        print(f"   SL: ₹{item['stop_loss']} | T1: ₹{item['target_1']} (R:R {item['risk_reward_ratio']}x)")
        print(f"   Est. Friction: ₹{item['estimated_friction']} | Net Gain T1: ₹{item['net_target1_gain']}")
        print(f"   Invalidation: {item['invalidation_rule']}")
        print(f"   Why: {item['rationale']}\n")
