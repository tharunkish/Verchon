import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries } from 'lightweight-charts';

export default function CanvasChart({ candles, dma50, dma200, stopPrice, ticker }) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);

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
      chart.remove();
    };
  }, [candles, dma50, dma200, stopPrice]);

  return (
    <div className="relative w-full rounded-lg border border-zinc-800/80 bg-zinc-950 p-2">
      <div className="mb-2 flex items-center justify-between px-2 pt-1 text-xs">
        <div className="flex items-center space-x-4">
          <span className="font-semibold text-zinc-200">{ticker} Daily Price Action</span>
          <span className="flex items-center space-x-1.5 text-cyan-400">
            <span className="inline-block h-2 w-2 rounded-full bg-cyan-400"></span>
            <span>50 DMA</span>
          </span>
          <span className="flex items-center space-x-1.5 text-purple-400">
            <span className="inline-block h-2 w-2 rounded-full bg-purple-400"></span>
            <span>200 DMA</span>
          </span>
          {stopPrice && (
            <span className="flex items-center space-x-1.5 text-rose-400">
              <span className="inline-block h-2 w-2 rounded-full bg-rose-400"></span>
              <span>Stop Loss: ₹{stopPrice.toFixed(2)}</span>
            </span>
          )}
        </div>
        <span className="font-mono-num text-zinc-500">1-Year History</span>
      </div>
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}
