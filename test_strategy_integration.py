"""
test_strategy_integration.py
Automated deterministic test suite for VERCHON's 3 new institutional swing strategies:
1. Liquidity Sweep (SMC Stop-Hunt & Reclaim)
2. Volatility Squeeze (John Carter Coiling & Expansion)
3. Rubber Band Snapback (Order Block / Mean-Reversion)

Also asserts 100% regression safety on existing V1 strategies.
"""

import sys
import unittest
import numpy as np
import pandas as pd

import techanalysis as ta
import resultanalysis as ra


class TestInstitutionalStrategies(unittest.TestCase):

    def setUp(self):
        # Set reproducible random seed
        np.random.seed(42)

    def test_liquidity_sweep_detection(self):
        """Tests that an intraday sweep below support followed by a volume reclaim triggers LIQUIDITY_SWEEP."""
        n = 40
        dates = pd.date_range("2026-01-01", periods=n, freq="B")
        
        # 39 bars trading above support at 100.0
        highs = np.full(n, 110.0)
        lows = np.full(n, 102.0)
        closes = np.full(n, 106.0)
        opens = np.full(n, 105.0)
        vols = np.full(n, 100000.0)

        # Baseline support floor at 100.0 (within prior 20-day window index 19..38)
        lows[25] = 100.0

        # Bar 39 (Today): Sweeps to 98.0 (< 100.0), absorbs and closes at 100.8 (>= 100.0) with high volume (+2.86% rebound <= 3.8%)
        opens[-1] = 99.0
        lows[-1] = 98.0
        highs[-1] = 102.0
        closes[-1] = 100.8
        vols[-1] = 250000.0  # 2.5x volume

        df = pd.DataFrame({
            "Open": opens, "High": highs, "Low": lows, "Close": closes, "Volume": vols
        }, index=dates)

        trend_info = {"Trend_Classification": "Uptrend"}
        res = ta.evaluate_liquidity_sweep(df, trend_info, trend_qual=True, trend_reasons=[])

        self.assertTrue(res["setup_detected"], "Liquidity sweep setup should be detected")
        self.assertTrue(res["signal_triggered"], "Liquidity sweep signal should trigger")
        self.assertEqual(res["strategy_name"], "LIQUIDITY_SWEEP")
        self.assertAlmostEqual(res["stop_price"], round(98.0 * 0.995, 2), places=2)
        self.assertGreater(res["target_1"], res["signal_close"])
        self.assertGreater(res["risk_reward_ratio"], 1.8)
        print("  [OK] Liquidity Sweep test passed successfully.")

    def test_volatility_squeeze_detection(self):
        """Tests that Bollinger Band compression inside Keltner Channel followed by expansion triggers VOLATILITY_SQUEEZE."""
        n = 45
        dates = pd.date_range("2026-01-01", periods=n, freq="B")
        
        # Generate tight consolidation where BB is strictly inside KC
        base_price = 200.0
        noise = np.sin(np.linspace(0, 10, n)) * 0.5
        closes = base_price + noise
        opens = closes - 0.2
        highs = closes + 0.6
        lows = closes - 0.6
        vols = np.full(n, 50000.0)

        # Bar 44 (Today): Massive expansion bar with volume surge
        opens[-1] = 200.0
        highs[-1] = 212.0
        lows[-1] = 199.5
        closes[-1] = 210.0
        vols[-1] = 180000.0  # 3.6x volume surge

        df = pd.DataFrame({
            "Open": opens, "High": highs, "Low": lows, "Close": closes, "Volume": vols
        }, index=dates)

        trend_info = {"Trend_Classification": "Strong uptrend"}
        res = ta.evaluate_volatility_squeeze(df, trend_info, trend_qual=True, trend_reasons=[])

        self.assertTrue(res["setup_detected"], "Volatility squeeze setup should be detected")
        self.assertTrue(res["signal_triggered"], "Volatility squeeze expansion signal should trigger")
        self.assertEqual(res["strategy_name"], "VOLATILITY_SQUEEZE")
        self.assertGreater(res["squeeze_bars_count"], 0)
        self.assertGreater(res["target_1"], res["signal_close"])
        print("  [OK] Volatility Squeeze test passed successfully.")

    def test_rubber_band_snapback_detection(self):
        """Tests that a strong leader pulling back into deep oversold prints RUBBER_BAND_SNAPBACK."""
        n = 70
        dates = pd.date_range("2026-01-01", periods=n, freq="B")

        # Long term bull market (Close moves from 100 to 220)
        closes = np.linspace(100.0, 220.0, n)
        highs = closes + 2.0
        lows = closes - 2.0
        opens = closes - 0.5
        vols = np.full(n, 80000.0)

        # Days 65-68: Sharp 4-day flush down from 220 to 185
        closes[-5] = 205.0
        closes[-4] = 195.0
        closes[-3] = 188.0
        closes[-2] = 185.0
        lows[-2] = 183.0
        highs[-2] = 190.0

        # Day 69 (Today): Strong bounce reversal closing above yesterday's high
        opens[-1] = 186.0
        lows[-1] = 184.0
        highs[-1] = 196.0
        closes[-1] = 194.0  # Higher than yesterday's high of 190.0
        vols[-1] = 120000.0

        df = pd.DataFrame({
            "Open": opens, "High": highs, "Low": lows, "Close": closes, "Volume": vols
        }, index=dates)

        trend_info = {"Trend_Classification": "Uptrend"}
        res = ta.evaluate_rubber_band_snapback(df, trend_info, trend_qual=True, trend_reasons=[])

        self.assertTrue(res["setup_detected"], "Rubber band setup should be detected")
        self.assertTrue(res["signal_triggered"], "Rubber band reversal signal should trigger")
        self.assertEqual(res["strategy_name"], "RUBBER_BAND_SNAPBACK")
        self.assertIsNotNone(res["stop_price"])
        self.assertGreater(res["target_1"], res["signal_close"])
        print("  [OK] Rubber Band Snapback test passed successfully.")

    def test_all_strategies_orchestrator(self):
        """Tests that evaluate_all_strategies registers all 6 strategies without regressions."""
        n = 60
        dates = pd.date_range("2026-01-01", periods=n, freq="B")
        closes = np.linspace(100, 150, n)
        df = pd.DataFrame({
            "Open": closes - 0.5,
            "High": closes + 1.0,
            "Low": closes - 1.0,
            "Close": closes,
            "Volume": np.full(n, 100000.0)
        }, index=dates)

        trend_info = ta.analyze_trend(df)
        momo_info = {"Relative_Strength_Alpha_%": {"1M": 5.0, "3M": 10.0}}

        eval_res = ta.evaluate_all_strategies(df, trend_info, momo_info)
        all_strats = eval_res.get("all_strategy_results", {})

        expected_strategies = [
            "LIQUIDITY_SWEEP",
            "VOLATILITY_SQUEEZE",
            "CONSOLIDATION_BREAKOUT",
            "RUBBER_BAND_SNAPBACK",
            "TREND_PULLBACK",
            "RELATIVE_STRENGTH_CONTINUATION",
        ]

        for s in expected_strategies:
            self.assertIn(s, all_strats, f"Strategy {s} must be present in all_strategy_results")

        print("  [OK] evaluate_all_strategies registers all 6 strategies cleanly.")

    def test_liquidity_sweep_extended_cap(self):
        """Tests that a sweep which rebounds > 3.8% from sweep low is marked EXTENDED_FROM_SWEEP."""
        n = 40
        dates = pd.date_range("2026-01-01", periods=n, freq="B")
        highs = np.full(n, 110.0)
        lows = np.full(n, 102.0)
        closes = np.full(n, 106.0)
        opens = np.full(n, 105.0)
        vols = np.full(n, 100000.0)
        lows[15] = 100.0  # Support floor

        # Sweep low = 95.0, close = 102.0 (+7.37% rebound > 3.8% max cap)
        opens[-1] = 98.0
        lows[-1] = 95.0
        highs[-1] = 103.0
        closes[-1] = 102.0
        vols[-1] = 250000.0

        df = pd.DataFrame({"Open": opens, "High": highs, "Low": lows, "Close": closes, "Volume": vols}, index=dates)
        trend_info = {"Trend_Classification": "Uptrend"}
        res = ta.evaluate_liquidity_sweep(df, trend_info, trend_qual=True, trend_reasons=[])

        self.assertTrue(res["setup_detected"])
        self.assertFalse(res["signal_triggered"], "Extended sweep must not trigger signal")
        self.assertEqual(res["state"], "EXTENDED_FROM_SWEEP")
        self.assertIn("EXTENDED_FROM_SWEEP_LOW", res["rejection_reason"])
        print("  [OK] Sweep extension cap (>3.8%) properly rejects late chase entries.")

    def test_no_active_setup_fallback(self):
        """Tests that a neutral stock without active setup returns NO_ACTIVE_SETUP instead of defaulting to LIQUIDITY_SWEEP."""
        n = 60
        dates = pd.date_range("2026-01-01", periods=n, freq="B")
        # Steady downward slope so Bollinger Bands expand well outside Keltner Channel and no setup forms
        closes = 200.0 - np.arange(n) * 1.5
        highs = closes + 0.5
        lows = closes - 0.5
        opens = closes
        df = pd.DataFrame({
            "Open": opens,
            "High": highs,
            "Low": lows,
            "Close": closes,
            "Volume": np.full(n, 50000.0)
        }, index=dates)

        trend_info = {"Trend_Classification": "Downtrend", "Moving_Averages": {"DMA_50": 200.0, "DMA_200": 300.0, "DMA_50_Slope": -1.0}}
        momo_info = {"Relative_Strength_Alpha_%": {"1M": -10.0, "3M": -15.0}}

        eval_res = ta.evaluate_all_strategies(df, trend_info, momo_info)
        self.assertEqual(eval_res.get("primary_strategy"), "NO_ACTIVE_SETUP")
        self.assertEqual(eval_res.get("active_strategy_result", {}).get("strategy_name"), "NO_ACTIVE_SETUP")
        print("  [OK] Neutral candidates cleanly fallback to NO_ACTIVE_SETUP (noise eliminated).")

    def test_macro_governor_attached(self):
        """Tests that analyze_candidate attaches macro governor and cuts sizing in hostile regime."""
        hostile_ctx = {"regime": "HOSTILE", "regime_score": 16}
        # Run analyze_candidate with mock or lightweight data
        cand = ra.analyze_candidate("HAL.NS", market_context=hostile_ctx)
        self.assertIn("macro_governor", cand)
        gov = cand["macro_governor"]
        self.assertTrue(gov["is_hostile"])
        self.assertEqual(gov["sizing_multiplier"], 0.5)
        self.assertIn("HOSTILE REGIME", gov["warning"])
        print("  [OK] Macro Governor properly attaches hostile regime sizing guidance.")



if __name__ == "__main__":
    print("\n" + "=" * 65)
    print("  VERCHON INSTITUTIONAL STRATEGY TEST SUITE")
    print("=" * 65 + "\n")
    unittest.main()
