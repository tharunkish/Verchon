import React, { useState, useEffect } from 'react';
import { Search, X, Layers, Briefcase, ChevronRight } from 'lucide-react';
import { normalizeTicker } from '../App';

export default function CommandK({ isOpen, onClose, onSelectTicker, onNavigateTab }) {
  const [search, setSearch] = useState('');

  const quickTickers = [
    { ticker: 'ICICIBANK.NS', name: 'ICICI Bank Ltd.', sector: 'Banking' },
    { ticker: 'TCS.NS', name: 'Tata Consultancy Services', sector: 'IT Services' },
    { ticker: 'IDEA.NS', name: 'Vodafone Idea Ltd.', sector: 'Telecom' },
    { ticker: 'RELIANCE.NS', name: 'Reliance Industries Ltd.', sector: 'Energy & Retail' },
    { ticker: 'INFY.NS', name: 'Infosys Ltd.', sector: 'IT Services' },
    { ticker: 'HAL.NS', name: 'Hindustan Aeronautics Ltd.', sector: 'Defense' },
    { ticker: 'TVSMOTOR.NS', name: 'TVS Motor Company', sector: 'Auto' },
  ];

  const filtered = quickTickers.filter(
    (t) =>
      t.ticker.toLowerCase().includes(search.toLowerCase()) ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.sector.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 pt-24 backdrop-blur-md">
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-white/[0.08] bg-[#0c0c10]/95 shadow-2xl backdrop-blur-2xl">
        {/* Search Input Bar */}
        <div className="flex items-center border-b border-zinc-800/80 px-4 py-3">
          <Search className="mr-3 h-4 w-4 text-rose-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stock ticker, company, or command..."
            className="w-full bg-transparent font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
            autoFocus
          />
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Action Suggestions */}
        <div className="max-h-80 overflow-y-auto p-2 text-xs">
          <div className="px-3 py-1 font-mono text-[10px] text-zinc-500">QUICK ACTIONS</div>
          <button
            onClick={() => {
              onNavigateTab('scanner');
              onClose();
            }}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-zinc-300 hover:bg-zinc-900"
          >
            <span className="flex items-center space-x-2">
              <Layers className="h-3.5 w-3.5 text-zinc-400" />
              <span>Go to Market Scanner & AI Reports</span>
            </span>
            <kbd className="font-mono text-[10px] text-zinc-500">Press 1</kbd>
          </button>

          <button
            onClick={() => {
              onNavigateTab('portfolio');
              onClose();
            }}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-zinc-300 hover:bg-zinc-900"
          >
            <span className="flex items-center space-x-2">
              <Briefcase className="h-3.5 w-3.5 text-zinc-400" />
              <span>Go to Paper Portfolio Cockpit</span>
            </span>
            <kbd className="font-mono text-[10px] text-zinc-500">Press 2</kbd>
          </button>

          <div className="mt-2 border-t border-zinc-900 px-3 pt-2 pb-1 font-mono text-[10px] text-zinc-500">
            SEARCH STOCKS
          </div>
          {filtered.length > 0 ? (
            filtered.map((item) => (
              <button
                key={item.ticker}
                onClick={() => {
                  onSelectTicker(item.ticker);
                  onNavigateTab('deepdive');
                  onClose();
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-zinc-900"
              >
                <div>
                  <div className="font-mono font-medium text-zinc-200">{item.ticker}</div>
                  <div className="text-[11px] text-zinc-500">{item.name} · {item.sector}</div>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
              </button>
            ))
          ) : (
            <button
              onClick={() => {
                if (search.trim()) {
                  const clean = normalizeTicker(search.trim());
                  onSelectTicker(clean);
                  onNavigateTab('deepdive');
                  onClose();
                }
              }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-zinc-900 text-zinc-300"
            >
              <span>Analyze ticker "{normalizeTicker(search.trim())}"</span>
              <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
