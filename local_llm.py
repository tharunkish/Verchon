"""
local_llm.py - Headless Local LLM Runner & API Client for VERCHON
================================================================
Manages the lifecycle of the local llama-server.exe process running
Huihui-Qwen3.5-4B-abliterated.Q4_K_M.gguf from D:\\lmmodels.
"""

import atexit
import json
import logging
import os
import signal
import subprocess
import time
from typing import Any, Dict, List, Optional
import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Paths and configuration
MODEL_PATH = r"D:\lmmodels\Huihui-Qwen3.5-4B-abliterated.Q4_K_M.gguf"
BINARY_PATH = r"D:\lmmodels\llama-bin\llama-server.exe"
LOCAL_SERVER_PORT = 8085
LOCAL_SERVER_URL = f"http://127.0.0.1:{LOCAL_SERVER_PORT}"

# Global subprocess handle
_server_process: Optional[subprocess.Popen] = None
_active_provider: str = "qwen"  # 'qwen' or 'gemini'


def is_local_model_available() -> bool:
    """Check if model GGUF and server executable exist on disk."""
    return os.path.exists(MODEL_PATH) and os.path.exists(BINARY_PATH)


def is_server_healthy() -> bool:
    """Check if local llama-server is listening and ready."""
    try:
        res = requests.get(f"{LOCAL_SERVER_URL}/health", timeout=1.5)
        return res.status_code == 200
    except Exception:
        return False


def start_local_server() -> bool:
    """
    Launch llama-server.exe in headless background mode (no visible console window).
    Auto-fits layers into GPU VRAM.
    """
    global _server_process

    if not is_local_model_available():
        logging.warning("Local model files not found on D:\\lmmodels. Cannot start local LLM.")
        return False

    if is_server_healthy():
        logging.info(f"Local Qwen server already running and healthy at {LOCAL_SERVER_URL}.")
        return True

    logging.info(f"Starting headless local Qwen 3.5 4B server on port {LOCAL_SERVER_PORT}...")

    cmd = [
        BINARY_PATH,
        "-m", MODEL_PATH,
        "-c", "4096",
        "-ngl", "99",
        "--device", "Vulkan0",
        "-t", "6",
        "--reasoning-budget", "0",
        "--port", str(LOCAL_SERVER_PORT),
        "--host", "127.0.0.1",
    ]

    try:
        # On Windows, use CREATE_NO_WINDOW so no console pops up
        creationflags = 0
        if os.name == "nt":
            creationflags = subprocess.CREATE_NO_WINDOW

        _server_process = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
        )

        # Poll health for up to 15 seconds
        for attempt in range(30):
            time.sleep(0.5)
            if is_server_healthy():
                print(f"  [OK] Local Qwen server ready at {LOCAL_SERVER_URL} (pid {_server_process.pid})")
                print(f"  [OK] Model: {os.path.basename(MODEL_PATH)} | Context: 4096 tokens | GPU: Vulkan0 (100% layers offloaded)")
                logging.info(f"Local Qwen server successfully online at {LOCAL_SERVER_URL} (pid {_server_process.pid})")
                return True

        print("  [FAIL] Local Qwen server process started, but healthcheck timed out.")
        logging.error("Local Qwen server process started, but healthcheck timed out.")
        return False
    except Exception as e:
        print(f"  [FAIL] Failed to launch local llama-server: {e}")
        logging.error(f"Failed to launch local llama-server: {e}")
        return False


def stop_local_server():
    """
    Cleanly stop local llama-server and free all GPU/RAM memory.
    Guarantees that no orphaned llama-server.exe processes linger on Windows.
    """
    global _server_process

    # 1. Terminate tracked subprocess handle if present
    if _server_process is not None:
        try:
            print(f"  [*] Shutting down local Qwen server (pid {_server_process.pid})...")
            logging.info(f"Shutting down local Qwen server (pid {_server_process.pid})...")
            _server_process.terminate()
            _server_process.wait(timeout=2)
        except Exception:
            try:
                _server_process.kill()
            except Exception:
                pass
        finally:
            _server_process = None

    # 2. Iterate and kill any llama-server.exe process via psutil
    try:
        import psutil
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                pname = proc.info.get('name') or ''
                if 'llama-server' in pname.lower():
                    proc.kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
    except Exception:
        pass

    # 3. Fail-safe taskkill on Windows to ensure 0 VRAM leaks
    if os.name == "nt":
        try:
            subprocess.run(
                ["taskkill", "/F", "/IM", "llama-server.exe", "/T"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=2,
            )
        except Exception:
            pass

    print("  [OK] Local Qwen server stopped. GPU VRAM completely freed.")


# Register automatic cleanup on process exit
atexit.register(stop_local_server)


def get_active_provider() -> str:
    """Get active AI provider: 'qwen' or 'gemini'."""
    return _active_provider


def set_active_provider(provider: str) -> str:
    """Set active AI provider: 'qwen' or 'gemini'."""
    global _active_provider
    if provider.lower() in ["qwen", "local"]:
        _active_provider = "qwen"
        # Ensure local server is booted up
        if not is_server_healthy():
            start_local_server()
    elif provider.lower() in ["gemini", "cloud"]:
        _active_provider = "gemini"
    return _active_provider


def query_local_qwen(
    prompt: str,
    system_prompt: Optional[str] = None,
    max_tokens: int = 700,
    temperature: float = 0.2,
) -> str:
    """
    Query the local Qwen 3.5 4B model via OpenAI-compatible endpoint.
    Returns plain string text (extracts reasoning and content cleanly).
    """
    if not is_server_healthy():
        print("  [*] Local Qwen server is offline. Starting server process...")
        success = start_local_server()
        if not success:
            raise RuntimeError("Local Qwen 3.5 server is not available.")

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": "qwen3.5-4b-abliterated",
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }

    t_start = time.time()
    prompt_len = len(prompt)
    print(f"  [->] [Local Qwen] Processing query (Prompt: ~{prompt_len} chars, Max Tokens: {max_tokens})...")

    try:
        res = requests.post(
            f"{LOCAL_SERVER_URL}/v1/chat/completions",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=240,
        )
        res.raise_for_status()
        data = res.json()
        choice = data.get("choices", [{}])[0]
        msg = choice.get("message", {})
        content = msg.get("content") or ""
        
        # If content is empty (e.g. model output reasoning_content only), fallback to reasoning
        if not content.strip() and msg.get("reasoning_content"):
            content = msg.get("reasoning_content")

        elapsed = time.time() - t_start
        usage = data.get("usage", {})
        comp_tokens = usage.get("completion_tokens", "N/A")
        total_tokens = usage.get("total_tokens", "N/A")
        timings = data.get("timings", {})
        tok_sec = round(timings.get("predicted_per_second", 0), 1)

        print(f"  [OK] [Local Qwen] Generation complete in {elapsed:.2f}s | Output: {comp_tokens} tokens ({tok_sec} tok/s) | Total: {total_tokens} tokens")

        return content.strip()
    except Exception as e:
        elapsed = time.time() - t_start
        print(f"  [FAIL] [Local Qwen] Query error after {elapsed:.2f}s: {e}")
        logging.error(f"Error querying local Qwen model: {e}")
        raise


def chat_with_stock(
    ticker: str,
    candidate_data: Dict[str, Any],
    chat_history: List[Dict[str, str]],
    user_message: str,
) -> str:
    """
    Interactive Q&A chat for a specific stock.
    Injects the stock's full technicals, fundamentals, and dossier context
    as system grounding, then appends conversation history and the user's question.
    """
    clean_sym = ticker.replace(".NS", "").replace(".BO", "").strip().upper()
    tech = candidate_data.get("technicals", {})
    fund = candidate_data.get("fundamentals", {})
    strat = tech.get("Strategy_Evaluation", {})
    trend = tech.get("Trend_Analysis", {})
    val = fund.get("valuation", {})
    
    price = trend.get("Current_Price", "N/A")
    dma50 = trend.get("50_DMA", "N/A")
    dma200 = trend.get("200_DMA", "N/A")
    strategy_name = strat.get("primary_strategy", "Swing Momentum")
    stop_price = strat.get("stop_loss", trend.get("50_DMA", "N/A"))
    pe = val.get("pe", "N/A")
    pe_5y = val.get("historical_pe_median_5y", "N/A")
    sales_growth = fund.get("growth", {}).get("sales_growth_3yr", "N/A")
    positives = fund.get("positives", [])
    red_flags = [f.get("name") if isinstance(f, dict) else str(f) for f in fund.get("red_flags", [])]

    system_prompt = (
        f"You are the senior trading analyst defending the thesis on {clean_sym} on an Indian equity swing desk.\n"
        f"Live Context for {clean_sym}:\n"
        f"- Price: ₹{price} | 50 DMA: ₹{dma50} | 200 DMA: ₹{dma200}\n"
        f"- Setup: {strategy_name} (Stop Loss / Guardrail: ₹{stop_price})\n"
        f"- Valuation: P/E {pe}x (5Y Median: {pe_5y}x) | 3Y Sales Growth: {sales_growth}%\n"
        f"- Positives: {', '.join(positives[:3]) if positives else 'None specified'}\n"
        f"- Watch-outs: {', '.join(red_flags[:2]) if red_flags else 'General sector cycle risk'}\n\n"
        "Guidelines:\n"
        "- Answer the trader's question directly, clearly, and concisely in 2-4 sentences.\n"
        "- Ground your answer strictly in the technical levels, moving averages, and fundamentals above.\n"
        "- Be realistic about risk; do not give blind promotional advice."
    )

    if not is_server_healthy():
        start_local_server()

    # Build multi-turn messages array
    messages = [{"role": "system", "content": system_prompt}]
    for msg in chat_history[-6:]:  # Keep recent turns
        messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
    messages.append({"role": "user", "content": user_message})

    payload = {
        "model": "qwen3.5-4b-abliterated",
        "messages": messages,
        "max_tokens": 400,
        "temperature": 0.2,
        "stream": False,
    }

    t_start = time.time()
    try:
        res = requests.post(
            f"{LOCAL_SERVER_URL}/v1/chat/completions",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=120,
        )
        res.raise_for_status()
        data = res.json()
        choice = data.get("choices", [{}])[0]
        msg = choice.get("message", {})
        content = msg.get("content") or msg.get("reasoning_content") or ""
        elapsed = time.time() - t_start
        print(f"  [OK] [Chat with {clean_sym}] Answered in {elapsed:.2f}s")
        return content.strip()
    except Exception as e:
        print(f"  [FAIL] [Chat with {clean_sym}] Error: {e}")
        return f"Unable to answer right now: {e}"


def generate_qwen_stock_dossier(ticker: str, candidate_data: Dict[str, Any]) -> str:
    """
    Generate an institutional qualitative dossier for a single stock using local Qwen.
    Formats the markdown section so ai_parser extracts ALL dashboard cards:
    - Why it entered the shortlist (Thesis)
    - Key evidence (Empirical fundamentals + technicals)
    - Recent Announcements & Filings
    - Important contradiction
    - Research risks / unresolved issues (Setup Invalidation, Trend Deterioration, Fundamental Risk)
    - Research questions
    - What would strengthen the thesis
    - What would weaken the thesis
    """
    clean_sym = ticker.replace(".NS", "").replace(".BO", "").strip().upper()
    tech = candidate_data.get("technicals", {})
    fund = candidate_data.get("fundamentals", {})
    strat = tech.get("Strategy_Evaluation", {})
    trend = tech.get("Trend_Analysis", {})
    momo = tech.get("Momentum_Analysis", {})
    vol = tech.get("Volume_Analysis", {})
    
    price = trend.get("Current_Price", "N/A")
    dma50 = trend.get("50_DMA", "N/A")
    dma200 = trend.get("200_DMA", "N/A")
    dma50_dist = trend.get("Dist_50_DMA_%", "N/A")
    dma200_dist = trend.get("Dist_200_DMA_%", "N/A")
    strategy_name = strat.get("primary_strategy", "Swing Momentum")
    setup_status = strat.get("status", "Active")
    stop_price = strat.get("stop_loss", trend.get("50_DMA", "N/A"))
    
    sector = fund.get("sector", "NSE Equity")
    industry = fund.get("industry", "N/A")
    val = fund.get("valuation", {})
    pe = val.get("pe", "N/A")
    pe_5y_median = val.get("historical_pe_median_5y", "N/A")
    pb = val.get("pb", "N/A")
    sales_growth = fund.get("growth", {}).get("sales_growth_3yr", "N/A")
    roe = fund.get("profitability", {}).get("roe", "N/A")
    
    positives = fund.get("positives", [])
    red_flags = [f.get("name") if isinstance(f, dict) else str(f) for f in fund.get("red_flags", [])]
    existing_questions = fund.get("questions", [])
    announcements = fund.get("recent_announcements", [])
    
    # Ingest corporate event radar
    import event_engine
    corp_radar = event_engine.fetch_corporate_radar(clean_sym, recent_announcements=announcements)
    next_earnings = corp_radar.get("next_earnings_date") or "Unannounced"
    days_to_earnings = corp_radar.get("days_to_earnings")
    earnings_warning = f"Q2/Q3 Results in {days_to_earnings} days ({next_earnings})" if days_to_earnings is not None else f"Earnings Date: {next_earnings}"
    
    ann_summary = "None recent."
    if announcements:
        ann_items = [f"{a.get('date', '')}: {a.get('title', '')}" for a in announcements[:3]]
        ann_summary = "; ".join(ann_items)

    system_prompt = (
        "You are an Elite Institutional Bear Thesis Strategist and Risk Devil's Advocate for Indian Equities (NSE). "
        "Your mission is NOT to cheerlead or regurgitate obvious bullish points. "
        "Your sole job is to aggressively stress-test the proposed 3-week to 2-month swing setup, identify the exact blind spots, "
        "surface critical fundamental contradictions, and tell the trader why this trade could fail before they risk real money. "
        "Write articulate, professional, information-dense complete sentences without conversational preamble."
    )

    prompt = f"""
Analyze {clean_sym} ({sector} | {industry}):
- Price: ₹{price} | 50 DMA: ₹{dma50} ({dma50_dist}% dist) | 200 DMA: ₹{dma200} ({dma200_dist}% dist)
- Proposed Setup: {strategy_name} (Status: {setup_status}, Guardrail Stop Level: ₹{stop_price})
- Corporate Actions & Calendar: {earnings_warning} | Ex-Dividend: {corp_radar.get('ex_dividend_date') or 'N/A'}
- Valuation & Quality: P/E {pe}x (5Y Median: {pe_5y_median}x), P/B {pb}x, ROE: {roe}%, 3Y Sales Growth: {sales_growth}%
- Positive Drivers: {', '.join(positives[:3]) if positives else 'Sound operating structure'}
- Red Flags / Audit Alerts: {', '.join(red_flags[:2]) if red_flags else 'General sector cycle risk'}
- Recent Filings / Announcements: {ann_summary}
- Key Seed Questions: {'; '.join(existing_questions[:2]) if existing_questions else 'Concall guidance sustainability'}

Generate the research dossier adhering EXACTLY to this markdown layout so our visual parser maps each card:

### {clean_sym}
- **Why it entered the shortlist**:
  - Write 1 sentence acknowledging the technical setup ({strategy_name} at ₹{price} vs 50 DMA ₹{dma50}).
  - Write 1 sentence on the business context for a 3-week to 2-month swing window.
- **Key evidence**:
  - Detail the technical price structure, moving average slope, and volume confirmation relative to ₹{dma200}.
  - Detail the valuation profile with P/E {pe}x (vs 5Y median {pe_5y_median}x), ROE {roe}%, and sales growth {sales_growth}%.
- **Recent Announcements & Filings**:
  - Summarize the recent corporate filings ({ann_summary}) and their relevance to trading posture.
- **Important contradiction**:
  - Evidence: Act as the Devil's Advocate. Detail the starkest contradiction between the bullish chart and the business/valuation reality (P/E {pe}x vs 5Y median {pe_5y_median}x or sector headwinds).
  - Interpretation: Explain what naive retail bulls are missing that institutional sellers might exploit.
  - Why it matters: Explain how this contradiction could trigger a sudden breakdown or trap buyers.
  - What would resolve it: Specify what concrete earnings beat or breakout volume must happen to prove the bears wrong.
- **Research risks / unresolved issues**:
  - Setup Invalidation: The hard mathematical exit below ₹{stop_price} that kills the trade immediately.
  - Trend Deterioration: The danger signal if price loses the 50 DMA ₹{dma50} or 200 DMA ₹{dma200}.
  - Research / Fundamental Risk: The #1 fundamental bear catalyst (e.g. debt, working capital stretch, margin squeeze, or governance concern).
- **Research questions**:
  - Formulate 2 sharp, skeptical questions the trader must investigate in concall transcripts or notes to accounts before entering.
- **What would strengthen the thesis**:
  - Specify the precise volume expansion and breakout confirmation above ₹{price} required to invalidate the bear case.
- **What would weaken the thesis**:
  - Detail the early distribution volume or lower-high breakdown pattern that confirms the bear case is playing out.
"""

    return query_local_qwen(prompt, system_prompt=system_prompt, max_tokens=900, temperature=0.3)


def generate_qwen_market_briefing(candidates: List[Dict[str, Any]], regime: Optional[Dict[str, Any]] = None) -> str:
    """
    Generate an executive market briefing across shortlisted candidates using local Qwen.
    """
    regime_name = regime.get("regime", "SUPPORTIVE") if regime else "SUPPORTIVE"
    regime_score = regime.get("regime_score", 85) if regime else 85
    
    summary_lines = []
    for c in candidates[:8]:
        sym = c.get("ticker", "").replace(".NS", "")
        p = c.get("current_price", c.get("price", "N/A"))
        score = c.get("score", "N/A")
        setup = c.get("setup_type", c.get("strategy", "Momentum"))
        summary_lines.append(f"- {sym}: Price ₹{p}, Setup '{setup}', Score {score}/100")

    cand_text = "\n".join(summary_lines)

    system_prompt = (
        "You are an Institutional CIO summarizing daily market candidates for an Indian swing desk. "
        "Write a concise, high-conviction briefing in markdown format."
    )

    prompt = f"""
Market Regime: {regime_name} (Score: {regime_score}/100)

Shortlisted Candidates:
{cand_text}

Provide an Executive Research Briefing with:
## 1. Macro & Market Posture (2 concise sentences on market environment)
## 2. Top Conviction Swings (Ranked evaluation of the best 2-3 setups)
## 3. Risk & Capital Guardrails (Specific stop loss and cash management advice)
"""

    return query_local_qwen(prompt, system_prompt=system_prompt, max_tokens=1800, temperature=0.3)



if __name__ == "__main__":
    print(f"Model available: {is_local_model_available()}")
    print("Testing server startup...")
    if start_local_server():
        print("Testing prompt generation...")
        reply = query_local_qwen("State in 1 sentence why short-term swing trading requires strict risk control.")
        print(f"Reply: {reply}")
        stop_local_server()
        print("Server stopped cleanly.")
