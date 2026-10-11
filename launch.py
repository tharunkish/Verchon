"""
VERCHON Vector Terminal - 1-Click Desktop Launcher
===================================================
1. Launches single-process unified FastAPI + React UI server on http://127.0.0.1:8000.
2. Automatically opens your default Windows web browser.
3. Closing this window or pressing Ctrl+C safely shuts down the server.
"""

import os
import sys
import time
import threading
import webbrowser
import subprocess

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(base_dir, "frontend")
    dist_dir = os.path.join(frontend_dir, "dist")

    print("=" * 65)
    print("  VERCHON VECTOR TERMINAL - SWING WORKSTATION")
    print("=" * 65)

    if not os.path.exists(dist_dir):
        print("  [*] Building production frontend UI bundle...")
        subprocess.run(["npm", "run", "build"], cwd=frontend_dir, shell=True)

    url = "http://127.0.0.1:8000"
    def wait_and_open_browser():
        import urllib.request
        health_url = f"{url}/api/portfolio"
        max_attempts = 50
        for _ in range(max_attempts):
            try:
                with urllib.request.urlopen(health_url, timeout=1) as resp:
                    if resp.status == 200:
                        break
            except Exception:
                time.sleep(0.2)
        webbrowser.open(url)

    threading.Thread(target=wait_and_open_browser, daemon=True).start()

    print("\n  [✓] Starting server engine...")
    print("  [✓] Local AI Model: Huihui-Qwen3.5-4B (Auto-boots with Verchon)")
    print("  [!] Close this window or press Ctrl+C to exit and stop the server.\n")
    print("=" * 65 + "\n")

    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, log_level="info")

if __name__ == "__main__":
    main()
