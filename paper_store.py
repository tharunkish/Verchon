"""
paper_store.py - Institutional-Grade Paper Trading Ledger & Cost Engine
=======================================================================
Handles persistent order storage, statutory transaction cost calculation
(STT, GST, Exchange charges, Stamp duty), dynamic risk-based sizing,
target tracking (2R/3R), partial scaling out, and live exit monitoring.
Stores records in `.history/paper_positions.json` and `.history/paper_account.json`
with atomic writes and safe crash recovery.
"""

from __future__ import annotations

import json
import logging
import math
import os
import tempfile
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import techanalysis as ta

logger = logging.getLogger("paper_store")

HISTORY_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".history")
LEDGER_FILE = os.path.join(HISTORY_DIR, "paper_positions.json")
ACCOUNT_FILE = os.path.join(HISTORY_DIR, "paper_account.json")

DEFAULT_STARTING_CAPITAL = 1000000.0  # ₹10,00,000 (10 Lakhs INR)
DEFAULT_RISK_PER_TRADE_PCT = 1.0     # 1.0% risk rule per trade


def _ensure_history_dir() -> None:
    """Ensures .history directory exists."""
    os.makedirs(HISTORY_DIR, exist_ok=True)


# =============================================================================
# 1. ACCOUNT LEDGER MANAGEMENT
# =============================================================================

def _load_account_raw() -> Dict[str, Any]:
    """Safely loads account data or initializes defaults."""
    _ensure_history_dir()
    if not os.path.exists(ACCOUNT_FILE):
        account_data = {
            "starting_capital": DEFAULT_STARTING_CAPITAL,
            "available_cash": DEFAULT_STARTING_CAPITAL,
            "risk_per_trade_pct": DEFAULT_RISK_PER_TRADE_PCT,
            "currency": "INR",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        }
        _save_account_raw(account_data)
        return account_data

    try:
        with open(ACCOUNT_FILE, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if not content:
                return _load_account_raw()
            data = json.loads(content)
            if isinstance(data, dict):
                return data
            return _load_account_raw()
    except Exception as e:
        logger.error(f"Failed to read paper account ({e}). Rebuilding defaults.")
        return {
            "starting_capital": DEFAULT_STARTING_CAPITAL,
            "available_cash": DEFAULT_STARTING_CAPITAL,
            "risk_per_trade_pct": DEFAULT_RISK_PER_TRADE_PCT,
            "currency": "INR",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        }


def _save_account_raw(account_data: Dict[str, Any]) -> bool:
    """Saves account data atomically."""
    _ensure_history_dir()
    try:
        dir_name = os.path.dirname(ACCOUNT_FILE)
        fd, tmp_path = tempfile.mkstemp(dir=dir_name, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(account_data, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, ACCOUNT_FILE)
        return True
    except Exception as e:
        logger.error(f"Failed to save paper account ({e}).")
        return False


def get_paper_account() -> Dict[str, Any]:
    """
    Returns account summary with aggregated performance metrics,
    cash vs deployed margin, win rate %, profit factor, and average R-multiple.
    """
    account_raw = _load_account_raw()
    positions = _load_ledger_raw()

    open_positions = [p for p in positions if p.get("status") == "OPEN"]
    closed_positions = [p for p in positions if p.get("status") == "CLOSED"]

    deployed_capital = sum(float(p.get("entry_price", 0.0)) * int(p.get("quantity", 0)) for p in open_positions)
    available_cash = float(account_raw.get("available_cash", DEFAULT_STARTING_CAPITAL))
    starting_capital = float(account_raw.get("starting_capital", DEFAULT_STARTING_CAPITAL))

    # Total Unrealized P&L
    total_unrealized_pnl = sum(float(p.get("unrealized_pnl", 0.0)) for p in open_positions)

    # Current market value of open positions
    open_market_value = sum(
        float(p.get("current_price", p.get("entry_price", 0.0))) * int(p.get("quantity", 0))
        for p in open_positions
    )

    # Total account equity: unencumbered cash + live market value of open positions
    total_equity = round(available_cash + open_market_value, 2)

    # Realized statistics from closed trades
    total_realized_gross = sum(float(p.get("realized_pnl", 0.0)) for p in closed_positions)
    total_charges_paid = sum(float(p.get("total_charges", 0.0)) for p in closed_positions) + sum(
        float(p.get("buy_charges", 0.0)) for p in open_positions
    )
    total_realized_net = sum(float(p.get("net_pnl", p.get("realized_pnl", 0.0))) for p in closed_positions)

    wins = [p for p in closed_positions if float(p.get("net_pnl", p.get("realized_pnl", 0.0))) > 0]
    losses = [p for p in closed_positions if float(p.get("net_pnl", p.get("realized_pnl", 0.0))) <= 0]

    win_count = len(wins)
    loss_count = len(losses)
    total_closed = len(closed_positions)

    win_rate = round((win_count / total_closed * 100), 1) if total_closed > 0 else 0.0

    gross_gains = sum(float(p.get("net_pnl", p.get("realized_pnl", 0.0))) for p in wins)
    gross_losses = abs(sum(float(p.get("net_pnl", p.get("realized_pnl", 0.0))) for p in losses))

    profit_factor = round(gross_gains / gross_losses, 2) if gross_losses > 0 else (99.9 if gross_gains > 0 else 1.0)

    # Average R-multiple
    r_multiples = [float(p.get("r_multiple", 0.0)) for p in closed_positions if p.get("r_multiple") is not None]
    avg_r = round(sum(r_multiples) / len(r_multiples), 2) if r_multiples else 0.0

    return {
        "starting_capital": starting_capital,
        "available_cash": round(available_cash, 2),
        "deployed_capital": round(deployed_capital, 2),
        "total_equity": total_equity,
        "risk_per_trade_pct": float(account_raw.get("risk_per_trade_pct", DEFAULT_RISK_PER_TRADE_PCT)),
        "open_unrealized_pnl": round(total_unrealized_pnl, 2),
        "total_realized_gross": round(total_realized_gross, 2),
        "total_realized_net": round(total_realized_net, 2),
        "total_charges_paid": round(total_charges_paid, 2),
        "open_trades_count": len(open_positions),
        "closed_trades_count": total_closed,
        "win_count": win_count,
        "loss_count": loss_count,
        "win_rate_pct": win_rate,
        "profit_factor": profit_factor,
        "avg_r_multiple": avg_r,
        "currency": "INR",
        "updated_at": datetime.now().isoformat(),
    }


def reset_paper_account(
    starting_capital: float = DEFAULT_STARTING_CAPITAL,
    risk_per_trade_pct: float = DEFAULT_RISK_PER_TRADE_PCT,
    clear_ledger: bool = True,
) -> Dict[str, Any]:
    """Resets the account capital and optionally clears the trade ledger."""
    account_data = {
        "starting_capital": round(float(starting_capital), 2),
        "available_cash": round(float(starting_capital), 2),
        "risk_per_trade_pct": round(float(risk_per_trade_pct), 2),
        "currency": "INR",
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }
    _save_account_raw(account_data)

    if clear_ledger:
        _save_ledger_raw([])

    return get_paper_account()


def update_paper_capital(
    new_starting_capital: float,
    risk_per_trade_pct: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Updates account starting capital and adjusts available cash without clearing trade ledger.
    Preserves all open positions, closed trade history, and transaction records.
    """
    account_raw = _load_account_raw()
    old_starting = float(account_raw.get("starting_capital", DEFAULT_STARTING_CAPITAL))
    old_cash = float(account_raw.get("available_cash", old_starting))

    delta = float(new_starting_capital) - old_starting
    new_cash = max(0.0, round(old_cash + delta, 2))

    account_raw["starting_capital"] = round(float(new_starting_capital), 2)
    account_raw["available_cash"] = new_cash
    if risk_per_trade_pct is not None:
        account_raw["risk_per_trade_pct"] = round(float(risk_per_trade_pct), 2)
    account_raw["updated_at"] = datetime.now().isoformat()

    _save_account_raw(account_raw)
    return get_paper_account()



# =============================================================================
# 2. REALISTIC INDIAN EQUITY DELIVERY TRANSACTION COST ENGINE
# =============================================================================

def calculate_transaction_costs(price: float, quantity: int, is_buy: bool = True) -> Dict[str, float]:
    """
    Computes statutory and regulatory transaction costs for Indian Equity Delivery:
    - Brokerage: Standard discount broker rate min(₹20, 0.03% of turnover)
    - STT (Securities Transaction Tax): 0.1% on Buy & Sell
    - Exchange Transaction Charges (NSE): 0.00297%
    - SEBI Turnover Charges: 0.0001% (₹10 per crore)
    - Stamp Duty (Buy leg only): 0.015%
    - GST: 18% on (Brokerage + Exchange Charges + SEBI Charges)
    """
    turnover = round(price * quantity, 2)
    if turnover <= 0:
        return {
            "turnover": 0.0,
            "brokerage": 0.0,
            "stt": 0.0,
            "exchange_charges": 0.0,
            "sebi_charges": 0.0,
            "stamp_duty": 0.0,
            "gst": 0.0,
            "total_charges": 0.0,
        }

    brokerage = round(min(20.0, turnover * 0.0003), 2)
    stt = round(turnover * 0.001, 2)
    exchange_charges = round(turnover * 0.0000297, 2)
    sebi_charges = round(turnover * 0.000001, 2)
    stamp_duty = round(turnover * 0.00015, 2) if is_buy else 0.0
    gst = round(0.18 * (brokerage + exchange_charges + sebi_charges), 2)

    total_charges = round(brokerage + stt + exchange_charges + sebi_charges + stamp_duty + gst, 2)

    return {
        "turnover": turnover,
        "brokerage": brokerage,
        "stt": stt,
        "exchange_charges": exchange_charges,
        "sebi_charges": sebi_charges,
        "stamp_duty": stamp_duty,
        "gst": gst,
        "total_charges": total_charges,
    }


# =============================================================================
# 3. AUTOMATED QUOTE & STRATEGY RESOLUTION ENGINE
# =============================================================================

def get_trade_setup_quote(
    ticker: str,
    portfolio_value: Optional[float] = None,
    risk_pct: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Auto-fetches latest market prices, technical indicators, ATR, and
    evaluates strategy qualification to automatically determine:
    1. Entry Price (Latest Close or Trigger Price)
    2. Stop Loss (Exact technical swing low / DMA stop)
    3. Target 1 (2R) and Target 2 (3R)
    4. Deterministic position size based on risk budget
    5. Estimated transaction costs
    """
    formatted_ticker = ta.format_nse_ticker(ticker)
    clean_sym = formatted_ticker.replace(".NS", "").replace(".BO", "").strip()

    account = get_paper_account()
    p_val = float(portfolio_value or account.get("total_equity", DEFAULT_STARTING_CAPITAL))
    r_pct = float(risk_pct or (account.get("risk_per_trade_pct", DEFAULT_RISK_PER_TRADE_PCT) / 100.0))
    avail_cash = float(account.get("available_cash", DEFAULT_STARTING_CAPITAL))

    stock_df, _ = ta.fetch_daily_ohlcv(formatted_ticker, period="1y")
    if stock_df is None or stock_df.empty:
        raise ValueError(f"Could not fetch historical data for {formatted_ticker}")

    close_s = stock_df["Close"]
    open_s = stock_df["Open"]
    high_s = stock_df["High"]
    low_s = stock_df["Low"]
    vol_s = stock_df["Volume"]

    curr_price = round(float(close_s.iloc[-1]), 2)
    try:
        import yfinance as yf
        fast_p = yf.Ticker(formatted_ticker).fast_info.get("lastPrice")
        if fast_p and not np.isnan(fast_p) and fast_p > 0:
            curr_price = round(float(fast_p), 2)
    except Exception:
        pass
    day_open = round(float(open_s.iloc[-1]), 2)
    day_high = round(float(high_s.iloc[-1]), 2)
    day_low = round(float(low_s.iloc[-1]), 2)
    prev_close = round(float(close_s.iloc[-2]), 2) if len(close_s) >= 2 else curr_price

    # Moving Averages
    dma_50 = round(float(close_s.rolling(50).mean().iloc[-1]), 2) if len(close_s) >= 50 else curr_price
    dma_200 = round(float(close_s.rolling(200).mean().iloc[-1]), 2) if len(close_s) >= 200 else dma_50

    # 14-period Average True Range (ATR)
    tr1 = high_s - low_s
    tr2 = (high_s - close_s.shift(1)).abs()
    tr3 = (low_s - close_s.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr_14 = round(float(tr.rolling(14).mean().iloc[-1]), 2) if len(tr) >= 14 else round(curr_price * 0.02, 2)

    # Evaluate Strategies for optimal technical stop using core engine
    chosen_stop = None
    strategy_name = "MANUAL_ENTRY"
    try:
        tech_res = ta.analyze_technical(formatted_ticker)
        strat_results = tech_res.get("Strategy_Evaluation", {})
        strategy_name = strat_results.get("primary_strategy") or "MANUAL_ENTRY"
        active_res = strat_results.get("active_strategy_result", {})
        if active_res and active_res.get("stop_price"):
            chosen_stop = float(active_res["stop_price"])
    except Exception as e:
        logger.warning(f"Strategy evaluation failed for {formatted_ticker}: {e}")

    # Fallback to confirmed swing low inside 20-session window
    if not chosen_stop:
        recent_20_low = float(low_s.iloc[-21:-1].min()) if len(low_s) >= 22 else float(curr_price * 0.95)
        if 0 < (curr_price - recent_20_low) / curr_price <= 0.08:
            chosen_stop = round(recent_20_low, 2)
        else:
            chosen_stop = round(max(curr_price * 0.92, curr_price - 1.5 * atr_14), 2)

    # Sanity check on stop price
    if chosen_stop >= curr_price or chosen_stop <= 0:
        chosen_stop = round(curr_price * 0.95, 2)

    risk_per_share = round(curr_price - chosen_stop, 2)
    risk_percent = round((risk_per_share / curr_price) * 100, 2)

    # Targets (2R and 3R boundaries)
    target_1 = round(curr_price + 2.0 * risk_per_share, 2)
    target_2 = round(curr_price + 3.0 * risk_per_share, 2)

    # Position sizing via core technical engine
    size_res = ta.calculate_position_size(
        entry_price=curr_price,
        stop_price=chosen_stop,
        portfolio_value=p_val,
        risk_percent=r_pct,
        available_cash=avail_cash,
    )

    rec_quantity = int(size_res.get("actual_quantity", 1))
    if rec_quantity <= 0:
        rec_quantity = 1

    capital_required = round(curr_price * rec_quantity, 2)
    max_risk_amount = round(risk_per_share * rec_quantity, 2)

    # Estimated costs
    buy_costs = calculate_transaction_costs(curr_price, rec_quantity, is_buy=True)
    t1_sell_costs = calculate_transaction_costs(target_1, rec_quantity, is_buy=False)
    round_trip_costs = round(buy_costs["total_charges"] + t1_sell_costs["total_charges"], 2)

    expected_profit_t1 = round((target_1 - curr_price) * rec_quantity - round_trip_costs, 2)

    return {
        "ticker": formatted_ticker,
        "clean_symbol": clean_sym,
        "current_price": curr_price,
        "day_open": day_open,
        "day_high": day_high,
        "day_low": day_low,
        "prev_close": prev_close,
        "change_pct": round(((curr_price - prev_close) / prev_close) * 100, 2) if prev_close else 0.0,
        "dma_50": dma_50,
        "dma_200": dma_200,
        "atr_14": atr_14,
        "strategy_name": strategy_name,
        "suggested_entry": curr_price,
        "suggested_stop": chosen_stop,
        "target_1": target_1,
        "target_2": target_2,
        "risk_per_share": risk_per_share,
        "risk_percent": risk_percent,
        "recommended_quantity": rec_quantity,
        "capital_required": capital_required,
        "max_risk_amount": max_risk_amount,
        "estimated_buy_charges": buy_costs["total_charges"],
        "estimated_round_trip_charges": round_trip_costs,
        "expected_net_profit_t1": expected_profit_t1,
        "risk_reward_ratio": "1 : 2.0 (Target 1) / 1 : 3.0 (Target 2)",
    }


# =============================================================================
# 4. POSITION PERSISTENCE & LIFECYCLE MANAGEMENT
# =============================================================================

def _load_ledger_raw() -> List[Dict[str, Any]]:
    """Safely loads the JSON ledger."""
    _ensure_history_dir()
    if not os.path.exists(LEDGER_FILE):
        return []

    try:
        with open(LEDGER_FILE, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if not content:
                return []
            data = json.loads(content)
            if isinstance(data, list):
                return data
            logger.warning("Paper ledger is not a list. Resetting to empty list.")
            return []
    except Exception as e:
        logger.error(f"Failed to read paper ledger ({e}). Recovering with empty list.")
        return []


def _save_ledger_raw(positions: List[Dict[str, Any]]) -> bool:
    """Saves positions atomically using a temporary file."""
    _ensure_history_dir()
    try:
        dir_name = os.path.dirname(LEDGER_FILE)
        fd, tmp_path = tempfile.mkstemp(dir=dir_name, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(positions, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, LEDGER_FILE)
        return True
    except Exception as e:
        logger.error(f"Failed to save paper ledger ({e}).")
        return False


def get_paper_positions(evaluate_exits: bool = True) -> List[Dict[str, Any]]:
    """
    Returns all paper positions. For OPEN positions, updates live prices,
    unrealized P&L, R-multiples, Target 1/2 hit states, and exit alerts.
    """
    positions = _load_ledger_raw()
    if not evaluate_exits:
        return positions

    updated_positions = []
    for pos in positions:
        pos_copy = dict(pos)
        if pos_copy.get("status") == "OPEN":
            ticker = pos_copy.get("ticker", "")
            try:
                stock_df, _ = ta.fetch_daily_ohlcv(ticker, period="1y")
                if stock_df is not None and not stock_df.empty:
                    close_s = stock_df["Close"]
                    open_s = stock_df["Open"]
                    high_s = stock_df["High"]
                    low_s = stock_df["Low"]

                    curr_price = round(float(close_s.iloc[-1]), 2)
                    try:
                        import yfinance as yf
                        fast_p = yf.Ticker(ticker).fast_info.get("lastPrice")
                        if fast_p and not np.isnan(fast_p) and fast_p > 0:
                            curr_price = round(float(fast_p), 2)
                    except Exception:
                        pass
                    day_open = round(float(open_s.iloc[-1]), 2)
                    day_high = round(float(high_s.iloc[-1]), 2)
                    day_low = round(float(low_s.iloc[-1]), 2)
                    day_close = curr_price

                    entry_p = float(pos_copy.get("entry_price", curr_price))
                    stop_p = float(pos_copy.get("stop_price", entry_p * 0.95))
                    target_1 = float(pos_copy.get("target_1", round(entry_p + 2 * (entry_p - stop_p), 2)))
                    target_2 = float(pos_copy.get("target_2", round(entry_p + 3 * (entry_p - stop_p), 2)))
                    qty = int(pos_copy.get("quantity", 1))

                    # Gross & Net Unrealized P&L
                    gross_pnl = round((curr_price - entry_p) * qty, 2)
                    pnl_pct = round(((curr_price - entry_p) / entry_p) * 100, 2) if entry_p > 0 else 0.0

                    # R-Multiple calculation
                    initial_r = entry_p - stop_p
                    r_multiple = round((curr_price - entry_p) / initial_r, 2) if initial_r > 0 else 0.0

                    # Charges calculation
                    buy_charges = float(pos_copy.get("buy_charges", calculate_transaction_costs(entry_p, qty, True)["total_charges"]))
                    est_sell_charges = calculate_transaction_costs(curr_price, qty, False)["total_charges"]
                    net_unrealized_pnl = round(gross_pnl - (buy_charges + est_sell_charges), 2)

                    dist_to_stop = round(((curr_price - stop_p) / curr_price) * 100, 2)
                    dist_to_t1 = round(((target_1 - curr_price) / curr_price) * 100, 2)

                    pos_copy["current_price"] = curr_price
                    pos_copy["unrealized_pnl"] = gross_pnl
                    pos_copy["net_unrealized_pnl"] = net_unrealized_pnl
                    pos_copy["unrealized_pnl_pct"] = pnl_pct
                    pos_copy["r_multiple"] = r_multiple
                    pos_copy["distance_to_stop_pct"] = dist_to_stop
                    pos_copy["distance_to_t1_pct"] = dist_to_t1
                    pos_copy["target_1"] = target_1
                    pos_copy["target_2"] = target_2

                    # Target reached checks
                    t1_reached = day_high >= target_1
                    t2_reached = day_high >= target_2
                    pos_copy["target_1_hit"] = t1_reached
                    pos_copy["target_2_hit"] = t2_reached

                    # Calculate holding sessions
                    entry_date_str = pos_copy.get("entry_date")
                    holding_sessions = 0
                    if entry_date_str:
                        try:
                            entry_dt = pd.to_datetime(entry_date_str)
                            holding_sessions = int((stock_df.index > entry_dt).sum())
                        except Exception:
                            holding_sessions = 1
                    pos_copy["holding_sessions"] = holding_sessions

                    # Consecutive closes below 50 DMA & slope
                    dma_50 = close_s.rolling(window=50).mean()
                    curr_50 = float(dma_50.iloc[-1])
                    # Consecutive closes below 50 DMA (only counted since entry)
                    consec_below = 0
                    if holding_sessions >= 1 and len(close_s) >= 1:
                        if float(close_s.iloc[-1]) < float(dma_50.iloc[-1]):
                            consec_below += 1
                    if holding_sessions >= 2 and len(close_s) >= 2:
                        if float(close_s.iloc[-2]) < float(dma_50.iloc[-2]):
                            consec_below += 1

                    slope_50 = 0.0
                    if len(dma_50) >= 6 and pd.notna(dma_50.iloc[-6]):
                        slope_50 = round(curr_50 - float(dma_50.iloc[-6]), 2)

                    pos_copy["dma_50"] = round(curr_50, 2)
                    pos_copy["dma_50_slope"] = slope_50
                    pos_copy["consecutive_closes_below_50dma"] = consec_below

                    # Authoritative core exit evaluation
                    should_exit, exit_p, exit_reason = ta.evaluate_paper_position_exit(
                        day_open=day_open,
                        day_low=day_low,
                        day_close=day_close,
                        stop_price=stop_p,
                        entry_price=entry_p,
                        holding_sessions=holding_sessions,
                        consecutive_closes_below_50dma=consec_below,
                        dma_50_slope=slope_50,
                    )

                    # Augment with Target 1 notification if stop was not breached
                    if not should_exit and t1_reached:
                        exit_alert = {
                            "should_exit": False,
                            "target_reached": True,
                            "suggested_exit_price": target_1,
                            "reason": "TARGET_1_REACHED (2R)",
                        }
                    else:
                        exit_alert = {
                            "should_exit": should_exit,
                            "target_reached": False,
                            "suggested_exit_price": exit_p,
                            "reason": exit_reason,
                        }

                    pos_copy["exit_alert"] = exit_alert
            except Exception as e:
                logger.warning(f"Could not evaluate live quote for {ticker}: {e}")
                pos_copy["exit_alert"] = {
                    "should_exit": False,
                    "suggested_exit_price": None,
                    "reason": None,
                }
        updated_positions.append(pos_copy)

    return updated_positions


def add_paper_position(
    ticker: str,
    entry_price: float,
    stop_price: float,
    quantity: int,
    strategy_name: str,
    target_1: Optional[float] = None,
    target_2: Optional[float] = None,
    order_type: str = "MARKET",
    entry_date: Optional[str] = None,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Creates and records a new paper trading position, computes initial buy charges,
    and debits required capital from available cash.
    """
    positions = _load_ledger_raw()
    account_raw = _load_account_raw()

    formatted_sym = ta.format_nse_ticker(ticker)
    now_date = entry_date or datetime.now().strftime("%Y-%m-%d")

    entry_p = round(float(entry_price), 2)
    stop_p = round(float(stop_price), 2)
    qty = int(quantity)

    # Invariant validations
    if entry_p <= 0:
        raise ValueError(f"Position entry_price must be positive, got {entry_p}")
    if stop_p <= 0:
        raise ValueError(f"Position stop_price must be positive, got {stop_p}")
    if entry_p <= stop_p:
        raise ValueError(f"Position entry_price ({entry_p}) must be strictly greater than stop_price ({stop_p})")
    if qty <= 0:
        raise ValueError(f"Position quantity must be positive, got {qty}")

    trade_risk_pct = round(((entry_p - stop_p) / entry_p) * 100, 2)
    if trade_risk_pct <= 0 or trade_risk_pct > 8.0:
        raise ValueError(f"Position trade risk ({trade_risk_pct:.2f}%) exceeds maximum allowable bound (8.0%)")

    initial_r = entry_p - stop_p
    t1 = round(float(target_1), 2) if target_1 else round(entry_p + 2.0 * initial_r, 2)
    t2 = round(float(target_2), 2) if target_2 else round(entry_p + 3.0 * initial_r, 2)

    buy_cost_breakdown = calculate_transaction_costs(entry_p, qty, is_buy=True)
    buy_charges = buy_cost_breakdown["total_charges"]
    capital_deployed = round(entry_p * qty, 2)
    total_cash_outflow = round(capital_deployed + buy_charges, 2)

    new_pos: Dict[str, Any] = {
        "id": f"trade_{uuid.uuid4().hex[:8]}",
        "ticker": formatted_sym,
        "entry_price": entry_p,
        "stop_price": stop_p,
        "target_1": t1,
        "target_2": t2,
        "quantity": qty,
        "initial_quantity": qty,
        "order_type": order_type,
        "risk_percent": trade_risk_pct,
        "initial_risk_amount": round(initial_r * qty, 2),
        "entry_date": now_date,
        "strategy_name": strategy_name,
        "status": "OPEN",
        "buy_charges": buy_charges,
        "total_charges": buy_charges,
        "exit_reason": None,
        "exit_price": None,
        "exit_date": None,
        "realized_pnl": None,
        "net_pnl": None,
        "realized_pnl_pct": None,
        "r_multiple": 0.0,
        "notes": notes or "",
        "created_at": datetime.now().isoformat(),
    }

    positions.insert(0, new_pos)
    _save_ledger_raw(positions)

    # Debit cash from account
    current_cash = float(account_raw.get("available_cash", DEFAULT_STARTING_CAPITAL))
    account_raw["available_cash"] = round(current_cash - total_cash_outflow, 2)
    account_raw["updated_at"] = datetime.now().isoformat()
    _save_account_raw(account_raw)

    return new_pos


def update_position_stop(
    position_id: str,
    new_stop_price: float,
) -> Optional[Dict[str, Any]]:
    """
    Updates the stop loss price on an active position (e.g., Trail Stop to Breakeven).
    """
    positions = _load_ledger_raw()
    target_pos = None

    for pos in positions:
        if pos.get("id") == position_id and pos.get("status") == "OPEN":
            target_pos = pos
            break

    if not target_pos:
        return None

    entry_p = float(target_pos.get("entry_price", 0.0))
    resolved_stop = round(float(new_stop_price), 2)
    new_risk_pct = round(((entry_p - resolved_stop) / entry_p) * 100, 2) if entry_p > 0 else 0.0

    target_pos["stop_price"] = resolved_stop
    target_pos["risk_percent"] = new_risk_pct
    target_pos["updated_at"] = datetime.now().isoformat()

    _save_ledger_raw(positions)
    return target_pos


def close_paper_position(
    position_id: str,
    exit_reason: str,
    exit_price: Optional[float] = None,
    quantity_to_close: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    """
    Closes a paper position (fully or partially).
    Computes sell statutory costs, gross P&L, net P&L after all charges,
    realized R-multiple, and credits net proceeds back to available cash.
    """
    positions = _load_ledger_raw()
    account_raw = _load_account_raw()
    target_pos = None

    for pos in positions:
        if pos.get("id") == position_id and pos.get("status") == "OPEN":
            target_pos = pos
            break

    if not target_pos:
        return None

    entry_p = float(target_pos.get("entry_price", 0.0))
    stop_p = float(target_pos.get("stop_price", entry_p * 0.95))
    total_qty = int(target_pos.get("quantity", 1))
    resolved_exit_p = round(float(exit_price), 2) if exit_price is not None else entry_p

    if not exit_reason or not str(exit_reason).strip():
        raise ValueError("Exit reason must be a non-empty string")
    if resolved_exit_p <= 0:
        raise ValueError(f"Exit price must be positive, got {resolved_exit_p}")

    # Partial exit handling
    is_partial = quantity_to_close is not None and 0 < quantity_to_close < total_qty
    close_qty = int(quantity_to_close) if is_partial else total_qty

    # Calculate sell transaction costs
    sell_costs = calculate_transaction_costs(resolved_exit_p, close_qty, is_buy=False)
    sell_charges = sell_costs["total_charges"]

    # Pro-rate buy charges
    total_buy_charges = float(target_pos.get("buy_charges", 0.0))
    allocated_buy_charges = round((close_qty / total_qty) * total_buy_charges, 2)
    total_trade_charges = round(allocated_buy_charges + sell_charges, 2)

    gross_pnl = round((resolved_exit_p - entry_p) * close_qty, 2)
    net_pnl = round(gross_pnl - total_trade_charges, 2)
    gross_pnl_pct = round(((resolved_exit_p - entry_p) / entry_p) * 100, 2) if entry_p > 0 else 0.0

    initial_r = entry_p - stop_p
    r_multiple = round((resolved_exit_p - entry_p) / initial_r, 2) if initial_r > 0 else 0.0

    cash_inflow = round((resolved_exit_p * close_qty) - sell_charges, 2)

    if is_partial:
        # 1. Update remaining open position
        remaining_qty = total_qty - close_qty
        remaining_buy_charges = round(total_buy_charges - allocated_buy_charges, 2)
        target_pos["quantity"] = remaining_qty
        target_pos["buy_charges"] = remaining_buy_charges

        # 2. Record new closed record for partial execution
        partial_closed_rec = {
            "id": f"trade_{uuid.uuid4().hex[:8]}",
            "ticker": target_pos["ticker"],
            "entry_price": entry_p,
            "stop_price": stop_p,
            "target_1": target_pos.get("target_1"),
            "target_2": target_pos.get("target_2"),
            "quantity": close_qty,
            "initial_quantity": total_qty,
            "strategy_name": target_pos.get("strategy_name"),
            "status": "CLOSED",
            "entry_date": target_pos.get("entry_date"),
            "exit_reason": f"PARTIAL_EXIT ({exit_reason})",
            "exit_price": resolved_exit_p,
            "exit_date": datetime.now().strftime("%Y-%m-%d"),
            "buy_charges": allocated_buy_charges,
            "sell_charges": sell_charges,
            "total_charges": total_trade_charges,
            "realized_pnl": gross_pnl,
            "net_pnl": net_pnl,
            "realized_pnl_pct": gross_pnl_pct,
            "r_multiple": r_multiple,
            "created_at": target_pos.get("created_at"),
            "closed_at": datetime.now().isoformat(),
        }
        positions.insert(0, partial_closed_rec)
        result_returned = partial_closed_rec
    else:
        # Full Close
        target_pos["status"] = "CLOSED"
        target_pos["exit_reason"] = exit_reason
        target_pos["exit_price"] = resolved_exit_p
        target_pos["exit_date"] = datetime.now().strftime("%Y-%m-%d")
        target_pos["sell_charges"] = sell_charges
        target_pos["total_charges"] = total_trade_charges
        target_pos["realized_pnl"] = gross_pnl
        target_pos["net_pnl"] = net_pnl
        target_pos["realized_pnl_pct"] = gross_pnl_pct
        target_pos["r_multiple"] = r_multiple
        target_pos["closed_at"] = datetime.now().isoformat()
        result_returned = target_pos

    _save_ledger_raw(positions)

    # Credit proceeds back to account available cash
    current_cash = float(account_raw.get("available_cash", DEFAULT_STARTING_CAPITAL))
    account_raw["available_cash"] = round(current_cash + cash_inflow, 2)
    account_raw["updated_at"] = datetime.now().isoformat()
    _save_account_raw(account_raw)

    return result_returned


# =============================================================================
# 5. PORTFOLIO RISK BRIDGE & SECTOR EXPOSURE ENGINE
# =============================================================================

def get_portfolio_sector_and_risk_exposure() -> Dict[str, Any]:
    """
    Computes portfolio sector allocation (₹ and % of equity), largest position
    concentrations, and total estimated portfolio capital at risk across open stops.
    Uses cached company sector metadata from .screener_cache/ (no AI guesswork).
    """
    import screener_scraper as ss

    account = get_paper_account()
    total_equity = account.get("total_equity", DEFAULT_STARTING_CAPITAL)
    available_cash = account.get("available_cash", DEFAULT_STARTING_CAPITAL)
    open_positions = [p for p in _load_ledger_raw() if p.get("status") == "OPEN"]

    sector_exposure: Dict[str, Dict[str, Any]] = {}
    total_risk_at_stop = 0.0
    position_exposures: List[Dict[str, Any]] = []

    for pos in open_positions:
        ticker = pos.get("ticker", "")
        clean_sym = ticker.replace(".NS", "").replace(".BO", "").strip().upper()
        qty = int(pos.get("quantity", 0))
        entry_p = float(pos.get("entry_price", 0.0))
        curr_p = float(pos.get("current_price", entry_p))
        stop_p = float(pos.get("stop_price", entry_p * 0.95))
        pos_val = round(curr_p * qty, 2)

        # Risk at stop for this position: (curr_p - stop_p) * qty if stop is below, or (entry_p - stop_p) * qty
        risk_at_stop = round(max(0.0, (entry_p - stop_p) * qty), 2)
        total_risk_at_stop += risk_at_stop

        # Look up sector from screener cache
        sector = "Unclassified / Other"
        cache_path = os.path.join(ss.CACHE_DIR, f"{clean_sym}.json")
        if os.path.exists(cache_path):
            try:
                with open(cache_path, "r", encoding="utf-8") as f:
                    cdata = json.load(f)
                    sec = cdata.get("COMPANY", {}).get("sector")
                    if sec and sec != "N/A":
                        sector = sec.strip()
            except Exception:
                pass

        if sector not in sector_exposure:
            sector_exposure[sector] = {
                "sector": sector,
                "amount": 0.0,
                "percentage": 0.0,
                "positions_count": 0,
                "tickers": [],
            }
        sector_exposure[sector]["amount"] += pos_val
        sector_exposure[sector]["positions_count"] += 1
        sector_exposure[sector]["tickers"].append(ticker)

        pos_pct = round((pos_val / total_equity) * 100, 2) if total_equity > 0 else 0.0
        position_exposures.append({
            "ticker": ticker,
            "sector": sector,
            "market_value": pos_val,
            "equity_pct": pos_pct,
            "risk_at_stop": risk_at_stop,
        })

    # Calculate sector percentages
    sector_list = []
    for sec_data in sector_exposure.values():
        sec_amt = round(sec_data["amount"], 2)
        sec_pct = round((sec_amt / total_equity) * 100, 2) if total_equity > 0 else 0.0
        sec_data["amount"] = sec_amt
        sec_data["percentage"] = sec_pct
        sector_list.append(sec_data)

    sector_list.sort(key=lambda x: x["amount"], reverse=True)
    position_exposures.sort(key=lambda x: x["market_value"], reverse=True)

    risk_at_stop_pct = round((total_risk_at_stop / total_equity) * 100, 2) if total_equity > 0 else 0.0

    return {
        "total_equity": total_equity,
        "available_cash": available_cash,
        "total_risk_at_stop": round(total_risk_at_stop, 2),
        "total_risk_at_stop_pct": risk_at_stop_pct,
        "sectors": sector_list,
        "position_exposures": position_exposures,
        "open_trades_count": len(open_positions),
    }


def get_proposed_trade_impact(
    ticker: str,
    custom_entry: Optional[float] = None,
    custom_stop: Optional[float] = None,
    custom_qty: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Pre-computes the portfolio impact of taking a proposed trade on `ticker`:
    - Native trade setup quote (entry, stop, targets, recommended quantity)
    - Before & after sector concentration (% and ₹)
    - Before & after total capital at risk at stop
    - Flags existing position in the same stock or same sector
    - Returns concentration warning if sector > 30% or position > 20%
    """
    import screener_scraper as ss

    clean_sym = ticker.replace(".NS", "").replace(".BO", "").strip().upper()
    formatted_ticker = ta.format_nse_ticker(clean_sym)

    # 1. Fetch current portfolio exposure state
    current_portfolio = get_portfolio_sector_and_risk_exposure()
    total_equity = current_portfolio["total_equity"]

    # 2. Fetch native deterministic trade quote
    quote = get_trade_setup_quote(formatted_ticker, portfolio_value=total_equity)

    entry_p = custom_entry if custom_entry and custom_entry > 0 else quote["suggested_entry"]
    stop_p = custom_stop if custom_stop and custom_stop > 0 else quote["suggested_stop"]
    qty = custom_qty if custom_qty and custom_qty > 0 else quote["recommended_quantity"]

    pos_val = round(entry_p * qty, 2)
    risk_per_share = max(0.0, entry_p - stop_p)
    gross_loss_at_stop = round(risk_per_share * qty, 2)

    # Transaction cost at entry & stop exit
    buy_costs = calculate_transaction_costs(entry_p, qty, is_buy=True)["total_charges"]
    sell_stop_costs = calculate_transaction_costs(stop_p, qty, is_buy=False)["total_charges"]
    net_loss_at_stop = round(gross_loss_at_stop + buy_costs + sell_stop_costs, 2)

    # 3. Resolve sector from screener cache
    stock_sector = "Unclassified / Other"
    cache_path = os.path.join(ss.CACHE_DIR, f"{clean_sym}.json")
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                cdata = json.load(f)
                sec = cdata.get("COMPANY", {}).get("sector")
                if sec and sec != "N/A":
                    stock_sector = sec.strip()
        except Exception:
            pass

    # 4. Find existing holdings in this stock & sector
    existing_stock_pos = next(
        (p for p in current_portfolio["position_exposures"] if p["ticker"] == formatted_ticker),
        None
    )
    existing_sector_info = next(
        (s for s in current_portfolio["sectors"] if s["sector"] == stock_sector),
        {"sector": stock_sector, "amount": 0.0, "percentage": 0.0, "positions_count": 0, "tickers": []}
    )

    current_sec_amt = existing_sector_info["amount"]
    current_sec_pct = existing_sector_info["percentage"]

    new_sec_amt = round(current_sec_amt + pos_val, 2)
    new_sec_pct = round((new_sec_amt / total_equity) * 100, 2) if total_equity > 0 else 0.0

    current_total_risk = current_portfolio["total_risk_at_stop"]
    new_total_risk = round(current_total_risk + gross_loss_at_stop, 2)
    new_total_risk_pct = round((new_total_risk / total_equity) * 100, 2) if total_equity > 0 else 0.0

    position_equity_pct = round((pos_val / total_equity) * 100, 2) if total_equity > 0 else 0.0

    # 5. Concentration Warnings (Non-blocking safeguards)
    warnings = []
    if new_sec_pct > 30.0:
        warnings.append(f"Sector Concentration: {stock_sector} exposure will reach {new_sec_pct}% of total equity (>30% threshold).")
    if position_equity_pct > 20.0:
        warnings.append(f"Single Position Sizing: This trade represents {position_equity_pct}% of your total portfolio (>20% cap).")
    if existing_stock_pos:
        warnings.append(f"Already Holding: You currently hold an active paper position in {clean_sym} ({existing_stock_pos['equity_pct']}% of equity).")

    return {
        "ticker": formatted_ticker,
        "clean_symbol": clean_sym,
        "sector": stock_sector,
        "strategy_name": quote["strategy_name"],
        "proposed_entry": entry_p,
        "proposed_stop": stop_p,
        "proposed_target_1": quote["target_1"],
        "proposed_target_2": quote["target_2"],
        "proposed_quantity": qty,
        "position_value": pos_val,
        "position_equity_pct": position_equity_pct,
        "estimated_loss_at_stop_gross": gross_loss_at_stop,
        "estimated_loss_at_stop_net": net_loss_at_stop,
        "estimated_charges": round(buy_costs + sell_stop_costs, 2),
        "sector_exposure_before_pct": current_sec_pct,
        "sector_exposure_after_pct": new_sec_pct,
        "sector_amount_before": current_sec_amt,
        "sector_amount_after": new_sec_amt,
        "portfolio_risk_before_pct": current_portfolio["total_risk_at_stop_pct"],
        "portfolio_risk_after_pct": new_total_risk_pct,
        "total_risk_before": current_total_risk,
        "total_risk_after": new_total_risk,
        "existing_position_in_stock": existing_stock_pos is not None,
        "warnings": warnings,
    }

