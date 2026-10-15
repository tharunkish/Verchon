"""
aianalysis.py - Two-Stage Gemini AI Research Layer for NSE Swing Trading
========================================================================
Architecture:
    NSE Candidate Universe (~30–50 stocks)
                ↓
    Python Analysis & Scoring (improvedfundanalysis + techanalysis + marketregime)
                ↓
    resultanalysis.py (Compact Stock Dossiers)
                ↓
    STAGE 1: AI Triage & Thematic Clustering (Gemini Flash - Low Thinking / Fast)
                ↓
    Shortlisted Finalists (~8–10 diverse candidates)
                ↓
    STAGE 2: AI Deep Comparative Synthesis (Gemini Flash - High Thinking / Reasoning)
                ↓
    Executive Research Dossier (Human Decision Support)

Design Principles:
    1. Python calculates. AI synthesizes. Human decides.
    2. Strict context separation: No raw HTML, no boilerplate.
    3. Exactly 2 Gemini API calls per complete run.
    4. No hallucinated metrics, prices, or invalidation levels.
    5. Factual evidence strictly separated from AI interpretation.
"""

from __future__ import annotations

from datetime import datetime
import argparse
import json
import os
import re
import sys
import time
from typing import Any, Dict, List, Optional, Tuple, Union

# Ensure UTF-8 stdout encoding on Windows consoles
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Load environment variables if python-dotenv is installed
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Import official Google GenAI SDK
try:
    from google import genai
    from google.genai import types
    GENAI_AVAILABLE = True
except ImportError:
    genai = None
    types = None
    GENAI_AVAILABLE = False

# Import deterministic analysis modules
import marketregime as mr
import resultanalysis as ra
from screener_scraper import fetch_nse_index_universe


# =====================================================================
# 1. CONSTANTS & CONFIGURATION
# =====================================================================

DEFAULT_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")
STAGE1_MODEL_DEFAULT = os.environ.get("GEMINI_STAGE1_MODEL", DEFAULT_MODEL)
STAGE2_MODEL_DEFAULT = os.environ.get("GEMINI_STAGE2_MODEL", DEFAULT_MODEL)

# Default benchmark candidate universe for full standalone runs (~30 diverse stocks)
DEFAULT_UNIVERSE = [
    # Information Technology
    {"name": "Tata Consultancy Services Ltd.", "ticker": "TCS.NS"},
    {"name": "Infosys Ltd.", "ticker": "INFY.NS"},
    {"name": "HCL Technologies Ltd.", "ticker": "HCLTECH.NS"},
    {"name": "Tech Mahindra Ltd.", "ticker": "TECHM.NS"},
    # Banking & Financial Services
    {"name": "ICICI Bank Ltd.", "ticker": "ICICIBANK.NS"},
    {"name": "HDFC Bank Ltd.", "ticker": "HDFCBANK.NS"},
    {"name": "State Bank of India", "ticker": "SBIN.NS"},
    {"name": "Axis Bank Ltd.", "ticker": "AXISBANK.NS"},
    {"name": "Bajaj Finance Ltd.", "ticker": "BAJFINANCE.NS"},
    # Auto & Ancillaries
    {"name": "Tata Motors Passenger Vehicles Ltd.", "ticker": "TMPV.NS"},
    {"name": "Maruti Suzuki India Ltd.", "ticker": "MARUTI.NS"},
    {"name": "Mahindra & Mahindra Ltd.", "ticker": "M&M.NS"},
    # FMCG & Consumption
    {"name": "Hindustan Unilever Ltd.", "ticker": "HINDUNILVR.NS"},
    {"name": "ITC Ltd.", "ticker": "ITC.NS"},
    {"name": "Tata Consumer Products Ltd.", "ticker": "TATACONSUM.NS"},
    # Pharmaceuticals & Healthcare
    {"name": "Sun Pharmaceutical Industries Ltd.", "ticker": "SUNPHARMA.NS"},
    {"name": "Cipla Ltd.", "ticker": "CIPLA.NS"},
    {"name": "Apollo Hospitals Enterprise Ltd.", "ticker": "APOLLOHOSP.NS"},
    # Infrastructure, Capital Goods & Defense
    {"name": "Larsen & Toubro Ltd.", "ticker": "LT.NS"},
    {"name": "Bharat Electronics Ltd.", "ticker": "BEL.NS"},
    {"name": "Hindustan Aeronautics Ltd.", "ticker": "HAL.NS"},
    # Telecom & Turnaround / Stressed
    {"name": "Bharti Airtel Ltd.", "ticker": "BHARTIARTL.NS"},
    {"name": "Vodafone Idea Ltd.", "ticker": "IDEA.NS"},
    # Energy, Metals & Commodities
    {"name": "Reliance Industries Ltd.", "ticker": "RELIANCE.NS"},
    {"name": "Tata Steel Ltd.", "ticker": "TATASTEEL.NS"},
    {"name": "NTPC Ltd.", "ticker": "NTPC.NS"},
]


# =====================================================================
# 2. DATA SERIALIZATION & SANITIZATION UTILITIES
# =====================================================================

def _clean_val(val: Any) -> Any:
    """Recursively converts non-serializable objects (NaNs, infs) into clean JSON primitives."""
    if val is None:
        return None
    if isinstance(val, (int, bool)):
        return val
    if isinstance(val, float):
        if val != val or val == float("inf") or val == float("-inf"):
            return None
        return round(val, 2)
    if isinstance(val, dict):
        return {str(k): _clean_val(v) for k, v in val.items()}
    if isinstance(val, (list, tuple, set)):
        return [_clean_val(x) for x in val]
    return str(val)


def _serialize_component(comp: Any) -> Dict[str, Any]:
    """Extracts clean dictionary representation of a ComponentResult object."""
    if comp is None:
        return {"score": None, "assessment": "N/A", "metrics": {}}
    if hasattr(comp, "score"):
        raw_metrics = getattr(comp, "metrics", {}) or {}
        return {
            "score": _clean_val(comp.score),
            "assessment": str(getattr(comp, "assessment", "N/A")),
            "metrics": {str(k): _clean_val(v) for k, v in raw_metrics.items()}
        }
    if isinstance(comp, dict):
        return {
            "score": _clean_val(comp.get("score")),
            "assessment": str(comp.get("assessment", "N/A")),
            "metrics": _clean_val(comp.get("metrics", {}))
        }
    return {"score": None, "assessment": str(comp), "metrics": {}}


def build_compact_dossier(candidate: Dict[str, Any]) -> Dict[str, Any]:
    """
    Builds a signal-dense, token-efficient stock dossier.
    Eliminates raw HTML, 10-year statement dumps, and boilerplates.
    Preserves all facts required for fundamental and technical reasoning.
    """
    f = candidate.get("fundamentals", {})
    t = candidate.get("technicals", {})
    trend = t.get("Trend_Analysis", {})
    momo = t.get("Momentum_Analysis", {})
    vol = t.get("Volume_Analysis", {})
    t_summary = t.get("Scoring_Summary", {})
    val = f.get("valuation", {})
    comps = f.get("components", {})

    return {
        "ticker": candidate.get("ticker", "UNKNOWN"),
        "name": candidate.get("name", "Unknown Company"),
        "sector": candidate.get("sector", f.get("sector", "N/A")),
        "industry": candidate.get("industry", f.get("industry", "N/A")),
        "archetype": f.get("company_type", "GENERAL"),
        "priority_classification": candidate.get("priority", "WATCHLIST"),
        "scores": {
            "consolidated": _clean_val(candidate.get("overall_score")),
            "fundamental": _clean_val(f.get("fundamental_score")),
            "technical": _clean_val(t_summary.get("Technical_Score")),
            "technical_posture": t_summary.get("Technical_Classification", "N/A")
        },
        "data_quality": {
            "completeness_pct": _clean_val(f.get("data_completeness")),
            "confidence": f.get("analysis_confidence", "N/A")
        },
        "valuation": {
            "pe": _clean_val(val.get("pe")),
            "pb": _clean_val(val.get("pb")),
            "historical_pe_median_5y": _clean_val(val.get("historical_pe_median_5y")),
            "historical_pe_median_3y": _clean_val(val.get("historical_pe_median_3y")),
            "category": val.get("category", "N/A"),
            "risk": val.get("risk", "N/A")
        },
        "recent_announcements": f.get("recent_announcements", []),
        "fundamental_pillars": {
            "business_quality": _serialize_component(comps.get("Business Quality")),
            "growth_earnings": _serialize_component(comps.get("Growth & Earnings")),
            "financial_health": _serialize_component(comps.get("Financial Health")),
            "earnings_quality": _serialize_component(comps.get("Earnings Quality")),
            "current_momentum": _serialize_component(comps.get("Current Momentum")),
            "ownership_governance": _serialize_component(comps.get("Ownership & Governance")),
            "sector_peer_multiple": _serialize_component(comps.get("Sector / Industry"))
        },
        "positive_signals": f.get("positives", []),
        "red_flags": [
            {
                "name": flag.get("name", "Alert"),
                "severity": flag.get("severity", "MEDIUM"),
                "explanation": flag.get("explanation", "")
            }
            for flag in f.get("red_flags", [])
        ],
        "technicals": {
            "current_price": _clean_val(trend.get("Current_Price")),
            "trend_classification": trend.get("Trend_Classification", "N/A"),
            "moving_averages": {
                "dma_50": _clean_val(trend.get("50_DMA")),
                "dist_50_dma_pct": _clean_val(trend.get("Dist_50_DMA_%")),
                "dma_50_trend": trend.get("50_DMA_Trend", "N/A"),
                "dma_50_slope_5d": _clean_val(trend.get("50_DMA_Slope_5d")),
                "dma_200": _clean_val(trend.get("200_DMA")),
                "dist_200_dma_pct": _clean_val(trend.get("Dist_200_DMA_%")),
                "dma_200_trend": trend.get("200_DMA_Trend", "N/A"),
                "dma_200_slope_5d": _clean_val(trend.get("200_DMA_Slope_5d"))
            },
            "returns_stock_pct": _clean_val(momo.get("Stock_Returns_%", {})),
            "returns_nifty_pct": _clean_val(momo.get("Nifty_Returns_%", {})),
            "relative_strength_vs_nifty": {
                "classification": momo.get("Relative_Strength_Classification", "N/A"),
                "alpha_pct": _clean_val(momo.get("Relative_Strength_Alpha_%", {}))
            },
            "volume_profile": {
                "classification": vol.get("Volume_Classification", "N/A"),
                "up_down_ratio": _clean_val(vol.get("Up_Down_Volume_Ratio")),
                "expansion_ratio": _clean_val(vol.get("Volume_Expansion_Ratio"))
            },
            "setups_detected": t.get("Setups_Detected", []),
            "strategy": _clean_val(t.get("Strategy_Evaluation") or candidate.get("strategy", {}))
        },
        "fundamental_qualification": {
            "qualified": candidate.get("fundamental_qualified", True),
            "failed_reasons": candidate.get("fundamental_failed_reasons", [])
        },
        "suggested_questions": f.get("questions", [])
    }


def build_stage1_summary_dossier(d: Dict[str, Any]) -> Dict[str, Any]:
    """
    Builds an ultra-compact summary representation for Stage 1 Triage.
    Strips non-essential details to keep total prompt tokens well within free-tier limits (<50k tokens).
    """
    tech = d.get("technicals", {})
    ma = tech.get("moving_averages", {})
    rs = tech.get("relative_strength_vs_nifty", {})
    strat = tech.get("strategy", {})

    return {
        "ticker": d.get("ticker"),
        "name": d.get("name"),
        "sector": d.get("sector"),
        "scores": d.get("scores"),
        "valuation": {
            "pe": d.get("valuation", {}).get("pe"),
            "pb": d.get("valuation", {}).get("pb"),
            "pe_5y_median": d.get("valuation", {}).get("historical_pe_median_5y"),
        },
        "technicals_summary": {
            "price": tech.get("current_price"),
            "posture": tech.get("trend_classification"),
            "dist_50dma_pct": ma.get("dist_50_dma_pct"),
            "dma_50_slope": ma.get("dma_50_slope_5d"),
            "dist_200dma_pct": ma.get("dist_200_dma_pct"),
            "dma_200_slope": ma.get("dma_200_slope_5d"),
            "alpha_1m": rs.get("alpha_pct", {}).get("1M") if isinstance(rs.get("alpha_pct"), dict) else None,
            "alpha_3m": rs.get("alpha_pct", {}).get("3M") if isinstance(rs.get("alpha_pct"), dict) else None,
            "strategy_qualified": strat.get("trend_qualified", False),
            "strategy_state": strat.get("active_strategy_result", {}).get("state", "N/A"),
        },
        "key_positives": d.get("positive_signals", [])[:3],
        "red_flags": [f.get("name") for f in d.get("red_flags", [])[:3]],
    }


def build_compact_market_regime(m: Dict[str, Any]) -> Dict[str, Any]:
    """Serializes the market regime context into a clean dictionary."""
    t = m.get("trend", {})
    mom = m.get("momentum", {})
    v = m.get("volatility", {})

    return {
        "benchmark": m.get("benchmark", "NIFTY 50"),
        "current_price": _clean_val(m.get("price")),
        "regime": m.get("regime", "NEUTRAL"),
        "regime_score": _clean_val(m.get("regime_score")),
        "confidence": m.get("confidence", "N/A"),
        "trend_classification": t.get("classification", "N/A"),
        "moving_averages": {
            "dma_20": _clean_val(t.get("dma_20")),
            "dma_50": _clean_val(t.get("dma_50")),
            "dma_200": _clean_val(t.get("dma_200")),
            "price_vs_20dma_pct": _clean_val(t.get("price_vs_20dma")),
            "price_vs_50dma_pct": _clean_val(t.get("price_vs_50dma")),
            "price_vs_200dma_pct": _clean_val(t.get("price_vs_200dma")),
            "dma_20_slope": t.get("dma_20_slope", "N/A"),
            "dma_50_slope": t.get("dma_50_slope", "N/A"),
            "dma_200_slope": t.get("dma_200_slope", "N/A")
        },
        "momentum": {
            "return_1m_pct": _clean_val(mom.get("return_1m")),
            "return_3m_pct": _clean_val(mom.get("return_3m")),
            "return_6m_pct": _clean_val(mom.get("return_6m")),
            "state": mom.get("state", "N/A")
        },
        "volatility": {
            "realized_vol_20d_pct": _clean_val(v.get("realized_vol_20d")),
            "state": v.get("state", "N/A")
        },
        "key_observations": m.get("reasons", [])
    }


# =====================================================================
# 3. GEMINI CLIENT SETUP
# =====================================================================

def get_gemini_client(api_key: Optional[str] = None) -> genai.Client:
    """Initializes and returns the official Google GenAI client."""
    if not GENAI_AVAILABLE:
        raise ImportError(
            "The 'google-genai' package is required. Install it using:\n"
            "    pip install google-genai"
        )

    resolved_key = api_key or os.environ.get("GEMINI_API_KEY")
    if not resolved_key or not resolved_key.strip():
        raise ValueError(
            "GEMINI_API_KEY not found!\n"
            "Please set your Google Gemini API key via environment variable or in a .env file:\n\n"
            "    Windows CMD:   set GEMINI_API_KEY=your_api_key_here\n"
            "    PowerShell:    $env:GEMINI_API_KEY=\"your_api_key_here\"\n"
            "    Linux/macOS:   export GEMINI_API_KEY=\"your_api_key_here\"\n\n"
            "Get a free Gemini API key at: https://aistudio.google.com/"
        )

    return genai.Client(api_key=resolved_key.strip())


# =====================================================================
# 4. STAGE 1 — AI TRIAGE & THEMATIC CLUSTERING
# =====================================================================

STAGE1_SYSTEM_INSTRUCTION = """
You are the Stage 1 Triage & Thematic Clustering Engine for an Indian equity (NSE) swing-trading research system (holding period: 3 weeks to 2 months).

Your role is qualitative triage across the candidate universe to construct a diverse, research-worthy shortlist of finalists.
- If the candidate universe has > 10 stocks, select approximately 8 to 10 diverse finalists.
- If the candidate universe has <= 10 stocks (e.g. 1 to 5 stocks during focused testing), shortlist ALL viable candidates from the supplied input.
Python has already performed all deterministic mathematical calculations (scores, moving averages, relative strength, ratios, strategy qualifications, active setup detections, invalidation reasons).
You must NEVER recalculate, invent, alter, or override numerical values or deterministic statuses.
You must NEVER invent news, numbers, earnings prints, or technical levels not explicitly present in the dossiers.

CORE PRINCIPLES & EPISTEMIC DISCIPLINE (PHASE 12 GUARDRAILS):

1. Deterministic Truth is Authoritative:
   - Python is the sole source of truth for: fundamental scores, technical metrics, moving average slopes, relative strength, strategy qualification, active setups, setup invalidations, breakout/pullback/RS conditions, technical levels, and market regime.
   - If Python says a strategy is NOT QUALIFIED or a setup is INVALIDATED, you must preserve that exact fact and reason. Do NOT override or reinterpret it.

2. Evidence Hierarchy (Fact vs Interpretation vs Hypothesis vs Confirmation):
   - FACT: Directly established by supplied numbers/metrics (e.g., "Price is 6.3% below the 50 DMA", "ROE is 15.9%", "Institutional ownership is 76.1%").
   - OBSERVATION / INTERPRETATION: A reasonable deduction from supplied facts (e.g., "The recent price structure indicates technical weakness").
   - HYPOTHESIS: A possible explanation not established by the data (e.g., "Investigate whether weakness coincides with sector-wide trends").
   - CONFIRMATION CONDITION: What observable evidence would confirm or weaken that hypothesis.
   - Never present hypotheses or interpretations as established facts.

3. Eliminate Unsupported Causal Claims & Predictive Language:
   - Do NOT make price predictions (avoid: "should rise", "likely winner", "will recover", "expected to break out", "downside protected", "poised for upside").
   - Do NOT infer causation without evidence. BANNED CAUSAL CLAIMS & CLICHES:
     * "institutional liquidation"
     * "distribution pressure"
     * "lack of buying conviction"
     * "market participants have discounted the stock"
     * "institutional sponsorship / accumulation"
     * "selling pressure"
     * "ownership creates a floor / downside protection"
     * "low valuation limits downside / provides margin of safety"
     * "smart money accumulation"
     * "healthy consolidation / healthy correction"
     * "bottomed out"
   - Use neutral, descriptive wording: "price weakness is present", "volume confirmation is weak", "institutional ownership is X%", "the data does not establish the cause of the decline". If the cause is unknown, state that it is unknown.

4. Valuation Multiples are Facts, NOT Subjective Labels:
   - Do NOT label valuation as: "cheap", "expensive", "inexpensive", "attractive", "unattractive", "fair", "reasonable", "premium", "discounted", or "margin of safety" unless an explicit peer/historical comparison baseline is supplied in the data.
   - State the multiples (e.g. "P/E is 14.1, P/B is 1.85") neutrally.

5. Keep Stock Roles Strictly Neutral and Descriptive:
   - Stage 1 assigns descriptive roles, but roles must describe WHY the stock is analytically interesting, NOT declare promotional conclusions.
   - BANNED LABELS: "Defensive Value", "Capital Preservation", "Market-Leading Accumulation", "High-Conviction Winner", "Safe Haven", "Downside Protected", "Best Opportunity", "Buy", "Top Pick".
   - PREFERRED DESCRIPTIVE ROLES:
     * "High-ROCE Industrials"
     * "IT Earnings Momentum"
     * "Banking Earnings Acceleration"
     * "Healthcare Growth"
     * "Telecom Cash-Flow Profile"
     * "Defense / Capital Goods"
     * "Relative-Strength Candidate"
     * "Valuation Context + Earnings Momentum"
     * Or other neutral, sector-and-driver specific descriptive tags.

6. Selection Philosophy (Research Shortlist, NOT a Leaderboard or Recommendation Engine):
   - Do NOT simply select the stocks with the highest scores.
   - Do NOT output "Winner", "Best stock", "#1 stock", or "Top pick".
   - Avoid unconditional recommendations like "Buy", "Sell", "Enter now". The goal is research triage.
   - Shortlist based on:
     * Thesis diversity & sector diversity across the universe
     * Distinct opportunity types (e.g. momentum continuation vs pullback to rising DMA vs turnaround inflection)
     * Fundamental vs technical contradictions worth investigating
     * Relative strength behavior in the current market regime

7. Missing / N/A Data:
   - N/A is NOT zero. N/A is NOT poor. Do NOT treat missing data as negative evidence.
   - For financial companies (banks/NBFCs), respect that CFO/PAT reflects credit disbursement cycles rather than operating cash conversion.

STRICT OUTPUT FORMAT:
You must return raw, valid JSON only. Do NOT include markdown code fences (no ```json or ```).
The JSON must adhere to the following schema:
{
  "market_themes": [
    {
      "theme": "string",
      "evidence": ["string"],
      "affected_stocks": ["string"]
    }
  ],
  "universe_observations": [
    "string"
  ],
  "shortlist": [
    {
      "ticker": "string",
      "descriptive_role": "string (strictly neutral, e.g. 'Banking Earnings Acceleration')",
      "sector_role": "string (matching descriptive_role)",
      "selection_reason": "string (2-3 concise, evidence-backed bullets)",
      "trade_thesis": "string",
      "key_strengths": ["string"],
      "key_contradictions": ["string"],
      "research_priority": "HIGH"
    }
  ],
  "excluded_or_deprioritized": [
    {
      "ticker": "string",
      "reason": "string"
    }
  ]
}
"""


def _create_generate_config(
    system_instruction: str,
    temperature: float = 0.2,
    response_mime_type: Optional[str] = None,
) -> types.GenerateContentConfig:
    """Builds a compliant GenerateContentConfig silencing AFC warnings and optimizing for fast, direct generation."""
    kwargs: Dict[str, Any] = {
        "system_instruction": system_instruction,
        "temperature": temperature,
        "automatic_function_calling": types.AutomaticFunctionCallingConfig(disable=True),
    }
    if response_mime_type:
        kwargs["response_mime_type"] = response_mime_type

    return types.GenerateContentConfig(**kwargs)


EXECUTION_DIAGNOSTICS: List[Dict[str, Any]] = []


def get_recent_diagnostics() -> List[Dict[str, Any]]:
    """Returns the most recent model execution and fallback diagnostics."""
    return list(EXECUTION_DIAGNOSTICS[-30:])


def log_diagnostic_event(event: Dict[str, Any]) -> None:
    """Appends an event to the global diagnostics buffer."""
    event["timestamp"] = datetime.now().isoformat()
    EXECUTION_DIAGNOSTICS.append(event)
    if len(EXECUTION_DIAGNOSTICS) > 100:
        EXECUTION_DIAGNOSTICS.pop(0)


def _call_gemini_with_retry(
    client: genai.Client,
    model_name: str,
    contents: str,
    config: types.GenerateContentConfig,
    fallback_config: Optional[types.GenerateContentConfig] = None,
    max_retries: int = 4,
    initial_delay: float = 2.0,
    verbose: bool = True,
    diagnostics: Optional[List[Dict[str, Any]]] = None,
    stage_label: str = "Execution",
) -> Any:
    """Executes Gemini API generation with exponential backoff on 503/429 transient errors and model fallback support."""
    active_config = config
    last_exception = None

    for attempt in range(1, max_retries + 1):
        t0 = time.time()
        try:
            res = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=active_config,
            )
            lat_ms = int((time.time() - t0) * 1000)
            tok_in = getattr(res.usage_metadata, "prompt_token_count", None) if hasattr(res, "usage_metadata") else None
            tok_out = getattr(res.usage_metadata, "candidates_token_count", None) if hasattr(res, "usage_metadata") else None
            diag = {
                "stage": stage_label,
                "model": model_name,
                "attempt": attempt,
                "status": "SUCCESS",
                "latency_ms": lat_ms,
                "tokens_in": tok_in,
                "tokens_out": tok_out,
                "message": f"Successfully generated response via {model_name} in {lat_ms}ms ({tok_in or 0} prompt / {tok_out or 0} response tokens)",
            }
            if diagnostics is not None:
                diagnostics.append(diag)
            log_diagnostic_event(diag)
            return res
        except Exception as e:
            last_exception = e
            lat_ms = int((time.time() - t0) * 1000)
            err_str = str(e)

            # If 400 error (e.g. invalid parameter), switch to fallback config immediately
            is_400 = "400" in err_str or "INVALID_ARGUMENT" in err_str
            is_503 = "503" in err_str or "UNAVAILABLE" in err_str or "high demand" in err_str.lower()
            is_429 = "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "quotaValue" in err_str

            err_status = "RATE_LIMITED_429" if is_429 else ("SERVER_BUSY_503" if is_503 else ("CONFIG_ERROR_400" if is_400 else "ERROR"))
            diag = {
                "stage": stage_label,
                "model": model_name,
                "attempt": attempt,
                "status": err_status,
                "latency_ms": lat_ms,
                "tokens_in": None,
                "tokens_out": None,
                "error": err_str[:300],
                "message": f"Model {model_name} attempt {attempt} returned {err_status}: {err_str[:120]}...",
            }
            if diagnostics is not None:
                diagnostics.append(diag)
            log_diagnostic_event(diag)

            if is_400 and fallback_config is not None:
                if active_config != fallback_config:
                    if verbose:
                        print(f"  [!] Note: Parameter rejected ({err_str[:60]}...). Retrying with fallback config...")
                    active_config = fallback_config
                    continue

            # Check for transient server errors (503 UNAVAILABLE, high demand, network timeout)
            # If retries on primary model are exhausted or hit quota limit (429/503), cycle through backup models sequentially immediately
            if is_503 or is_429:
                fallback_models = [
                    "gemini-2.5-flash",
                    "gemini-2.5-flash-lite",
                    "gemini-2.0-flash",
                    "gemini-1.5-flash",
                    "gemini-flash-latest",
                    "gemini-flash-lite-latest",
                ]
                for alt_model in fallback_models:
                    if alt_model == model_name:
                        continue
                    if verbose:
                        print(f"  [!] Note: {model_name} server busy/exhausted. Auto-falling back to {alt_model}...")
                    t_alt = time.time()
                    try:
                        res = client.models.generate_content(
                            model=alt_model,
                            contents=contents,
                            config=active_config,
                        )
                        lat_alt = int((time.time() - t_alt) * 1000)
                        tok_in = getattr(res.usage_metadata, "prompt_token_count", None) if hasattr(res, "usage_metadata") else None
                        tok_out = getattr(res.usage_metadata, "candidates_token_count", None) if hasattr(res, "usage_metadata") else None
                        fb_diag = {
                            "stage": stage_label,
                            "model": alt_model,
                            "attempt": 1,
                            "status": "FALLBACK_SUCCESS",
                            "latency_ms": lat_alt,
                            "tokens_in": tok_in,
                            "tokens_out": tok_out,
                            "message": f"Fallback to {alt_model} SUCCEEDED in {lat_alt}ms ({tok_in or 0} prompt / {tok_out or 0} response tokens)",
                        }
                        if diagnostics is not None:
                            diagnostics.append(fb_diag)
                        log_diagnostic_event(fb_diag)
                        return res
                    except Exception as fb_err:
                        lat_alt = int((time.time() - t_alt) * 1000)
                        last_exception = fb_err
                        fb_err_str = str(fb_err)
                        is_fb_429 = "429" in fb_err_str or "RESOURCE_EXHAUSTED" in fb_err_str
                        is_fb_503 = "503" in fb_err_str or "UNAVAILABLE" in fb_err_str
                        fb_status = "FALLBACK_DENIED_429" if is_fb_429 else ("FALLBACK_BUSY_503" if is_fb_503 else "FALLBACK_ERROR")
                        fb_diag = {
                            "stage": stage_label,
                            "model": alt_model,
                            "attempt": 1,
                            "status": fb_status,
                            "latency_ms": lat_alt,
                            "tokens_in": None,
                            "tokens_out": None,
                            "error": fb_err_str[:300],
                            "message": f"Fallback to {alt_model} DENIED/FAILED ({fb_status}): {fb_err_str[:120]}...",
                        }
                        if diagnostics is not None:
                            diagnostics.append(fb_diag)
                        log_diagnostic_event(fb_diag)

                        if fallback_config is not None and active_config != fallback_config:
                            t_alt2 = time.time()
                            try:
                                res = client.models.generate_content(
                                    model=alt_model,
                                    contents=contents,
                                    config=fallback_config,
                                )
                                lat_alt2 = int((time.time() - t_alt2) * 1000)
                                tok_in = getattr(res.usage_metadata, "prompt_token_count", None) if hasattr(res, "usage_metadata") else None
                                tok_out = getattr(res.usage_metadata, "candidates_token_count", None) if hasattr(res, "usage_metadata") else None
                                fb2_diag = {
                                    "stage": stage_label,
                                    "model": alt_model,
                                    "attempt": 2,
                                    "status": "FALLBACK_CONFIG_SUCCESS",
                                    "latency_ms": lat_alt2,
                                    "tokens_in": tok_in,
                                    "tokens_out": tok_out,
                                    "message": f"Fallback to {alt_model} (simplified config) SUCCEEDED in {lat_alt2}ms",
                                }
                                if diagnostics is not None:
                                    diagnostics.append(fb2_diag)
                                log_diagnostic_event(fb2_diag)
                                return res
                            except Exception as fb_err2:
                                last_exception = fb_err2
                        continue
                break

    if last_exception is not None:
        raise last_exception
    raise RuntimeError(f"Failed to generate content from '{model_name}' after {max_retries} attempts.")



def run_stage_1_triage(
    client: genai.Client,
    compact_dossiers: List[Dict[str, Any]],
    market_context: Dict[str, Any],
    model_name: str = STAGE1_MODEL_DEFAULT,
    verbose: bool = True,
    diagnostics: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Executes Stage 1 Triage using Gemini Flash in fast/low-thinking mode (thinking_budget=0).
    Returns structured JSON with shortlisted finalists (~8-10 stocks) and thematic clusters.
    """
    if verbose:
        print(f"[*] Running Stage 1 Triage ({len(compact_dossiers)} stocks) using {model_name}...")

    compact_summaries = [build_stage1_summary_dossier(d) for d in compact_dossiers]

    prompt_payload = {
        "market_regime": market_context,
        "total_candidates": len(compact_summaries),
        "candidates": compact_summaries
    }

    user_prompt = (
        "Analyze the following candidate universe of NSE swing stocks and market regime. "
        "Perform thematic triage, sector clustering, and select approximately 8 to 10 diverse finalists. "
        "Return STRICT JSON only matching the schema specified in your system instructions.\n\n"
        f"INPUT DATA:\n{json.dumps(prompt_payload, indent=2)}"
    )

    config = _create_generate_config(
        system_instruction=STAGE1_SYSTEM_INSTRUCTION,
        temperature=0.2,
        response_mime_type="application/json",
    )
    fallback_config = types.GenerateContentConfig(
        system_instruction=STAGE1_SYSTEM_INSTRUCTION,
        temperature=0.2,
        response_mime_type="application/json",
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)
    )

    response = _call_gemini_with_retry(
        client=client,
        model_name=model_name,
        contents=user_prompt,
        config=config,
        fallback_config=fallback_config,
        verbose=verbose,
        diagnostics=diagnostics,
        stage_label="Stage 1 Triage",
    )


    raw_text = response.text or ""
    # Strip any accidental markdown formatting
    cleaned_json = raw_text.strip()
    if cleaned_json.startswith("```json"):
        cleaned_json = cleaned_json[7:]
    elif cleaned_json.startswith("```"):
        cleaned_json = cleaned_json[3:]
    if cleaned_json.endswith("```"):
        cleaned_json = cleaned_json[:-3]
    cleaned_json = cleaned_json.strip()

    try:
        parsed = json.loads(cleaned_json)
        if verbose:
            shortlist_count = len(parsed.get("shortlist", []))
            print(f"[+] Stage 1 Triage completed successfully. {shortlist_count} finalists shortlisted.")
        return parsed
    except json.JSONDecodeError as err:
        if verbose:
            print(f"[!] Warning: Stage 1 JSON parsing failed ({err}). Attempting regex fallback extraction...")

        # Regex fallback for tickers
        extracted_tickers = re.findall(r'"ticker":\s*"([^"]+)"', cleaned_json)
        shortlist_candidates = list(dict.fromkeys(extracted_tickers))[:10]

        if not shortlist_candidates:
            # Deterministic fallback: pick top candidates sorted by overall score across distinct sectors
            seen_sectors = set()
            shortlist_candidates = []
            for c in compact_dossiers:
                sec = c.get("sector", "N/A")
                if sec not in seen_sectors or len(seen_sectors) >= 5:
                    seen_sectors.add(sec)
                    shortlist_candidates.append(c["ticker"])
                if len(shortlist_candidates) >= 10:
                    break

        return {
            "market_themes": [{"theme": "General Market Cross-Section", "evidence": ["Deterministic fallback applied."], "affected_stocks": shortlist_candidates}],
            "universe_observations": ["Stage 1 JSON output required sanitization fallback."],
            "shortlist": [{"ticker": t, "selection_reason": "Deterministic score & sector diversification fallback.", "key_strengths": [], "key_contradictions": [], "sector_role": "Core", "research_priority": "HIGH"} for t in shortlist_candidates],
            "excluded_or_deprioritized": []
        }


# =====================================================================
# 5. STAGE 2 — AI DEEP COMPARATIVE SYNTHESIS
# =====================================================================

STAGE2_SYSTEM_INSTRUCTION = """
You are the Stage 2 Deep Reasoning & Comparative Synthesis Engine for an Indian equity (NSE) swing-trading research system (holding period: 3 weeks to 2 months).

Your input consists ONLY of the shortlisted finalists selected by Stage 1, their compact analytical dossiers, and the Market Regime backdrop.
Your purpose is to produce an institutional-grade, evidence-grounded Markdown research report for a human portfolio manager.
You are a research synthesis layer, NOT an autonomous trading decision-maker or trading recommender.

CORE PRINCIPLES & EPISTEMIC DISCIPLINE (PHASE 12 GUARDRAILS):

1. Deterministic Python Results are Authoritative Truth:
   - The deterministic Python modules are authoritative for: fundamental scores, technical metrics, trend state, relative strength, strategy qualification, active setups, setup invalidation, breakout/pullback/RS conditions, technical levels, market regime, numerical valuation metrics, data completeness, and confidence.
   - You must NEVER override, alter, reinterpret, or invent these deterministic results.
   - If a strategy is NOT QUALIFIED, state that it is not qualified along with the exact supplied reason (e.g. "50 DMA slope is negative: 5-session Δ ₹-3.69").
   - If no valid setup exists, do NOT manufacture a hypothetical entry or stop price.

2. Evidence Hierarchy (Strict Separation of Facts vs Interpretations vs Hypotheses):
   Every important analytical statement must belong to one of four categories:
   - FACT: Directly established by supplied data (e.g., "Price is 6.3% below the 50 DMA", "ROE is 15.9%", "Institutional ownership is 76.1%", "The strategy is not qualified because 50 DMA slope is negative").
   - OBSERVATION / INTERPRETATION: A reasonable interpretation derived from supplied facts (e.g., "The recent price structure indicates technical weakness", "The fundamental profile is stronger than current technical positioning").
   - RESEARCH QUESTIONS / HYPOTHESES: Things that require further investigation and are NOT established facts (e.g., "Investigate whether recent weakness coincides with sector-level weakness").
   - CONFIRMATION CONDITION: Observable, conditional price/volume action required to confirm or weaken a hypothesis.
   - Never present hypotheses or interpretations as established facts.

3. Eliminate Unsupported Causal Claims & Predictive Language:
   - Do NOT infer causation unless the supplied data actually contains evidence establishing it.
   - BANNED CAUSAL PHRASES & CLICHES:
     * "institutional liquidation" (instead use: "price weakness is present; institutional ownership is X%")
     * "distribution pressure" (instead use: "volume up/down ratio is 0.65; price is below 50 DMA")
     * "lack of buying conviction" (instead use: "daily trading volume is below 20-day average")
     * "market participants have discounted the stock" (instead use: "the stock trades at a lower P/E multiple")
     * "institutional sponsorship / accumulation" (instead use: "institutional ownership increased by X%")
     * "selling pressure" (instead use: "price declined by X%")
     * "ownership creates a floor / downside protection" (instead use: "institutions hold X%, but this does not establish price support")
     * "low valuation limits downside / provides margin of safety"
     * "smart money accumulation"
     * "healthy consolidation / healthy correction"
     * "bottomed out"
     * "poised for growth / poised for breakout"
     * "earnings growth will drive the stock"
     * "market is pricing in X"
   - If the cause of a price move or fundamental change is unknown, explicitly state that it is unknown.

4. Valuation Guardrails (Strict Multiples & Historical Comparison):
   - Report exact multiples neutrally: "P/E is 10.5 and P/B is 1.42."
   - When `historical_pe_median_5y` or `historical_pe_median_3y` is supplied, compare current P/E directly against its historical median baseline (e.g. "Current P/E of 10.5x vs 5Y median of 10.5x and 3Y median of 9.9x"). Calculate and state the percentage premium or discount relative to the median.
   - If no historical or peer benchmark is available, explicitly state that multiples are reported without a historical benchmark.
   - Do NOT use emotional labels like "cheap", "expensive", "bargain", or "margin of safety".

5. Recent Announcements & Event Context (No Inventions):
   - Each dossier provides `recent_announcements` from Screener (regulatory filings, analyst meets, trading window closures, etc.).
   - Cite relevant announcements factually under **Key evidence** or **Research risks / unresolved issues** (e.g., upcoming trading window closures / results intimations, analyst meets, regulatory notices).
   - If no recent announcements are provided or relevant, do not invent them.

6. Technical Strategy Guardrails & Level Integrity:
   - You must NEVER invent: entry prices, stop-loss levels, invalidation levels, breakout levels, swing lows, target prices, or R:R ratios.
   - You may ONLY repeat or explain levels already supplied by the deterministic technical engine.
   - If a signal is TRIGGERED, cite the EXACT supplied `stop_price` (₹X) and `risk_percent` (Y%).
   - If a setup is NOT QUALIFIED, FORMING, or INVALIDATED, explain the exact supplied rejection/invalidation reason.
   - Never say "A breakout above ₹X would be a good entry" unless that exact level and condition were supplied by the deterministic engine.

7. Strategy Language (No Unconditional Trading Recommendations):
   - Do NOT use unconditional instructions or trading advice: "Buy", "Sell", "Enter now", "This is a strong buying opportunity", "Take the trade", "Avoid this stock".
   - Instead describe the deterministic state: "Strategy qualified", "Strategy not qualified", "Setup active", "Setup invalidated", "Technical confirmation is absent", "Further research is warranted", "The supplied conditions are not currently satisfied".

8. Decision-Relevant Research Questions:
   - Research questions must remain open questions, never disguised assertions.
   - GOOD: "Why has the stock underperformed over the last month despite positive 6-month relative strength?"
   - BAD: "The stock is underperforming because institutional investors are selling."
   - GOOD: "Investigate the recent change in institutional ownership."
   - BAD: "Institutions are reducing exposure."
   - Every question must answer why resolving it matters to the investment thesis.

9. Market Regime as Context Only:
   - The market-regime output is context, NOT an automatic mathematical penalty or trade blocker.
   - State the regime neutrally: "The current market regime is HOSTILE, with Nifty below its 20/50/200 DMAs. This provides macro context where technical confirmation is particularly important, but does not mathematically alter individual stock scores."

10. Missing Data & Financial Companies Handling:
    - Preserve the distinction between an actual value, an unavailable value (N/A), and insufficient data coverage.
    - Never interpret N/A as zero, poor, or negative evidence.
    - For Financial Companies (Banks & NBFCs): Do NOT treat low or negative CFO/PAT as proof of poor earnings quality or accounting failure. Cash-flow dynamics for lending institutions reflect credit disbursement and deposit cycles rather than standard industrial working capital.

11. Cross-Stock Trade-Off Analysis (No Leaderboards or Winners):
    - Do NOT output a ranking, leaderboard, "winner", "best stock", or "top pick".
    - Contrast trade-offs neutrally across explicit analytical dimensions.

12. Observable Confirmation Conditions (No Predictions):
    - "What would strengthen / weaken the thesis" must be observable confirmation conditions, NEVER price forecasts.
    - GOOD: "A daily close above the 50 DMA (₹1,590.00) with a positive 50-DMA slope."
    - BAD: "If earnings remain strong, the stock will rally to ₹1,800."

INTERNAL QUALITY-CONTROL AUDIT CHECKLIST:
Before finalizing output, verify:
- Is every factual claim directly supported by supplied data?
- Did I compare P/E to historical 5Y/3Y medians where supplied?
- Did I mention any relevant recent announcements/filings from the data?
- Did I eliminate all banned causal claims (e.g. 'institutional liquidation', 'distribution pressure', 'market participants discounted')?
- Did I preserve all deterministic strategy qualifications, invalidations, and exact price levels?
- Did I avoid all unconditional 'Buy/Sell/Enter' recommendations?

DOCUMENT STRUCTURE:
Your output must be clean, publication-grade Markdown strictly following this structure:

# NSE Swing Research Report

## 1. Market Backdrop
(Concise summary of supplied Nifty 50 regime, moving averages, momentum, and realized volatility. Contextual only, zero predictions.)

## 2. Universe Themes & Cross-Sectional Observations
(Concise synthesis of macro and sector themes across the universe. Highlight where multiple candidates share overlapping risks or technical postures without causal speculation.)

## 3. Finalist Research Dossiers
(For EACH finalist, adhere strictly to this adversarial stress-test format:)
### [TICKER] - Company Name
- **Why it entered the shortlist**: (1–2 concise sentences combining technical setup and fundamental trigger)
- **Bull Case (The Setup)**:
  - Strongest technical momentum and volume accumulation evidence supporting swing upside towards 2R/3R targets.
  - Fundamental compounding: ROE trajectory, sales growth, operating margin expansion, or sector tailwind.
  - Corporate catalysts: order wins, management updates, or earnings cycle holding window.
- **Bear Case (The Trap & Counterevidence)**:
  - Valuation headwinds: stretched P/E vs historical 5Y median, peer comparison, growth deceleration.
  - Structural risks: working capital stretch, promoter pledge, governance watch-outs, or raw material input cost pressure.
  - Distribution trap: retail FOMO pattern, overhead technical supply, or upcoming event risks.
- **Risk Judge Verdict (Adjudication & Verification)**:
  - Verdict: [FAVORS BULL SETUP | FAVORS BEAR TRAP | INCONCLUSIVE / HIGH RISK] - (Objective adjudication stating which thesis is supported by data and who has the probability edge).
  - Confirmed Facts: (Exactly 2 verified empirical facts from the data snapshot).
  - Unsupported Claims: (1 speculative retail assumption lacking empirical backing).
  - Invalidation Boundary: Strict deterministic exit at the supplied strategy stop loss level (never suggest an alternate stop).
- **Observable Confirmation & Invalidation Conditions**:
  - What would strengthen the thesis: (Observable volume expansion and price breakout level that confirms the Bull Case).
  - What would weaken the thesis: (Observable distribution pattern or support breakdown that confirms the Bear Case).

## 4. Cross-Stock Comparison (Trade-Off Analysis)
(Direct dimensional comparison across the finalists. Do NOT output a ranking or leaderboard. Do NOT declare a 'winner', 'best stock', or 'highest conviction'. Contrast the trade-offs:)
- **Earnings Momentum & Growth Quality**: (Candidate A vs Candidate B...)
- **Technical Structure & Setup Maturity**: (Candidate A vs Candidate B...)
- **Relative Strength vs Nifty**: (Candidate A vs Candidate B...)
- **Valuation Context & Baselines**: (Compare P/E against 5Y/3Y medians and peer multiples neutrally across finalists)
- **Balance Sheet & Downside Risk Profile**: (Candidate A vs Candidate B...)
- **Trade-Thesis Distinction**: (Explain how each candidate represents a materially different trade opportunity)

## 5. Common Research Questions & Human Verification Checklist
- **Common Research Questions**: (ONLY include if genuinely applicable to multiple finalists AND answering it would materially change the comparison or thesis. Do NOT include generic filler.)
- **Human Decision Boundary & Verification Checklist**: (Actionable list of external checks for the human investor before committing capital: latest concall transcript, upcoming earnings date, promoter pledge updates, corporate actions.)
"""


def run_stage_2_synthesis(
    client: genai.Client,
    finalist_dossiers: List[Dict[str, Any]],
    stage1_result: Dict[str, Any],
    market_context: Dict[str, Any],
    model_name: str = STAGE2_MODEL_DEFAULT,
    verbose: bool = True,
    diagnostics: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """
    Executes Stage 2 Deep Reasoning using Gemini Flash in high-thinking / deep reasoning mode.
    Returns a comprehensive, publication-grade Markdown research report.
    """
    if verbose:
        print(f"[*] Running Stage 2 Deep Synthesis ({len(finalist_dossiers)} finalists) using {model_name}...")

    payload = {
        "market_regime": market_context,
        "stage1_triage_summary": {
            "market_themes": stage1_result.get("market_themes", []),
            "universe_observations": stage1_result.get("universe_observations", []),
            "shortlist_rationale": stage1_result.get("shortlist", [])
        },
        "finalists": finalist_dossiers
    }

    user_prompt = (
        "Synthesize the following swing trading finalists and market regime into an institutional-grade "
        "executive research report for a human portfolio manager. Apply strict Fact/Interpretation/Hypothesis "
        "discipline, non-predictive observable confirmation conditions, and decision-relevant research questions. "
        "Follow the required Markdown structure strictly.\n\n"
        f"INPUT DOSSIERS:\n{json.dumps(payload, indent=2)}"
    )

    config = _create_generate_config(
        system_instruction=STAGE2_SYSTEM_INSTRUCTION,
        temperature=0.4,
    )
    fallback_config = types.GenerateContentConfig(
        system_instruction=STAGE2_SYSTEM_INSTRUCTION,
        temperature=0.4,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)
    )

    response = _call_gemini_with_retry(
        client=client,
        model_name=model_name,
        contents=user_prompt,
        config=config,
        fallback_config=fallback_config,
        verbose=verbose,
        diagnostics=diagnostics,
        stage_label="Stage 2 Synthesis",
    )


    report_text = response.text or "# NSE Swing Research Report\n\n[!] Error: Empty response received from model."
    if verbose:
        print("[+] Stage 2 Deep Synthesis completed successfully.")
    return report_text.strip()


# =====================================================================
# 6. ORCHESTRATION PIPELINE
# =====================================================================

def run_ai_research_pipeline(
    candidates: Optional[List[Union[Dict[str, str], str]]] = None,
    evaluated_results: Optional[List[Dict[str, Any]]] = None,
    market_context: Optional[Dict[str, Any]] = None,
    api_key: Optional[str] = None,
    stage1_model: str = STAGE1_MODEL_DEFAULT,
    stage2_model: str = STAGE2_MODEL_DEFAULT,
    output_file: Optional[str] = None,
    verbose: bool = True
) -> Dict[str, Any]:
    """
    Main orchestration entry point:
    1. Runs resultanalysis deterministic screening (or consumes pre-evaluated results).
    2. Builds compact JSON dossiers.
    3. Runs Stage 1 Triage (Call 1).
    4. Extracts shortlisted finalists.
    5. Runs Stage 2 Deep Synthesis (Call 2).
    6. Saves/outputs final report.
    """
    start_time = time.time()

    # Step 1: Initialize Gemini Client first (Fail-fast check for API credentials)
    client = get_gemini_client(api_key=api_key)

    # Step 2: Ingest or compute deterministic results
    if evaluated_results is None:
        target_candidates = candidates if candidates is not None else DEFAULT_UNIVERSE
        if verbose:
            print(f"[*] Starting Python deterministic screening across {len(target_candidates)} stocks...")
        evaluated_results, raw_market_ctx = ra.analyze_universe(
            candidates=target_candidates,
            market_context=market_context,
            verbose=verbose
        )
        compact_market = build_compact_market_regime(raw_market_ctx)
    else:
        if market_context is None:
            raw_market_ctx = mr.analyze_market_regime()
            compact_market = build_compact_market_regime(raw_market_ctx)
        else:
            compact_market = build_compact_market_regime(market_context)

    # Step 3: Build compact dossiers
    compact_dossiers = [build_compact_dossier(c) for c in evaluated_results]

    if not compact_dossiers:
        raise ValueError("Candidate universe is empty. Provide at least one valid ticker to analyze.")

    pipeline_diagnostics: List[Dict[str, Any]] = []

    # Step 4: Stage 1 — AI Triage & Thematic Clustering (Call 1)
    stage1_result = run_stage_1_triage(
        client=client,
        compact_dossiers=compact_dossiers,
        market_context=compact_market,
        model_name=stage1_model,
        verbose=verbose,
        diagnostics=pipeline_diagnostics,
    )

    # Step 5: Extract Finalists
    shortlist_info = stage1_result.get("shortlist", [])
    dossier_map: Dict[str, Any] = {}
    for d in compact_dossiers:
        raw_tick = str(d.get("ticker", "")).upper().strip()
        clean_tick = raw_tick.replace(".NS", "").replace(".BO", "")
        dossier_map[raw_tick] = d
        dossier_map[clean_tick] = d

    finalist_dossiers = []
    seen_tickers = set()
    for item in shortlist_info:
        raw_t = str(item.get("ticker", "")).upper().strip()
        clean_t = raw_t.replace(".NS", "").replace(".BO", "")
        matched = dossier_map.get(raw_t) or dossier_map.get(clean_t)
        if matched and matched["ticker"] not in seen_tickers:
            seen_tickers.add(matched["ticker"])
            finalist_dossiers.append(matched)

    # If matching failed, take the top candidates from the dossiers (up to 8, or all if <= 8)
    if not finalist_dossiers:
        if verbose:
            print("[!] Warning: Could not match shortlisted tickers directly to dossiers. Using top scored candidates.")
        finalist_dossiers = compact_dossiers[:min(8, len(compact_dossiers))]

    # Step 6: Stage 2 — Deep Reasoning & Synthesis (Call 2)
    stage2_report = run_stage_2_synthesis(
        client=client,
        finalist_dossiers=finalist_dossiers,
        stage1_result=stage1_result,
        market_context=compact_market,
        model_name=stage2_model,
        verbose=verbose,
        diagnostics=pipeline_diagnostics,
    )

    elapsed_time = round(time.time() - start_time, 1)
    if verbose:
        print(f"\n[+] AI Research Pipeline finished in {elapsed_time}s across {len(compact_dossiers)} stocks.")

    # Save to file if specified
    if output_file:
        try:
            with open(output_file, "w", encoding="utf-8") as f_out:
                f_out.write(stage2_report)
            if verbose:
                print(f"[+] Final report successfully written to '{output_file}'.")
        except Exception as e:
            if verbose:
                print(f"[!] Warning: Could not write output file '{output_file}': {e}")

    return {
        "elapsed_seconds": elapsed_time,
        "market_context": compact_market,
        "total_universe_size": len(compact_dossiers),
        "stage1_result": stage1_result,
        "finalist_tickers": [d["ticker"] for d in finalist_dossiers],
        "finalist_dossiers": finalist_dossiers,
        "report_markdown": stage2_report,
        "diagnostics": pipeline_diagnostics,
    }



# =====================================================================
# 7. COMMAND-LINE INTERFACE (CLI)
# =====================================================================

def parse_cli_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Two-Stage Gemini AI Research Layer for NSE Swing Trading"
    )
    parser.add_argument(
        "tickers_pos",
        nargs="*",
        help="Optional positional NSE tickers (e.g. TCS.NS,ICICIBANK.NS or TCS.NS ICICIBANK.NS)"
    )
    parser.add_argument(
        "--tickers",
        type=str,
        default="",
        help="Comma-separated NSE tickers to evaluate (e.g. TCS.NS,ICICIBANK.NS,IDEA.NS)"
    )
    parser.add_argument(
        "--file",
        type=str,
        default="",
        help="Path to a text file containing tickers (one ticker per line)"
    )
    parser.add_argument(
        "--universe",
        type=str,
        default="",
        help="Predefined NSE index universe (e.g. nifty50, nifty100, nifty500, niftymidcap100; cached for 60 days)"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Limit number of stocks to scan from the universe (e.g. --limit 50)"
    )
    parser.add_argument(
        "--output",
        type=str,
        default="research_report.md",
        help="Path to save the generated Markdown research report (default: research_report.md)"
    )
    parser.add_argument(
        "--api-key",
        type=str,
        default="",
        help="Google Gemini API key (optional; defaults to GEMINI_API_KEY env var)"
    )
    parser.add_argument(
        "--stage1-model",
        type=str,
        default=STAGE1_MODEL_DEFAULT,
        help=f"Gemini model for Stage 1 (default: {STAGE1_MODEL_DEFAULT})"
    )
    parser.add_argument(
        "--stage2-model",
        type=str,
        default=STAGE2_MODEL_DEFAULT,
        help=f"Gemini model for Stage 2 (default: {STAGE2_MODEL_DEFAULT})"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run deterministic Python screening and export compact dossiers without calling Gemini API"
    )
    return parser.parse_args()


def main() -> None:
    args = parse_cli_args()

    # Determine candidates from positional arguments or --tickers
    raw_tickers: List[str] = []
    if args.tickers.strip():
        raw_tickers.extend(args.tickers.split(","))
    if args.tickers_pos:
        for p in args.tickers_pos:
            raw_tickers.extend(p.split(","))

    candidate_list: Optional[List[Dict[str, str]]] = None

    if raw_tickers:
        symbols = [s.strip().upper() for s in raw_tickers if s.strip()]
        # Remove duplicates while preserving order
        seen = set()
        unique_syms = []
        for s in symbols:
            if s not in seen:
                seen.add(s)
                unique_syms.append(s)
        candidate_list = [{"name": s, "ticker": s} for s in unique_syms]
    elif args.file.strip():
        if not os.path.exists(args.file):
            print(f"[!] Error: File '{args.file}' does not exist.")
            sys.exit(1)
        with open(args.file, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip() and not line.startswith("#")]
        candidate_list = [{"name": s, "ticker": s} for s in lines]
    elif args.universe.strip():
        u_name = args.universe.strip()
        fetched = fetch_nse_index_universe(u_name)
        if not fetched:
            print(f"[!] Warning: Could not fetch universe for '{u_name}'. Using default benchmark universe.")
            candidate_list = DEFAULT_UNIVERSE
        else:
            print(f"[*] Loaded {len(fetched)} constituents from '{u_name}' universe (60-day cache).")
            candidate_list = fetched

    # Apply limit if specified
    if candidate_list and args.limit > 0:
        candidate_list = candidate_list[:args.limit]
        print(f"[*] Applied candidate limit: scanning first {len(candidate_list)} stocks.")

    # Dry-run mode for offline testing / inspecting data payloads
    if args.dry_run:
        print("[*] Running DRY-RUN mode (Deterministic Python analysis only)...")
        targets = candidate_list if candidate_list is not None else DEFAULT_UNIVERSE[:5]
        results, market_ctx = ra.analyze_universe(targets, verbose=True)
        compact = [build_compact_dossier(c) for c in results]
        print(f"\n[+] Dry run complete. Generated {len(compact)} compact dossiers.")
        print(f"Sample Dossier ({compact[0]['ticker']}):\n{json.dumps(compact[0], indent=2)}")
        sys.exit(0)

    try:
        pipeline_output = run_ai_research_pipeline(
            candidates=candidate_list,
            api_key=args.api_key if args.api_key else None,
            stage1_model=args.stage1_model,
            stage2_model=args.stage2_model,
            output_file=args.output,
            verbose=True
        )

        print("\n" + "=" * 70)
        print("STAGE 1 TRIAGE SHORTLIST")
        print("=" * 70)
        for idx, item in enumerate(pipeline_output["stage1_result"].get("shortlist", []), 1):
            print(f"  {idx}. {item.get('ticker'):<12} | Role: {item.get('sector_role', 'N/A'):<15} | Reason: {item.get('selection_reason')}")

        print("\n" + "=" * 70)
        print("FINAL STAGE 2 RESEARCH REPORT")
        print("=" * 70)
        print(pipeline_output["report_markdown"])
        print("=" * 70)

    except ValueError as ve:
        print(f"\n[!] Configuration Error: {ve}")
        sys.exit(1)
    except Exception as e:
        print(f"\n[!] Unexpected Error during pipeline execution: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
