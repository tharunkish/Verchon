"""
chart_signals.py - Clean Technical Buy Signal Markers for TradingView Chart
===========================================================================
Detects technical strategy buy trigger bars across a stock's OHLCV history
and builds clean Lightweight Charts series markers directly on the candlestick chart.
No backtest simulation, no outcome markers — purely clean BUY indicators.
"""

from typing import Any, Dict, List, Optional
import pandas as pd


def compute_chart_signals(
    df: pd.DataFrame,
    active_strategy_info: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Scans the OHLCV dataframe for strategy buy triggers and builds clean
    TradingView series markers.
    """
    if df is None or len(df) < 40:
        return {"markers": []}

    close = df["Close"].squeeze()
    high = df["High"].squeeze()
    low = df["Low"].squeeze()
    vol = df["Volume"].squeeze()
    open_p = df["Open"].squeeze()

    ma50 = close.rolling(50).mean()
    ma200 = close.rolling(200).mean() if len(close) >= 200 else close.rolling(50).mean()
    vol_ma20 = vol.rolling(20).mean()

    markers: List[Dict[str, Any]] = []
    last_trigger_idx = -999
    total_bars = len(df)

    for i in range(50, total_bars):
        date_str = df.index[i].strftime("%Y-%m-%d") if hasattr(df.index[i], "strftime") else str(df.index[i])[:10]
        c = float(close.iloc[i])
        o = float(open_p.iloc[i])
        m50 = float(ma50.iloc[i])
        m200 = float(ma200.iloc[i]) if pd.notna(ma200.iloc[i]) else m50
        v = float(vol.iloc[i])
        v_avg = float(vol_ma20.iloc[i]) if pd.notna(vol_ma20.iloc[i]) else v

        # 1. Structural Trend Filter
        is_uptrend = c > m200 and m50 >= m200 * 0.98

        # 2. Setup Triggers
        # Setup A: Pullback to 50 DMA
        near_50dma = abs(c - m50) / m50 <= 0.035
        is_pullback = (
            is_uptrend
            and near_50dma
            and c > o
            and (float(close.iloc[i - 1]) <= m50 * 1.015 or float(low.iloc[i]) <= m50 * 1.015)
        )

        # Setup B: Consolidation Breakout on Volume
        highest_20 = float(high.iloc[max(0, i - 20):i].max())
        is_breakout = is_uptrend and c > highest_20 and v >= 1.35 * v_avg

        sig_label = None
        if is_breakout:
            sig_label = "Breakout"
        elif is_pullback:
            sig_label = "Pullback"

        if sig_label and (i - last_trigger_idx > 6):
            last_trigger_idx = i
            markers.append({
                "time": date_str,
                "position": "belowBar",
                "color": "#10b981",
                "shape": "arrowUp",
                "text": f"BUY ({sig_label})",
                "size": 1,
            })

    # Check if active strategy for today has a buy signal triggered
    if active_strategy_info and total_bars > 0:
        latest_date = df.index[-1].strftime("%Y-%m-%d") if hasattr(df.index[-1], "strftime") else str(df.index[-1])[:10]
        is_triggered = active_strategy_info.get("signal_triggered", False)
        all_strat = active_strategy_info.get("all_strategy_results", {})
        any_triggered = is_triggered or any(s.get("signal_triggered") for s in all_strat.values())

        if any_triggered:
            existing_latest = any(m["time"] == latest_date for m in markers)
            strat_name = active_strategy_info.get("primary_strategy") or "Setup"
            clean_name = strat_name.replace("SWING_", "").replace("_", " ").title()
            if not existing_latest:
                markers.append({
                    "time": latest_date,
                    "position": "belowBar",
                    "color": "#00f2fe",
                    "shape": "arrowUp",
                    "text": f"BUY ({clean_name})",
                    "size": 2,
                })

    markers.sort(key=lambda m: m["time"])
    return {"markers": markers}
