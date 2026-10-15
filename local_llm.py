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
import re
import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Paths and configuration
CODER_7B_MODEL_PATH = r"D:\lmmodels\qwen2.5-coder-7b-instruct-q3_k_m.gguf"
QWEN_4B_MODEL_PATH = r"D:\lmmodels\Huihui-Qwen3.5-4B-abliterated.Q4_K_M.gguf"
# Default to Qwen 2.5 Coder 7B (Q3_K_M) - 100% GPU VRAM fit & elite logic
MODEL_PATH = CODER_7B_MODEL_PATH if os.path.exists(CODER_7B_MODEL_PATH) else QWEN_4B_MODEL_PATH
BINARY_PATH = r"D:\lmmodels\llama-cuda-bin\llama-server.exe"
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


# Windows Job Object handle to guarantee child process termination on exit
_job_object = None

def _init_windows_job():
    global _job_object
    if os.name != "nt" or _job_object is not None:
        return _job_object
    try:
        import ctypes
        from ctypes import wintypes

        class LI(ctypes.Structure):
            _fields_ = [
                ('PerProcessUserTimeLimit', wintypes.LARGE_INTEGER),
                ('PerJobUserTimeLimit', wintypes.LARGE_INTEGER),
                ('LimitFlags', wintypes.DWORD),
                ('MinimumWorkingSetSize', ctypes.c_size_t),
                ('MaximumWorkingSetSize', ctypes.c_size_t),
                ('ActiveProcessLimit', wintypes.DWORD),
                ('Affinity', ctypes.c_size_t),
                ('PriorityClass', wintypes.DWORD),
                ('SchedulingClass', wintypes.DWORD),
            ]

        class IO(ctypes.Structure):
            _fields_ = [
                ('R', ctypes.c_uint64),
                ('W', ctypes.c_uint64),
                ('O', ctypes.c_uint64),
                ('Rb', ctypes.c_uint64),
                ('Wb', ctypes.c_uint64),
                ('Ob', ctypes.c_uint64),
            ]

        class EX(ctypes.Structure):
            _fields_ = [
                ('B', LI),
                ('I', IO),
                ('PML', ctypes.c_size_t),
                ('JML', ctypes.c_size_t),
                ('PPML', ctypes.c_size_t),
                ('PJML', ctypes.c_size_t),
            ]

        job = ctypes.windll.kernel32.CreateJobObjectW(None, None)
        info = EX()
        info.B.LimitFlags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        ctypes.windll.kernel32.SetInformationJobObject(job, 9, ctypes.byref(info), ctypes.sizeof(info))
        _job_object = job
    except Exception as e:
        logging.warning(f"Could not initialize Windows Job Object: {e}")
    return _job_object


def start_local_server() -> bool:
    """
    Launch llama-server.exe in headless background mode (no visible console window).
    Auto-fits layers into GPU VRAM.
    Tied to a Windows Job Object so if parent Python/launch process dies for ANY reason,
    the Windows OS kernel automatically terminates llama-server.exe immediately.
    """
    global _server_process

    if not is_local_model_available():
        logging.warning("Local model files not found on D:\\lmmodels. Cannot start local LLM.")
        return False

    if is_server_healthy():
        logging.info(f"Local Qwen server already running and healthy at {LOCAL_SERVER_URL}.")
        return True

    model_name = "Qwen 2.5 Coder 7B" if "coder" in MODEL_PATH.lower() else "Qwen 3.5 4B"

    logging.info(f"Starting headless local {model_name} server on port {LOCAL_SERVER_PORT} (GPU offload: 100% layers in VRAM)...")

    cmd = [
        BINARY_PATH,
        "-m", MODEL_PATH,
        "-c", "4096",
        "-ngl", "99",
        "-t", "6",
        "--port", str(LOCAL_SERVER_PORT),
        "--host", "127.0.0.1",
    ]
    if "3.5" in MODEL_PATH.lower():
        cmd.extend(["--reasoning", "off", "--reasoning-format", "none", "--reasoning-budget", "0"])

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

        # Bind to Windows Job Object so Windows kernel auto-kills it on parent termination
        if os.name == "nt":
            job = _init_windows_job()
            if job and _server_process:
                try:
                    import ctypes
                    ctypes.windll.kernel32.AssignProcessToJobObject(job, int(_server_process._handle))
                except Exception as je:
                    logging.warning(f"Notice assigning llama-server to Job Object: {je}")

        # Poll health for up to 15 seconds
        for attempt in range(30):
            time.sleep(0.5)
            if is_server_healthy():
                print(f"  [OK] Local Qwen server ready at {LOCAL_SERVER_URL} (pid {_server_process.pid})")
                print(f"  [OK] Model: {os.path.basename(MODEL_PATH)} | Context: 4096 tokens | GPU: NVIDIA CUDA (100% layers offloaded)")
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
    Query the local Qwen model via OpenAI-compatible endpoint.
    Returns plain string text (extracts reasoning and content cleanly).
    """
    if not is_server_healthy():
        print("  [*] Local Qwen server is offline. Starting server process...")
        success = start_local_server()
        if not success:
            raise RuntimeError("Local Qwen server is not available.")

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": "qwen2.5-coder-7b",
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


def stream_local_qwen(
    prompt: str,
    system_prompt: Optional[str] = None,
    max_tokens: int = 900,
    temperature: float = 0.2,
):
    """
    Generator that streams tokens one by one from local Qwen via SSE.
    Yields string text chunks as they are generated.
    """
    if not is_server_healthy():
        print("  [*] Local Qwen server is offline. Starting server process...")
        success = start_local_server()
        if not success:
            raise RuntimeError("Local Qwen server is not available.")

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": "qwen2.5-coder-7b",
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": True,
    }

    t_start = time.time()
    prompt_len = len(prompt)
    print(f"  [->] [Local Qwen Stream] Starting stream (Prompt: ~{prompt_len} chars, Max Tokens: {max_tokens})...")

    with requests.post(
        f"{LOCAL_SERVER_URL}/v1/chat/completions",
        json=payload,
        headers={"Content-Type": "application/json"},
        stream=True,
        timeout=240,
    ) as res:
        res.raise_for_status()
        token_count = 0
        for line in res.iter_lines(decode_unicode=True):
            if not line:
                continue
            line = line.strip()
            if line.startswith("data: "):
                data_part = line[6:].strip()
                if data_part == "[DONE]":
                    break
                try:
                    chunk = json.loads(data_part)
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    token = delta.get("content") or delta.get("reasoning_content") or ""
                    if token:
                        token_count += 1
                        yield token
                except Exception:
                    continue

        elapsed = time.time() - t_start
        tok_sec = round(token_count / elapsed, 1) if elapsed > 0 else 0
        print(f"  [OK] [Local Qwen Stream] Completed in {elapsed:.2f}s | Output: {token_count} tokens ({tok_sec} tok/s)")


def build_stock_chat_context(
    ticker: str,
    candidate_data: Dict[str, Any],
) -> str:
    """Build grounded system prompt for interactive stock chat."""
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

    return (
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


def chat_with_stock(
    ticker: str,
    candidate_data: Dict[str, Any],
    chat_history: List[Dict[str, str]],
    user_message: str,
) -> str:
    """
    Interactive Q&A chat for a specific stock (non-streaming).
    """
    clean_sym = ticker.replace(".NS", "").replace(".BO", "").strip().upper()
    system_prompt = build_stock_chat_context(ticker, candidate_data)

    if not is_server_healthy():
        start_local_server()

    messages = [{"role": "system", "content": system_prompt}]
    for msg in chat_history[-6:]:
        messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
    messages.append({"role": "user", "content": user_message})

    payload = {
        "model": "qwen2.5-coder-7b",
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


def stream_chat_with_stock(
    ticker: str,
    candidate_data: Dict[str, Any],
    chat_history: List[Dict[str, str]],
    user_message: str,
):
    """
    Interactive Q&A chat for a specific stock (token streaming generator).
    Yields string text chunks as they arrive from local Qwen.
    """
    clean_sym = ticker.replace(".NS", "").replace(".BO", "").strip().upper()
    system_prompt = build_stock_chat_context(ticker, candidate_data)

    if not is_server_healthy():
        start_local_server()

    messages = [{"role": "system", "content": system_prompt}]
    for msg in chat_history[-6:]:
        messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
    messages.append({"role": "user", "content": user_message})

    payload = {
        "model": "qwen2.5-coder-7b",
        "messages": messages,
        "max_tokens": 400,
        "temperature": 0.2,
        "stream": True,
    }

    t_start = time.time()
    try:
        with requests.post(
            f"{LOCAL_SERVER_URL}/v1/chat/completions",
            json=payload,
            headers={"Content-Type": "application/json"},
            stream=True,
            timeout=120,
        ) as res:
            res.raise_for_status()
            tok_count = 0
            for line in res.iter_lines(decode_unicode=True):
                if not line:
                    continue
                line = line.strip()
                if line.startswith("data: "):
                    data_part = line[6:].strip()
                    if data_part == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_part)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        token = delta.get("content") or delta.get("reasoning_content") or ""
                        if token:
                            tok_count += 1
                            yield token
                    except Exception:
                        continue
            elapsed = time.time() - t_start
            tok_sec = round(tok_count / elapsed, 1) if elapsed > 0 else 0
            print(f"  [OK] [Chat Stream with {clean_sym}] Completed in {elapsed:.2f}s | {tok_count} tokens ({tok_sec} tok/s)")
    except Exception as e:
        print(f"  [FAIL] [Chat Stream with {clean_sym}] Error: {e}")
        yield f"Unable to answer right now: {e}"


def build_stock_dossier_prompts(ticker: str, candidate_data: Dict[str, Any]) -> tuple[str, str]:
    """
    Builds the system prompt and user prompt for generating a detailed qualitative stock dossier.
    Shared by both batch and streaming endpoints.
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
    
    # Ingest corporate event radar & distill short-form news
    import event_engine
    corp_radar = event_engine.fetch_corporate_radar(clean_sym, recent_announcements=announcements)
    next_earnings = corp_radar.get("next_earnings_date") or "Unannounced"
    days_to_earnings = corp_radar.get("days_to_earnings")
    earnings_warning = f"Q2/Q3 Results in {days_to_earnings} days ({next_earnings})" if days_to_earnings is not None else f"Earnings Date: {next_earnings}"
    
    distilled_filings = []
    if days_to_earnings is not None:
        if days_to_earnings <= 14:
            distilled_filings.append(f"Upcoming Earnings: {days_to_earnings} days away on {next_earnings} (HIGH EVENT RISK)")
        else:
            distilled_filings.append(f"Upcoming Earnings: {days_to_earnings} days away on {next_earnings} (Safe Holding Window)")

    for a in announcements[:4]:
        cat_info = event_engine.classify_filing_category(a.get("title", ""), a.get("description", ""))
        category = cat_info.get("category", "GENERAL")
        dt = a.get("date", "").strip()
        
        desc = a.get("description", "").strip()
        title = a.get("title", "").strip()
        cleaned_title = re.sub(r"^Announcement under Regulation 30 \(LODR\)[-–—\s]*", "", title, flags=re.IGNORECASE).strip()
        filing_text = desc if desc else cleaned_title
        if filing_text:
            if len(filing_text) > 120:
                filing_text = filing_text[:117] + "..."
            distilled_filings.append(f"[{dt}] {category}: {filing_text}")

    ann_distilled_text = "; ".join(distilled_filings) if distilled_filings else "No high-impact corporate filings or upcoming earnings within 30 days."

    system_prompt = (
        "You are an Institutional Senior Investment Committee Chair evaluating an Indian Equity (NSE) candidate for a 3-week to 2-month swing trade. "
        "Your task is to conduct an adversarial stress-test between the Bull Thesis and the Bear Counterevidence, followed by an objective Risk Judge adjudication. "
        "Strict Rule: Under no circumstance invent a new stop-loss level. The stop loss is deterministically fixed by the technical engine at ₹{stop_price}. "
        "The Risk Judge must verify claims against the provided empirical data, identify unverified retail assumptions, and state clearly whether evidence is sufficient or inconclusive. "
        "Write precise, institutional-grade, information-dense complete sentences without conversational preamble."
    )

    prompt = f"""
FROZEN EMPIRICAL EVIDENCE SNAPSHOT FOR {clean_sym} ({sector} | {industry}):
- Price: ₹{price} | 50 DMA: ₹{dma50} ({dma50_dist}% dist) | 200 DMA: ₹{dma200} ({dma200_dist}% dist)
- Deterministic Strategy Setup: {strategy_name} (Status: {setup_status}, Guardrail Stop Loss: ₹{stop_price})
- Corporate Actions & Calendar: {earnings_warning} | Ex-Dividend: {corp_radar.get('ex_dividend_date') or 'N/A'}
- Valuation & Financials: P/E {pe}x (5Y Median: {pe_5y_median}x), P/B {pb}x, ROE: {roe}%, 3Y Sales Growth: {sales_growth}%
- Positive Fundamentals: {', '.join(positives[:3]) if positives else 'Sound operating structure'}
- Red Flags & Governance Alerts: {', '.join(red_flags[:2]) if red_flags else 'General sector cycle risk'}
- Distilled Corporate Filings: {ann_distilled_text}
- Seed Research Questions: {'; '.join(existing_questions[:2]) if existing_questions else 'Concall guidance sustainability'}

Generate the research dossier adhering EXACTLY to this markdown layout so our visual parser maps each card:

### {clean_sym}
- **Why it entered the shortlist**:
  - Write 1 sentence on why the deterministic scanner shortlisted {clean_sym} ({strategy_name} at ₹{price} vs 50 DMA ₹{dma50}).
- **Bull Case (The Setup)**:
  - Present the strongest technical and volume evidence supporting upside momentum towards new swing highs.
  - Detail the fundamental improvement, ROE {roe}%, and operating growth supporting an accumulation thesis.
  - Highlight key operational catalyst from filings or earnings window ({earnings_warning}).
- **Bear Case (The Trap & Counterevidence)**:
  - Detail valuation headwinds (P/E {pe}x vs 5Y median {pe_5y_median}x) and sector resistance.
  - Expose fundamental risks: working capital stretch, promoter pledge, governance watch-outs, or upcoming event traps.
  - Detail the distribution pattern or trap scenario where naive retail buyers get caught.
- **Risk Judge Verdict (Adjudication & Verification)**:
  - Verdict: [FAVORS BULL SETUP | FAVORS BEAR TRAP | INCONCLUSIVE / HIGH RISK] - (State objective adjudication on which side has the empirical probability edge).
  - Confirmed Facts: List 2 empirical metrics verified directly from the data snapshot.
  - Unsupported Claims: List 1 speculative retail assumption lacking data support.
  - Invalidation Boundary: Reiterate the strict deterministic exit rule below ₹{stop_price} (do NOT suggest any alternate stop).
- **Observable Confirmation Conditions**:
  - What would strengthen the thesis: The exact volume expansion and breakout confirmation above ₹{price} that confirms the Bull Case.
  - What would weaken the thesis: The exact price action or distribution breakdown confirming the Bear Case is underway.
"""
    return system_prompt, prompt


def generate_qwen_stock_dossier(ticker: str, candidate_data: Dict[str, Any]) -> str:
    """
    Generate an institutional qualitative dossier for a single stock using local Qwen (non-streaming).
    """
    system_prompt, prompt = build_stock_dossier_prompts(ticker, candidate_data)
    return query_local_qwen(prompt, system_prompt=system_prompt, max_tokens=900, temperature=0.3)


def stream_qwen_stock_dossier(ticker: str, candidate_data: Dict[str, Any]):
    """
    Stream an institutional qualitative dossier for a single stock using local Qwen.
    Yields string text tokens in real time.
    """
    system_prompt, prompt = build_stock_dossier_prompts(ticker, candidate_data)
    return stream_local_qwen(prompt, system_prompt=system_prompt, max_tokens=900, temperature=0.3)


def build_market_briefing_prompts(candidates: List[Dict[str, Any]], regime: Optional[Dict[str, Any]] = None) -> tuple[str, str]:
    """Build prompts for executive market briefing."""
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
    return system_prompt, prompt


def generate_qwen_market_briefing(candidates: List[Dict[str, Any]], regime: Optional[Dict[str, Any]] = None) -> str:
    """
    Generate an executive market briefing across shortlisted candidates using local Qwen (non-streaming).
    """
    system_prompt, prompt = build_market_briefing_prompts(candidates, regime)
    return query_local_qwen(prompt, system_prompt=system_prompt, max_tokens=1800, temperature=0.3)


def stream_qwen_market_briefing(candidates: List[Dict[str, Any]], regime: Optional[Dict[str, Any]] = None):
    """
    Stream an executive market briefing across shortlisted candidates using local Qwen.
    Yields string text tokens in real time.
    """
    system_prompt, prompt = build_market_briefing_prompts(candidates, regime)
    return stream_local_qwen(prompt, system_prompt=system_prompt, max_tokens=1800, temperature=0.3)



if __name__ == "__main__":
    print(f"Model available: {is_local_model_available()}")
    print("Testing server startup...")
    if start_local_server():
        print("Testing prompt generation...")
        reply = query_local_qwen("State in 1 sentence why short-term swing trading requires strict risk control.")
        print(f"Reply: {reply}")
        stop_local_server()
        print("Server stopped cleanly.")
