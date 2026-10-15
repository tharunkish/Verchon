"""
chart_signals.py - Historical Signal Detection & TradingView Chart Accuracy Engine
==================================================================================
Identifies historical technical buy signals across a stock's 1-year OHLCV history,
simulates forward execution outcomes (2R Target vs Stop Loss), computes accuracy
metrics (Win Rate, Profit Factor, Avg Gain), and formats Lightweight Charts markers.
"""

from typing import Any, Dict, List, Optional
import pandas as pd


def compute_chart_signals(
    df: pd.DataFrame,
    active_strategy_info: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Scans the OHLCV dataframe for historical strategy buy triggers, simulates
    trade outcomes (Target vs Stop), and builds TradingView series markers.
    """
    if df is None or len(df) < 40:
        return {"signals": [], "stats": {}, "markers": []}

    close = df["Close"].squeeze()
    high = df["High"].squeeze()
    low = df["Low"].squeeze()
    vol = df["Volume"].squeeze()
    open_p = df["Open"].squeeze()

    ma50 = close.rolling(50).mean()
    ma200 = close.rolling(200).mean() if len(close) >= 200 else close.rolling(50).mean()
    vol_ma20 = vol.rolling(20).mean()

    signals: List[Dict[str, Any]] = []
    markers: List[Dict[str, Any]] = []

    total_bars = len(df)

    for i in range(50, total_bars):
        date_str = df.index[i].strftime("%Y-%m-%d")
        c = float(close.iloc[i])
        o = float(open_p.iloc[i])
        m50 = float(ma50.iloc[i])
        m200 = float(ma200.iloc[i]) if pd.notna(ma200.iloc[i]) else m50
        v = float(vol.iloc[i])
        v_avg = float(vol_ma20.iloc[i]) if pd.notna(vol_ma20.iloc[i]) else v

        # 1. Structural Trend Filter
        is_uptrend = c > m200 and m50 >= m200 * 0.98

        # 2. Setup Conditions
        # Setup A: Trend Pullback to 50 DMA
        near_50dma = abs(c - m50) / m50 <= 0.035
        is_pullback_bounce = (
            c > o
            and (float(close.iloc[i - 1]) <= m50 * 1.015 or float(low.iloc[i]) <= m50 * 1.015)
        )

        # Setup B: Consolidation Breakout
        highest_20 = float(high.iloc[max(0, i - 20):i].max())
        is_breakout = c > highest_20 and v >= 1.35 * v_avg and is_uptrend

        sig_type = None
        sig_label = ""
        if is_breakout:
            sig_type = "CONSOLIDATION_BREAKOUT"
            sig_label = "Breakout"
        elif is_uptrend and near_50dma and is_pullback_bounce:
            sig_type = "TREND_PULLBACK"
            sig_label = "50D Pullback"

        if sig_type:
            # Throttle duplicate triggers within 6 bars
            if not signals or (i - signals[-1]["idx"] > 6):
                stop = round(
                    m50 * 0.96 if sig_type == "TREND_PULLBACK" else float(low.iloc[max(0, i - 5):i + 1].min()) * 0.98,
                    2,
                )
                risk = max(1.0, c - stop)
                target = round(c + 2.0 * risk, 2)

                is_latest_bar = i >= total_bars - 4
                outcome = "ACTIVE" if is_latest_bar else "EXPIRED"
                pnl_pct = 0.0
                outcome_date = None
                bars_held = 0

                # Simulate forward price action up to 35 bars
                for j in range(i + 1, min(total_bars, i + 35)):
                    bars_held += 1
                    bar_low = float(low.iloc[j])
                    bar_high = float(high.iloc[j])

                    if bar_low <= stop:
                        outcome = "STOP_HIT"
                        pnl_pct = round(((stop - c) / c) * 100, 1)
                        outcome_date = df.index[j].strftime("%Y-%m-%d")
                        break
                    elif bar_high >= target:
                        outcome = "TARGET_HIT"
                        pnl_pct = round(((target - c) / c) * 100, 1)
                        outcome_date = df.index[j].strftime("%Y-%m-%d")
                        break

                if outcome in ["ACTIVE", "EXPIRED"]:
                    latest_close = float(close.iloc[-1])
                    pnl_pct = round(((latest_close - c) / c) * 100, 1)

                signals.append({
                    "idx": i,
                    "date": date_str,
                    "type": sig_type,
                    "label": sig_label,
                    "price": round(c, 2),
                    "stop": stop,
                    "target": target,
                    "outcome": outcome,
                    "outcome_date": outcome_date,
                    "pnl_pct": pnl_pct,
                    "bars_held": bars_held,
                })

                # Construct Entry Marker
                entry_color = "#10b981" if outcome in ["TARGET_HIT", "ACTIVE"] else ("#f43f5e" if outcome == "STOP_HIT" else "#06b6d4")
                badge_text = f"BUY {sig_label} @ ₹{round(c, 1)}"
                if outcome == "TARGET_HIT":
                    badge_text += f" ✓ +{pnl_pct}%"
                elif outcome == "STOP_HIT":
                    badge_text += f" ✕ {pnl_pct}%"
                elif outcome == "ACTIVE":
                    badge_text = f"⚡ ACTIVE BUY @ ₹{round(c, 1)}"

                markers.append({
                    "time": date_str,
                    "position": "belowBar",
                    "color": entry_color,
                    "shape": "arrowUp",
                    "text": badge_text,
                    "size": 2 if outcome == "ACTIVE" else 1,
                })

                # Construct Outcome Marker
                if outcome_date:
                    if outcome == "TARGET_HIT":
                        markers.append({
                            "time": outcome_date,
                            "position": "aboveBar",
                            "color": "#10b981",
                            "shape": "circle",
                            "text": f"TARGET HIT +{pnl_pct}%",
                            "size": 1,
                        })
                    elif outcome == "STOP_HIT":
                        markers.append({
                            "time": outcome_date,
                            "position": "belowBar",
                            "color": "#f43f5e",
                            "shape": "circle",
                            "text": f"STOP HIT {pnl_pct}%",
                            "size": 1,
                        })

    # If the active strategy evaluated for today is active, ensure latest marker exists
    if active_strategy_info and total_bars > 0:
        latest_date = df.index[-1].strftime("%Y-%m-%d")
        strat_name = active_strategy_info.get("primary_strategy") or "SWING_MOMENTUM"
        strat_status = active_strategy_info.get("status") or "Active"
        latest_c = float(close.iloc[-1])
        latest_stop = active_strategy_info.get("stop_loss", float(ma50.iloc[-1]))
        latest_target = active_strategy_info.get("target_1", round(latest_c * 1.10, 2))

        # Check if we already have an active marker at latest_date
        has_latest_marker = any(m["time"] == latest_date for m in markers)
        if not has_latest_marker and strat_status in ["Active", "QUALIFIED"]:
            markers.append({
                "time": latest_date,
                "position": "belowBar",
                "color": "#00f2fe",
                "shape": "arrowUp",
                "text": f"⚡ ACTIVE SETUP: {strat_name} @ ₹{round(latest_c, 1)}",
                "size": 2,
            })
            signals.append({
                "idx": total_bars - 1,
                "date": latest_date,
                "type": strat_name,
                "label": "Active Setup",
                "price": round(latest_c, 2),
                "stop": round(float(latest_stop), 2) if latest_stop else round(latest_c * 0.95, 2),
                "target": round(float(latest_target), 2) if latest_target else round(latest_c * 1.10, 2),
                "outcome": "ACTIVE",
                "outcome_date": None,
                "pnl_pct": 0.0,
                "bars_held": 0,
            })

    # Sort markers chronologically (mandatory for Lightweight Charts)
    markers.sort(key=lambda m: m["time"])

    # Aggregate Accuracy Statistics
    wins = [s for s in signals if s["outcome"] == "TARGET_HIT" or (s["outcome"] == "EXPIRED" and s["pnl_pct"] > 0)]
    losses = [s for s in signals if s["outcome"] == "STOP_HIT" or (s["outcome"] == "EXPIRED" and s["pnl_pct"] < 0)]

    total_resolved = len(wins) + len(losses)
    win_rate = round((len(wins) / total_resolved) * 100, 1) if total_resolved > 0 else 0.0
    avg_win = round(sum(s["pnl_pct"] for s in wins) / len(wins), 1) if wins else 0.0
    avg_loss = round(sum(s["pnl_pct"] for s in losses) / len(losses), 1) if losses else 0.0

    total_profit_pct = sum(s["pnl_pct"] for s in wins)
    total_loss_pct = abs(sum(s["pnl_pct"] for s in losses))
    profit_factor = round(total_profit_pct / total_loss_pct, 2) if total_loss_pct > 0 else (round(total_profit_pct, 2) if total_profit_pct > 0 else 1.0)

    active_sig = next((s for s in signals if s["outcome"] == "ACTIVE"), None)

    stats = {
        "total_signals": len(signals),
        "evaluated_signals": total_resolved,
        "winning_signals": len(wins),
        "losing_signals": len(losses),
        "win_rate_pct": win_rate,
        "avg_win_pct": avg_win,
        "avg_loss_pct": avg_loss,
        "profit_factor": profit_factor,
        "active_signal": active_sig,
    }

    return {
        "signals": signals,
        "stats": stats,
        "markers": markers,
    }
