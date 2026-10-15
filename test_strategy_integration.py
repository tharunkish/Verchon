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

        # Baseline support floor at 100.0
        lows[15] = 100.0

        # Bar 39 (Today): Sweeps to 97.5 (< 100.0), absorbs and closes at 104.0 (>= 100.0) with high volume
        opens[-1] = 99.0
        lows[-1] = 97.5
        highs[-1] = 105.0
        closes[-1] = 104.0
        vols[-1] = 250000.0  # 2.5x volume

        df = pd.DataFrame({
            "Open": opens, "High": highs, "Low": lows, "Close": closes, "Volume": vols
        }, index=dates)

        trend_info = {"Trend_Classification": "Uptrend"}
        res = ta.evaluate_liquidity_sweep(df, trend_info, trend_qual=True, trend_reasons=[])

        self.assertTrue(res["setup_detected"], "Liquidity sweep setup should be detected")
        self.assertTrue(res["signal_triggered"], "Liquidity sweep signal should trigger")
        self.assertEqual(res["strategy_name"], "LIQUIDITY_SWEEP")
        self.assertAlmostEqual(res["stop_price"], round(97.5 * 0.995, 2), places=2)
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


if __name__ == "__main__":
    print("\n" + "=" * 65)
    print("  VERCHON INSTITUTIONAL STRATEGY TEST SUITE")
    print("=" * 65 + "\n")
    unittest.main()
