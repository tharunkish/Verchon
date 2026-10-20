import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  createSeriesMarkers,
} from 'lightweight-charts';
import { 
  Eye, 
  EyeOff, 
  BarChart2, 
  Target, 
  TrendingUp, 
  Activity,
  Layers,
  RotateCcw
} from 'lucide-react';

const TIMEFRAMES = [
  { id: '1M', label: '1M' },
  { id: '3M', label: '3M' },
  { id: '6M', label: '6M' },
  { id: '1Y', label: '1Y' },
  { id: '2Y', label: '2Y' },
  { id: '1W', label: '1W (Weekly)', isWeekly: true },
];

// Helper mathematical functions for client-side fallback
function computeDailyEma(bars, period) {
  if (!bars || bars.length < period) return [];
  const k = 2 / (period + 1);
  let prev = bars[0].close;
  const res = [];
  for (let i = 0; i < bars.length; i++) {
    prev = bars[i].close * k + prev * (1 - k);
    if (i >= period - 1) {
      res.push({ time: bars[i].time, value: Number(prev.toFixed(2)) });
    }
  }
  return res;
}

function computeDailyVolSma(bars, period) {
  if (!bars || bars.length < period) return [];
  const res = [];
  for (let i = period - 1; i < bars.length; i++) {
    const slice = bars.slice(i - (period - 1), i + 1);
    const sum = slice.reduce((acc, b) => acc + (b.volume || 0), 0);
    res.push({ time: bars[i].time, value: Math.round(sum / period) });
  }
  return res;
}

function computeWeeklyFallback(dailyBars) {
  if (!dailyBars || dailyBars.length === 0) {
    return { candles: [], ema_10: [], dma_40: [], vol_ma_10: [] };
  }

  const weeksMap = new Map();

  dailyBars.forEach((bar) => {
    const d = new Date(bar.time);
    const day = d.getDay(); // 0 is Sun, 5 is Fri
    const diff = 5 - day;
    const fri = new Date(d);
    fri.setDate(d.getDate() + diff);
    const friStr = fri.toISOString().slice(0, 10);

    if (!weeksMap.has(friStr)) {
      weeksMap.set(friStr, {
        time: friStr,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume || 0,
      });
    } else {
      const w = weeksMap.get(friStr);
      w.high = Math.max(w.high, bar.high);
      w.low = Math.min(w.low, bar.low);
      w.close = bar.close;
      w.volume = (w.volume || 0) + (bar.volume || 0);
    }
  });

  const wCandles = Array.from(weeksMap.values()).sort((a, b) => a.time.localeCompare(b.time));
  const ema10 = computeDailyEma(wCandles, 10);
  const dma40 = [];
  if (wCandles.length >= 40) {
    for (let i = 39; i < wCandles.length; i++) {
      const slice = wCandles.slice(i - 39, i + 1);
      const avg = slice.reduce((acc, c) => acc + c.close, 0) / 40;
      dma40.push({ time: wCandles[i].time, value: Number(avg.toFixed(2)) });
    }
  } else {
    ema10.forEach((e) => dma40.push({ ...e }));
  }
  const volMa10 = computeDailyVolSma(wCandles, 10);

  return {
    candles: wCandles,
    ema_10: ema10,
    dma_40: dma40,
    vol_ma_10: volMa10,
  };
}

export default function CanvasChart({
  candles = [],
  ema20 = [],
  dma50 = [],
  dma200 = [],
  volMa = [],
  weekly = null,
  entryPrice = null,
  stopPrice = null,
  target1 = null,
  target2 = null,
  ticker = '',
  markers = [],
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const volMaSeriesRef = useRef(null);
  const ema20SeriesRef = useRef(null);
  const dma50SeriesRef = useRef(null);
  const dma200SeriesRef = useRef(null);
  const priceLinesRef = useRef([]);
  const markersPluginRef = useRef(null);

  // Timeframe and display controls
  const [activeTimeframe, setActiveTimeframe] = useState('6M');
  const [showSignals, setShowSignals] = useState(true);
  const [showTradeMatrix, setShowTradeMatrix] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showEma20, setShowEma20] = useState(true);
  const [showDma50, setShowDma50] = useState(true);
  const [showDma200, setShowDma200] = useState(true);

  // Crosshair hover inspection HUD state
  const [hoverBar, setHoverBar] = useState(null);

  // Dark mode detection
  const [isDark, setIsDark] = useState(() => {
    return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Formatters
  const formatPrice = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '—';
    return Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatVolume = (val) => {
    if (!val || isNaN(val)) return '—';
    const num = Number(val);
    if (num >= 10000000) return `${(num / 10000000).toFixed(2)} Cr`;
    if (num >= 100000) return `${(num / 100000).toFixed(2)} L`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toLocaleString('en-IN');
  };

  // Resilient data fallbacks
  const effectiveWeekly = useMemo(() => {
    if (weekly && weekly.candles && weekly.candles.length > 0) {
      return weekly;
    }
    return computeWeeklyFallback(candles);
  }, [weekly, candles]);

  const effectiveEma20 = useMemo(() => {
    if (ema20 && ema20.length > 0) return ema20;
    return computeDailyEma(candles, 20);
  }, [ema20, candles]);

  const effectiveVolMa = useMemo(() => {
    if (volMa && volMa.length > 0) return volMa;
    return computeDailyVolSma(candles, 20);
  }, [volMa, candles]);

  // Active dataset according to current timeframe
  const isWeeklyActive = activeTimeframe === '1W';
  const activeCandles = isWeeklyActive && effectiveWeekly?.candles?.length > 0 
    ? effectiveWeekly.candles 
    : candles;

  // Compute latest bar stats for default HUD display when not hovering
  const latestBar = useMemo(() => {
    if (!activeCandles || activeCandles.length === 0) return null;
    const lastC = activeCandles[activeCandles.length - 1];
    const prevC = activeCandles.length > 1 ? activeCandles[activeCandles.length - 2] : null;
    const chg = prevC && prevC.close 
      ? ((lastC.close - prevC.close) / prevC.close) * 100 
      : (lastC.open ? ((lastC.close - lastC.open) / lastC.open) * 100 : 0);

    const lastEma = isWeeklyActive 
      ? effectiveWeekly?.ema_10?.slice(-1)[0]?.value 
      : effectiveEma20?.slice(-1)[0]?.value;
    const lastD50 = isWeeklyActive 
      ? effectiveWeekly?.dma_40?.slice(-1)[0]?.value 
      : dma50?.slice(-1)[0]?.value;
    const lastD200 = isWeeklyActive 
      ? null 
      : dma200?.slice(-1)[0]?.value;

    return {
      time: lastC.time,
      open: lastC.open,
      high: lastC.high,
      low: lastC.low,
      close: lastC.close,
      change: chg,
      volume: lastC.volume,
      ema20: lastEma,
      dma50: lastD50,
      dma200: lastD200,
    };
  }, [activeCandles, isWeeklyActive, effectiveWeekly, effectiveEma20, dma50, dma200]);

  const activeHud = hoverBar || latestBar;

  // Manage Trade Execution Matrix Price Lines
  const syncPriceLines = useCallback(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    // Clear old lines
    priceLinesRef.current.forEach((pl) => {
      try {
        series.removePriceLine(pl);
      } catch (_) {}
    });
    priceLinesRef.current = [];

    if (!showTradeMatrix) return;

    // Entry Price (Solid Slate / Sky Blue)
    if (entryPrice && Number(entryPrice) > 0) {
      try {
        const pl = series.createPriceLine({
          price: Number(entryPrice),
          color: isDark ? '#60a5fa' : '#2563eb',
          lineWidth: 2,
          lineStyle: 0, // Solid
          axisLabelVisible: true,
          title: `ENTRY ₹${Number(entryPrice).toFixed(1)}`,
        });
        priceLinesRef.current.push(pl);
      } catch (_) {}
    }

    // Stop Loss (Dashed Crimson)
    if (stopPrice && Number(stopPrice) > 0) {
      try {
        const pl = series.createPriceLine({
          price: Number(stopPrice),
          color: isDark ? '#f87171' : '#b20808',
          lineWidth: 2,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: `STOP ₹${Number(stopPrice).toFixed(1)}`,
        });
        priceLinesRef.current.push(pl);
      } catch (_) {}
    }

    // Target 1 (+2R, Dashed Forest Green / Emerald)
    if (target1 && Number(target1) > 0) {
      try {
        const pl = series.createPriceLine({
          price: Number(target1),
          color: isDark ? '#4ade80' : '#2d6a4f',
          lineWidth: 2,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: `T1 (+2R) ₹${Number(target1).toFixed(1)}`,
        });
        priceLinesRef.current.push(pl);
      } catch (_) {}
    }

    // Target 2 (+3R, Dashed Indigo)
    if (target2 && Number(target2) > 0) {
      try {
        const pl = series.createPriceLine({
          price: Number(target2),
          color: isDark ? '#818cf8' : '#4f46e5',
          lineWidth: 2,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: `T2 (+3R) ₹${Number(target2).toFixed(1)}`,
        });
        priceLinesRef.current.push(pl);
      } catch (_) {}
    }
  }, [showTradeMatrix, entryPrice, stopPrice, target1, target2, isDark]);

  // Primary Chart Initialization
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Theme palette selection
    const bgCol = isDark ? '#1c232d' : '#f7ede5';
    const textCol = isDark ? '#958a7a' : '#806350';
    const gridCol = isDark ? 'rgba(54, 60, 68, 0.35)' : 'rgba(184, 165, 151, 0.45)';
    const crossCol = isDark ? '#4f5864' : '#806350';
    const borderCol = isDark ? '#363c44' : '#b8a597';
    const upCol = isDark ? '#4ade80' : '#2d6a4f';
    const downCol = isDark ? '#f87171' : '#b20808';
    const dma50Col = isDark ? '#60a5fa' : '#3b82f6';
    const dma200Col = isDark ? '#c084fc' : '#8b0909';
    const ema20Col = isDark ? '#fbbf24' : '#d97706';
    const volMaCol = isDark ? '#958a7a' : '#a88a6d';

    // 1. Initialize Chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: bgCol },
        textColor: textCol,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: gridCol },
        horzLines: { color: gridCol },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: crossCol,
          width: 1,
          style: 3,
        },
        horzLine: {
          color: crossCol,
          width: 1,
          style: 3,
        },
      },
      timeScale: {
        borderColor: borderCol,
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: borderCol,
        autoScale: true,
        scaleMargins: {
          top: 0.08,
          bottom: 0.28, // Reserve bottom 28% for Volume
        },
      },
      width: chartContainerRef.current.clientWidth || 800,
      height: 440,
    });

    chartRef.current = chart;

    // 2. Configure Dedicated Volume Sub-Panel Scale
    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.76, // Volume occupies lower 24% of canvas
        bottom: 0.02,
      },
      visible: false, // Clean look, hide volume axis numbers
    });

    // 3. Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: upCol,
      downColor: downCol,
      borderVisible: false,
      wickUpColor: upCol,
      wickDownColor: downCol,
      priceScaleId: 'right',
    });
    candleSeriesRef.current = candleSeries;

    // 4. Volume Histogram Sub-Panel
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: 'volume',
      priceFormat: {
        type: 'volume',
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // 5. Volume 20 MA Line (in Volume Sub-Panel)
    const volMaSeries = chart.addSeries(LineSeries, {
      priceScaleId: 'volume',
      color: volMaCol,
      lineWidth: 1.5,
      lineStyle: 0,
      title: 'Vol MA',
    });
    volMaSeriesRef.current = volMaSeries;

    // 6. 20 EMA Line (Short-term momentum cushion)
    const ema20Series = chart.addSeries(LineSeries, {
      priceScaleId: 'right',
      color: ema20Col,
      lineWidth: 1.5,
      title: '20 EMA',
    });
    ema20SeriesRef.current = ema20Series;

    // 7. 50 DMA Line
    const dma50Series = chart.addSeries(LineSeries, {
      priceScaleId: 'right',
      color: dma50Col,
      lineWidth: 1.5,
      title: '50 DMA',
    });
    dma50SeriesRef.current = dma50Series;

    // 8. 200 DMA Line
    const dma200Series = chart.addSeries(LineSeries, {
      priceScaleId: 'right',
      color: dma200Col,
      lineWidth: 1.5,
      title: '200 DMA',
    });
    dma200SeriesRef.current = dma200Series;

    // 9. Crosshair Move Subscription for Live HUD
    const handleCrosshairMove = (param) => {
      if (!param || !param.time || !candleSeriesRef.current) {
        setHoverBar(null);
        return;
      }
      const cData = param.seriesData.get(candleSeriesRef.current);
      if (!cData) {
        setHoverBar(null);
        return;
      }

      const vData = volumeSeriesRef.current ? param.seriesData.get(volumeSeriesRef.current) : null;
      const emaData = ema20SeriesRef.current ? param.seriesData.get(ema20SeriesRef.current) : null;
      const d50Data = dma50SeriesRef.current ? param.seriesData.get(dma50SeriesRef.current) : null;
      const d200Data = dma200SeriesRef.current ? param.seriesData.get(dma200SeriesRef.current) : null;

      const open = cData.open;
      const high = cData.high;
      const low = cData.low;
      const close = cData.close;
      const chg = open ? ((close - open) / open) * 100 : 0;

      let timeStr = '';
      if (typeof param.time === 'string') {
        timeStr = param.time;
      } else if (param.time?.year) {
        timeStr = `${param.time.year}-${String(param.time.month).padStart(2, '0')}-${String(param.time.day).padStart(2, '0')}`;
      } else {
        timeStr = String(param.time);
      }

      setHoverBar({
        time: timeStr,
        open,
        high,
        low,
        close,
        change: chg,
        volume: vData?.value,
        ema20: emaData?.value,
        dma50: d50Data?.value,
        dma200: d200Data?.value,
      });
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);

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
      if (chartRef.current) {
        try {
          chartRef.current.unsubscribeCrosshairMove(handleCrosshairMove);
        } catch (_) {}
      }
      if (markersPluginRef.current) {
        try {
          markersPluginRef.current.detach();
        } catch (_) {}
        markersPluginRef.current = null;
      }
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      volMaSeriesRef.current = null;
      ema20SeriesRef.current = null;
      dma50SeriesRef.current = null;
      dma200SeriesRef.current = null;
    };
  }, [isDark]);

  // Update Data and Visible Range when activeTimeframe, candles, or weekly change
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;
    const chart = chartRef.current;
    const isWeekly = activeTimeframe === '1W';

    const upVolCol = isDark ? 'rgba(74, 222, 128, 0.45)' : 'rgba(45, 106, 79, 0.45)';
    const downVolCol = isDark ? 'rgba(248, 113, 113, 0.45)' : 'rgba(178, 8, 8, 0.45)';

    if (isWeekly && effectiveWeekly?.candles && effectiveWeekly.candles.length > 0) {
      candleSeriesRef.current.setData(effectiveWeekly.candles);
      
      const weeklyVolData = effectiveWeekly.candles.map((c) => ({
        time: c.time,
        value: c.volume || 0,
        color: c.close >= c.open ? upVolCol : downVolCol,
      }));
      volumeSeriesRef.current?.setData(weeklyVolData);
      volMaSeriesRef.current?.setData(effectiveWeekly.vol_ma_10 || []);
      
      ema20SeriesRef.current?.setData(effectiveWeekly.ema_10 || []);
      ema20SeriesRef.current?.applyOptions({ title: '10W EMA' });
      
      dma50SeriesRef.current?.setData(effectiveWeekly.dma_40 || []);
      dma50SeriesRef.current?.applyOptions({ title: '40W SMA' });
      
      dma200SeriesRef.current?.setData([]);

      chart.timeScale().fitContent();
    } else if (candles && candles.length > 0) {
      candleSeriesRef.current.setData(candles);
      
      const dailyVolData = candles.map((c) => ({
        time: c.time,
        value: c.volume || 0,
        color: c.close >= c.open ? upVolCol : downVolCol,
      }));
      volumeSeriesRef.current?.setData(dailyVolData);
      volMaSeriesRef.current?.setData(effectiveVolMa || []);
      
      ema20SeriesRef.current?.setData(effectiveEma20 || []);
      ema20SeriesRef.current?.applyOptions({ title: '20 EMA' });
      
      dma50SeriesRef.current?.setData(dma50 || []);
      dma50SeriesRef.current?.applyOptions({ title: '50 DMA' });
      
      dma200SeriesRef.current?.setData(dma200 || []);

      const count = candles.length;
      if (activeTimeframe === '1M') {
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, count - 22), to: count + 1 });
      } else if (activeTimeframe === '3M') {
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, count - 66), to: count + 2 });
      } else if (activeTimeframe === '6M') {
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, count - 130), to: count + 3 });
      } else if (activeTimeframe === '1Y') {
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, count - 252), to: count + 4 });
      } else if (activeTimeframe === '2Y') {
        chart.timeScale().fitContent();
      }
    }

    syncPriceLines();
  }, [activeTimeframe, candles, effectiveWeekly, effectiveEma20, dma50, dma200, effectiveVolMa, isDark, syncPriceLines]);

  // Visibility toggles
  useEffect(() => {
    ema20SeriesRef.current?.applyOptions({ visible: showEma20 });
  }, [showEma20]);

  useEffect(() => {
    dma50SeriesRef.current?.applyOptions({ visible: showDma50 });
  }, [showDma50]);

  useEffect(() => {
    dma200SeriesRef.current?.applyOptions({ visible: showDma200 && activeTimeframe !== '1W' });
  }, [showDma200, activeTimeframe]);

  useEffect(() => {
    volumeSeriesRef.current?.applyOptions({ visible: showVolume });
    volMaSeriesRef.current?.applyOptions({ visible: showVolume });
  }, [showVolume]);

  // Synchronize price lines when trade matrix state changes
  useEffect(() => {
    syncPriceLines();
  }, [syncPriceLines]);

  // Markers (Buy Signals) plugin management
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    if (markersPluginRef.current) {
      try {
        markersPluginRef.current.detach();
      } catch (_) {}
      markersPluginRef.current = null;
    }
    if (showSignals && activeTimeframe !== '1W' && markers && markers.length > 0) {
      try {
        markersPluginRef.current = createSeriesMarkers(candleSeriesRef.current, markers);
      } catch (err) {
        console.warn('Marker attachment warning:', err);
      }
    }
  }, [showSignals, activeTimeframe, markers]);

  // Reset View handler
  const handleResetView = () => {
    if (chartRef.current) {
      if (activeTimeframe === '1W' || activeTimeframe === '2Y') {
        chartRef.current.timeScale().fitContent();
      } else {
        const count = candles.length;
        if (activeTimeframe === '1M') {
          chartRef.current.timeScale().setVisibleLogicalRange({ from: Math.max(0, count - 22), to: count + 1 });
        } else if (activeTimeframe === '3M') {
          chartRef.current.timeScale().setVisibleLogicalRange({ from: Math.max(0, count - 66), to: count + 2 });
        } else if (activeTimeframe === '6M') {
          chartRef.current.timeScale().setVisibleLogicalRange({ from: Math.max(0, count - 130), to: count + 3 });
        } else if (activeTimeframe === '1Y') {
          chartRef.current.timeScale().setVisibleLogicalRange({ from: Math.max(0, count - 252), to: count + 4 });
        }
      }
    }
  };

  return (
    <div className="relative w-full rounded-xl border border-[#b8a597] dark:border-[#363c44] bg-[#f7ede5] dark:bg-[#1c232d] p-3 shadow-sm dark:shadow-xl space-y-2.5">
      {/* 1. Top Controls Bar: Ticker, Timeframes & Indicators */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#b8a597] dark:border-[#363c44] pb-2 text-xs">
        
        {/* Left: Ticker & Timeframe Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1.5 pr-2 border-r border-[#b8a597]/60 dark:border-[#363c44]">
            <span className="font-mono text-sm font-bold tracking-tight text-[#2d1f17] dark:text-[#e0d1b9]">
              {ticker ? ticker.replace('.NS', '') : 'NSE'}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#edd9cc] dark:bg-[#222b37] text-[#806350] dark:text-[#958a7a]">
              {isWeeklyActive ? '1W' : '1D'}
            </span>
          </div>

          {/* Timeframe Buttons */}
          <div className="flex items-center space-x-1 bg-[#edd9cc]/60 dark:bg-[#13171e] p-1 rounded-lg border border-[#b8a597]/50 dark:border-[#363c44]">
            {TIMEFRAMES.map((tf) => {
              const isActive = activeTimeframe === tf.id;
              return (
                <button
                  key={tf.id}
                  type="button"
                  onClick={() => setActiveTimeframe(tf.id)}
                  className={`px-2.5 py-1 min-h-[28px] flex items-center justify-center text-[11px] font-mono font-semibold rounded transition ${
                    isActive
                      ? 'bg-[#806350] text-[#edd9cc] dark:bg-[#e0d1b9] dark:text-[#1c232d] shadow-sm'
                      : 'text-[#806350] hover:text-[#2d1f17] dark:text-[#958a7a] hover:dark:text-[#e0d1b9]'
                  }`}
                  title={`Switch to ${tf.label}`}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleResetView}
            className="p-1 min-h-[28px] min-w-[28px] flex items-center justify-center rounded text-[#806350] hover:text-[#2d1f17] dark:text-[#958a7a] hover:dark:text-[#e0d1b9] transition"
            title="Reset Zoom / Fit Range"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Right: Indicator & Layer Toggles */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
          {/* EMA 20 Toggle */}
          <button
            type="button"
            onClick={() => setShowEma20((prev) => !prev)}
            className={`flex items-center space-x-1 px-2.5 py-1 min-h-[28px] rounded border transition ${
              showEma20
                ? 'border-amber-600/40 bg-amber-600/10 text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-400'
                : 'border-transparent text-[#806350]/60 dark:text-[#958a7a]/60 line-through'
            }`}
            title="Toggle 20 EMA short-term momentum cushion"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-600 dark:bg-amber-400" />
            <span>{isWeeklyActive ? '10W EMA' : '20 EMA'}</span>
          </button>

          {/* 50 DMA Toggle */}
          <button
            type="button"
            onClick={() => setShowDma50((prev) => !prev)}
            className={`flex items-center space-x-1 px-2.5 py-1 min-h-[28px] rounded border transition ${
              showDma50
                ? 'border-blue-600/40 bg-blue-600/10 text-blue-800 dark:border-blue-400/40 dark:bg-blue-400/10 dark:text-blue-400'
                : 'border-transparent text-[#806350]/60 dark:text-[#958a7a]/60 line-through'
            }`}
            title="Toggle 50 DMA medium-term trend"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
            <span>{isWeeklyActive ? '40W SMA' : '50 DMA'}</span>
          </button>

          {/* 200 DMA Toggle (Daily only) */}
          {!isWeeklyActive && (
            <button
              type="button"
              onClick={() => setShowDma200((prev) => !prev)}
              className={`flex items-center space-x-1 px-2.5 py-1 min-h-[28px] rounded border transition ${
                showDma200
                  ? 'border-rose-600/40 bg-rose-600/10 text-rose-800 dark:border-purple-400/40 dark:bg-purple-400/10 dark:text-purple-400'
                  : 'border-transparent text-[#806350]/60 dark:text-[#958a7a]/60 line-through'
              }`}
              title="Toggle 200 DMA institutional floor"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#8b0909] dark:bg-purple-400" />
              <span>200 DMA</span>
            </button>
          )}

          {/* Volume Sub-Panel Toggle */}
          <button
            type="button"
            onClick={() => setShowVolume((prev) => !prev)}
            className={`flex items-center space-x-1 px-2.5 py-1 min-h-[28px] rounded border transition ${
              showVolume
                ? 'border-[#806350]/40 bg-[#edd9cc] text-[#2d1f17] dark:border-[#e0d1b9]/40 dark:bg-[#222b37] dark:text-[#e0d1b9]'
                : 'border-transparent text-[#806350]/60 dark:text-[#958a7a]/60 line-through'
            }`}
            title="Toggle Volume sub-panel & 20 Volume MA"
          >
            <BarChart2 className="h-3 w-3" />
            <span>Vol</span>
          </button>

          {/* Trade Execution Matrix Overlay Toggle */}
          {(entryPrice || stopPrice || target1 || target2) && (
            <button
              type="button"
              onClick={() => setShowTradeMatrix((prev) => !prev)}
              className={`flex items-center space-x-1 px-2.5 py-1 min-h-[28px] rounded border transition ${
                showTradeMatrix
                  ? 'border-emerald-600/40 bg-emerald-600/10 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-400'
                  : 'border-transparent text-[#806350]/60 dark:text-[#958a7a]/60 line-through'
              }`}
              title="Toggle Trade Matrix (Entry, Stop, Target 1, Target 2)"
            >
              <Target className="h-3 w-3" />
              <span>Trade Plan</span>
            </button>
          )}

          {/* Buy Signal Markers Toggle */}
          {markers && markers.length > 0 && !isWeeklyActive && (
            <button
              type="button"
              onClick={() => setShowSignals((prev) => !prev)}
              className={`flex items-center space-x-1 px-2.5 py-1 min-h-[28px] rounded border transition ${
                showSignals
                  ? 'border-emerald-600/40 bg-emerald-600/15 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-400'
                  : 'border-[#b8a597] bg-[#edd9cc] text-[#806350] dark:border-[#363c44] dark:bg-[#222b37] dark:text-[#958a7a]'
              }`}
              title="Toggle setup trigger markers"
            >
              {showSignals ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              <span>Triggers ({markers.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Real-Time Floating Inspection HUD (Date, OHLCV, % Change, Moving Averages) */}
      {activeHud && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[#edd9cc]/60 dark:bg-[#13171e]/70 px-2.5 py-1 font-mono text-[11px] border border-[#b8a597]/40 dark:border-[#363c44]/50">
          <div className="flex items-center space-x-1.5 text-[#806350] dark:text-[#958a7a] font-bold">
            <span className="text-[#2d1f17] dark:text-[#e0d1b9]">{activeHud.time || '—'}</span>
          </div>

          <div className="flex items-center space-x-1">
            <span className="text-[#806350] dark:text-[#958a7a]">O:</span>
            <span className="font-semibold text-[#2d1f17] dark:text-[#e0d1b9]">₹{formatPrice(activeHud.open)}</span>
          </div>

          <div className="flex items-center space-x-1">
            <span className="text-[#806350] dark:text-[#958a7a]">H:</span>
            <span className="font-semibold text-[#2d1f17] dark:text-[#e0d1b9]">₹{formatPrice(activeHud.high)}</span>
          </div>

          <div className="flex items-center space-x-1">
            <span className="text-[#806350] dark:text-[#958a7a]">L:</span>
            <span className="font-semibold text-[#2d1f17] dark:text-[#e0d1b9]">₹{formatPrice(activeHud.low)}</span>
          </div>

          <div className="flex items-center space-x-1">
            <span className="text-[#806350] dark:text-[#958a7a]">C:</span>
            <span className="font-semibold text-[#2d1f17] dark:text-[#e0d1b9]">₹{formatPrice(activeHud.close)}</span>
          </div>

          <div className={`font-semibold ${activeHud.change >= 0 ? 'text-[#2d6a4f] dark:text-emerald-400' : 'text-[#b20808] dark:text-rose-400'}`}>
            {activeHud.change >= 0 ? '+' : ''}{activeHud.change ? activeHud.change.toFixed(2) : '0.00'}%
          </div>

          {activeHud.volume !== undefined && activeHud.volume !== null && (
            <div className="flex items-center space-x-1">
              <span className="text-[#806350] dark:text-[#958a7a]">Vol:</span>
              <span className="font-semibold text-[#2d1f17] dark:text-[#e0d1b9]">{formatVolume(activeHud.volume)}</span>
            </div>
          )}

          {showEma20 && activeHud.ema20 && (
            <div className="text-amber-700 dark:text-amber-400 flex items-center space-x-1">
              <span className="text-[10px]">{isWeeklyActive ? '10W EMA:' : '20 EMA:'}</span>
              <span className="font-semibold">₹{formatPrice(activeHud.ema20)}</span>
            </div>
          )}

          {showDma50 && activeHud.dma50 && (
            <div className="text-blue-700 dark:text-blue-400 flex items-center space-x-1">
              <span className="text-[10px]">{isWeeklyActive ? '40W SMA:' : '50 DMA:'}</span>
              <span className="font-semibold">₹{formatPrice(activeHud.dma50)}</span>
            </div>
          )}

          {showDma200 && activeHud.dma200 && !isWeeklyActive && (
            <div className="text-[#8b0909] dark:text-purple-400 flex items-center space-x-1">
              <span className="text-[10px]">200 DMA:</span>
              <span className="font-semibold">₹{formatPrice(activeHud.dma200)}</span>
            </div>
          )}
        </div>
      )}

      {/* 3. Lightweight Charts Canvas */}
      <div ref={chartContainerRef} className="w-full rounded-lg overflow-hidden" />

      {/* 4. Bottom Trade Matrix Legend */}
      {showTradeMatrix && (entryPrice || stopPrice || target1 || target2) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#b8a597]/40 dark:border-[#363c44] pt-2 text-[10px] font-mono">
          <span className="text-[#806350] dark:text-[#958a7a] font-bold uppercase tracking-wider">
            Active Trade Matrix Overlay
          </span>
          <div className="flex flex-wrap items-center gap-3">
            {stopPrice && Number(stopPrice) > 0 && (
              <span className="flex items-center space-x-1 text-[#b20808] dark:text-rose-400 font-semibold">
                <span className="inline-block h-1.5 w-3 border-b-2 border-dashed border-[#b20808] dark:border-rose-400" />
                <span>Stop: ₹{Number(stopPrice).toFixed(1)}</span>
              </span>
            )}
            {entryPrice && Number(entryPrice) > 0 && (
              <span className="flex items-center space-x-1 text-[#2563eb] dark:text-sky-400 font-semibold">
                <span className="inline-block h-1.5 w-3 border-b-2 border-solid border-[#2563eb] dark:border-sky-400" />
                <span>Entry: ₹{Number(entryPrice).toFixed(1)}</span>
              </span>
            )}
            {target1 && Number(target1) > 0 && (
              <span className="flex items-center space-x-1 text-[#2d6a4f] dark:text-emerald-400 font-semibold">
                <span className="inline-block h-1.5 w-3 border-b-2 border-dashed border-[#2d6a4f] dark:border-emerald-400" />
                <span>T1 (+2R): ₹{Number(target1).toFixed(1)}</span>
              </span>
            )}
            {target2 && Number(target2) > 0 && (
              <span className="flex items-center space-x-1 text-indigo-700 dark:text-indigo-400 font-semibold">
                <span className="inline-block h-1.5 w-3 border-b-2 border-dashed border-indigo-700 dark:border-indigo-400" />
                <span>T2 (+3R): ₹{Number(target2).toFixed(1)}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
