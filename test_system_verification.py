import os
import json
import tempfile
from fastapi.testclient import TestClient
import paper_store
from server import app

client = TestClient(app)

def run_tests():
    print("=== STARTING BACKEND VERIFICATION ===")
    
    # 1. Test Fault Tolerance in paper_store
    print("\n[1/6] Testing paper_store fault tolerance...")
    orig_ledger = paper_store.LEDGER_FILE
    with tempfile.TemporaryDirectory() as tmp_dir:
        # Non-existent file
        fake_path = os.path.join(tmp_dir, "non_existent.json")
        paper_store.LEDGER_FILE = fake_path
        positions = paper_store._load_ledger_raw()
        assert positions == [], "Missing file must return empty list"
        print("  ✓ Non-existent ledger returns [] safely")

        # Corrupted JSON
        corrupt_path = os.path.join(tmp_dir, "corrupt.json")
        with open(corrupt_path, "w", encoding="utf-8") as f:
            f.write("{ invalid json [")
        paper_store.LEDGER_FILE = corrupt_path
        positions = paper_store._load_ledger_raw()
        assert positions == [], "Corrupted file must return empty list"
        print("  ✓ Corrupted ledger safely falls back to []")

        # Add, list, close
        valid_path = os.path.join(tmp_dir, "test_ledger.json")
        paper_store.LEDGER_FILE = valid_path
        pos = paper_store.add_paper_position(
            ticker="TCS.NS",
            entry_price=3500.0,
            stop_price=3400.0,
            quantity=10,
            strategy_name="Trend Pullback / Continuation",
        )
        assert pos["ticker"] == "TCS.NS"
        assert pos["status"] == "OPEN"
        assert pos["risk_percent"] == 2.86
        print("  ✓ Added paper position with auto risk calculation")

        all_pos = paper_store.get_paper_positions(evaluate_exits=False)
        assert len(all_pos) == 1
        print("  ✓ Successfully loaded persisted paper position")

        closed = paper_store.close_paper_position(
            position_id=pos["id"],
            exit_price=3700.0,
            exit_reason="Target reached",
        )
        assert closed["status"] == "CLOSED"
        assert closed["realized_pnl"] == 2000.0
        print("  ✓ Successfully closed paper position with correct P&L")
    paper_store.LEDGER_FILE = orig_ledger

    # 2. Test Health Endpoint
    print("\n[2/6] Testing GET /api/health...")
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    print("  ✓ Health endpoint returned 200 OK")

    # 3. Test Regime Endpoint
    print("\n[3/6] Testing GET /api/regime...")
    res = client.get("/api/regime")
    assert res.status_code == 200
    data = res.json()
    assert "regime" in data
    assert "breadth" in data
    print(f"  ✓ Market regime loaded: {data.get('regime')} (Score: {data.get('regime_score')})")

    # 4. Test Paper Trades API
    print("\n[4/6] Testing GET /api/paper-trades...")
    res = client.get("/api/paper-trades")
    assert res.status_code == 200
    assert isinstance(res.json(), list)
    print(f"  ✓ Paper trades endpoint returned {len(res.json())} positions")

    # 5. Test Stock Dossier Endpoint (TCS.NS)
    print("\n[5/6] Testing GET /api/stocks/TCS.NS...")
    res = client.get("/api/stocks/TCS.NS")
    assert res.status_code == 200
    res_data = res.json()
    assert res_data["ticker"] == "TCS.NS"
    assert "dossier" in res_data
    assert "fundamentals" in res_data["dossier"]
    assert "technicals" in res_data["dossier"]
    assert "chart" in res_data
    assert "rule_breakdown" in res_data
    print(f"  ✓ Stock dossier for TCS.NS fetched cleanly (Candles: {len(res_data['chart']['candles'])}, Rules: {len(res_data['rule_breakdown'])})")

    # 6. Test 3-Stock Deterministic Scan
    print("\n[6/6] Testing POST /api/scan with 3-stock universe...")
    test_universe = ["ICICIBANK.NS", "TCS.NS", "IDEA.NS"]
    res = client.post("/api/scan", json={"tickers": test_universe})
    assert res.status_code == 200
    scan_result = res.json()
    assert "candidates" in scan_result
    assert "market_regime" in scan_result
    candidates = scan_result["candidates"]
    print(f"  ✓ Scan returned {len(candidates)} ranked candidates for {test_universe}")
    for c in candidates:
        print(f"    - {c['ticker']}: Score {c.get('overall_score')} | Strategy: {c.get('strategy', {}).get('primary_strategy') or 'No setup'}")

    print("\n=== ALL BACKEND VERIFICATION CHECKS PASSED ===")

if __name__ == "__main__":
    run_tests()
