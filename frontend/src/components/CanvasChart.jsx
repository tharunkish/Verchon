import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
} from 'lightweight-charts';
import { Eye, EyeOff } from 'lucide-react';

export default function CanvasChart({
  candles = [],
  dma50 = [],
  dma200 = [],
  stopPrice,
  ticker = '',
  markers = [],
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const markersPluginRef = useRef(null);

  const [showSignals, setShowSignals] = useState(true);

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

    // 5. Clean Buy Signal Markers (Lightweight Charts v5 Plugin)
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

  // Dynamically toggle markers without destroying chart
  useEffect(() => {
    if (markersPluginRef.current) {
      const activeMarkers = showSignals && markers && markers.length > 0 ? markers : [];
      markersPluginRef.current.setMarkers(activeMarkers);
    }
  }, [showSignals, markers]);

  return (
    <div className="relative w-full rounded-xl border border-zinc-800/80 bg-zinc-950 p-2 shadow-xl">
      {/* Chart HUD & Legend */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 px-2 pb-2.5 pt-1 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold tracking-tight text-zinc-100">{ticker}</span>
            <span className="text-[11px] font-mono text-zinc-500">Daily</span>
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

        {/* Clean Signal Toggle */}
        {markers && markers.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-zinc-500">
              {markers.length} Buy Trigger{markers.length > 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={() => setShowSignals((prev) => !prev)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                showSignals
                  ? 'border border-emerald-500/40 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                  : 'border border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
              title="Toggle buy signals on chart"
            >
              {showSignals ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              <span>Buy Signals: {showSignals ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Lightweight Charts Canvas */}
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}
