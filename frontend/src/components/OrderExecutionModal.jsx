import React, { useState, useEffect } from 'react';
import { 
  X, 
  Zap, 
  Target, 
  ShieldCheck, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  Info,
  Sliders,
  CheckCircle2
} from 'lucide-react';
import { normalizeTicker } from '../App';

export default function OrderExecutionModal({
  isOpen,
  onClose,
  initialTicker = '',
  initialStrategy = '',
  candidateList = [],
  onOrderSubmitted,
  account,
}) {
  const [ticker, setTicker] = useState(initialTicker || 'TCS.NS');
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteData, setQuoteData] = useState(null);
  const [quoteError, setQuoteError] = useState(null);

  const [orderType, setOrderType] = useState('MARKET');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [target1, setTarget1] = useState('');
  const [target2, setTarget2] = useState('');
  const [quantity, setQuantity] = useState(10);
  const [strategyName, setStrategyName] = useState(initialStrategy || 'MANUAL_ENTRY');
  const [riskPctSetting, setRiskPctSetting] = useState(account?.risk_per_trade_pct || 1.0);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Sync initial ticker if modal opened with a specific stock
  useEffect(() => {
    if (initialTicker) {
      const clean = normalizeTicker(initialTicker);
      setTicker(clean);
      fetchQuote(clean);
    }
  }, [initialTicker]);

  useEffect(() => {
    if (isOpen && !quoteData && ticker) {
      fetchQuote(ticker);
    }
  }, [isOpen]);

  const fetchQuote = async (sym) => {
    if (!sym || !sym.trim()) return;
    const clean = normalizeTicker(sym);
    setLoadingQuote(true);
    setQuoteError(null);

    try {
      const pVal = account?.total_equity || 1000000;
      const res = await fetch(
        `/api/paper-trades/quote?ticker=${encodeURIComponent(clean)}&portfolio_value=${pVal}&risk_pct=${riskPctSetting / 100}`
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch quote (${res.statusText})`);
      }
      const data = await res.json();
      setQuoteData(data);
      setTicker(data.ticker);
      setEntryPrice(data.suggested_entry);
      setStopPrice(data.suggested_stop);
      setTarget1(data.target_1);
      setTarget2(data.target_2);
      setQuantity(data.recommended_quantity || 10);
      if (data.strategy_name && data.strategy_name !== 'MANUAL_ENTRY') {
        setStrategyName(data.strategy_name);
      }
    } catch (err) {
      setQuoteError(err.message);
    } finally {
      setLoadingQuote(false);
    }
  };

  const handleRecalculateQty = (newRiskPct) => {
    setRiskPctSetting(newRiskPct);
    const numEntry = parseFloat(entryPrice) || 0;
    const numStop = parseFloat(stopPrice) || 0;
    const pVal = account?.total_equity || 1000000;
    const availCash = account?.available_cash || 1000000;

    if (numEntry > numStop && numEntry > 0) {
      const riskPerShare = numEntry - numStop;
      const riskBudget = pVal * (newRiskPct / 100);
      const riskQty = Math.floor(riskBudget / riskPerShare);
      const cashQty = Math.floor(availCash / numEntry);
      const finalQty = Math.max(1, Math.min(riskQty, cashQty > 0 ? cashQty : riskQty));
      setQuantity(finalQty);
    }
  };

  // Recalculate targets when entry or stop changes manually
  const handleEntryChange = (val) => {
    setEntryPrice(val);
    const numEntry = parseFloat(val) || 0;
    const numStop = parseFloat(stopPrice) || 0;
    if (numEntry > numStop && numStop > 0) {
      const r = numEntry - numStop;
      setTarget1((numEntry + 2 * r).toFixed(2));
      setTarget2((numEntry + 3 * r).toFixed(2));
    }
  };

  const handleStopChange = (val) => {
    setStopPrice(val);
    const numEntry = parseFloat(entryPrice) || 0;
    const numStop = parseFloat(val) || 0;
    if (numEntry > numStop && numStop > 0) {
      const r = numEntry - numStop;
      setTarget1((numEntry + 2 * r).toFixed(2));
      setTarget2((numEntry + 3 * r).toFixed(2));
      handleRecalculateQty(riskPctSetting);
    }
  };

  const numEntry = parseFloat(entryPrice) || 0;
  const numStop = parseFloat(stopPrice) || 0;
  const numT1 = parseFloat(target1) || 0;
  const numT2 = parseFloat(target2) || 0;
  const numQty = parseInt(quantity) || 1;

  const capitalRequired = Math.round(numEntry * numQty);
  const riskPerShare = Math.max(0, numEntry - numStop);
  const totalRiskAmount = Math.round(riskPerShare * numQty);
  const riskPctOfPrice = numEntry > 0 ? ((riskPerShare / numEntry) * 100).toFixed(2) : '0';
  
  // Real-life Indian delivery statutory transaction charges estimate
  const estBuyCharges = Math.round(
    Math.min(20, capitalRequired * 0.0003) + // Brokerage
    capitalRequired * 0.001 +              // STT 0.1%
    capitalRequired * 0.0000297 +          // Exch txn
    capitalRequired * 0.00015 +            // Stamp duty
    capitalRequired * 0.000001 +           // SEBI
    0.18 * (Math.min(20, capitalRequired * 0.0003) + capitalRequired * 0.0000297) // GST
  );

  const estRewardT1 = Math.round(Math.max(0, (numT1 - numEntry) * numQty - estBuyCharges * 2));
  const estRewardT2 = Math.round(Math.max(0, (numT2 - numEntry) * numQty - estBuyCharges * 2));

  const availableCash = account?.available_cash || 1000000;
  const isCashInsufficient = capitalRequired > availableCash;
  const isInvalidSpread = numEntry <= numStop || numStop <= 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isInvalidSpread || submitting) return;

    setSubmitting(true);
    try {
      await onOrderSubmitted({
        ticker: ticker.trim().toUpperCase(),
        entry_price: numEntry,
        stop_price: numStop,
        target_1: numT1 > 0 ? numT1 : null,
        target_2: numT2 > 0 ? numT2 : null,
        quantity: numQty,
        order_type: orderType,
        strategy_name: strategyName || 'MANUAL_ENTRY',
        notes: notes.trim(),
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-6 py-4">
          <div className="flex items-center space-x-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Zap className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-mono text-sm font-bold text-zinc-100">
                  VERCHON VECTOR · ORDER EXECUTION
                </h3>
                <span className="rounded bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 font-mono text-[10px] text-emerald-300 font-semibold">
                  NSE DELIVERY
                </span>
              </div>
              <div className="font-mono text-[11px] text-zinc-400">
                Automated quote lookup · Sized via 1% Risk Budget rule
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* 1. Ticker Search & Quick Candidate Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-mono text-[11px] text-zinc-400 font-semibold">
                TICKER SYMBOL
              </label>
              {loadingQuote && (
                <span className="flex items-center space-x-1 font-mono text-[11px] text-rose-400">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span>Fetching live NSE quote & technical levels...</span>
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="e.g. TCS.NS or ICICIBANK.NS"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  onBlur={() => fetchQuote(ticker)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      fetchQuote(ticker);
                    }
                  }}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/90 px-3.5 py-2 font-mono text-xs text-zinc-100 uppercase outline-none hover:border-zinc-700 focus:border-rose-500"
                  required
                />
              </div>
              <button
                type="button"
                onClick={() => fetchQuote(ticker)}
                className="flex items-center space-x-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200 hover:bg-zinc-800"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingQuote ? 'animate-spin' : ''}`} />
                <span>Auto-Fill</span>
              </button>
            </div>

            {/* Quick Pick Pills from Scan */}
            {candidateList && candidateList.length > 0 && (
              <div className="mt-2 flex items-center space-x-1.5 overflow-x-auto">
                <span className="font-mono text-[10px] text-zinc-500 shrink-0">Scanned Candidates:</span>
                {candidateList.slice(0, 5).map((c) => (
                  <button
                    key={c.ticker}
                    type="button"
                    onClick={() => {
                      setTicker(c.ticker);
                      fetchQuote(c.ticker);
                    }}
                    className={`rounded border px-2 py-0.5 font-mono text-[10px] transition ${
                      ticker === c.ticker
                        ? 'border-rose-500 bg-rose-950/40 text-rose-300'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    {c.ticker.replace('.NS', '')}
                  </button>
                ))}
              </div>
            )}

            {quoteError && (
              <div className="mt-2 rounded border border-rose-800/80 bg-rose-950/30 p-2 font-mono text-[11px] text-rose-300 flex items-center space-x-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>{quoteError}</span>
              </div>
            )}
          </div>

          {/* 2. Order Parameters (Entry, Stop Loss, Target 1, Target 2) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="mb-1 block font-mono text-[10px] text-zinc-400">
                ENTRY PRICE (₹)
              </label>
              <input
                type="number"
                step="0.05"
                value={entryPrice}
                onChange={(e) => handleEntryChange(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2 font-mono text-xs font-semibold text-zinc-100 outline-none focus:border-rose-500"
                required
              />
              <span className="font-mono text-[9px] text-zinc-500 mt-0.5 block">Market / Fill Price</span>
            </div>

            <div>
              <label className="mb-1 block font-mono text-[10px] text-rose-400">
                STOP LOSS (₹)
              </label>
              <input
                type="number"
                step="0.05"
                value={stopPrice}
                onChange={(e) => handleStopChange(e.target.value)}
                className="w-full rounded-lg border border-rose-900/60 bg-zinc-900 p-2 font-mono text-xs font-semibold text-rose-300 outline-none focus:border-rose-500"
                required
              />
              <span className="font-mono text-[9px] text-rose-400/80 mt-0.5 block">
                -{riskPctOfPrice}% swing buffer
              </span>
            </div>

            <div>
              <label className="mb-1 block font-mono text-[10px] text-emerald-400">
                TARGET 1 (2R) (₹)
              </label>
              <input
                type="number"
                step="0.05"
                value={target1}
                onChange={(e) => setTarget1(e.target.value)}
                className="w-full rounded-lg border border-emerald-900/60 bg-zinc-900 p-2 font-mono text-xs font-semibold text-emerald-300 outline-none focus:border-emerald-500"
                required
              />
              <span className="font-mono text-[9px] text-emerald-400/80 mt-0.5 block">
                Scale 50% here (+2R)
              </span>
            </div>

            <div>
              <label className="mb-1 block font-mono text-[10px] text-rose-400">
                TARGET 2 (3R) (₹)
              </label>
              <input
                type="number"
                step="0.05"
                value={target2}
                onChange={(e) => setTarget2(e.target.value)}
                className="w-full rounded-lg border border-rose-900/60 bg-zinc-900 p-2 font-mono text-xs font-semibold text-rose-300 outline-none focus:border-rose-500"
              />
              <span className="font-mono text-[9px] text-rose-400/80 mt-0.5 block">
                Full exit (+3R)
              </span>
            </div>
          </div>

          {/* 3. Position Sizing & Risk Rule Calibration */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[11px] text-zinc-300 font-semibold flex items-center space-x-1.5">
                <Sliders className="h-3.5 w-3.5 text-rose-400" />
                <span>RISK-BUDGET POSITION SIZER</span>
              </span>
              <div className="flex items-center space-x-1">
                {[0.5, 1.0, 1.5, 2.0].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => handleRecalculateQty(pct)}
                    className={`rounded px-2 py-0.5 font-mono text-[10px] transition ${
                      riskPctSetting === pct
                        ? 'bg-rose-600 text-white font-bold shadow-sm shadow-rose-950/60'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {pct}% Risk
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block font-mono text-[10px] text-zinc-400">
                  SHARES (QUANTITY)
                </label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2 font-mono text-xs font-bold text-zinc-100 outline-none focus:border-rose-500"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block font-mono text-[10px] text-zinc-400">
                  QUALIFIED STRATEGY
                </label>
                <input
                  type="text"
                  value={strategyName}
                  onChange={(e) => setStrategyName(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2 font-mono text-xs text-zinc-300 outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="mb-1 block font-mono text-[10px] text-zinc-400">
                  ORDER TYPE
                </label>
                <select
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2 font-mono text-xs text-zinc-200 outline-none"
                >
                  <option value="MARKET">Market Execution</option>
                  <option value="LIMIT">Limit / Trigger Order</option>
                </select>
              </div>
            </div>
          </div>

          {/* 4. Real-World Execution Metrics & Statutory Cost Preview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/20 p-3 font-mono text-xs">
            <div className="border-r border-zinc-800/80 pr-2">
              <span className="text-[10px] text-zinc-500 block">CAPITAL REQUIRED</span>
              <span className={`text-xs font-bold ${isCashInsufficient ? 'text-rose-400' : 'text-zinc-200'}`}>
                ₹{capitalRequired.toLocaleString('en-IN')}
              </span>
              <span className="text-[9px] text-zinc-500 block">
                Cash: ₹{Math.round(availableCash).toLocaleString('en-IN')}
              </span>
            </div>

            <div className="border-r border-zinc-800/80 pr-2">
              <span className="text-[10px] text-zinc-500 block">MAX RISK AT STOP</span>
              <span className="text-xs font-bold text-rose-400">
                ₹{totalRiskAmount.toLocaleString('en-IN')}
              </span>
              <span className="text-[9px] text-zinc-500 block">
                ₹{riskPerShare.toFixed(2)}/sh ({riskPctSetting}% rule)
              </span>
            </div>

            <div className="border-r border-zinc-800/80 pr-2">
              <span className="text-[10px] text-zinc-500 block">EST. STATUTORY COSTS</span>
              <span className="text-xs font-bold text-amber-400">
                ₹{estBuyCharges}
              </span>
              <span className="text-[9px] text-zinc-500 block">
                STT, GST, Stamp duty
              </span>
            </div>

            <div>
              <span className="text-[10px] text-zinc-500 block">POTENTIAL GAIN (2R)</span>
              <span className="text-xs font-bold text-emerald-400">
                +₹{estRewardT1.toLocaleString('en-IN')}
              </span>
              <span className="text-[9px] text-emerald-400/70 block">
                Net after charges
              </span>
            </div>
          </div>

          {/* Validation Warnings */}
          {isInvalidSpread && (
            <div className="rounded-lg border border-rose-800/80 bg-rose-950/40 p-2.5 font-mono text-xs text-rose-300 flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Invalid setup: Entry price must be strictly greater than Stop Loss price.</span>
            </div>
          )}

          {isCashInsufficient && (
            <div className="rounded-lg border border-amber-800/80 bg-amber-950/40 p-2.5 font-mono text-xs text-amber-300 flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Capital required (₹{capitalRequired.toLocaleString('en-IN')}) exceeds available cash (₹{Math.round(availableCash).toLocaleString('en-IN')}). Consider reducing quantity.</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
            <div className="font-mono text-[11px] text-zinc-500">
              Risk:Reward = <span className="text-rose-400 font-bold">1 : 2.0</span> to T1 · <span className="text-emerald-400 font-bold">1 : 3.0</span> to T2
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 font-mono text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isInvalidSpread || submitting}
                className="flex items-center space-x-2 rounded-lg bg-gradient-to-r from-[#c9183b] to-[#a1112e] px-5 py-2 font-mono text-xs font-bold text-white shadow-md shadow-rose-950/60 transition hover:from-[#e11d48] hover:to-[#be123c] active:scale-95 disabled:opacity-40"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{submitting ? 'Executing Order...' : `Execute Paper Order (${numQty} shares)`}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
