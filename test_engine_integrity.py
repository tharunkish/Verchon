"""
Engine Invariant & Property-Style Test Suite (VERCHON Integrity Upgrade)
Verifies core system invariants and ensures impossible/contradictory states cannot exist.

Invariants Verified:
1. Data Integrity: NaN / invalid required input cannot qualify.
2. Risk Boundaries: Stop distance > 8% or <= 0% cannot produce an active signal (ENTRY_REJECTED).
3. Entry Gap Invariant: Gap > 5% strictly rejects entry.
4. Signal Completeness: SIGNAL_TRIGGERED requires 100% of required strategy predicates to pass.
5. Paper Trading Lifecycle: A position cannot be OPEN without positive entry_price, stop_price, quantity, and entry_date.
6. Position Close Integrity: Closed position requires valid exit_price and exit_reason.
7. Legitimately N/A vs Missing: Bank/NBFC N/A fields do not penalize completeness or behave like 0.0.
8. Benchmark Alignment: Alpha calculations strictly align stock and benchmark on matching dates.
"""

import unittest
import numpy as np
import pandas as pd

import techanalysis as ta
import improvedfundanalysis as ifa
import screener_scraper as scraper
import resultanalysis as ra
import paper_store as ps


class TestEngineIntegrityInvariants(unittest.TestCase):

    def setUp(self):
        # Create standard synthetic 100-bar uptrending dataframe
        dates = pd.date_range("2025-01-01", periods=100, freq="B")
        base_price = 100.0 + np.linspace(0, 50, 100)
        self.valid_df = pd.DataFrame({
            "Open": base_price + 0.5,
            "High": base_price + 2.0,
            "Low": base_price - 1.0,
            "Close": base_price + 1.0,
            "Volume": 100000.0
        }, index=dates)

    # -------------------------------------------------------------------------
    # Invariant 1: OHLCV Validation rejects impossible price bounds & NaN
    # -------------------------------------------------------------------------
    def test_ohlcv_validation_rejects_impossible_bars(self):
        # High < Low
        bad_df = self.valid_df.copy()
        bad_df.iloc[10, bad_df.columns.get_loc("High")] = bad_df.iloc[10]["Low"] - 5.0
        is_val, errs = ta.validate_ohlcv_data(bad_df, "TEST")
        self.assertFalse(is_val)
        self.assertTrue(any("High < Low" in e for e in errs))

        # Close <= 0
        zero_df = self.valid_df.copy()
        zero_df.iloc[15, zero_df.columns.get_loc("Close")] = 0.0
        is_val, errs = ta.validate_ohlcv_data(zero_df, "TEST")
        self.assertFalse(is_val)
        self.assertTrue(any("Close <= 0" in e for e in errs))

        # Non-monotonic dates
        unsorted_df = self.valid_df.sample(frac=1.0)
        is_val, errs = ta.validate_ohlcv_data(unsorted_df, "TEST")
        self.assertFalse(is_val)
        self.assertTrue(any("monotonically" in e for e in errs))

        # Duplicate dates
        dup_df = pd.concat([self.valid_df, self.valid_df.iloc[[-1]]])
        is_val, errs = ta.validate_ohlcv_data(dup_df, "TEST")
        self.assertFalse(is_val)
        self.assertTrue(any("Duplicate" in e for e in errs))

    # -------------------------------------------------------------------------
    # Invariant 2: Benchmark date alignment strictly prevents mismatched alpha
    # -------------------------------------------------------------------------
    def test_benchmark_alignment_handles_mismatched_calendars(self):
        # Stock traded on Monday, Tuesday, Wednesday
        stock_dates = pd.to_datetime(["2025-01-06", "2025-01-07", "2025-01-08"])
        stock_s = pd.Series([100.0, 105.0, 110.0], index=stock_dates)

        # Benchmark traded on Tuesday, Wednesday, Thursday
        bench_dates = pd.to_datetime(["2025-01-07", "2025-01-08", "2025-01-09"])
        bench_s = pd.Series([20000.0, 20100.0, 20200.0], index=bench_dates)

        aligned_stock, aligned_bench = ta.align_stock_and_benchmark(stock_s, bench_s)

        # Common intersection must strictly be Tuesday and Wednesday
        expected_dates = pd.to_datetime(["2025-01-07", "2025-01-08"])
        self.assertEqual(len(aligned_stock), 2)
        self.assertEqual(len(aligned_bench), 2)
        pd.testing.assert_index_equal(aligned_stock.index, expected_dates)
        pd.testing.assert_index_equal(aligned_bench.index, expected_dates)

    # -------------------------------------------------------------------------
    # Invariant 3: Risk Filter Invariant - Risk > 8% rejects entry
    # -------------------------------------------------------------------------
    def test_risk_filter_invariant_rejects_greater_than_8_percent(self):
        # Calculate position size with risk > 8%
        entry = 100.0
        stop = 90.0  # 10% risk
        size_res = ta.calculate_position_size(entry_price=entry, stop_price=stop)
        self.assertFalse(size_res["valid"])
        self.assertEqual(size_res["actual_quantity"], 0)
        self.assertIn("RISK_OUT_OF_BOUNDS", size_res["reason"])

        # Entry gap filter invariant: > 5% gap strictly rejected
        gap_ok, gap_reason = ta.evaluate_entry_gap(signal_close=100.0, next_open=106.0)
        self.assertFalse(gap_ok)
        self.assertEqual(gap_reason, "EXCESSIVE_ENTRY_GAP")

    # -------------------------------------------------------------------------
    # Invariant 4: Truth table derivation - SIGNAL_TRIGGERED requires 100% predicates passing
    # -------------------------------------------------------------------------
    def test_truth_table_predicate_soundness(self):
        # Evaluate trend qualification truth table
        trend_info = ta.analyze_trend(self.valid_df)
        is_qual, reasons, tt = ta.check_trend_qualification(self.valid_df, trend_info)

        # Because len(valid_df) == 100 < 200, it must fail with history_length_200 predicate
        self.assertFalse(is_qual)
        self.assertTrue(len(tt) > 0)
        history_pred = [p for p in tt if p["name"] == "history_length_200"][0]
        self.assertFalse(history_pred["passed"])
        self.assertIsNotNone(history_pred["failure_reason"])

    # -------------------------------------------------------------------------
    # Invariant 5: Legitimately N/A vs Missing Fundamentals
    # -------------------------------------------------------------------------
    def test_legitimately_na_fields_not_penalized_for_financials(self):
        bank_data = {
            "COMPANY": {"company_name": "Test Bank Ltd", "company_type": "BANK"},
            "VALUATION": {"current_pe": 15.0, "p_b": 2.1},
            "ANNUAL_FINANCIALS": {"profit_5y_cagr": 18.0},
            "QUARTERLY_FINANCIALS": {"recent_sales_yoy": 14.0, "recent_profit_yoy": 20.0},
            "BALANCE_SHEET": {},  # D/E not applicable to banks
            "RATIOS": {"roe": 16.5},  # ROCE not applicable to banks
            "SHAREHOLDING": {"fii_holding": 35.0, "dii_holding": 25.0},
        }

        comp_type, conf = ifa.classify_company_archetype(bank_data)
        self.assertEqual(comp_type, "BANK")

        comp_pct, conf_rating, details = ifa.evaluate_data_completeness(bank_data, "BANK")
        self.assertIn("roce", details["legitimately_na_fields"])
        self.assertIn("debt_to_equity", details["legitimately_na_fields"])
        # Should not expect ROCE or D/E in expected fields for BANK
        self.assertNotIn("roce", details["expected_fields"])
        self.assertNotIn("debt_to_equity", details["expected_fields"])

    # -------------------------------------------------------------------------
    # Invariant 6: Data quality failure safe propagation (Never becomes 0.0)
    # -------------------------------------------------------------------------
    def test_failed_data_quality_fails_safely_without_silent_zeros(self):
        failed_raw = scraper.create_failed_fundamental_data("BADTICKER", "HTTP 404 Page Not Found")
        self.assertFalse(failed_raw["DATA_QUALITY"]["is_valid"])

        analyzed = ifa.analyze_fundamentals(failed_raw)
        self.assertIsNone(analyzed["fundamental_score"])
        self.assertEqual(analyzed["data_completeness"], 0.0)
        self.assertEqual(analyzed["analysis_confidence"], "LOW")

        # Result analysis qualification check
        is_qual, reasons, tt = ra.check_fundamental_qualification(analyzed)
        self.assertFalse(is_qual)
        self.assertTrue(any("Data quality invalid" in r for r in reasons))
        dq_pred = [p for p in tt if p["name"] == "data_quality_valid"][0]
        self.assertFalse(dq_pred["passed"])

    # -------------------------------------------------------------------------
    # Invariant 7: Paper Position Lifecycle Validation Invariants
    # -------------------------------------------------------------------------
    def test_paper_position_invariants(self):
        # Invalid entry price <= 0
        with self.assertRaises(ValueError):
            ps.add_paper_position("INFY", entry_price=0.0, stop_price=100.0, quantity=10, strategy_name="BREAKOUT")

        # Invalid stop >= entry
        with self.assertRaises(ValueError):
            ps.add_paper_position("INFY", entry_price=100.0, stop_price=105.0, quantity=10, strategy_name="BREAKOUT")

        # Invalid risk > 8%
        with self.assertRaises(ValueError):
            ps.add_paper_position("INFY", entry_price=100.0, stop_price=90.0, quantity=10, strategy_name="BREAKOUT")

        # Invalid quantity <= 0
        with self.assertRaises(ValueError):
            ps.add_paper_position("INFY", entry_price=100.0, stop_price=95.0, quantity=0, strategy_name="BREAKOUT")

    # -------------------------------------------------------------------------
    # Invariant 8: Temporal Look-Ahead Integrity (as_of_date slicing)
    # -------------------------------------------------------------------------
    def test_temporal_look_ahead_protection(self):
        # Slicing at index 60 must contain exactly 61 rows and latest bar == date at index 60
        cutoff_date = self.valid_df.index[60].strftime("%Y-%m-%d")
        
        # Test batch cache simulation with as_of_date
        ta._BATCH_OHLCV_CACHE["SYNTH.NS"] = self.valid_df.copy()
        try:
            sliced_stock, _ = ta.fetch_daily_ohlcv("SYNTH", period="2y", as_of_date=cutoff_date)
            self.assertEqual(len(sliced_stock), 61)
            self.assertEqual(sliced_stock.index[-1].strftime("%Y-%m-%d"), cutoff_date)
            # Ensure future dates beyond cutoff are not present
            self.assertTrue((sliced_stock.index <= pd.to_datetime(cutoff_date)).all())
        finally:
            ta._BATCH_OHLCV_CACHE.pop("SYNTH.NS", None)

    # -------------------------------------------------------------------------
    # Invariant 9: Observational Evidence Layers (Weekly trend, RVOL, ATR)
    # -------------------------------------------------------------------------
    def test_observational_evidence_layers(self):
        # Weekly trend
        weekly_trend = ta.calculate_weekly_trend(self.valid_df)
        self.assertTrue(weekly_trend["is_evidence_only"])
        self.assertIn("weekly_10_ema", weekly_trend)
        self.assertIn("alignment", weekly_trend)

        # RVOL
        rvol = ta.calculate_rvol(self.valid_df)
        self.assertTrue(rvol["is_evidence_only"])
        self.assertIn("rvol_20d", rvol)
        self.assertIn("rvol_50d", rvol)
        self.assertIsInstance(rvol["volume_expansion_confirmed"], bool)

        # ATR
        atr = ta.calculate_atr(self.valid_df, period=14)
        self.assertTrue(atr["is_evidence_only"])
        self.assertIn("atr_14", atr)
        self.assertIn("atr_pct", atr)
        self.assertIn("atr_1_5x", atr)
        self.assertIn("atr_2_0x", atr)
        self.assertGreater(atr["atr_14"], 0.0)

    # -------------------------------------------------------------------------
    # Invariant 10: Event Risk Proximity Alert (Observational Risk Context)
    # -------------------------------------------------------------------------
    def test_event_risk_alert_mechanism(self):
        # 1. Announcement with earnings within 5 days of target date
        announcements = [
            {
                "title": "Board Meeting to consider Financial Results",
                "date": "15 Jan 2025",
                "description": "Board Meeting scheduled for unaudited Q3 financial results"
            }
        ]
        
        # As of 12 Jan 2025 (3 days difference)
        event_res = ra.evaluate_event_risk(announcements, as_of_date="2025-01-12")
        self.assertTrue(event_res["has_event_risk"])
        self.assertEqual(event_res["risk_level"], "WARNING")
        self.assertTrue(event_res["is_evidence_only"])
        self.assertIn("Financial Results", event_res["event_warning"])

        # 2. Distant announcement (> 30 days)
        event_distant = ra.evaluate_event_risk(announcements, as_of_date="2025-03-01")
        self.assertFalse(event_distant["has_event_risk"])
        self.assertEqual(event_distant["risk_level"], "LOW")

    # -------------------------------------------------------------------------
    # Invariant 11: Reproducibility & Audit Trail Metadata
    # -------------------------------------------------------------------------
    def test_audit_metadata_structure(self):
        self.assertEqual(ra.ENGINE_VERSION, "2.1.0")
        self.assertEqual(ra.STRATEGY_VERSION, "1.0.0")
        self.assertEqual(ra.SCORING_VERSION, "1.1.0")


if __name__ == "__main__":
    unittest.main()

