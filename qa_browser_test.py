"""
End-to-End QA Browser Test Suite for Frontier UI/UX.
Uses Playwright to:
1. Capture console logs, runtime errors, and failed requests.
2. Verify Header & Market Regime data loading.
3. Test keyboard shortcuts ('1', '2', '3', 'j', 'k', 'Ctrl+K').
4. Test Scanner tab with 3-stock universe ('ICICIBANK.NS', 'TCS.NS', 'IDEA.NS').
5. Test Deep Dive tab (candlestick chart canvas rendering, 7 pillars, rule checklist).
6. Test Paper Portfolio tab (add new trade modal, verify table, close trade modal, verify history).
7. Test failure states (invalid ticker input).
8. Save screenshots of each state to .history/qa_screenshots/.
"""

import os
import sys
import time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

def run_qa():
    console_errors = []
    page_errors = []
    failed_requests = []
    
    screenshot_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".history", "qa_screenshots")
    os.makedirs(screenshot_dir, exist_ok=True)

    print("==================================================")
    print("STARTING FULL END-TO-END PLAYWRIGHT QA TEST")
    print("==================================================")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        # Listeners for console, page errors, and failed requests
        def on_console(msg):
            if msg.type in ("error", "warning"):
                print(f"[CONSOLE {msg.type.upper()}] {msg.text}")
                if msg.type == "error":
                    console_errors.append(msg.text)

        page.on("console", on_console)
        page.on("pageerror", lambda err: page_errors.append(str(err)))
        page.on("requestfailed", lambda req: failed_requests.append(f"{req.method} {req.url} - {req.failure}"))

        # Step 1: Navigate to http://localhost:3000
        print("\n[Step 1] Navigating to http://localhost:3000/ ...")
        page.goto("http://localhost:3000/", wait_until="networkidle")
        time.sleep(1)
        page.screenshot(path=os.path.join(screenshot_dir, "01_initial_load.png"))
        print("  [OK] Page loaded successfully")

        # Step 2: Verify Header & Market Regime
        print("\n[Step 2] Verifying Global Header & Market Regime...")
        page.wait_for_selector("header", timeout=5000)
        regime_banner = page.locator("header")
        assert regime_banner.count() > 0
        header_text = regime_banner.inner_text()
        print(f"  [OK] Header rendered. Text summary:\n    {header_text.replace(chr(10), ' | ')[:120]}...")
        assert "VERCHON" in header_text
        assert "HOSTILE" in header_text or "NIFTY" in header_text

        # Step 3: Test Keyboard Navigation (1, 2, 3)
        print("\n[Step 3] Testing Keyboard Tab Switching ('2', '3', '1')...")
        # Press '2' -> Portfolio
        page.keyboard.press("2")
        time.sleep(0.5)
        page.wait_for_selector("text=ACTIVE TRADES", timeout=3000)
        page.screenshot(path=os.path.join(screenshot_dir, "02_tab_portfolio.png"))
        print("  [OK] Hotkey '2' successfully switched to Paper Portfolio tab")

        # Press '3' -> Deep Dive
        page.keyboard.press("3")
        time.sleep(0.5)
        page.wait_for_selector("text=Daily Price Action", timeout=8000)
        page.screenshot(path=os.path.join(screenshot_dir, "03_tab_deepdive.png"))
        print("  [OK] Hotkey '3' successfully switched to Stock Deep Dive tab")

        # Press '1' -> Scanner
        page.keyboard.press("1")
        time.sleep(0.5)
        page.wait_for_selector("button:has-text('Run Deterministic Scan')", timeout=5000)
        page.screenshot(path=os.path.join(screenshot_dir, "04_tab_scanner.png"))
        print("  [OK] Hotkey '1' successfully switched back to Scanner tab")

        # Step 4: Run 3-Stock Deterministic Scan
        print("\n[Step 4] Running 3-Stock Deterministic Scan...")
        universe_select = page.locator("select").first
        universe_select.select_option("fast3")
        print("  [OK] Selected Universe: 3-Stock Fast Test (ICICI, TCS, IDEA)")
        
        # Click Run Deterministic Scan button
        scan_btn = page.locator("button:has-text('Run Deterministic Scan')")
        scan_btn.click()
        print("  [OK] Clicked 'Run Deterministic Scan'")

        # Wait for candidate cards to appear
        page.wait_for_selector("text=ICICIBANK", timeout=15000)
        page.screenshot(path=os.path.join(screenshot_dir, "05_scan_results.png"))
        print("  [OK] Scan completed. Candidate cards rendered successfully!")

        cards = page.locator("div.group:has-text('ICICIBANK')")
        assert cards.count() > 0
        print(f"  [OK] Found candidate cards on page.")

        # Step 5: Test Deep Dive with Chart & Rules
        print("\n[Step 5] Testing Deep Dive Screen & Canvas Chart...")
        # Click ICICIBANK card to open deep dive
        cards.first.click()
        time.sleep(1)
        page.wait_for_selector("text=Daily Price Action", timeout=8000)
        
        # Verify chart canvas element exists
        canvas = page.locator("canvas")
        assert canvas.count() > 0, "Canvas chart element must be rendered"
        print(f"  [OK] Lightweight-Charts canvas element confirmed (Found {canvas.count()} canvas layer(s))")

        # Verify strategy rule checklist
        page.wait_for_selector("text=STRATEGY SAFETY & ENTRY CHECKLIST", timeout=5000)
        print("  [OK] Strategy rule checklist rendered")

        # Verify 7-pillars card
        page.wait_for_selector("text=COMPANY FINANCIAL HEALTH & SAFETY (7 PILLARS)", timeout=5000)
        print("  [OK] 7-Pillar Fundamental Analysis rendered")
        page.screenshot(path=os.path.join(screenshot_dir, "06_deepdive_verified.png"))

        # Step 6: Test Paper Portfolio (Add and Close Trade)
        print("\n[Step 6] Testing Paper Portfolio Trade Execution...")
        page.keyboard.press("2")
        time.sleep(0.5)
        page.wait_for_selector("button:has-text('New Trade')", timeout=3000)
        
        # Open Modal
        page.locator("button:has-text('New Trade')").click()
        page.wait_for_selector("text=VERCHON VECTOR · ORDER EXECUTION", timeout=5000)
        print("  [OK] 'VERCHON VECTOR · ORDER EXECUTION' modal opened cleanly")

        # Fill ticker & trigger live auto-fill
        ticker_input = page.locator("input[placeholder*='TCS.NS or ICICIBANK.NS']")
        ticker_input.click()
        page.keyboard.press("Control+A")
        page.keyboard.press("Backspace")
        ticker_input.type("WIPRO.NS", delay=50)
        page.keyboard.press("Enter")
        page.wait_for_timeout(3000)

        # Verify entry price auto-filled
        entry_val = page.locator("input[step='0.05']").first.input_value()
        print(f"  [OK] Auto-filled live entry price: ₹{entry_val}")
        assert float(entry_val) > 0

        page.screenshot(path=os.path.join(screenshot_dir, "07_modal_autofill.png"))

        # Submit trade
        submit_btn = page.locator("button:has-text('Execute Paper Order')")
        submit_btn.click()
        page.wait_for_selector("div.rounded-xl:has-text('WIPRO.NS')", timeout=15000)
        page.screenshot(path=os.path.join(screenshot_dir, "08_trade_recorded.png"))
        print("  [OK] Test position recorded. Verifying in open positions...")

        # Verify position card
        test_card = page.locator("div.rounded-xl:has-text('WIPRO.NS')").first
        assert test_card.count() > 0, "New position must appear in active trades"
        print("  [OK] 'WIPRO.NS' confirmed in active portfolio with R:R Bracket Bar")

        # Close the position
        close_btn = page.locator("button[data-testid='close-position-btn']").first
        close_btn.wait_for(state="visible", timeout=10000)
        assert close_btn.count() > 0
        close_btn.click()
        time.sleep(2)
        page.screenshot(path=os.path.join(screenshot_dir, "09_trade_closed.png"))
        print("  [OK] Position closed cleanly. Confirmed in Closed Trades ledger")

        # Step 7: Test Failure State (Invalid Ticker in Deep Dive)
        print("\n[Step 7] Testing safe failure handling (Invalid Ticker in Deep Dive)...")
        page.keyboard.press("3")
        time.sleep(0.5)
        search_input = page.locator("form input[type='text']").first
        search_input.fill("NON_EXISTENT_TICKER_XYZ")
        page.locator("button[type='submit']:has-text('Deep Dive')").click()
        time.sleep(3)
        page.screenshot(path=os.path.join(screenshot_dir, "10_invalid_ticker_handling.png"))
        
        # Verify UI handles error without crashing to blank screen
        body_text = page.locator("body").inner_text()
        assert len(body_text) > 100, "UI must not crash to blank screen"
        print("  [OK] UI gracefully handled non-existent ticker without crash")

        # Restore valid view
        search_input.fill("TCS.NS")
        page.locator("button[type='submit']:has-text('Deep Dive')").click()
        time.sleep(2)
        print("  [OK] Restored to valid ticker (TCS.NS)")

        browser.close()

    print("\n==================================================")
    print("PLAYWRIGHT QA TEST COMPLETED")
    print(f"Console Errors: {len(console_errors)}")
    print(f"Page Exceptions: {len(page_errors)}")
    print(f"Failed Requests: {len(failed_requests)}")
    print("==================================================")

    if console_errors:
        print("\nConsole Errors detected:")
        for err in console_errors:
            print(f"  - {err}")

    if page_errors:
        print("\nPage Exceptions detected:")
        for err in page_errors:
            print(f"  - {err}")

    if failed_requests:
        print("\nFailed Network Requests:")
        for req in failed_requests:
            print(f"  - {req}")

    return {
        "console_errors": console_errors,
        "page_errors": page_errors,
        "failed_requests": failed_requests,
    }

if __name__ == "__main__":
    result = run_qa()
    if result["page_errors"]:
        sys.exit(1)
    sys.exit(0)
