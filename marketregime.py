"""
marketregime.py - Standalone Market Context & Regime Analysis Module (Phase 7)
=============================================================================
Purpose:
    Answers: "Is the overall Indian equity market environment currently supportive,
    neutral, or hostile for a 3-week to 2-month swing-trading strategy?"

Design Principles:
    - Primary Benchmark: Nifty 50 (^NSEI) via Yahoo Finance daily data.
    - Context only: Generates NO buy/sell/stop-loss recommendations.
    - Independent: Does not modify or depend on improvedfundanalysis.py,
      techanalysis.py, or resultanalysis.py.
    - Exposes structured dictionary output for future Phase 8 consolidation.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import pandas as pd
import yfinance as yf


def fetch_benchmark_data(
    ticker: str = "^NSEI",
    period: str = "2y",
    as_of_date: Optional[str] = None
) -> Optional[pd.DataFrame]:
    """
    Fetches daily historical price data for the benchmark index.
    Retrieves ~2 years of daily data to ensure clean 200 DMA + 20-day slope
    and 6-month momentum calculation without edge clipping.
    Slices on or before as_of_date if specified.
    """
    try:
        data = yf.download(
            ticker, period=period, interval="1d", progress=False, auto_adjust=True
        )
        if data is None or data.empty:
            return None

        # Flatten MultiIndex columns if returned by newer yfinance versions
        if isinstance(data.columns, pd.MultiIndex):
            data.columns = [col[0] for col in data.columns]

        if "Close" not in data.columns:
            return None

        clean_data = data[["Close"]].dropna()

        # Enforce temporal point-in-time boundary if as_of_date provided
        if as_of_date:
            clean_data = clean_data[clean_data.index <= pd.to_datetime(as_of_date)]

        if len(clean_data) < 50:
            return None

        return clean_data
    except Exception:
        return None


def calculate_dma_and_slopes(
    close_series: pd.Series, slope_lookback: int = 20
) -> Dict[str, Any]:
    """
    Calculates 20, 50, and 200 daily moving averages and their 20-day slopes.
    Slope is defined as percentage change in DMA over the lookback window.
    """
    n = len(close_series)
    metrics: Dict[str, Any] = {
        "current_price": float(close_series.iloc[-1]),
        "dma_20": None,
        "dma_50": None,
        "dma_200": None,
        "price_vs_20dma": None,
        "price_vs_50dma": None,
        "price_vs_200dma": None,
        "dma_20_vs_50": None,
        "dma_50_vs_200": None,
        "dma_20_slope": "N/A",
        "dma_50_slope": "N/A",
        "dma_200_slope": "N/A",
    }

    price = metrics["current_price"]

    # 20 DMA
    if n >= 20:
        dma20_series = close_series.rolling(window=20).mean()
        d20 = float(dma20_series.iloc[-1])
        metrics["dma_20"] = round(d20, 2)
        metrics["price_vs_20dma"] = round(((price - d20) / d20) * 100, 2)

        if n >= 20 + slope_lookback and not pd.isna(
            dma20_series.iloc[-slope_lookback - 1]
        ):
            d20_past = float(dma20_series.iloc[-slope_lookback - 1])
            slope_pct = ((d20 - d20_past) / d20_past) * 100
            metrics["dma_20_slope"] = (
                "Rising"
                if slope_pct > 0.5
                else ("Falling" if slope_pct < -0.5 else "Flat")
            )

    # 50 DMA
    if n >= 50:
        dma50_series = close_series.rolling(window=50).mean()
        d50 = float(dma50_series.iloc[-1])
        metrics["dma_50"] = round(d50, 2)
        metrics["price_vs_50dma"] = round(((price - d50) / d50) * 100, 2)

        if metrics["dma_20"] is not None:
            metrics["dma_20_vs_50"] = round(
                ((metrics["dma_20"] - d50) / d50) * 100, 2
            )

        if n >= 50 + slope_lookback and not pd.isna(
            dma50_series.iloc[-slope_lookback - 1]
        ):
            d50_past = float(dma50_series.iloc[-slope_lookback - 1])
            slope_pct = ((d50 - d50_past) / d50_past) * 100
            metrics["dma_50_slope"] = (
                "Rising"
                if slope_pct > 0.4
                else ("Falling" if slope_pct < -0.4 else "Flat")
            )

    # 200 DMA
    if n >= 200:
        dma200_series = close_series.rolling(window=200).mean()
        d200 = float(dma200_series.iloc[-1])
        metrics["dma_200"] = round(d200, 2)
        metrics["price_vs_200dma"] = round(((price - d200) / d200) * 100, 2)

        if metrics["dma_50"] is not None:
            metrics["dma_50_vs_200"] = round(
                ((metrics["dma_50"] - d200) / d200) * 100, 2
            )

        if n >= 200 + slope_lookback and not pd.isna(
            dma200_series.iloc[-slope_lookback - 1]
        ):
            d200_past = float(dma200_series.iloc[-slope_lookback - 1])
            slope_pct = ((d200 - d200_past) / d200_past) * 100
            metrics["dma_200_slope"] = (
                "Rising"
                if slope_pct > 0.25
                else ("Falling" if slope_pct < -0.25 else "Flat")
            )

    return metrics


def calculate_momentum(close_series: pd.Series) -> Dict[str, Any]:
    """
    Calculates 1-month (~21 days), 3-month (~63 days), and 6-month (~126 days) returns.
    """
    n = len(close_series)
    current_price = float(close_series.iloc[-1])

    ret_1m = (
        round(((current_price / float(close_series.iloc[-22])) - 1) * 100, 2)
        if n > 21
        else None
    )
    ret_3m = (
        round(((current_price / float(close_series.iloc[-64])) - 1) * 100, 2)
        if n > 63
        else None
    )
    ret_6m = (
        round(((current_price / float(close_series.iloc[-127])) - 1) * 100, 2)
        if n > 126
        else None
    )

    valid_returns = [r for r in [ret_1m, ret_3m, ret_6m] if r is not None]

    if not valid_returns:
        state = "N/A"
    else:
        positive_count = sum(1 for r in valid_returns if r > 0)
        avg_ret = sum(valid_returns) / len(valid_returns)

        if (
            positive_count == len(valid_returns)
            and (ret_3m is None or ret_3m > 1.5)
            and avg_ret > 2.0
        ):
            state = "STRONG"
        elif positive_count >= 1 and avg_ret >= -1.0:
            state = "MODERATE"
        else:
            state = "WEAK"

    return {
        "return_1m": ret_1m,
        "return_3m": ret_3m,
        "return_6m": ret_6m,
        "state": state,
    }


def calculate_realized_volatility(close_series: pd.Series) -> Dict[str, Any]:
    """
    Calculates 20-day annualized realized volatility from daily log returns.
    Compares current 20-day vol to its recent 1-year historical distribution.
    """
    if len(close_series) < 25:
        return {"realized_vol_20d": None, "state": "N/A"}

    returns = np.log(close_series / close_series.shift(1)).dropna()
    rolling_20_vol = returns.rolling(window=20).std() * np.sqrt(252) * 100
    rolling_clean = rolling_20_vol.dropna()

    if len(rolling_clean) == 0:
        return {"realized_vol_20d": None, "state": "N/A"}

    current_vol = round(float(rolling_clean.iloc[-1]), 2)

    # Use up to past 252 trading days (~1 year) to determine relative percentile
    sample_window = rolling_clean.iloc[-252:]
    percentile = float((sample_window < current_vol).mean() * 100)

    if percentile <= 35.0 or current_vol < 11.5:
        state = "LOW"
    elif percentile <= 75.0 and current_vol <= 17.5:
        state = "NORMAL"
    else:
        state = "HIGH"

    return {"realized_vol_20d": current_vol, "state": state}


def classify_trend(trend_metrics: Dict[str, Any]) -> str:
    """
    Classifies trend into:
    STRONG UPTREND, UPTREND, NEUTRAL, DOWNTREND, STRONG DOWNTREND
    """
    p_vs_50 = trend_metrics["price_vs_50dma"]
    p_vs_200 = trend_metrics["price_vs_200dma"]
    d50_vs_200 = trend_metrics["dma_50_vs_200"]
    s50 = trend_metrics["dma_50_slope"]
    s200 = trend_metrics["dma_200_slope"]

    # If 200 DMA is missing due to limited data
    if p_vs_200 is None:
        if p_vs_50 is not None and p_vs_50 > 0 and s50 == "Rising":
            return "UPTREND"
        if p_vs_50 is not None and p_vs_50 < 0 and s50 == "Falling":
            return "DOWNTREND"
        return "NEUTRAL"

    # Multi-condition evaluation
    bull_conditions = [
        p_vs_50 > 0 if p_vs_50 is not None else False,
        p_vs_200 > 0,
        d50_vs_200 > 0 if d50_vs_200 is not None else False,
        s50 in ["Rising", "Flat"],
        s200 in ["Rising", "Flat"],
    ]
    bear_conditions = [
        p_vs_50 < 0 if p_vs_50 is not None else False,
        p_vs_200 < 0,
        d50_vs_200 < 0 if d50_vs_200 is not None else False,
        s50 in ["Falling", "Flat"],
        s200 in ["Falling", "Flat"],
    ]

    bull_score = sum(bull_conditions)
    bear_score = sum(bear_conditions)

    if (
        bull_score == 5
        and p_vs_50 > 0
        and p_vs_200 > 0
        and s50 == "Rising"
        and s200 == "Rising"
    ):
        return "STRONG UPTREND"
    if bull_score >= 3 and p_vs_200 > 0:
        return "UPTREND"
    if (
        bear_score == 5
        and p_vs_50 < 0
        and p_vs_200 < 0
        and s50 == "Falling"
        and s200 == "Falling"
    ):
        return "STRONG DOWNTREND"
    if bear_score >= 3 and p_vs_200 < 0:
        return "DOWNTREND"

    return "NEUTRAL"


def compute_regime_score(
    trend_metrics: Dict[str, Any],
    trend_classification: str,
    momentum_metrics: Dict[str, Any],
    vol_metrics: Dict[str, Any],
) -> Tuple[Optional[int], Dict[str, Any], List[str]]:
    """
    Calculates the 0-100 market regime score using:
    Trend: 45%, Momentum: 30%, Volatility: 25%.
    Renormalizes available weights if data is missing.
    """
    reasons: List[str] = []
    component_scores: Dict[str, Optional[float]] = {
        "trend": None,
        "momentum": None,
        "volatility": None,
    }

    # 1. Trend Structure Component (Max 100)
    trend_map = {
        "STRONG UPTREND": 100.0,
        "UPTREND": 80.0,
        "NEUTRAL": 50.0,
        "DOWNTREND": 25.0,
        "STRONG DOWNTREND": 5.0,
    }
    t_score = trend_map.get(trend_classification)
    component_scores["trend"] = t_score

    p_vs_50 = trend_metrics["price_vs_50dma"]
    p_vs_200 = trend_metrics["price_vs_200dma"]
    d50_vs_200 = trend_metrics["dma_50_vs_200"]

    if p_vs_50 is not None and p_vs_200 is not None:
        if p_vs_50 > 0 and p_vs_200 > 0:
            reasons.append("Nifty is trading above its 50 and 200 DMA.")
        elif p_vs_50 > 0 and p_vs_200 <= 0:
            reasons.append(
                "Nifty is above its 50 DMA but remains capped below its 200 DMA."
            )
        elif p_vs_50 <= 0 and p_vs_200 > 0:
            reasons.append(
                "Nifty has pulled back below its 50 DMA while holding above its 200 DMA."
            )
        else:
            reasons.append(
                "Nifty is trading below both its major 50 and 200 DMA levels."
            )

    if d50_vs_200 is not None:
        if d50_vs_200 > 0:
            reasons.append("50 DMA remains above the 200 DMA (Golden Cross structure).")
        else:
            reasons.append(
                "50 DMA is positioned below the 200 DMA (Death Cross structure)."
            )

    # 2. Momentum Component (Max 100)
    m_state = momentum_metrics["state"]
    ret_3m = momentum_metrics["return_3m"]
    ret_1m = momentum_metrics["return_1m"]

    if m_state == "STRONG":
        component_scores["momentum"] = 90.0
        reasons.append(
            f"Momentum is strong with positive multi-month follow-through (3M: {ret_3m:+0.1f}%)."
        )
    elif m_state == "MODERATE":
        component_scores["momentum"] = 65.0
        if ret_3m is not None and ret_3m >= 0:
            reasons.append(
                f"3-month momentum remains positive ({ret_3m:+0.1f}%)."
            )
        else:
            reasons.append(
                "Momentum is mixed with short-term consolidation visible."
            )
    elif m_state == "WEAK":
        component_scores["momentum"] = 25.0
        reasons.append(
            f"Medium-term momentum is negative (1M: {ret_1m:+0.1f}%, 3M: {ret_3m:+0.1f}%)."
            if ret_1m is not None and ret_3m is not None
            else "Momentum is deteriorating."
        )

    # 3. Volatility Component (Max 100)
    v_state = vol_metrics["state"]
    vol_val = vol_metrics["realized_vol_20d"]

    if v_state == "LOW":
        component_scores["volatility"] = 90.0
        reasons.append(
            f"Realized volatility is low ({vol_val}%), offering stable swing-trade conditions."
        )
    elif v_state == "NORMAL":
        component_scores["volatility"] = 75.0
        reasons.append(
            f"Realized volatility is within normal historical ranges ({vol_val}%)."
        )
    elif v_state == "HIGH":
        component_scores["volatility"] = 25.0
        reasons.append(
            f"Realized volatility is elevated ({vol_val}%), increasing whipsaw risk."
        )

    # Weight Renormalization
    base_weights = {"trend": 0.45, "momentum": 0.30, "volatility": 0.25}
    active_weight_sum = sum(
        base_weights[k]
        for k, v in component_scores.items()
        if v is not None
    )

    if active_weight_sum == 0:
        return None, component_scores, ["Insufficient market data available."]

    final_score = sum(
        component_scores[k] * (base_weights[k] / active_weight_sum)
        for k in base_weights
        if component_scores[k] is not None
    )

    return int(round(final_score)), component_scores, reasons


def determine_regime_and_confidence(
    score: Optional[int],
    trend_classification: str,
    momentum_metrics: Dict[str, Any],
    vol_metrics: Dict[str, Any],
    data_points_present: int,
    total_data_points: int,
) -> Tuple[str, str, float]:
    """
    Translates the numerical score + structural state into one of:
    SUPPORTIVE, NEUTRAL, CAUTION, HOSTILE, along with confidence level.
    """
    completeness = round((data_points_present / total_data_points) * 100, 1)

    # Confidence calculation
    if completeness >= 85.0 and vol_metrics["state"] != "N/A":
        confidence = "HIGH"
    elif completeness >= 60.0:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    if score is None:
        return "NEUTRAL", confidence, completeness

    v_state = vol_metrics["state"]
    m_state = momentum_metrics["state"]

    # Structural logic checks
    if (
        score >= 68
        and trend_classification in ["STRONG UPTREND", "UPTREND"]
        and v_state != "HIGH"
    ):
        regime = "SUPPORTIVE"
    elif (
        trend_classification in ["STRONG DOWNTREND", "DOWNTREND"]
        and m_state == "WEAK"
    ) or (score < 35):
        regime = "HOSTILE"
    elif (
        score < 50
        or v_state == "HIGH"
        or trend_classification in ["DOWNTREND", "STRONG DOWNTREND"]
        or m_state == "WEAK"
    ):
        regime = "CAUTION"
    else:
        regime = "NEUTRAL"

    return regime, confidence, completeness


def analyze_market_regime(
    ticker: str = "^NSEI",
    benchmark_name: str = "NIFTY 50",
    as_of_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Main entry point: fetches data, calculates all metrics, and returns
    a structured regime dictionary matching Phase 7/8 specifications.
    Respects temporal as_of_date boundary if provided.
    """
    df = fetch_benchmark_data(ticker=ticker, as_of_date=as_of_date)

    # Missing Data Fallback
    if df is None or len(df) == 0:
        return {
            "benchmark": benchmark_name,
            "ticker": ticker,
            "price": None,
            "trend": {
                "classification": "N/A",
                "dma_20": None,
                "dma_50": None,
                "dma_200": None,
                "price_vs_20dma": None,
                "price_vs_50dma": None,
                "price_vs_200dma": None,
                "dma_20_slope": "N/A",
                "dma_50_slope": "N/A",
                "dma_200_slope": "N/A",
            },
            "momentum": {
                "return_1m": None,
                "return_3m": None,
                "return_6m": None,
                "state": "N/A",
            },
            "volatility": {"realized_vol_20d": None, "state": "N/A"},
            "breadth": {"value": None, "state": "N/A"},
            "regime_score": None,
            "regime": "NEUTRAL",
            "confidence": "LOW",
            "data_completeness": 0.0,
            "reasons": ["Unable to fetch market benchmark data from source."],
        }

    close_series = df["Close"]
    trend_metrics = calculate_dma_and_slopes(close_series)
    momentum_metrics = calculate_momentum(close_series)
    vol_metrics = calculate_realized_volatility(close_series)
    trend_classification = classify_trend(trend_metrics)

    # Track completeness across 8 core items
    key_fields = [
        trend_metrics["dma_20"],
        trend_metrics["dma_50"],
        trend_metrics["dma_200"],
        trend_metrics["dma_50_slope"] != "N/A",
        momentum_metrics["return_1m"],
        momentum_metrics["return_3m"],
        momentum_metrics["return_6m"],
        vol_metrics["realized_vol_20d"],
    ]
    data_points_present = sum(1 for x in key_fields if x is not None and x is not False)
    total_data_points = len(key_fields)

    score, _, reasons = compute_regime_score(
        trend_metrics, trend_classification, momentum_metrics, vol_metrics
    )

    regime, confidence, completeness = determine_regime_and_confidence(
        score,
        trend_classification,
        momentum_metrics,
        vol_metrics,
        data_points_present,
        total_data_points,
    )

    return {
        "benchmark": benchmark_name,
        "ticker": ticker,
        "price": trend_metrics["current_price"],
        "trend": {
            "classification": trend_classification,
            "dma_20": trend_metrics["dma_20"],
            "dma_50": trend_metrics["dma_50"],
            "dma_200": trend_metrics["dma_200"],
            "price_vs_20dma": trend_metrics["price_vs_20dma"],
            "price_vs_50dma": trend_metrics["price_vs_50dma"],
            "price_vs_200dma": trend_metrics["price_vs_200dma"],
            "dma_20_slope": trend_metrics["dma_20_slope"],
            "dma_50_slope": trend_metrics["dma_50_slope"],
            "dma_200_slope": trend_metrics["dma_200_slope"],
        },
        "momentum": momentum_metrics,
        "volatility": vol_metrics,
        "breadth": {"value": None, "state": "N/A"},
        "regime_score": score,
        "regime": regime,
        "confidence": confidence,
        "data_completeness": completeness,
        "reasons": reasons,
    }


def print_market_regime_report(res: Dict[str, Any]) -> None:
    """Prints the terminal report cleanly formatted according to specifications."""
    t = res["trend"]
    m = res["momentum"]
    v = res["volatility"]
    b = res["breadth"]

    def fmt_num(val, prefix="₹"):
        return f"{prefix}{val:,.2f}" if val is not None else "N/A"

    def fmt_pct(val):
        return f"{val:+0.1f}%" if val is not None else "N/A"

    print("=================================================================")
    print("MARKET REGIME ANALYSIS")
    print("BENCHMARK")
    print(f"Index               : {res['benchmark']}")
    print(f"Current Price       : {fmt_num(res['price'])}")
    print("TREND STRUCTURE")
    print(f"20 DMA              : {fmt_num(t['dma_20'])}")
    print(f"50 DMA              : {fmt_num(t['dma_50'])}")
    print(f"200 DMA             : {fmt_num(t['dma_200'])}")
    print(f"Price vs 20 DMA     : {fmt_pct(t['price_vs_20dma'])}")
    print(f"Price vs 50 DMA     : {fmt_pct(t['price_vs_50dma'])}")
    print(f"Price vs 200 DMA    : {fmt_pct(t['price_vs_200dma'])}")
    print(f"20 DMA Slope        : {t['dma_20_slope']}")
    print(f"50 DMA Slope        : {t['dma_50_slope']}")
    print(f"200 DMA Slope       : {t['dma_200_slope']}")
    print(f"Trend Classification: {t['classification']}")
    print("MOMENTUM")
    print(f"1M Return           : {fmt_pct(m['return_1m'])}")
    print(f"3M Return           : {fmt_pct(m['return_3m'])}")
    print(f"6M Return           : {fmt_pct(m['return_6m'])}")
    print(f"Momentum State      : {m['state']}")
    print("VOLATILITY")
    vol_str = f"{v['realized_vol_20d']:.1f}%" if v["realized_vol_20d"] is not None else "N/A"
    print(f"20D Realized Vol    : {vol_str}")
    print(f"Volatility State    : {v['state']}")
    print("BREADTH")
    print(f"Above 50 DMA        : {b['value'] if b['value'] is not None else 'N/A'}")
    print(f"Breadth State       : {b['state']}")
    print("MARKET REGIME")
    score_str = f"{res['regime_score']}/100" if res['regime_score'] is not None else "N/A"
    print(f"Score               : {score_str}")
    print(f"Regime              : {res['regime']}")
    print(f"Confidence          : {res['confidence']}")
    print(f"Data Completeness   : {res['data_completeness']:.0f}%")
    print("WHY")
    for r in res.get("reasons", []):
        print(f"• {r}")
    print("=================================================================")


if __name__ == "__main__":
    result = analyze_market_regime()
    print_market_regime_report(result)