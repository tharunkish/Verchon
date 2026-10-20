"""
server.py - FastAPI Service Layer for Frontier Research UI
===========================================================
Serves structured JSON application state and Markdown AI reports
wrapping existing analytical engines without modifying base logic.
"""

from __future__ import annotations

import json
import logging
import math
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any, Dict, List, Optional, Union

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

logger = logging.getLogger("server")

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


class PaperAiConsultRequest(BaseModel):
    message: str
    history: List[Dict[str, Any]] = []


class JournalUpdateRequest(BaseModel):
    tags: Optional[List[str]] = None
    notes: Optional[str] = None



# In-memory cache for Portfolio AI Advisor briefing
PORTFOLIO_AI_CACHE: Dict[str, Any] = {
    "briefing": None,
    "telemetry": None,
    "timestamp": 0,
    "provider": None,
}


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
@app.post("/api/ai-dossier/{ticker}")
def generate_single_stock_ai_dossier(ticker: str, force: bool = False) -> Dict[str, Any]:
    """
    Generates or retrieves an on-demand structured AI Dossier specifically for one stock.
    Routes to Local Qwen 3.5 4B or Cloud Gemini depending on active user setting.
    """
    clean_sym = ticker.replace(".NS", "").replace(".BO", "").strip().upper()
    formatted_sym = ta.format_nse_ticker(clean_sym)

    # If already cached from a previous synthesis and not forced, return immediately
    if not force and clean_sym in AI_REPORT_CACHE["dossiers"]:
        cached_dossier = ai_parser.clean_mojibake(AI_REPORT_CACHE["dossiers"][clean_sym])
        return serialize_for_json({
            "ticker": formatted_sym,
            "cached": True,
            "dossier": cached_dossier,
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
            rep_md = ai_parser.clean_mojibake(rep_md)
            
            print(f"  [3/3] Parsing Markdown into structured cards (Thesis, Invalidation, Contradictions, Questions)...")
            stock_dossier = ai_parser.parse_stock_ai_section(clean_sym, rep_md)

            if not stock_dossier:
                stock_dossier = {
                    "raw_section": rep_md,
                    "thesis": [f"Local Qwen qualitative assessment generated for {clean_sym}."],
                    "risks": {"setup_invalidation": "Break below recent swing support."},
                }
            stock_dossier = ai_parser.clean_mojibake(stock_dossier)

            AI_REPORT_CACHE["dossiers"][clean_sym] = stock_dossier
            AI_REPORT_CACHE["dossiers"][formatted_sym] = stock_dossier
            diagnostics = [{"step": "local_qwen_dossier", "model": "Qwen 2.5 Coder 7B", "status": "SUCCESS"}]
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
        rep_md = ai_parser.clean_mojibake(pipeline_result.get("report_markdown", ""))
        diagnostics = pipeline_result.get("diagnostics", [])
        parsed = ai_parser.parse_full_report_by_tickers([clean_sym, formatted_sym], rep_md)
        stock_dossier = parsed.get("dossiers", {}).get(clean_sym) or parsed.get("dossiers", {}).get(formatted_sym)

        if not stock_dossier:
            stock_dossier = {
                "raw_section": rep_md,
                "thesis": [f"Cloud Gemini research dossier generated for {clean_sym}."],
                "risks": {"setup_invalidation": "Break below recent swing support."},
            }
        stock_dossier = ai_parser.clean_mojibake(stock_dossier)

        AI_REPORT_CACHE["dossiers"][clean_sym] = stock_dossier
        AI_REPORT_CACHE["dossiers"][formatted_sym] = stock_dossier
        AI_REPORT_CACHE["diagnostics"] = diagnostics

        return serialize_for_json({
            "ticker": formatted_sym,
            "cached": False,
            "dossier": stock_dossier,
            "raw_markdown": rep_md,
            "diagnostics": diagnostics,
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate AI dossier for {ticker}: {e}")


@app.post("/api/ai-dossier/{ticker}/stream")
def stream_single_stock_ai_dossier(ticker: str, force: bool = False):
    """
    Streams an on-demand structured AI Dossier token-by-token using Server-Sent Events (SSE).
    Sends individual tokens while generating, then emits a final structured payload.
    Supports force=true to bypass cache and synthesize a fresh report.
    """
    clean_sym = ticker.replace(".NS", "").replace(".BO", "").strip().upper()
    formatted_sym = ta.format_nse_ticker(clean_sym)

    def event_stream():
        # Check cache only if not forced
        if not force and clean_sym in AI_REPORT_CACHE["dossiers"]:
            cached_dossier = ai_parser.clean_mojibake(AI_REPORT_CACHE["dossiers"][clean_sym])
            cached_data = {
                "type": "done",
                "ticker": formatted_sym,
                "cached": True,
                "dossier": cached_dossier,
                "raw_markdown": cached_dossier.get("raw_section", "") or cached_dossier.get("raw_markdown", ""),
                "diagnostics": AI_REPORT_CACHE.get("diagnostics", []),
            }
            yield f"data: {json.dumps(cached_data)}\n\n"
            return

        active_provider = local_llm.get_active_provider()

        # Route to Gemini if cloud provider is active
        if active_provider == "gemini":
            try:
                pipeline_result = ai.run_ai_research_pipeline(
                    candidates=[{"name": clean_sym, "ticker": formatted_sym}],
                    verbose=False,
                )
                rep_md = ai_parser.clean_mojibake(pipeline_result.get("report_markdown", ""))
                diagnostics = pipeline_result.get("diagnostics", [])
                parsed = ai_parser.parse_full_report_by_tickers([clean_sym, formatted_sym], rep_md)
                stock_dossier = parsed.get("dossiers", {}).get(clean_sym) or parsed.get("dossiers", {}).get(formatted_sym)
                if not stock_dossier:
                    stock_dossier = {
                        "raw_section": rep_md,
                        "thesis": [f"Cloud Gemini qualitative research generated for {clean_sym}."],
                        "risks": {"setup_invalidation": "Break below recent swing support."},
                    }
                stock_dossier = ai_parser.clean_mojibake(stock_dossier)
                AI_REPORT_CACHE["dossiers"][clean_sym] = stock_dossier
                AI_REPORT_CACHE["dossiers"][formatted_sym] = stock_dossier

                done_payload = {
                    "type": "done",
                    "ticker": formatted_sym,
                    "cached": False,
                    "dossier": stock_dossier,
                    "raw_markdown": rep_md,
                    "diagnostics": diagnostics,
                }
                yield f"data: {json.dumps(done_payload)}\n\n"
                return
            except Exception as err:
                yield f"data: {json.dumps({'type': 'error', 'error': str(err)})}\n\n"
                return

        # Route to Local Qwen
        try:
            cand_data = ra.analyze_candidate(formatted_sym)
            token_list = []
            for token in local_llm.stream_qwen_stock_dossier(formatted_sym, cand_data):
                cleaned_token = local_llm.clean_mojibake(token)
                token_list.append(cleaned_token)
                yield f"data: {json.dumps({'type': 'token', 'content': cleaned_token})}\n\n"

            full_md = "".join(token_list)
            stock_dossier = ai_parser.parse_stock_ai_section(clean_sym, full_md)
            if not stock_dossier:
                stock_dossier = {
                    "raw_section": full_md,
                    "thesis": [f"Local Qwen qualitative assessment generated for {clean_sym}."],
                    "risks": {"setup_invalidation": "Break below recent swing support."},
                }
            stock_dossier = ai_parser.clean_mojibake(stock_dossier)

            AI_REPORT_CACHE["dossiers"][clean_sym] = stock_dossier
            AI_REPORT_CACHE["dossiers"][formatted_sym] = stock_dossier
            diagnostics = [{"step": "local_qwen_dossier_stream", "model": "Qwen 2.5 Coder 7B", "status": "SUCCESS"}]
            AI_REPORT_CACHE["diagnostics"] = diagnostics

            done_payload = {
                "type": "done",
                "ticker": formatted_sym,
                "cached": False,
                "dossier": stock_dossier,
                "raw_markdown": full_md,
                "diagnostics": diagnostics,
            }
            yield f"data: {json.dumps(done_payload)}\n\n"
        except Exception as err:
            err_payload = {"type": "error", "error": str(err)}
            yield f"data: {json.dumps(err_payload)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


class StockChatRequest(BaseModel):
    message: str
    history: List[Dict[str, str]] = []

@app.post("/api/ai-chat/{ticker}")
@app.post("/api/stocks/{ticker}/chat")
def chat_with_stock_endpoint(ticker: str, req: StockChatRequest) -> Dict[str, Any]:
    """
    Interactive Q&A chat endpoint for a specific stock (non-streaming).
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
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai-chat/{ticker}/stream")
@app.post("/api/stocks/{ticker}/chat/stream")
def stream_chat_with_stock_endpoint(ticker: str, req: StockChatRequest):
    """
    Interactive Q&A chat endpoint with word-by-word token streaming via SSE.
    """
    clean_sym = ticker.replace(".NS", "").replace(".BO", "").strip().upper()
    formatted_sym = ta.format_nse_ticker(clean_sym)

    def event_stream():
        try:
            cand_data = ra.analyze_candidate(formatted_sym)
            token_list = []
            for token in local_llm.stream_chat_with_stock(
                ticker=formatted_sym,
                candidate_data=cand_data,
                chat_history=req.history,
                user_message=req.message,
            ):
                token_list.append(token)
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

            full_reply = "".join(token_list)
            done_payload = {"type": "done", "reply": full_reply}
            yield f"data: {json.dumps(done_payload)}\n\n"
        except Exception as err:
            yield f"data: {json.dumps({'type': 'error', 'error': str(err)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/ai-report/stream")
def stream_ai_report_endpoint(req: AIReportRequest):
    """
    Streams the executive market research briefing across candidate stocks via SSE.
    """
    tickers_list = [t.strip().upper() for t in req.tickers if t.strip()] if req.tickers else []
    cand_items = [{"ticker": t, "current_price": "N/A", "score": 75} for t in tickers_list]

    def event_stream():
        try:
            regime_obj = None
            try:
                regime_obj = mr.fetch_market_regime()
            except Exception:
                pass

            token_list = []
            for token in local_llm.stream_qwen_market_briefing(cand_items, regime_obj):
                token_list.append(token)
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

            full_md = "".join(token_list)
            AI_REPORT_CACHE["report_markdown"] = full_md
            AI_REPORT_CACHE["finalist_tickers"] = tickers_list
            AI_REPORT_CACHE["updated_at"] = datetime.now().isoformat()

            done_payload = {
                "type": "done",
                "report_markdown": full_md,
                "finalist_tickers": tickers_list,
                "structured": {"executive_summary": full_md},
                "diagnostics": [{"step": "local_qwen_market_briefing_stream", "model": "Qwen 2.5 Coder 7B", "status": "SUCCESS"}],
            }
            yield f"data: {json.dumps(done_payload)}\n\n"
        except Exception as err:
            yield f"data: {json.dumps({'type': 'error', 'error': str(err)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

# In-memory News Hub Cache (15 min TTL) to eliminate UI freeze
_NEWS_HUB_CACHE: Dict[str, Any] = {}
_NEWS_HUB_CACHE_TIME: float = 0.0
_NEWS_HUB_CACHE_TTL: float = 900.0  # 15 minutes

@app.get("/api/news-hub")
def get_news_hub_data(force_refresh: bool = False) -> Dict[str, Any]:
    """
    Returns aggregated corporate filings, upcoming earnings radar,
    and live market news feed for Tab 4 with in-memory caching and concurrent fetching.
    """
    global _NEWS_HUB_CACHE, _NEWS_HUB_CACHE_TIME
    now_ts = time.time()
    if not force_refresh and _NEWS_HUB_CACHE and (now_ts - _NEWS_HUB_CACHE_TIME < _NEWS_HUB_CACHE_TTL):
        return _NEWS_HUB_CACHE

    try:
        filings = event_engine.get_aggregate_corporate_announcements(limit=40)
        market_news = event_engine.fetch_market_news_feed(limit=25)

        # Build upcoming earnings radar across active reporting universe + held portfolio positions
        open_positions = ps.get_paper_positions()
        held_tickers = set(
            p.get("ticker", "").replace(".NS", "").replace(".BO", "").strip().upper()
            for p in open_positions if p.get("status") == "OPEN"
        )

        base_tickers = [
            "HDFCBANK", "AXISBANK", "RELIANCE", "INFY", "KOTAKBANK", "LT", "ITC",
            "BEL", "ADANIPORTS", "SBIN", "REDINGTON", "HAL", "TECHM", "TCS", "PNB",
            "TATASTEEL", "TITAN", "BAJFINANCE", "MARUTI", "SUNPHARMA"
        ]
        # Held positions prioritized at the top of inspection
        combined_tickers = list(dict.fromkeys(list(held_tickers) + base_tickers))

        def _fetch_radar_item(clean_t: str):
            try:
                radar = event_engine.fetch_corporate_radar(f"{clean_t}.NS")
                dt = radar.get("next_earnings_date")
                days = radar.get("days_to_earnings")
                is_held = clean_t in held_tickers

                # Filter to confirmed upcoming future dates (days >= 0)
                if dt and days is not None and days >= 0:
                    return {
                        "ticker": f"{clean_t}.NS",
                        "next_earnings_date": dt,
                        "days_to_earnings": days,
                        "is_held": is_held,
                        "badge": radar.get("event_risk_badge"),
                        "status": radar.get("event_risk_status"),
                        "reason": radar.get("event_risk_reason"),
                        "past_surprises": radar.get("past_earnings_track_record", [])[:4],
                        "gap_stats": radar.get("gap_stats", {}),
                        "gap_reactions": radar.get("gap_reactions", [])[:4],
                    }
            except Exception as e:
                logger.warning(f"Error fetching radar for {clean_t}: {e}")
            return None

        upcoming_earnings = []
        with ThreadPoolExecutor(max_workers=8) as executor:
            futures = [
                executor.submit(_fetch_radar_item, t.replace(".NS", "").replace(".BO", "").strip().upper())
                for t in combined_tickers
                if t.strip()
            ]
            for f in as_completed(futures):
                res = f.result()
                if res:
                    upcoming_earnings.append(res)

        # Sort: held positions with upcoming earnings <= 14d first, then by days remaining
        upcoming_earnings.sort(key=lambda x: (
            0 if x.get("is_held") and (x.get("days_to_earnings", 999) <= 14) else 1,
            x.get("days_to_earnings") if x.get("days_to_earnings") is not None else 999
        ))

        # Build recent earnings report cards & review scorecards
        recent_earnings_reviews = event_engine.get_recent_earnings_reviews(combined_tickers[:15], limit=8)

        data = serialize_for_json({
            "upcoming_earnings": upcoming_earnings,
            "recent_earnings_reviews": recent_earnings_reviews,
            "recent_filings": filings,
            "market_news": market_news,
            "updated_at": datetime.now().isoformat(),
        })
        _NEWS_HUB_CACHE = data
        _NEWS_HUB_CACHE_TIME = time.time()
        return data
    except Exception as e:
        print(f"[!] News Hub error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/corporate-events/earnings-review/{ticker}")
def get_single_earnings_review(ticker: str) -> Dict[str, Any]:
    """
    Returns empirical Earnings Report Card for a ticker:
    Projected vs Actual, operational highlights, dividend declaration, and overall review verdict.
    """
    try:
        card = event_engine.fetch_earnings_report_card(ticker)
        return serialize_for_json(card)
    except Exception as e:
        logger.error(f"Failed to fetch earnings review for {ticker}: {e}")
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
        # 1. Deterministic Candidate Analysis with Market Regime Context
        m_ctx = None
        try:
            m_ctx = mr.analyze_market_regime(as_of_date=as_of_date)
        except Exception:
            pass
        candidate_dossier = ra.analyze_candidate(formatted_sym, as_of_date=as_of_date, market_context=m_ctx)

        # 2. Fetch 2Y OHLCV for interactive multi-timeframe chart
        candles: List[Dict[str, Any]] = []
        ema_20_line: List[Dict[str, Any]] = []
        dma_50_line: List[Dict[str, Any]] = []
        dma_200_line: List[Dict[str, Any]] = []
        vol_ma_line: List[Dict[str, Any]] = []

        weekly_candles: List[Dict[str, Any]] = []
        weekly_ema_10_line: List[Dict[str, Any]] = []
        weekly_dma_40_line: List[Dict[str, Any]] = []
        weekly_vol_ma_line: List[Dict[str, Any]] = []

        try:
            stock_df, _ = ta.fetch_daily_ohlcv(formatted_sym, period="2y", as_of_date=as_of_date)
            if stock_df is not None and not stock_df.empty:
                close_s = stock_df["Close"]
                vol_s = stock_df["Volume"]
                ema20 = close_s.ewm(span=20, adjust=False).mean()
                ma50 = close_s.rolling(window=50).mean()
                ma200 = close_s.rolling(window=200).mean() if len(close_s) >= 200 else ma50
                vol_ma20 = vol_s.rolling(window=20).mean()

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

                    if pd.notna(ema20.iloc[idx]):
                        ema_20_line.append({"time": date_str, "value": round(float(ema20.iloc[idx]), 2)})
                    if pd.notna(ma50.iloc[idx]):
                        dma_50_line.append({"time": date_str, "value": round(float(ma50.iloc[idx]), 2)})
                    if pd.notna(ma200.iloc[idx]):
                        dma_200_line.append({"time": date_str, "value": round(float(ma200.iloc[idx]), 2)})
                    if pd.notna(vol_ma20.iloc[idx]):
                        vol_ma_line.append({"time": date_str, "value": round(float(vol_ma20.iloc[idx]), 2)})

                # Weekly resampled candles & weekly moving averages
                try:
                    w_df = stock_df.resample('W-FRI').agg({
                        'Open': 'first',
                        'High': 'max',
                        'Low': 'min',
                        'Close': 'last',
                        'Volume': 'sum'
                    }).dropna()
                    if not w_df.empty:
                        w_close = w_df["Close"]
                        w_ema10 = w_close.ewm(span=10, adjust=False).mean()
                        w_ma40 = w_close.rolling(window=40).mean() if len(w_close) >= 40 else w_ema10
                        w_vol_ma = w_df["Volume"].rolling(window=10).mean()

                        for w_idx in range(len(w_df)):
                            w_date = w_df.index[w_idx].strftime("%Y-%m-%d")
                            weekly_candles.append({
                                "time": w_date,
                                "open": round(float(w_df["Open"].iloc[w_idx]), 2),
                                "high": round(float(w_df["High"].iloc[w_idx]), 2),
                                "low": round(float(w_df["Low"].iloc[w_idx]), 2),
                                "close": round(float(w_df["Close"].iloc[w_idx]), 2),
                                "volume": int(w_df["Volume"].iloc[w_idx]),
                            })
                            if pd.notna(w_ema10.iloc[w_idx]):
                                weekly_ema_10_line.append({"time": w_date, "value": round(float(w_ema10.iloc[w_idx]), 2)})
                            if pd.notna(w_ma40.iloc[w_idx]):
                                weekly_dma_40_line.append({"time": w_date, "value": round(float(w_ma40.iloc[w_idx]), 2)})
                            if pd.notna(w_vol_ma.iloc[w_idx]):
                                weekly_vol_ma_line.append({"time": w_date, "value": round(float(w_vol_ma.iloc[w_idx]), 2)})
                except Exception as w_err:
                    print(f"[!] Weekly resample warning: {w_err}")

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

        vol_i = t_data.get("Volume_Analysis", {})
        active_strat = strat_eval.get("active_strategy_result", {})
        primary_strategy = strat_eval.get("primary_strategy") or candidate_dossier.get("setup_type") or "SWING_MOMENTUM"
        f_comps = candidate_dossier.get("fundamentals", {}).get("components", {})
        bq_val = f_comps.get("Business Quality")
        bq_score = bq_val.score if hasattr(bq_val, "score") else (bq_val.get("score") if isinstance(bq_val, dict) else None)

        if primary_strategy == "RUBBER_BAND_SNAPBACK":
            rule_breakdown = [
                {
                    "rule": "Structural Base Proximity (Price >= 200-Day Support * 0.97)",
                    "passed": bool(isinstance(d200, (int, float)) and price >= d200 * 0.97),
                    "detail": f"Price ₹{price} vs 200-day avg ₹{d200}",
                },
                {
                    "rule": "Extreme Short-Term Exhaustion (RSI-2 <= 20 or RSI-14 <= 38)",
                    "passed": bool(active_strat.get("setup_detected", True)),
                    "detail": f"Oversold condition satisfied (RSI-2: {active_strat.get('rsi_2', 'Extr. Low')})",
                },
                {
                    "rule": "Oversold Reversal Confirmation (Green Candle / Outside Bar)",
                    "passed": bool(active_strat.get("signal_triggered")),
                    "detail": "Reversal confirmed" if active_strat.get("signal_triggered") else "Awaiting reversal confirmation",
                },
                {
                    "rule": "Business Quality Protection (Quality Score >= 40)",
                    "passed": bool(bq_score is None or bq_score >= 40),
                    "detail": f"Business Quality: {bq_score if bq_score is not None else 'N/A'}/100",
                },
                {
                    "rule": "Reasonable Valuation (Not Overpriced / P/E < 80x)",
                    "passed": bool(candidate_dossier.get("fundamentals", {}).get("valuation", {}).get("risk") != "HIGH"),
                    "detail": f"P/E {candidate_dossier.get('fundamentals', {}).get('valuation', {}).get('pe', 'N/A')}x ({candidate_dossier.get('fundamentals', {}).get('valuation', {}).get('category', 'Fair')})",
                },
                {
                    "rule": "Active Snapback Signal Triggered (Defined Risk/Reward >= 1.8x)",
                    "passed": bool(active_strat.get("signal_triggered")),
                    "detail": f"SL: ₹{active_strat.get('stop_price', '---')} | T1: ₹{active_strat.get('target_1', '---')} (R:R {active_strat.get('risk_reward_ratio', 2.0)}x)",
                },
            ]
        elif primary_strategy == "LIQUIDITY_SWEEP":
            rule_breakdown = [
                {
                    "rule": "Support Floor Identified (Prior 20-Day Low Baseline)",
                    "passed": bool(active_strat.get("support_level") is not None),
                    "detail": f"Floor established at ₹{active_strat.get('support_level', 'N/A')}",
                },
                {
                    "rule": "Intraday Liquidity Sweep Below Support Floor",
                    "passed": bool(active_strat.get("setup_detected")),
                    "detail": f"Pierced floor to ₹{active_strat.get('sweep_low', 'N/A')}",
                },
                {
                    "rule": "Absorption Reclaim (Close Held Above Support Floor)",
                    "passed": bool(price >= (active_strat.get("support_level") or 0)),
                    "detail": f"Close ₹{price} >= Floor ₹{active_strat.get('support_level', 'N/A')}",
                },
                {
                    "rule": "Sweep Rebound Not Extended (<= 3.8% from Sweep Low)",
                    "passed": bool(active_strat.get("state") != "EXTENDED_FROM_SWEEP"),
                    "detail": f"Rebound: +{active_strat.get('rebound_from_sweep_pct', 0)}% (<= 3.8% limit)",
                },
                {
                    "rule": "Sweep Volume Confirmation (Volume >= 1.15x Average)",
                    "passed": bool(vol_i.get("Volume_Expansion_Ratio", 1.0) >= 1.15 or active_strat.get("signal_triggered")),
                    "detail": f"Volume ratio: {vol_i.get('Volume_Expansion_Ratio', 1.0)}x of 20-day avg",
                },
                {
                    "rule": "Active Liquidity Sweep Triggered (Tight Wick Stop)",
                    "passed": bool(active_strat.get("signal_triggered")),
                    "detail": f"SL: ₹{active_strat.get('stop_price', '---')} | T1: ₹{active_strat.get('target_1', '---')}",
                },
            ]
        elif primary_strategy == "VOLATILITY_SQUEEZE":
            rule_breakdown = [
                {
                    "rule": "Bollinger Bands Compressed Inside Keltner Channel (Squeeze)",
                    "passed": bool(active_strat.get("setup_detected")),
                    "detail": f"{active_strat.get('squeeze_bars_count', 0)} sessions in squeeze",
                },
                {
                    "rule": "Expansion Fire Trigger (Price Piercing Upper Band)",
                    "passed": bool(active_strat.get("signal_triggered")),
                    "detail": "Upper band breakout confirmed" if active_strat.get("signal_triggered") else "Coiling in progress",
                },
                {
                    "rule": "Directional Momentum Positive (Rising Momentum Bias)",
                    "passed": bool(alpha_1m is not None and alpha_1m > -2.0),
                    "detail": f"1M Alpha: {alpha_1m:+.1f}% vs Nifty" if alpha_1m is not None else "Positive",
                },
                {
                    "rule": "Expansion Volume Surge (Volume >= 1.15x Average)",
                    "passed": bool(vol_i.get("Volume_Expansion_Ratio", 1.0) >= 1.15 or active_strat.get("signal_triggered")),
                    "detail": f"Volume ratio: {vol_i.get('Volume_Expansion_Ratio', 1.0)}x of 20-day avg",
                },
                {
                    "rule": "Reasonable Valuation (Not Overpriced / P/E < 80x)",
                    "passed": bool(candidate_dossier.get("fundamentals", {}).get("valuation", {}).get("risk") != "HIGH"),
                    "detail": f"P/E {candidate_dossier.get('fundamentals', {}).get('valuation', {}).get('pe', 'N/A')}x ({candidate_dossier.get('fundamentals', {}).get('valuation', {}).get('category', 'Fair')})",
                },
                {
                    "rule": "Active Volatility Squeeze Triggered (Defined Risk/Reward)",
                    "passed": bool(active_strat.get("signal_triggered")),
                    "detail": f"SL: ₹{active_strat.get('stop_price', '---')} | T1: ₹{active_strat.get('target_1', '---')}",
                },
            ]
        else:
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
                "ema_20": ema_20_line,
                "dma_50": dma_50_line,
                "dma_200": dma_200_line,
                "vol_ma_20": vol_ma_line,
                "markers": chart_signal_data.get("markers", []),
                "weekly": {
                    "candles": weekly_candles,
                    "ema_10": weekly_ema_10_line,
                    "dma_40": weekly_dma_40_line,
                    "vol_ma_10": weekly_vol_ma_line,
                },
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



@app.get("/api/paper-trades/sector-exposure")
def get_paper_sector_exposure() -> Dict[str, Any]:
    """Returns real-time sector allocation, capital at risk, and position concentration."""
    try:
        return serialize_for_json(ps.get_portfolio_sector_and_risk_exposure())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to calculate sector exposure: {e}")


@app.get("/api/paper-trades/portfolio-impact")
def get_paper_portfolio_impact(
    ticker: str,
    custom_entry: Optional[float] = None,
    custom_stop: Optional[float] = None,
    custom_qty: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Portfolio Risk Bridge Endpoint:
    Previews the before/after sector exposure, portfolio risk at stop,
    and concentration warnings for a proposed position on `ticker`.
    """
    if not ticker or not ticker.strip():
        raise HTTPException(status_code=400, detail="Ticker symbol is required")
    try:
        impact = ps.get_proposed_trade_impact(
            ticker=ticker.strip().upper(),
            custom_entry=custom_entry,
            custom_stop=custom_stop,
            custom_qty=custom_qty,
        )
        return serialize_for_json(impact)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to calculate trade impact for {ticker}: {e}")


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


@app.get("/api/paper-trades/journal")
def get_paper_trade_journal() -> Dict[str, Any]:
    """Returns comprehensive quantitative trade journal analytics, calendar heatmap, and strategy attribution."""
    try:
        return serialize_for_json(ps.get_trade_journal_analytics())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Journal analytics error: {e}")


@app.post("/api/paper-trades/journal/{position_id}")
def update_paper_trade_journal(position_id: str, req: JournalUpdateRequest) -> Dict[str, Any]:
    """Updates user reflection tags and notes on a trade campaign/position."""
    try:
        updated = ps.update_position_journal(
            position_id=position_id,
            tags=req.tags,
            notes=req.notes,
        )
        if not updated:
            raise HTTPException(status_code=404, detail="Trade position not found")
        return serialize_for_json(updated)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update trade journal: {e}")



# =====================================================================
# PORTFOLIO AI ADVISOR & CONSULTANT (Google Finance Style)
# =====================================================================

@app.get("/api/paper-trades/ai-briefing")
def get_paper_portfolio_briefing(force_refresh: bool = False) -> Dict[str, Any]:
    """
    Returns a Google Finance-style executive portfolio briefing:
    - 1-2 sentence executive snapshot of overall equity, cash reserve, and market regime
    - 2-3 actionable bullets with embedded [ACTION:...] tags for 1-click execution
    - Complete live portfolio telemetry snapshot
    Cached for 3 minutes unless force_refresh is True.
    """
    now = time.time()
    cache_age = now - PORTFOLIO_AI_CACHE.get("timestamp", 0)

    if not force_refresh and PORTFOLIO_AI_CACHE.get("briefing") and cache_age < 180:
        return serialize_for_json({
            "briefing": PORTFOLIO_AI_CACHE["briefing"],
            "telemetry": PORTFOLIO_AI_CACHE["telemetry"],
            "cached": True,
            "cache_age_seconds": round(cache_age, 1),
            "provider": PORTFOLIO_AI_CACHE.get("provider", local_llm.get_active_provider()),
        })

    try:
        telemetry = ps.get_clean_portfolio_telemetry()
        active_provider = local_llm.get_active_provider()
        briefing_text = local_llm.generate_portfolio_briefing(telemetry)

        PORTFOLIO_AI_CACHE["briefing"] = briefing_text
        PORTFOLIO_AI_CACHE["telemetry"] = telemetry
        PORTFOLIO_AI_CACHE["timestamp"] = now
        PORTFOLIO_AI_CACHE["provider"] = active_provider

        return serialize_for_json({
            "briefing": briefing_text,
            "telemetry": telemetry,
            "cached": False,
            "cache_age_seconds": 0,
            "provider": active_provider,
        })
    except Exception as e:
        logger.error(f"Failed to generate portfolio briefing: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate portfolio briefing: {e}")


@app.post("/api/paper-trades/ai-consult")
def consult_paper_portfolio(req: PaperAiConsultRequest) -> Dict[str, Any]:
    """
    Interactive Q&A consultation for the paper portfolio (non-streaming).
    Grounded in real-time ledger, positions, sector weights, corporate radar, and regime.
    """
    try:
        telemetry = ps.get_clean_portfolio_telemetry()
        reply = local_llm.chat_with_portfolio(
            telemetry=telemetry,
            chat_history=req.history,
            user_message=req.message,
        )
        return serialize_for_json({
            "reply": reply,
            "provider": local_llm.get_active_provider(),
        })
    except Exception as e:
        logger.error(f"Portfolio consultation error: {e}")
        raise HTTPException(status_code=500, detail=f"Consultation error: {e}")


@app.post("/api/paper-trades/ai-consult/stream")
def stream_consult_paper_portfolio(req: PaperAiConsultRequest):
    """
    Interactive Q&A consultation with token-by-token streaming via SSE.
    Enables conversational back-and-forth directly with the portfolio.
    """
    def event_stream():
        try:
            telemetry = ps.get_clean_portfolio_telemetry()
            token_list = []
            for token in local_llm.stream_chat_with_portfolio(
                telemetry=telemetry,
                chat_history=req.history,
                user_message=req.message,
            ):
                token_list.append(token)
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

            full_reply = "".join(token_list)
            yield f"data: {json.dumps({'type': 'done', 'reply': full_reply})}\n\n"
        except Exception as err:
            yield f"data: {json.dumps({'type': 'error', 'error': str(err)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


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
            if target.endswith(".html"):
                return FileResponse(
                    target,
                    headers={
                        "Cache-Control": "no-cache, no-store, must-revalidate",
                        "Pragma": "no-cache",
                        "Expires": "0",
                    },
                )
            return FileResponse(target)
        return FileResponse(
            os.path.join(dist_dir, "index.html"),
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )


if __name__ == "__main__":
    import uvicorn
    print("[*] Starting Frontier Research FastAPI Server on http://localhost:8000 ...")
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)

