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
                logging.info(f"Local Qwen server successfully online at {LOCAL_SERVER_URL} (pid {_server_process.pid})")
                return True

        logging.error("Local Qwen server process started, but healthcheck timed out.")
        return False
    except Exception as e:
        logging.error(f"Failed to launch local llama-server: {e}")
        return False


def stop_local_server():
    """Cleanly stop local llama-server and free all GPU/RAM memory."""
    global _server_process

    if _server_process is not None:
        try:
            logging.info(f"Shutting down local Qwen server (pid {_server_process.pid})...")
            _server_process.terminate()
            _server_process.wait(timeout=3)
        except Exception:
            try:
                _server_process.kill()
            except Exception:
                pass
        finally:
            _server_process = None

    # Also force-kill any lingering process on the port if needed
    try:
        import psutil  # type: ignore
        for proc in psutil.process_iter(['name', 'cmdline']):
            if proc.info['name'] == 'llama-server.exe':
                proc.kill()
    except Exception:
        pass


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
    max_tokens: int = 1024,
    temperature: float = 0.2,
) -> str:
    """
    Query the local Qwen 3.5 4B model via OpenAI-compatible endpoint.
    Returns plain string text (extracts reasoning and content cleanly).
    """
    if not is_server_healthy():
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
        content = msg.get("content") or ""
        
        # If content is empty (e.g. model output reasoning_content only), fallback to reasoning
        if not content.strip() and msg.get("reasoning_content"):
            content = msg.get("reasoning_content")

        return content.strip()
    except Exception as e:
        logging.error(f"Error querying local Qwen model: {e}")
        raise


def generate_qwen_stock_dossier(ticker: str, candidate_data: Dict[str, Any]) -> str:
    """
    Generate an institutional qualitative dossier for a single stock using local Qwen.
    Formats the markdown section so ai_parser can extract structured cards.
    """
    clean_sym = ticker.replace(".NS", "").replace(".BO", "").strip().upper()
    tech = candidate_data.get("technicals", {})
    fund = candidate_data.get("fundamentals", {})
    strat = candidate_data.get("technicals", {}).get("Strategy_Evaluation", {})
    trend = tech.get("Trend_Analysis", {})
    
    price = trend.get("Current_Price", "N/A")
    dma50 = trend.get("50_DMA", "N/A")
    dma200 = trend.get("200_DMA", "N/A")
    strategy_name = strat.get("primary_strategy", "Swing Momentum")
    sector = fund.get("sector", "NSE Equity")
    pe = fund.get("valuation", {}).get("pe", "N/A")
    sales_growth = fund.get("growth", {}).get("sales_growth_3yr", "N/A")

    system_prompt = (
        "You are a Senior Quantitative Equity Analyst at an elite Indian swing trading desk. "
        "Analyze the provided stock metrics and generate a concise, institutional-grade research dossier. "
        "Write full, concrete sentences based on the data. NEVER output bracketed placeholders or template tags like [Reason]."
    )

    prompt = f"""
Analyze {clean_sym} ({sector}):
- Current Price: ₹{price}
- 50 DMA: ₹{dma50} | 200 DMA: ₹{dma200}
- Active Setup: {strategy_name}
- Valuation P/E: {pe}x | 3Y Sales Growth: {sales_growth}%

Generate a structured dossier adhering to this exact markdown layout. Fill in every bullet with real, concrete swing trading analysis based on the numbers above:

### {clean_sym}
- **Why it entered the shortlist**:
  - State the technical or momentum catalyst based on the setup {strategy_name}.
  - Note the structural posture relative to moving averages (₹{price} vs 50DMA ₹{dma50}).
- **Key evidence**:
  - Explain the trend strength or moving average alignment.
  - Explain the valuation context (P/E {pe}x, sales growth {sales_growth}%).
- **Main risk**:
  - Specify the exact technical invalidation level (e.g. below 50 DMA ₹{dma50}).
  - Note the market or sector headwind risk.
- **Observable conditions that strengthen**:
  - Name the bullish volume or breakout price action confirming momentum.
- **Observable conditions that weaken**:
  - Name the breakdown or volume exhaustion signal to exit early.
"""

    return query_local_qwen(prompt, system_prompt=system_prompt, max_tokens=1500, temperature=0.3)


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
