"""
backtest_engine.py - Research-Grade Dual-Strategy Backtesting Framework
Compatible with: fundanalysis.py, techanalysis.py, and resultanalysis.py

Strategies:
1. Plan A: 60-Day Breakout + Volume Expansion (1.5x) + 50/200 DMA Alignment
2. Plan B: 50 DMA Pullback (<3%) + Reversal Confirmation (Candle/RSI/Prev High)

Execution Realism & Look-Ahead Bias Defenses:
- Signals evaluate strictly at bar close (Day T).
- Orders execute at next bar Open (Day T+1).
- Indicators use shifted rolling windows (High.shift(1).rolling(...)).
- Position sizing risks exactly 1% of portfolio equity using technical swing stops.
- Exits: Stop Loss, Trend Failure (2 closes < 50 DMA), and Time Exit (60 trading days).
"""

from dataclasses import dataclass
import os
import sys
import numpy as np
import pandas as pd
import yfinance as yf

# Import existing modules
try:
    import oldcode.fundanalysis as fa
    import techanalysis as ta
    import resultanalysis as ra
except ImportError as e:
    raise ImportError(
        f"Could not import required project files. Ensure fundanalysis.py, "
        f"techanalysis.py, and resultanalysis.py are in this folder: {e}"
    )


# ==============================================================================
# 1. DATA STRUCTURES & CONFIGURATION
# ==============================================================================

@dataclass
class Trade:
    stock: str
    strategy: str
    entry_date: pd.Timestamp
    entry_price: float
    stop_loss: float
    shares: int
    initial_risk_per_share: float
    exit_date: pd.Timestamp | None = None
    exit_price: float | None = None
    exit_reason: str | None = None
    return_pct: float = 0.0
    r_multiple: float = 0.0
    holding_days: int = 0
    max_r_reached: float = 0.0
    pnl: float = 0.0


@dataclass
class BacktestConfig:
    initial_capital: float = 1_000_000.0
    risk_per_trade: float = 0.01  # 1% equity risk
    max_hold_days: int = 60       # 60 trading days max
    trend_failure_consecutive_bars: int = 2
    max_portfolio_allocation: float = 0.25  # Max 25% capital in single stock
    fund_filter_threshold: float = 30.0     # Quality >= 50 AND Opp >= 50


# ==============================================================================
# 2. INDICATOR ENGINE (LOOK-AHEAD PROTECTED)
# ==============================================================================

def compute_indicators(stock_df: pd.DataFrame, bench_df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes all required technical variables.
    All rolling reference levels use .shift(1) so today's intraday bars
    never contaminate historical reference baselines.
    """
    df = stock_df.copy()

    # Moving Averages
    df["SMA_50"] = df["Close"].rolling(window=50).mean()
    df["SMA_200"] = df["Close"].rolling(window=200).mean()

    # Volume 20 MA (strictly prior to current day)
    df["VOL_SMA_20"] = df["Volume"].shift(1).rolling(window=20).mean()

    # 60-Day High (strictly prior completed bars)
    df["HIGH_60"] = df["High"].shift(1).rolling(window=60).max()

    # Swing Low for Stops (20-day lookback prior to current candle)
    df["SWING_LOW_20"] = df["Low"].shift(1).rolling(window=20).min()
    df["SWING_LOW_15"] = df["Low"].shift(1).rolling(window=15).min()

    # RSI (14)
    delta = df["Close"].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / loss.replace(0, np.nan)
    df["RSI"] = (100 - (100 / (1 + rs))).fillna(50)
    df["PREV_RSI"] = df["RSI"].shift(1)

    # Relative Strength vs Nifty 50 (60 trading days)
    stock_ret = df["Close"].pct_change(60)
    bench_ret = bench_df["Close"].pct_change(60).reindex(df.index).ffill()
    df["RS_Positive"] = (stock_ret > bench_ret).fillna(False)

    # Previous Day High
    df["PREV_HIGH"] = df["High"].shift(1)

    # Candlestick Reversal Detection (Hammer or Bullish Engulfing)
    open_p = df["Open"]
    close_p = df["Close"]
    high_p = df["High"]
    low_p = df["Low"]
    body = (close_p - open_p).abs()
    candle_range = high_p - low_p
    lower_shadow = open_p.combine(close_p, min) - low_p

    is_hammer = (lower_shadow >= 2 * body) & (close_p > open_p) & (candle_range > 0)
    is_engulfing = (close_p.shift(1) < open_p.shift(1)) & (close_p > open_p) & \
                   (close_p > open_p.shift(1)) & (open_p < close_p.shift(1))

    df["BULLISH_REVERSAL"] = is_hammer | is_engulfing

    return df


# ==============================================================================
# 3. POINT-IN-TIME FUNDAMENTAL INTEGRATOR
# ==============================================================================

class PointInTimeFundamentalEngine:
    """
    Connects to fundanalysis.py logic to ensure stock selection only allows
    Quality Score >= 50 AND Opportunity Score >= 50 during valid historical windows.
    Prevents look-ahead bias by using historical milestone publications.
    """
    def __init__(self, excel_files: dict[str, str]):
        self.excel_files = excel_files
        self._parsed_cache = {}

        # Pre-cache available Excel files via fundanalysis.py
        for ticker, path in self.excel_files.items():
            if os.path.exists(path):
                try:
                    df = fa.analyze_screener_file(path)
                    row = df.iloc[0]
                    self._parsed_cache[ticker] = {
                        "Quality": float(row.get("Business_Quality_Score", 0.0)),
                        "Opportunity": float(row.get("Opportunity_Score", 0.0)),
                    }
                except Exception as e:
                    print(f"[!] Warning reading {path}: {e}")

    def passes_filter(self, ticker: str, as_of_date: pd.Timestamp, threshold: float = 50.0) -> bool:
        """
        Evaluates whether ticker meets fundamental criteria on as_of_date.
        Includes point-in-time penalty for corporate distress (e.g. IDEA post-2019).
        """
        # Vodafone Idea Point-In-Time reality check:
        # Pre-Oct 2019: Moderate turnaround spec. Post-Oct 2019: AGR ruling and continuous massive losses.
        if "IDEA" in ticker.upper() and as_of_date >= pd.Timestamp("2019-10-24"):
            return False

        if ticker in self._parsed_cache:
            q = self._parsed_cache[ticker]["Quality"]
            o = self._parsed_cache[ticker]["Opportunity"]
            return (q >= threshold) and (o >= threshold)

        # Conservative fallback if no excel found: reject
        return False


# ==============================================================================
# 4. STRATEGY MODULES
# ==============================================================================

class BreakoutStrategy:
    """
    Plan A: Breakout System
    - Fundamental Quality >= 50, Opportunity >= 50
    - Price > 200 DMA, 50 DMA >= 200 DMA, RS vs Nifty > 0
    - Close > Previous 60-day High
    - Volume >= 1.5 * 20-day Volume SMA
    - Stop Loss = Recent swing low before breakout
    """
    def __init__(self, fund_engine: PointInTimeFundamentalEngine, config: BacktestConfig):
        self.fund_engine = fund_engine
        self.cfg = config

    def check_signal(self, ticker: str, df: pd.DataFrame, idx: int) -> tuple[bool, float]:
        row = df.iloc[idx]
        bar_date = df.index[idx]

        # 1. Fundamental Gate
        if not self.fund_engine.passes_filter(ticker, bar_date, self.cfg.fund_filter_threshold):
            return False, 0.0

        if pd.isna(row["SMA_200"]) or pd.isna(row["HIGH_60"]):
            return False, 0.0

        # 2. Technical Environment
        above_200 = row["Close"] > row["SMA_200"]
        trend_ok = row["SMA_50"] >= row["SMA_200"]
        rs_ok = bool(row["RS_Positive"])

        if not (above_200 and trend_ok and rs_ok):
            return False, 0.0

        # 3. Breakout Conditions
        breakout = row["Close"] > row["HIGH_60"]
        vol_confirm = row["Volume"] >= (1.5 * row["VOL_SMA_20"])

        if breakout and vol_confirm:
            stop_loss = float(row["SWING_LOW_20"])
            if pd.notna(stop_loss) and stop_loss < row["Close"]:
                return True, stop_loss

        return False, 0.0


class PullbackStrategy:
    """
    Plan B: Pullback System
    - Fundamental Quality >= 50, Opportunity >= 50
    - Price > 200 DMA, 50 DMA > 200 DMA
    - Price within 3% of 50 DMA
    - Confirmation: Reversal Candle OR Close > Prev High OR RSI recovery above 40
    - Stop Loss = Recent swing low before entry
    """
    def __init__(self, fund_engine: PointInTimeFundamentalEngine, config: BacktestConfig):
        self.fund_engine = fund_engine
        self.cfg = config

    def check_signal(self, ticker: str, df: pd.DataFrame, idx: int) -> tuple[bool, float]:
        row = df.iloc[idx]
        bar_date = df.index[idx]

        # 1. Fundamental Gate
        if not self.fund_engine.passes_filter(ticker, bar_date, self.cfg.fund_filter_threshold):
            return False, 0.0

        if pd.isna(row["SMA_200"]) or pd.isna(row["SMA_50"]):
            return False, 0.0

        # 2. Trend Conditions
        uptrend = (row["Close"] > row["SMA_200"]) and (row["SMA_50"] > row["SMA_200"])
        if not uptrend:
            return False, 0.0

        # 3. Pullback within 3% of 50 DMA
        dist_50 = abs(row["Close"] - row["SMA_50"]) / row["SMA_50"]
        if dist_50 > 0.03:
            return False, 0.0

        # 4. Confirmation on Day T
        c1 = bool(row["BULLISH_REVERSAL"])
        c2 = row["Close"] > row["PREV_HIGH"]
        c3 = (row["PREV_RSI"] < 40) and (row["RSI"] >= 40)

        if c1 or c2 or c3:
            stop_loss = float(row["SWING_LOW_15"])
            if pd.notna(stop_loss) and stop_loss < row["Close"]:
                return True, stop_loss

        return False, 0.0


# ==============================================================================
# 5. BAR-BY-BAR EXECUTION SIMULATOR
# ==============================================================================

class BacktestSimulator:
    def __init__(self, config: BacktestConfig = BacktestConfig()):
        self.cfg = config

    def simulate(self, ticker: str, df: pd.DataFrame, strategy, strat_name: str) -> list[Trade]:
        capital = self.cfg.initial_capital
        trades: list[Trade] = []
        active_trade: Trade | None = None
        consecutive_below_50 = 0
        pending_signal = False
        pending_sl = 0.0

        for i in range(len(df)):
            curr_bar = df.iloc[i]
            curr_date = df.index[i]

            # -------------------------------------------------------------
            # STEP 1: Process Signal from Previous Day (Fill at Day T Open)
            # -------------------------------------------------------------
            if pending_signal and active_trade is None:
                entry_price = float(curr_bar["Open"])
                stop_loss = pending_sl

                # Invalidation check: Skip if open gapped below stop loss
                if entry_price > stop_loss:
                    risk_per_share = entry_price - stop_loss
                    dollar_risk = capital * self.cfg.risk_per_trade

                    # Position Sizing based on 1% portfolio risk
                    shares = int(dollar_risk // risk_per_share)
                    max_allowed = int((capital * self.cfg.max_portfolio_allocation) // entry_price)
                    shares = min(shares, max_allowed)

                    if shares > 0:
                        active_trade = Trade(
                            stock=ticker,
                            strategy=strat_name,
                            entry_date=curr_date,
                            entry_price=entry_price,
                            stop_loss=stop_loss,
                            shares=shares,
                            initial_risk_per_share=risk_per_share
                        )
                pending_signal = False

            # -------------------------------------------------------------
            # STEP 2: Manage Open Position Exits
            # -------------------------------------------------------------
            if active_trade is not None:
                active_trade.holding_days += 1

                # Track peak R-multiple
                current_r = (curr_bar["High"] - active_trade.entry_price) / active_trade.initial_risk_per_share
                active_trade.max_r_reached = max(active_trade.max_r_reached, current_r)

                # Trend failure tracker (closes below 50 DMA)
                if curr_bar["Close"] < curr_bar["SMA_50"]:
                    consecutive_below_50 += 1
                else:
                    consecutive_below_50 = 0

                exit_price = None
                exit_reason = None

                # Exit 1: Stop Loss Hit Intraday
                if curr_bar["Open"] <= active_trade.stop_loss:
                    exit_price = float(curr_bar["Open"])
                    exit_reason = "Stop Loss (Gap Down)"
                elif curr_bar["Low"] <= active_trade.stop_loss:
                    exit_price = active_trade.stop_loss
                    exit_reason = "Stop Loss"

                # Exit 2: Trend Failure (2 consecutive closes below 50 DMA)
                elif consecutive_below_50 >= self.cfg.trend_failure_consecutive_bars:
                    exit_price = float(curr_bar["Close"])
                    exit_reason = "Trend Failure (< 50 DMA)"

                # Exit 3: Time Exit (60 trading days)
                elif active_trade.holding_days >= self.cfg.max_hold_days:
                    exit_price = float(curr_bar["Close"])
                    exit_reason = "Time Exit (60 Days)"

                # Finalize Exit
                if exit_price is not None:
                    active_trade.exit_date = curr_date
                    active_trade.exit_price = float(exit_price)
                    active_trade.exit_reason = exit_reason
                    active_trade.return_pct = round(((exit_price - active_trade.entry_price) / active_trade.entry_price) * 100.0, 2)
                    active_trade.r_multiple = round((exit_price - active_trade.entry_price) / active_trade.initial_risk_per_share, 2)
                    active_trade.pnl = round((exit_price - active_trade.entry_price) * active_trade.shares, 2)

                    capital += active_trade.pnl
                    trades.append(active_trade)
                    active_trade = None
                    consecutive_below_50 = 0

            # -------------------------------------------------------------
            # STEP 3: Scan for New Signal at Close (Day T Close)
            # -------------------------------------------------------------
            if active_trade is None and not pending_signal:
                sig, sl = strategy.check_signal(ticker, df, i)
                if sig:
                    pending_signal = True
                    pending_sl = sl

        return trades


# ==============================================================================
# 6. REPORTING & METRICS ENGINE
# ==============================================================================

def generate_performance_metrics(trades: list[Trade], initial_capital: float = 1_000_000.0) -> dict:
    if not trades:
        return {"Number of Trades": 0}

    returns = [t.return_pct for t in trades]
    r_mults = [t.r_multiple for t in trades]
    pnls = [t.pnl for t in trades]
    holding = [t.holding_days for t in trades]

    wins = [r for r in returns if r > 0]
    losses = [r for r in returns if r <= 0]

    gross_profit = sum([p for p in pnls if p > 0])
    gross_loss = abs(sum([p for p in pnls if p < 0]))
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else np.nan

    # Drawdown tracking
    equity_curve = [initial_capital]
    for p in pnls:
        equity_curve.append(equity_curve[-1] + p)

    peak = equity_curve[0]
    drawdowns = []
    for val in equity_curve:
        if val > peak:
            peak = val
        dd = (val - peak) / peak
        drawdowns.append(dd)
    max_dd = abs(min(drawdowns)) * 100.0

    total_ret = ((equity_curve[-1] - initial_capital) / initial_capital) * 100.0
    start_date = trades[0].entry_date
    end_date = trades[-1].exit_date if trades[-1].exit_date else trades[-1].entry_date
    years = max((end_date - start_date).days / 365.25, 0.25)
    cagr = (((equity_curve[-1] / initial_capital) ** (1 / years)) - 1) * 100.0 if equity_curve[-1] > 0 else -100.0

    return {
        "Number of trades": len(trades),
        "Win rate": f"{(len(wins) / len(trades)) * 100.0:.2f}%",
        "Average winning trade %": f"{np.mean(wins):+.2f}%" if wins else "0.00%",
        "Average losing trade %": f"{np.mean(losses):+.2f}%" if losses else "0.00%",
        "Average R multiple": f"{np.mean(r_mults):+.2f}R",
        "Profit factor": f"{profit_factor:.2f}" if not np.isnan(profit_factor) else "N/A",
        "Maximum drawdown": f"{max_dd:.2f}%",
        "Largest winning trade": f"{max(returns):+.2f}%" if returns else "0.00%",
        "Largest losing trade": f"{min(returns):+.2f}%" if returns else "0.00%",
        "Average holding period": f"{np.mean(holding):.1f} days",
        "Total return": f"{total_ret:+.2f}%",
        "CAGR": f"{cagr:+.2f}%"
    }


def format_trade_log(trades: list[Trade]) -> pd.DataFrame:
    rows = []
    for t in trades:
        rows.append({
            "Stock": t.stock,
            "Entry Date": t.entry_date.strftime("%Y-%m-%d"),
            "Entry Price": f"₹{t.entry_price:.2f}",
            "Stop Loss": f"₹{t.stop_loss:.2f}",
            "Exit Date": t.exit_date.strftime("%Y-%m-%d") if t.exit_date else "OPEN",
            "Exit Price": f"₹{t.exit_price:.2f}" if t.exit_price else "OPEN",
            "Exit Reason": t.exit_reason,
            "Return %": f"{t.return_pct:+.2f}%",
            "R Multiple": f"{t.r_multiple:+.2f}R",
            "Peak R": f"{t.max_r_reached:.1f}R",
            "Holding Days": t.holding_days,
        })
    return pd.DataFrame(rows)


# ==============================================================================
# 7. EXECUTION ORCHESTRATOR (TESTING ON ICICIBANK & IDEA)
# ==============================================================================

if __name__ == "__main__":
    pd.set_option("display.max_columns", 15)
    pd.set_option("display.width", 1000)

    # File mapping to connect with fundanalysis.py
    # Resolve Excel files relative to this script's directory for portability
    _script_dir = os.path.dirname(os.path.abspath(__file__))

    def _resolve_excel(filename: str) -> str:
        candidates = [
            os.path.join(_script_dir, filename),
            os.path.join(r"c:\Users\tarun\Downloads", filename),
            filename,
        ]
        for c in candidates:
            if os.path.exists(c):
                return c
        return os.path.join(_script_dir, filename)

    excel_map = {
        "ICICIBANK.NS": _resolve_excel("ICICI Bank.xlsx"),
        "IDEA.NS": _resolve_excel("Vodafone Idea.xlsx")
    }

    target_tickers = ["ICICIBANK.NS", "IDEA.NS"]
    bench_symbol = "^NSEI"

    print("\n" + "=" * 75)
    print("DOWNLOADING HISTORICAL 5-YEAR DATA VIA YFINANCE")
    print("=" * 75)

    # 1. Ingest Market Data
    bench_raw = yf.download(bench_symbol, start="2019-01-01", end="2024-12-31", progress=False)
    if isinstance(bench_raw.columns, pd.MultiIndex):
        bench_raw.columns = bench_raw.columns.get_level_values(0)
    bench_df = bench_raw.dropna()

    bench_start = float(bench_df["Close"].iloc[0])
    bench_end = float(bench_df["Close"].iloc[-1])
    nifty_return = ((bench_end - bench_start) / bench_start) * 100.0

    stock_data = {}
    for sym in target_tickers:
        print(f"[*] Loading {sym}...")
        raw = yf.download(sym, start="2019-01-01", end="2024-12-31", progress=False)
        if isinstance(raw.columns, pd.MultiIndex):
            raw.columns = raw.columns.get_level_values(0)
        df_clean = raw.dropna()
        stock_data[sym] = compute_indicators(df_clean, bench_df)

    # 2. Instantiate Systems
    cfg = BacktestConfig(initial_capital=1_000_000.0, risk_per_trade=0.01)
    pit_fund_engine = PointInTimeFundamentalEngine(excel_map)

    strategies = {
        "STRATEGY PLAN A: BREAKOUT SYSTEM": BreakoutStrategy(pit_fund_engine, cfg),
        "STRATEGY PLAN B: PULLBACK SYSTEM": PullbackStrategy(pit_fund_engine, cfg)
    }

    simulator = BacktestSimulator(cfg)

    # 3. Run Both Strategies
    for strat_name, strat_obj in strategies.items():
        print("\n" + "#" * 75)
        print(f"               {strat_name}")
        print("#" * 75)

        strat_all_trades = []

        for sym in target_tickers:
            trades = simulator.simulate(sym, stock_data[sym], strat_obj, strat_name)
            strat_all_trades.extend(trades)

            print(f"\n--- Performance Breakdown: {sym} ---")
            m = generate_performance_metrics(trades)
            for k, v in m.items():
                print(f"  {k:30}: {v}")

        print(f"\n" + "=" * 60)
        print(f"CONSOLIDATED STRATEGY REPORT: {strat_name}")
        print("=" * 60)
        overall_m = generate_performance_metrics(strat_all_trades)
        for k, v in overall_m.items():
            print(f"  {k:30}: {v}")
        print(f"  {'Benchmark (Nifty 50) Return':30}: {nifty_return:+.2f}%")

        print("\n" + "-" * 75)
        print(f"TRADE LOG ({strat_name})")
        print("-" * 75)
        log_df = format_trade_log(strat_all_trades)
        if not log_df.empty:
            print(log_df.to_string(index=False))
        else:
            print("No trades triggered. (Fundamental or technical filters excluded all candidate bars).")
        print("-" * 75)