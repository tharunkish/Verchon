"""
server.py - FastAPI Service Layer for Frontier Research UI
===========================================================
Serves structured JSON application state and Markdown AI reports
wrapping existing analytical engines without modifying base logic.
"""

from __future__ import annotations

import math
import os
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional, Union

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import aianalysis as ai
import ai_parser
import event_engine
import improvedfundanalysis as ifa
import local_llm
import marketregime as mr
import paper_store as ps
import resultanalysis as ra
import screener_scraper as scraper
import techanalysis as ta

# In-memory AI Report Cache to share synthesized dossiers between Scanner and Deep Dive
AI_REPORT_CACHE: Dict[str, Any] = {
    "report_markdown": "",
    "dossiers": {},
    "macro_backdrop": "",
    "cross_comparison": "",
    "finalist_tickers": [],
    "updated_at": None,
}

# Initialize FastAPI application
app = FastAPI(
    title="NSE Swing Trading Research System API",
    description="Backend service layer for Frontier Full-Screen Swing Trading UI",
    version="1.0.0",
)

# Application lifecycle events
@app.on_event("startup")
def startup_event():
    """Eagerly launch local Qwen model on boot if active provider is local/qwen."""
    if local_llm.get_active_provider() == "qwen":
        print("\n" + "=" * 60)
        print(" [AI Engine] Eagerly booting Local Qwen 3.5 4B server...")
        print("=" * 60)
        local_llm.start_local_server()

# Shutdown handler to clean up local LLM worker
@app.on_event("shutdown")
def shutdown_event():
    local_llm.stop_local_server()

class AIProviderSettings(BaseModel):
    provider: str = Field(default="qwen", description="'qwen' or 'gemini'")

@app.get("/api/settings/ai-provider")
def get_ai_provider_setting() -> Dict[str, Any]:
    return {
        "provider": local_llm.get_active_provider(),
        "local_available": local_llm.is_local_model_available(),
        "local_running": local_llm.is_server_healthy(),
        "model_path": local_llm.MODEL_PATH,
    }

@app.post("/api/settings/ai-provider")
def set_ai_provider_setting(req: AIProviderSettings) -> Dict[str, Any]:
    updated = local_llm.set_active_provider(req.provider)
    return {
        "provider": updated,
        "local_available": local_llm.is_local_model_available(),
        "local_running": local_llm.is_server_healthy(),
    }

# Enable CORS for Vite frontend (running on port 3000 or 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# =====================================================================
# 1. ROBUST JSON SERIALIZER
# =====================================================================

def serialize_for_json(val: Any) -> Any:
    """
    Recursively cleans Python objects, pandas data, numpy types, and
    ComponentResult instances into standard JSON-serializable primitives.
    """
    if val is None:
        return None
    if isinstance(val, (bool, str, int)):
        return val
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return None
        return round(val, 2)
    if isinstance(val, (np.floating, np.integer)):
        f_val = float(val)
        if math.isnan(f_val) or math.isinf(f_val):
            return None
        return round(f_val, 2)
    if isinstance(val, (pd.Timestamp, datetime)):
        return val.strftime("%Y-%m-%d")
    if hasattr(val, "score") and hasattr(val, "assessment"):
        # ComponentResult instance from improvedfundanalysis
        raw_metrics = getattr(val, "metrics", {}) or {}
        return {
            "score": serialize_for_json(getattr(val, "score", None)),
            "coverage": serialize_for_json(getattr(val, "coverage", 0.0)),
            "assessment": str(getattr(val, "assessment", "N/A")),
            "metrics": {str(k): serialize_for_json(v) for k, v in raw_metrics.items()},
        }
    if isinstance(val, dict):
        return {str(k): serialize_for_json(v) for k, v in val.items()}
    if isinstance(val, (list, tuple, set, np.ndarray, pd.Series)):
        return [serialize_for_json(x) for x in val]

    return str(val)


# =====================================================================
# 2. REQUEST & RESPONSE MODELS
# =====================================================================

class ScanRequest(BaseModel):
    universe: str = "nifty100"
    limit: int = 10
    tickers: Optional[List[str]] = None
    as_of_date: Optional[str] = None


class AIReportRequest(BaseModel):
    tickers: Optional[List[str]] = None
    stage1_model: Optional[str] = None
    stage2_model: Optional[str] = None


class PaperPositionAddRequest(BaseModel):
    ticker: str
    entry_price: float
    stop_price: float
    quantity: int = 1
    strategy_name: str
    target_1: Optional[float] = None
    target_2: Optional[float] = None
    order_type: str = "MARKET"
    entry_date: Optional[str] = None
    notes: Optional[str] = None


class PaperPositionCloseRequest(BaseModel):
    position_id: str
    exit_reason: str = "MANUAL_CLOSE"
    exit_price: Optional[float] = None
    quantity_to_close: Optional[int] = None


class PaperPositionUpdateStopRequest(BaseModel):
    position_id: str
    new_stop_price: float


class PaperAccountResetRequest(BaseModel):
    starting_capital: float = 1000000.0
    risk_per_trade_pct: float = 1.0
    clear_ledger: bool = True


class PaperAccountUpdateRequest(BaseModel):
    starting_capital: float
    risk_per_trade_pct: Optional[float] = None



# =====================================================================
# 3. API ENDPOINTS
# =====================================================================

@app.get("/api/health")
def health_check() -> Dict[str, Any]:
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "service": "VERCHON Terminal API",
        "engine_version": getattr(ra, "ENGINE_VERSION", "2.1.0"),
        "strategy_version": getattr(ra, "STRATEGY_VERSION", "1.0.0"),
        "scoring_version": getattr(ra, "SCORING_VERSION", "1.1.0"),
        "paper_store_db": ps.LEDGER_FILE,
    }


@app.get("/api/regime")
def get_market_regime(as_of_date: Optional[str] = None) -> Dict[str, Any]:
    """Returns the macro market regime for Nifty 50, supporting historical as_of_date."""
    try:
        regime_data = mr.analyze_market_regime(as_of_date=as_of_date)
        return serialize_for_json(regime_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Market regime evaluation error: {e}")


@app.post("/api/scan")
def run_deterministic_scan(req: ScanRequest) -> Dict[str, Any]:
    """
    Executes deterministic screening across specified universe or custom tickers.
    Fast and inexpensive; does NOT invoke AI.
    """
    try:
        candidates_to_run: List[Dict[str, str]] = []
        if req.tickers and len(req.tickers) > 0:
            for t in req.tickers:
                clean_t = t.strip().upper()
                if clean_t:
                    candidates_to_run.append({"name": clean_t, "ticker": clean_t})
        else:
            fetched = scraper.fetch_nse_index_universe(req.universe)
            if not fetched:
                candidates_to_run = ai.DEFAULT_UNIVERSE
            else:
                candidates_to_run = fetched

        if req.limit > 0:
            candidates_to_run = candidates_to_run[:req.limit]

        evaluated, market_ctx = ra.analyze_universe(
            candidates=candidates_to_run,
            verbose=False,
            as_of_date=req.as_of_date,
        )

        return serialize_for_json({
            "market_regime": market_ctx,
            "total_candidates": len(evaluated),
            "candidates": evaluated,
            "engine_version": getattr(ra, "ENGINE_VERSION", "2.1.0"),
            "strategy_version": getattr(ra, "STRATEGY_VERSION", "1.0.0"),
            "scoring_version": getattr(ra, "SCORING_VERSION", "1.1.0"),
            "as_of_date": req.as_of_date,
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scan error: {e}")


@app.post("/api/ai-report")
def run_ai_research_report(req: AIReportRequest) -> Dict[str, Any]:
    """
    Explicitly triggers the AI research pipeline (routed to Local Qwen or Cloud Gemini).
    Caches parsed structured dossiers, and returns report.
    """
    try:
        candidate_list: Optional[List[Dict[str, str]]] = None
        tickers_list: List[str] = []
        if req.tickers and len(req.tickers) > 0:
            candidate_list = [{"name": t.strip().upper(), "ticker": t.strip().upper()} for t in req.tickers if t.strip()]
            tickers_list = [t.strip().upper() for t in req.tickers if t.strip()]

        active_provider = local_llm.get_active_provider()

        # ROUTE 1: Local Qwen 3.5 4B (Offline & Unlimited)
        if active_provider == "qwen":
            regime_obj = None
            try:
                regime_obj = mr.fetch_market_regime()
            except Exception:
                pass

            cand_items = [{"ticker": t, "current_price": "N/A", "score": 75} for t in tickers_list]
            t0 = time.time()
            rep_md = local_llm.generate_qwen_market_briefing(cand_items, regime_obj)
            elapsed = round(time.time() - t0, 2)

            AI_REPORT_CACHE["report_markdown"] = rep_md
            AI_REPORT_CACHE["finalist_tickers"] = tickers_list
            AI_REPORT_CACHE["updated_at"] = datetime.now().isoformat()

            return serialize_for_json({
                "elapsed_seconds": elapsed,
                "stage1_result": {"provider": "local_qwen_3.5_4b"},
                "finalist_tickers": tickers_list,
                "report_markdown": rep_md,
                "structured": {"executive_summary": rep_md},
                "diagnostics": [{"step": "local_qwen_synthesis", "model": "Huihui-Qwen3.5-4B-Abliterated", "status": "SUCCESS"}],
            })

        # ROUTE 2: Cloud Google Gemini Cascade
        pipeline_result = ai.run_ai_research_pipeline(
            candidates=candidate_list,
            stage1_model=req.stage1_model or ai.STAGE1_MODEL_DEFAULT,
            stage2_model=req.stage2_model or ai.STAGE2_MODEL_DEFAULT,
            verbose=False,
        )

        rep_md = pipeline_result.get("report_markdown", "")
        finalists = pipeline_result.get("finalist_tickers", []) or tickers_list

        # Parse full markdown into structured per-stock dossiers
        parsed = ai_parser.parse_full_report_by_tickers(finalists, rep_md)

        # Update cache
        AI_REPORT_CACHE["report_markdown"] = rep_md
        AI_REPORT_CACHE["dossiers"].update(parsed.get("dossiers", {}))
        AI_REPORT_CACHE["macro_backdrop"] = parsed.get("macro_backdrop", "")
        AI_REPORT_CACHE["cross_comparison"] = parsed.get("cross_comparison", "")
        AI_REPORT_CACHE["finalist_tickers"] = finalists
        AI_REPORT_CACHE["updated_at"] = datetime.now().isoformat()

        return serialize_for_json({
            "elapsed_seconds": pipeline_result.get("elapsed_seconds"),
            "stage1_result": pipeline_result.get("stage1_result"),
            "finalist_tickers": finalists,
            "report_markdown": rep_md,
            "structured": parsed,
            "diagnostics": pipeline_result.get("diagnostics", []),
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI pipeline error: {e}")


@app.get("/api/ai-diagnostics")
def get_ai_diagnostics() -> Dict[str, Any]:
    """Returns real-time model execution, denial, and fallback diagnostic traces."""
    active_provider = local_llm.get_active_provider()
    if active_provider == "qwen":
        return serialize_for_json({
            "diagnostics": [{
                "step": "local_inference",
                "model": "Huihui-Qwen3.5-4B-Abliterated (Local)",
                "status": "ONLINE" if local_llm.is_server_healthy() else "OFFLINE",
            }]
        })
    return serialize_for_json({
        "diagnostics": ai.get_recent_diagnostics()
    })


@app.post("/api/ai-dossier/{ticker}")
def generate_single_stock_ai_dossier(ticker: str) -> Dict[str, Any]:
    """
    Generates or retrieves an on-demand structured AI Dossier specifically for one stock.
    Routes to Local Qwen 3.5 4B or Cloud Gemini depending on active user setting.
    """
    clean_sym = ticker.replace(".NS", "").replace(".BO", "").strip().upper()
    formatted_sym = ta.format_nse_ticker(clean_sym)

    # If already cached from a previous synthesis, return immediately
    if clean_sym in AI_REPORT_CACHE["dossiers"]:
        return serialize_for_json({
            "ticker": formatted_sym,
            "cached": True,
            "dossier": AI_REPORT_CACHE["dossiers"][clean_sym],
            "diagnostics": AI_REPORT_CACHE.get("diagnostics", []),
        })

    active_provider = local_llm.get_active_provider()

    # ROUTE 1: Local Qwen 3.5 4B Engine
    if active_provider == "qwen":
        try:
            print(f"\n[AI Pipeline] Synthesizing research dossier for {clean_sym} via Local Qwen 3.5 4B...")
            print(f"  [1/3] Running deterministic candidate analysis (Fundamentals + Technicals)...")
            cand_data = ra.analyze_candidate(formatted_sym)
            
            print(f"  [2/3] Querying local Qwen engine on port 8085 (prompting with full context)...")
            rep_md = local_llm.generate_qwen_stock_dossier(formatted_sym, cand_data)
            
            print(f"  [3/3] Parsing Markdown into structured cards (Thesis, Invalidation, Contradictions, Questions)...")
            stock_dossier = ai_parser.parse_stock_ai_section(clean_sym, rep_md)

            if not stock_dossier:
                stock_dossier = {
                    "raw_section": rep_md,
                    "thesis": [f"Local Qwen qualitative assessment generated for {clean_sym}."],
                    "risks": {"setup_invalidation": "Break below recent swing support."},
                }

            AI_REPORT_CACHE["dossiers"][clean_sym] = stock_dossier
            AI_REPORT_CACHE["dossiers"][formatted_sym] = stock_dossier
            diagnostics = [{"step": "local_qwen_dossier", "model": "Huihui-Qwen3.5-4B-Abliterated", "status": "SUCCESS"}]
            AI_REPORT_CACHE["diagnostics"] = diagnostics
            print(f"[AI Pipeline] Successfully completed research dossier for {clean_sym}.\n")

            return serialize_for_json({
                "ticker": formatted_sym,
                "cached": False,
                "dossier": stock_dossier,
                "raw_markdown": rep_md,
                "diagnostics": diagnostics,
            })
        except Exception as qwen_err:
            print(f"[!] Local Qwen stock dossier error: {qwen_err}")
            raise HTTPException(status_code=500, detail=f"Local Qwen error: {qwen_err}")

    # ROUTE 2: Cloud Google Gemini Pipeline
    try:
        pipeline_result = ai.run_ai_research_pipeline(
            candidates=[{"name": clean_sym, "ticker": formatted_sym}],
            verbose=False,
        )
        rep_md = pipeline_result.get("report_markdown", "")
        diagnostics = pipeline_result.get("diagnostics", [])
        parsed = ai_parser.parse_full_report_by_tickers([clean_sym, formatted_sym], rep_md)
        stock_dossier = parsed.get("dossiers", {}).get(clean_sym) or parsed.get("dossiers", {}).get(formatted_sym)

        if stock_dossier:
            AI_REPORT_CACHE["dossiers"][clean_sym] = stock_dossier
            AI_REPORT_CACHE["dossiers"][formatted_sym] = stock_dossier
        AI_REPORT_CACHE["diagnostics"] = diagnostics

        return serialize_for_json({
            "ticker": formatted_sym,
            "cached": False,
            "dossier": stock_dossier or {"raw_section": rep_md, "thesis": []},
            "raw_markdown": rep_md,
            "diagnostics": diagnostics,
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate AI dossier for {ticker}: {e}")


class StockChatRequest(BaseModel):
    message: str
    history: List[Dict[str, str]] = []

@app.post("/api/ai-chat/{ticker}")
def chat_with_stock_endpoint(ticker: str, req: StockChatRequest) -> Dict[str, Any]:
    """
    Interactive Q&A chat endpoint for a specific stock.
    Grounds local Qwen on candidate fundamentals & technicals.
    """
    clean_sym = ticker.replace(".NS", "").replace(".BO", "").strip().upper()
    formatted_sym = ta.format_nse_ticker(clean_sym)

    try:
        cand_data = ra.analyze_candidate(formatted_sym)
        reply = local_llm.chat_with_stock(
            ticker=formatted_sym,
            candidate_data=cand_data,
            chat_history=req.history,
            user_message=req.message,
        )
        return serialize_for_json({
            "ticker": formatted_sym,
            "reply": reply,
        })
    except Exception as e:
        print(f"[!] Stock chat error: {e}")
@app.get("/api/news-hub")
def get_news_hub_data() -> Dict[str, Any]:
    """
    Returns aggregated corporate filings, upcoming earnings radar,
    and live market news feed for Tab 4.
    """
    try:
        filings = event_engine.get_aggregate_corporate_announcements(limit=40)
        market_news = event_engine.fetch_market_news_feed(limit=25)

        # Build upcoming earnings radar across popular screened stocks
        sample_tickers = ["PNB", "REDINGTON", "HAL", "TECHM", "TCS", "ICICIBANK", "SBIN", "BEL", "ADANIPORTS", "MOTHERSON"]
        upcoming_earnings = []
        for t in sample_tickers:
            radar = event_engine.fetch_corporate_radar(f"{t}.NS")
            if radar.get("next_earnings_date"):
                upcoming_earnings.append({
                    "ticker": f"{t}.NS",
                    "next_earnings_date": radar.get("next_earnings_date"),
                    "days_to_earnings": radar.get("days_to_earnings"),
                    "badge": radar.get("event_risk_badge"),
                    "status": radar.get("event_risk_status"),
                    "reason": radar.get("event_risk_reason"),
                    "past_surprises": radar.get("past_earnings_track_record", [])[:2],
                })

        # Sort upcoming earnings by days remaining
        upcoming_earnings.sort(key=lambda x: x.get("days_to_earnings") if x.get("days_to_earnings") is not None else 999)

        return serialize_for_json({
            "upcoming_earnings": upcoming_earnings,
            "recent_filings": filings,
            "market_news": market_news,
            "updated_at": datetime.now().isoformat(),
        })
    except Exception as e:
        print(f"[!] News Hub error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stocks/{ticker}")
def get_stock_deep_dive(ticker: str, as_of_date: Optional[str] = None) -> Dict[str, Any]:
    """
    Consolidated Stock Dossier Endpoint:
    Returns full fundamental 7 pillars, technical indicators, strategy pass/fail rule checklist,
    valuation comparisons, and OHLCV chart bars for the TradingView canvas.
    Supports historical as_of_date parameter for temporal analysis.
    """
    clean_sym = ticker.replace(".NS", "").replace(".BO", "").strip().upper()
    formatted_sym = ta.format_nse_ticker(clean_sym)

    try:
        # 1. Deterministic Candidate Analysis
        candidate_dossier = ra.analyze_candidate(formatted_sym, as_of_date=as_of_date)

        # 2. Fetch 1Y OHLCV for interactive chart
        candles: List[Dict[str, Any]] = []
        dma_50_line: List[Dict[str, Any]] = []
        dma_200_line: List[Dict[str, Any]] = []

        try:
            stock_df, _ = ta.fetch_daily_ohlcv(formatted_sym, period="1y", as_of_date=as_of_date)
            if stock_df is not None and not stock_df.empty:
                # Calculate rolling moving averages
                close_s = stock_df["Close"]
                ma50 = close_s.rolling(window=50).mean()
                ma200 = close_s.rolling(window=200).mean() if len(close_s) >= 200 else ma50

                for idx in range(len(stock_df)):
                    date_val = stock_df.index[idx]
                    date_str = date_val.strftime("%Y-%m-%d") if hasattr(date_val, "strftime") else str(date_val)[:10]

                    c_open = float(stock_df["Open"].iloc[idx])
                    c_high = float(stock_df["High"].iloc[idx])
                    c_low = float(stock_df["Low"].iloc[idx])
                    c_close = float(stock_df["Close"].iloc[idx])
                    c_vol = float(stock_df["Volume"].iloc[idx])

                    candles.append({
                        "time": date_str,
                        "open": round(c_open, 2),
                        "high": round(c_high, 2),
                        "low": round(c_low, 2),
                        "close": round(c_close, 2),
                        "volume": int(c_vol),
                    })

                    if pd.notna(ma50.iloc[idx]):
                        dma_50_line.append({"time": date_str, "value": round(float(ma50.iloc[idx]), 2)})
                    if pd.notna(ma200.iloc[idx]):
                        dma_200_line.append({"time": date_str, "value": round(float(ma200.iloc[idx]), 2)})

            # 2.1 Calculate technical buy signal markers for TradingView chart
            chart_signal_data = {"markers": []}
            try:
                import chart_signals
                strat_info = candidate_dossier.get("technicals", {}).get("Strategy_Evaluation", {})
                chart_signal_data = chart_signals.compute_chart_signals(stock_df, strat_info)
            except Exception as sig_err:
                print(f"[!] Chart signal calculation warning for {ticker}: {sig_err}")
        except Exception as chart_err:
            print(f"[!] Chart bar retrieval warning for {ticker}: {chart_err}")
            chart_signal_data = {"markers": []}

        # 3. Strategy Pass/Fail Rule Breakdown Checklist
        t_data = candidate_dossier.get("technicals", {})
        trend_i = t_data.get("Trend_Analysis", {})
        momo_i = t_data.get("Momentum_Analysis", {})
        strat_eval = t_data.get("Strategy_Evaluation", {})
        all_strat = strat_eval.get("all_strategy_results", {})

        price = trend_i.get("Current_Price", 0.0)
        d50 = trend_i.get("50_DMA", 0.0)
        d200 = trend_i.get("200_DMA")
        s50 = trend_i.get("50_DMA_Slope_5d", 0.0)
        alpha_1m = momo_i.get("Relative_Strength_Alpha_%", {}).get("1M")
        alpha_3m = momo_i.get("Relative_Strength_Alpha_%", {}).get("3M")

        rule_breakdown = [
            {
                "rule": "Price Above 200-Day Moving Average (Long-Term Uptrend)",
                "passed": bool(isinstance(d200, (int, float)) and price > d200),
                "detail": f"Price ₹{price} vs 200-day avg ₹{d200}",
            },
            {
                "rule": "50-Day Average Above 200-Day Average (Bullish Trend Alignment)",
                "passed": bool(isinstance(d200, (int, float)) and d50 > d200),
                "detail": f"50-day avg ₹{d50} vs 200-day avg ₹{d200}",
            },
            {
                "rule": "50-Day Average is Rising (Upward Momentum)",
                "passed": bool(s50 > 0),
                "detail": f"5-day change: ₹{s50:+.2f}",
            },
            {
                "rule": "Beating Nifty 50 Over Last 3 Months (Outperforming the Market)",
                "passed": bool(alpha_3m is not None and alpha_3m > 0),
                "detail": f"3M Outperformance: {alpha_3m:+.1f}% vs Nifty" if alpha_3m is not None else "N/A",
            },
            {
                "rule": "Reasonable Valuation (Not Overpriced / P/E < 80x)",
                "passed": bool(candidate_dossier.get("fundamentals", {}).get("valuation", {}).get("risk") != "HIGH"),
                "detail": f"P/E {candidate_dossier.get('fundamentals', {}).get('valuation', {}).get('pe', 'N/A')}x ({candidate_dossier.get('fundamentals', {}).get('valuation', {}).get('category', 'Fair')})",
            },
            {
                "rule": "Active Buy Setup Triggered (Breakout or Pullback Confirmation)",
                "passed": bool(any(s.get("signal_triggered") for s in all_strat.values())),
                "detail": strat_eval.get("primary_strategy") or "No active setup",
            },
        ]

        # Check if AI dossier is available in cache
        cached_ai = AI_REPORT_CACHE["dossiers"].get(clean_sym) or AI_REPORT_CACHE["dossiers"].get(formatted_sym)

        # 4. Institutional Corporate Actions & Earnings Radar
        announcements = candidate_dossier.get("fundamentals", {}).get("recent_announcements", [])
        corporate_radar = event_engine.fetch_corporate_radar(formatted_sym, recent_announcements=announcements)

        return serialize_for_json({
            "ticker": formatted_sym,
            "dossier": candidate_dossier,
            "chart": {
                "candles": candles,
                "dma_50": dma_50_line,
                "dma_200": dma_200_line,
                "markers": chart_signal_data.get("markers", []),
            },
            "rule_breakdown": rule_breakdown,
            "corporate_radar": corporate_radar,
            "ai_dossier": cached_ai,
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stock dossier error for {ticker}: {e}")


@app.get("/api/paper-trades")
def get_paper_trades() -> List[Dict[str, Any]]:
    """Returns active and historical paper trading positions with live exit evaluations."""
    try:
        return serialize_for_json(ps.get_paper_positions(evaluate_exits=True))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Paper ledger error: {e}")


@app.get("/api/paper-trades/account")
def get_paper_account() -> Dict[str, Any]:
    """Returns real-life account equity, cash balance, and performance metrics."""
    try:
        return serialize_for_json(ps.get_paper_account())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Paper account error: {e}")


@app.post("/api/paper-trades/account/reset")
def reset_paper_account(req: PaperAccountResetRequest) -> Dict[str, Any]:
    """Resets virtual capital and optionally clears historical paper trades."""
    try:
        acc = ps.reset_paper_account(
            starting_capital=req.starting_capital,
            risk_per_trade_pct=req.risk_per_trade_pct,
            clear_ledger=req.clear_ledger,
        )
        return serialize_for_json(acc)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reset paper account: {e}")


@app.post("/api/paper-trades/account/update")
def update_paper_account(req: PaperAccountUpdateRequest) -> Dict[str, Any]:
    """Updates account starting capital and risk % without altering open positions or trade history."""
    try:
        acc = ps.update_paper_capital(
            new_starting_capital=req.starting_capital,
            risk_per_trade_pct=req.risk_per_trade_pct,
        )
        return serialize_for_json(acc)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update paper account: {e}")



@app.get("/api/paper-trades/quote")
def get_paper_trade_quote(
    ticker: str,
    portfolio_value: Optional[float] = None,
    risk_pct: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Automated Trade Setup Resolution:
    Returns live market price, technical stop loss, targets (2R/3R),
    ATR, recommended quantity, and estimated delivery transaction charges.
    """
    if not ticker or not ticker.strip():
        raise HTTPException(status_code=400, detail="Ticker symbol is required")
    try:
        quote = ps.get_trade_setup_quote(
            ticker=ticker.strip().upper(),
            portfolio_value=portfolio_value,
            risk_pct=risk_pct,
        )
        return serialize_for_json(quote)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch trade quote for {ticker}: {e}")


@app.post("/api/paper-trades/add")
def add_paper_trade(req: PaperPositionAddRequest) -> Dict[str, Any]:
    """Records a new paper trade position into the persistent ledger with targets and statutory cost calculations."""
    try:
        new_pos = ps.add_paper_position(
            ticker=req.ticker,
            entry_price=req.entry_price,
            stop_price=req.stop_price,
            quantity=req.quantity,
            strategy_name=req.strategy_name,
            target_1=req.target_1,
            target_2=req.target_2,
            order_type=req.order_type,
            entry_date=req.entry_date,
            notes=req.notes,
        )
        return serialize_for_json(new_pos)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to record paper position: {e}")


@app.post("/api/paper-trades/update-stop")
def update_paper_trade_stop(req: PaperPositionUpdateStopRequest) -> Dict[str, Any]:
    """Adjusts the stop loss on an open paper position (e.g. Trail to Breakeven)."""
    try:
        updated = ps.update_position_stop(
            position_id=req.position_id,
            new_stop_price=req.new_stop_price,
        )
        if not updated:
            raise HTTPException(status_code=404, detail="Open position not found")
        return serialize_for_json(updated)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update stop price: {e}")


@app.post("/api/paper-trades/close")
def close_paper_trade(req: PaperPositionCloseRequest) -> Dict[str, Any]:
    """Closes an open paper position (fully or partially) and records realized net P&L."""
    try:
        closed = ps.close_paper_position(
            position_id=req.position_id,
            exit_reason=req.exit_reason,
            exit_price=req.exit_price,
            quantity_to_close=req.quantity_to_close,
        )
        if not closed:
            raise HTTPException(status_code=404, detail="Open position not found")
        return serialize_for_json(closed)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to close paper position: {e}")


# =====================================================================
# SYSTEM RESTART, HEALTH & AI LIFECYCLE ENDPOINTS
# =====================================================================

@app.post("/api/ai/unload")
def unload_ai_model_endpoint() -> Dict[str, Any]:
    """Manually unloads local Qwen 3.5 AI model from GPU VRAM."""
    try:
        local_llm.stop_local_server()
        return {"status": "unloaded", "message": "Local Qwen 3.5 stopped. GPU VRAM completely freed."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to unload AI model: {e}")


@app.get("/api/system/health")
def system_health_check() -> Dict[str, Any]:
    """Lightweight health probe used by frontend during system reboot polling."""
    return {
        "status": "online",
        "timestamp": time.time(),
        "active_ai_provider": local_llm.get_active_provider(),
    }


@app.post("/api/system/restart")
def restart_entire_system() -> Dict[str, Any]:
    """
    Completely restarts the Verchon server engine, releases port 8000 & 8085,
    stops local Qwen model (freeing GPU VRAM), and boots a fresh process.
    """
    import threading
    import subprocess

    def _execute_delayed_restart():
        time.sleep(0.6)  # Allow HTTP response to be flushed to browser client
        print("\n" + "=" * 65)
        print("  [SYSTEM] Received 1-Click Complete Restart Command from UI")
        print("  [SYSTEM] Shutting down Local Qwen 3.5 AI and releasing GPU memory...")
        print("=" * 65)

        try:
            local_llm.stop_local_server()
        except Exception as e:
            print(f"  [!] Notice during AI stop: {e}")

        # Clear in-memory caches
        AI_REPORT_CACHE["macro_backdrop"] = ""
        AI_REPORT_CACHE["cross_comparison"] = ""
        AI_REPORT_CACHE["dossiers"].clear()
        AI_REPORT_CACHE["diagnostics"].clear()

        # Spawn a brand new launch.py process that waits for this PID to release port 8000
        base_dir = os.path.dirname(os.path.abspath(__file__))
        launch_script = os.path.join(base_dir, "launch.py")
        old_pid = os.getpid()

        print(f"  [SYSTEM] Spawning fresh launch.py supervisor (waiting for PID {old_pid})...")

        try:
            subprocess.Popen(
                [sys.executable, launch_script, "--wait-for-pid", str(old_pid), "--no-browser"],
                cwd=base_dir,
                creationflags=subprocess.CREATE_NEW_CONSOLE | subprocess.CREATE_NEW_PROCESS_GROUP,
                close_fds=True,
            )
        except Exception as spawn_err:
            print(f"  [!] Failed to spawn new launch instance: {spawn_err}")

        print("  [SYSTEM] Terminating previous server process. Port 8000 freed.\n")
        os._exit(0)

    threading.Thread(target=_execute_delayed_restart, daemon=True).start()

    return {
        "status": "restarting",
        "message": "Complete system restart initiated. Local AI & server rebooting.",
        "old_pid": os.getpid(),
    }


# =====================================================================
# 4. STATIC FRONTEND MOUNTING & ENTRYPOINT
# =====================================================================

dist_dir = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.exists(dist_dir):
    assets_dir = os.path.join(dist_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="API route not found")
        target = os.path.join(dist_dir, full_path)
        if full_path and os.path.exists(target) and os.path.isfile(target):
            return FileResponse(target)
        return FileResponse(os.path.join(dist_dir, "index.html"))


if __name__ == "__main__":
    import uvicorn
    print("[*] Starting Frontier Research FastAPI Server on http://localhost:8000 ...")
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)

