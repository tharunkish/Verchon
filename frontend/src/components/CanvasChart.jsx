import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
} from 'lightweight-charts';
import {
  Target,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Zap,
  Activity,
  Award,
} from 'lucide-react';

export default function CanvasChart({
  candles = [],
  dma50 = [],
  dma200 = [],
  stopPrice,
  ticker = '',
  markers = [],
  signals = [],
  signalStats = {},
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const markersPluginRef = useRef(null);

  const [showSignals, setShowSignals] = useState(true);
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Initialize chart canvas with Linear/TradingView dark theme
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#09090b' },
        textColor: '#a1a1aa',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(39, 39, 42, 0.4)' },
        horzLines: { color: 'rgba(39, 39, 42, 0.4)' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#52525b',
          width: 1,
          style: 3,
        },
        horzLine: {
          color: '#52525b',
          width: 1,
          style: 3,
        },
      },
      timeScale: {
        borderColor: '#27272a',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#27272a',
        autoScale: true,
      },
      width: chartContainerRef.current.clientWidth || 800,
      height: 380,
    });

    chartRef.current = chart;

    // 1. Candlestick Series (Lightweight Charts v5 API)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });

    if (candles && candles.length > 0) {
      candleSeries.setData(candles);
    }

    // 2. 50 DMA Line (Cyan)
    if (dma50 && dma50.length > 0) {
      const line50 = chart.addSeries(LineSeries, {
        color: '#06b6d4',
        lineWidth: 2,
        title: '50 DMA',
      });
      line50.setData(dma50);
    }

    // 3. 200 DMA Line (Purple)
    if (dma200 && dma200.length > 0) {
      const line200 = chart.addSeries(LineSeries, {
        color: '#a855f7',
        lineWidth: 2,
        title: '200 DMA',
      });
      line200.setData(dma200);
    }

    // 4. Stop Price Line (Dashed Rose Red)
    if (stopPrice && stopPrice > 0 && candleSeries) {
      candleSeries.createPriceLine({
        price: stopPrice,
        color: '#f43f5e',
        lineWidth: 2,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: `STOP ₹${stopPrice.toFixed(2)}`,
      });
    }

    // 5. Historical Strategy Setup Markers Plugin (Lightweight Charts v5)
    if (candleSeries) {
      const activeMarkers = showSignals && markers && markers.length > 0 ? markers : [];
      const markersPlugin = createSeriesMarkers(candleSeries, activeMarkers);
      markersPluginRef.current = markersPlugin;
    }

    chart.timeScale().fitContent();

    // Responsive resize handler
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (markersPluginRef.current) {
        try {
          markersPluginRef.current.detach();
        } catch (_) {}
        markersPluginRef.current = null;
      }
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, dma50, dma200, stopPrice]);

  // Synchronize markers toggle without full chart re-render
  useEffect(() => {
    if (markersPluginRef.current) {
      const activeMarkers = showSignals && markers && markers.length > 0 ? markers : [];
      markersPluginRef.current.setMarkers(activeMarkers);
    }
  }, [showSignals, markers]);

  // Accuracy Statistics derived from backend
  const evaluatedCount = signalStats?.evaluated_signals ?? 0;
  const winningCount = signalStats?.winning_signals ?? 0;
  const losingCount = signalStats?.losing_signals ?? 0;
  const winRate = signalStats?.win_rate_pct ?? 0;
  const profitFactor = signalStats?.profit_factor ?? 0;
  const avgWin = signalStats?.avg_win_pct ?? 0;
  const avgLoss = signalStats?.avg_loss_pct ?? 0;

  return (
    <div className="relative w-full rounded-xl border border-zinc-800/80 bg-zinc-950 p-2 shadow-xl">
      {/* Top Header & Indicator / Accuracy Bar */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 px-2 pb-2.5 pt-1 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold tracking-tight text-zinc-100">{ticker}</span>
            <span className="text-[11px] text-zinc-400 font-mono">1Y Daily Action</span>
          </div>

          <div className="flex items-center gap-2.5 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5 text-cyan-400">
              <span className="inline-block h-2 w-2 rounded-full bg-cyan-400" />
              <span>50 DMA</span>
            </span>
            <span className="flex items-center gap-1.5 text-purple-400">
              <span className="inline-block h-2 w-2 rounded-full bg-purple-400" />
              <span>200 DMA</span>
            </span>
            {stopPrice && stopPrice > 0 && (
              <span className="flex items-center gap-1.5 text-rose-400">
                <span className="inline-block h-2 w-2 rounded-full bg-rose-400" />
                <span>Stop: ₹{Number(stopPrice).toFixed(2)}</span>
              </span>
            )}
          </div>
        </div>

        {/* Accuracy & Backtest Scorecard Badges */}
        <div className="flex flex-wrap items-center gap-2">
          {evaluatedCount > 0 ? (
            <>
              <div
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  winRate >= 60
                    ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                    : winRate >= 45
                    ? 'border border-amber-500/40 bg-amber-500/10 text-amber-400'
                    : 'border border-zinc-700 bg-zinc-800 text-zinc-300'
                }`}
                title={`Historical Setup Accuracy: ${winningCount} Won, ${losingCount} Stopped of ${evaluatedCount} completed trades`}
              >
                <Target className="h-3.5 w-3.5" />
                <span>{winRate}% Win Rate</span>
                <span className="text-[10px] font-mono opacity-80">({winningCount}W / {losingCount}L)</span>
              </div>

              {profitFactor > 0 && (
                <div
                  className="hidden sm:flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-semibold text-cyan-300"
                  title="Profit Factor = Total Profit % / Total Loss %"
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>PF: {profitFactor}x</span>
                </div>
              )}

              {avgWin > 0 && (
                <div className="hidden md:flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] font-mono text-zinc-300">
                  <span className="text-emerald-400">+{avgWin}%</span>
                  <span className="text-zinc-600">/</span>
                  <span className="text-rose-400">{avgLoss}%</span>
                </div>
              )}
            </>
          ) : signals.length > 0 ? (
            <div className="flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-xs text-cyan-300">
              <Activity className="h-3.5 w-3.5" />
              <span>{signals.length} Signal{signals.length > 1 ? 's' : ''} (Active)</span>
            </div>
          ) : null}

          {/* Toggle Markers Button */}
          {markers.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSignals((prev) => !prev)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                showSignals
                  ? 'border border-emerald-500/40 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                  : 'border border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
              title="Toggle historical setup markers on the chart"
            >
              {showSignals ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              <span>Signals: {showSignals ? 'ON' : 'OFF'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Chart Canvas */}
      <div ref={chartContainerRef} className="w-full" />

      {/* Active Setup Alert Banner */}
      {signalStats?.active_signal && (
        <div className="mx-1 mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-3 py-2 text-xs text-cyan-200">
          <div className="flex items-center gap-2 font-medium">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500"></span>
            </span>
            <span className="font-semibold text-cyan-300">Active Setup Triggered:</span>
            <span>{signalStats.active_signal.type} on {signalStats.active_signal.date}</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px]">
            <span>Trigger: ₹{signalStats.active_signal.price}</span>
            <span className="text-emerald-400 font-semibold">Target (2R): ₹{signalStats.active_signal.target}</span>
            <span className="text-rose-400 font-semibold">Stop: ₹{signalStats.active_signal.stop}</span>
          </div>
        </div>
      )}

      {/* Collapsible Historical Signal Audit Log */}
      {signals && signals.length > 0 && (
        <div className="mt-2.5 border-t border-zinc-800/80 px-2 pt-2">
          <button
            type="button"
            onClick={() => setShowLog((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-md px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Award className="h-3.5 w-3.5 text-cyan-400" />
              <span>Historical Strategy Track Record ({signals.length} Signals)</span>
              {evaluatedCount > 0 && (
                <span className="text-[11px] text-zinc-500 font-mono">
                  • {winRate}% win rate across 1Y forward simulations
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-zinc-400">
              <span>{showLog ? 'Hide Details' : 'View Audit Log'}</span>
              {showLog ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </div>
          </button>

          {showLog && (
            <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/40">
              <table className="w-full text-left font-mono text-xs text-zinc-300">
                <thead className="border-b border-zinc-800 bg-zinc-900 text-[10px] uppercase text-zinc-400">
                  <tr>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Setup</th>
                    <th className="py-2 px-3 text-right">Entry</th>
                    <th className="py-2 px-3 text-right">Target (2R)</th>
                    <th className="py-2 px-3 text-right">Stop Loss</th>
                    <th className="py-2 px-3 text-center">Outcome</th>
                    <th className="py-2 px-3 text-right">Return</th>
                    <th className="py-2 px-3 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {signals.map((sig, idx) => {
                    const isTarget = sig.outcome === 'TARGET_HIT';
                    const isStop = sig.outcome === 'STOP_HIT';
                    const isActive = sig.outcome === 'ACTIVE';

                    return (
                      <tr key={idx} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="py-2 px-3 text-zinc-400">{sig.date}</td>
                        <td className="py-2 px-3 font-sans font-medium text-zinc-200">
                          {sig.label || sig.type}
                        </td>
                        <td className="py-2 px-3 text-right">₹{sig.price?.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-emerald-400/90">₹{sig.target?.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-rose-400/90">₹{sig.stop?.toFixed(2)}</td>
                        <td className="py-2 px-3 text-center">
                          {isTarget && (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="h-3 w-3" /> TARGET HIT
                            </span>
                          )}
                          {isStop && (
                            <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-400 border border-rose-500/20">
                              <XCircle className="h-3 w-3" /> STOP HIT
                            </span>
                          )}
                          {isActive && (
                            <span className="inline-flex items-center gap-1 rounded bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 border border-cyan-500/20 animate-pulse">
                              <Zap className="h-3 w-3" /> ACTIVE
                            </span>
                          )}
                          {!isTarget && !isStop && !isActive && (
                            <span className="inline-flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                              <Clock className="h-3 w-3" /> EXPIRED
                            </span>
                          )}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-semibold ${
                            sig.pnl_pct > 0
                              ? 'text-emerald-400'
                              : sig.pnl_pct < 0
                              ? 'text-rose-400'
                              : 'text-zinc-400'
                          }`}
                        >
                          {sig.pnl_pct > 0 ? `+${sig.pnl_pct}%` : `${sig.pnl_pct}%`}
                        </td>
                        <td className="py-2 px-3 text-right text-zinc-400">
                          {sig.bars_held ? `${sig.bars_held} bars` : 'Open'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
