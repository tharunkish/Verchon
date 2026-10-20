"""
test_paper_engine.py - Automated Backend & Engine Verification
Tests:
1. Automated Quote Resolution (Entry, Stop Loss, Target 1, Target 2, Sizing)
2. Indian Delivery Statutory Transaction Cost Calculation
3. Account Margin & Cash Accounting
4. Trailing Stop Update
5. Partial Scale-Out (50%) Execution
6. Full Position Exit & Net Realized P&L
"""

import urllib.request
import json
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

BASE_URL = "http://127.0.0.1:8000"

def request_json(path, method="GET", data=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def run_tests():
    import os
    print("=" * 60)
    print("RUNNING INSTITUTIONAL PAPER TRADING ENGINE TEST SUITE")
    print("=" * 60)

    # Safety Guard: preserve user's real ledger if exists
    pos_file = os.path.join(".history", "paper_positions.json")
    acc_file = os.path.join(".history", "paper_account.json")
    pos_backup = None
    acc_backup = None
    if os.path.exists(pos_file):
        with open(pos_file, "r", encoding="utf-8") as f:
            pos_backup = f.read()
    if os.path.exists(acc_file):
        with open(acc_file, "r", encoding="utf-8") as f:
            acc_backup = f.read()

    try:
        # 1. Reset Account to known state
        print("\n[Test 1] Resetting virtual account...")
        acc = request_json("/api/paper-trades/account/reset", method="POST", data={
            "starting_capital": 1000000.0,
            "risk_per_trade_pct": 1.0,
            "clear_ledger": True
        })
        assert acc["starting_capital"] == 1000000.0
        assert acc["available_cash"] == 1000000.0
        print(f"  [OK] Initialized Account Equity: ₹{acc['total_equity']:,} | Cash: ₹{acc['available_cash']:,}")

        # 2. Automated Quote & Strategy Resolution
        print("\n[Test 2] Querying Automated Trade Setup Quote for TCS.NS...")
        quote = request_json("/api/paper-trades/quote?ticker=TCS.NS")
        assert quote["ticker"] == "TCS.NS"
        assert quote["current_price"] > 0
        assert quote["suggested_stop"] > 0
        assert quote["suggested_stop"] < quote["current_price"]
        assert quote["target_1"] > quote["current_price"]
        assert quote["target_2"] > quote["target_1"]
        assert quote["recommended_quantity"] > 0
        print(f"  [OK] Auto-Resolved TCS.NS:")
        print(f"       Entry: ₹{quote['current_price']} | Stop: ₹{quote['suggested_stop']} ({quote['risk_percent']}%)")
        print(f"       Target 1 (2R): ₹{quote['target_1']} | Target 2 (3R): ₹{quote['target_2']}")
        print(f"       Risk-Budget Sized Qty: {quote['recommended_quantity']} shares | Est Round-Trip Fees: ₹{quote['estimated_round_trip_charges']}")

        # 3. Add Paper Position
        print("\n[Test 3] Executing Paper Order with Targets & Costs...")
        entry_p = quote["current_price"]
        stop_p = quote["suggested_stop"]
        t1 = quote["target_1"]
        t2 = quote["target_2"]
        qty = 100

        order_payload = {
            "ticker": "TCS.NS",
            "entry_price": entry_p,
            "stop_price": stop_p,
            "target_1": t1,
            "target_2": t2,
            "quantity": qty,
            "strategy_name": quote["strategy_name"],
            "order_type": "MARKET"
        }
        pos = request_json("/api/paper-trades/add", method="POST", data=order_payload)
        pos_id = pos["id"]
        assert pos["status"] == "OPEN"
        assert pos["buy_charges"] > 0
        print(f"  [OK] Order Recorded: {pos_id} | Qty: {pos['quantity']} | Buy Charges: ₹{pos['buy_charges']}")

        acc_after_buy = request_json("/api/paper-trades/account")
        expected_cash = 1000000.0 - (entry_p * qty + pos["buy_charges"])
        assert abs(acc_after_buy["available_cash"] - expected_cash) < 1.0
        print(f"  [OK] Cash Margin Debited Accurately: Available Cash = ₹{acc_after_buy['available_cash']:,}")

        # 4. Trailing Stop Loss to Breakeven
        print("\n[Test 4] Updating Stop Loss (Trail to Breakeven)...")
        updated = request_json("/api/paper-trades/update-stop", method="POST", data={
            "position_id": pos_id,
            "new_stop_price": entry_p
        })
        assert updated["stop_price"] == entry_p
        print(f"  [OK] Stop price updated to Breakeven: ₹{updated['stop_price']}")

        # 5. Partial Scale-Out (50 Shares at Target 1)
        print("\n[Test 5] Scaling Out 50% at Target 1...")
        partial_res = request_json("/api/paper-trades/close", method="POST", data={
            "position_id": pos_id,
            "exit_reason": "TARGET_1_HIT",
            "exit_price": t1,
            "quantity_to_close": 50
        })
        assert partial_res["status"] == "CLOSED"
        assert partial_res["quantity"] == 50
        assert partial_res["net_pnl"] > 0
        print(f"  [OK] Partial scale-out filled: 50 shares @ ₹{t1} | Net P&L: ₹{partial_res['net_pnl']} | Total Fees: ₹{partial_res['total_charges']}")

        # Check remaining open position
        positions = request_json("/api/paper-trades")
        remaining_open = [p for p in positions if p["id"] == pos_id and p["status"] == "OPEN"]
        assert len(remaining_open) == 1
        assert remaining_open[0]["quantity"] == 50
        print(f"  [OK] Confirmed remaining open position: {remaining_open[0]['quantity']} shares")

        # 6. Full Close remaining 50 Shares at Target 2
        print("\n[Test 6] Closing Remaining 50 Shares at Target 2...")
        full_res = request_json("/api/paper-trades/close", method="POST", data={
            "position_id": pos_id,
            "exit_reason": "TARGET_2_HIT",
            "exit_price": t2
        })
        assert full_res["status"] == "CLOSED"
        assert full_res["net_pnl"] > 0
        print(f"  [OK] Final 50 shares closed @ ₹{t2} | Net P&L: ₹{full_res['net_pnl']}")

        # 7. Verify Account Blotter Metrics
        print("\n[Test 7] Verifying Account Ledger Performance Metrics...")
        final_acc = request_json("/api/paper-trades/account")
        assert final_acc["open_trades_count"] == 0
        assert final_acc["closed_trades_count"] == 2
        assert final_acc["win_rate_pct"] == 100.0
        assert final_acc["total_realized_net"] > 0
        print(f"  [OK] Account Final Equity: ₹{final_acc['total_equity']:,}")
        print(f"       Win Rate: {final_acc['win_rate_pct']}% | Total Net Realized P&L: ₹{final_acc['total_realized_net']:,}")
        print(f"       Total Statutory Charges Paid: ₹{final_acc['total_charges_paid']}")

    finally:
        if pos_backup is not None:
            with open(pos_file, "w", encoding="utf-8") as f:
                f.write(pos_backup)
        if acc_backup is not None:
            with open(acc_file, "w", encoding="utf-8") as f:
                f.write(acc_backup)
        print("\n[Safety Cleanup] Restored user's live ledger and positions.")

    print("\n" + "=" * 60)
    print("ALL 7 INSTITUTIONAL PAPER ENGINE TESTS PASSED PERFECTLY!")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
