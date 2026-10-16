import React, { useState, useEffect } from 'react';
import TerminalHeader from './components/terminal/TerminalHeader';
import AppleHeader from './components/apple/AppleHeader';
import CommandK from './components/CommandK';
import BackgroundAura from './components/BackgroundAura';
import SettingsModal from './components/SettingsModal';
import TerminalScannerTab from './tabs/terminal/TerminalScannerTab';
import AppleScannerTab from './tabs/apple/AppleScannerTab';
import TerminalPortfolioTab from './tabs/terminal/TerminalPortfolioTab';
import ApplePortfolioTab from './tabs/apple/ApplePortfolioTab';
import DeepDiveTab from './tabs/DeepDiveTab';
import NewsTab from './tabs/NewsTab';
import OrderExecutionModal from './components/OrderExecutionModal';
import SystemRestartModal from './components/SystemRestartModal';
import { useToast } from './components/Toast';

export function normalizeTicker(input) {
  if (!input) return 'ICICIBANK.NS';
  let t = input.trim().toUpperCase();
  if (!t.endsWith('.NS') && !t.endsWith('.BO') && !t.startsWith('^')) {
    t = `${t}.NS`;
  }
  return t;
}

export default function App() {
  const { addToast } = useToast();

  const getInitialThemeStyle = () => {
    try {
      const saved = localStorage.getItem('verchon_theme_style');
      if (saved) return saved;
      const legacy = localStorage.getItem('verchon_theme_mode');
      if (legacy === 'classic-terminal' || legacy === 'terminal') return 'terminal';
      return 'apple';
    } catch {
      return 'apple';
    }
  };

  const getInitialColorMode = () => {
    try {
      const saved = localStorage.getItem('verchon_color_mode');
      if (saved === 'light' || saved === 'dark') return saved;
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
      }
      return 'dark';
    } catch {
      return 'dark';
    }
  };

  const [themeStyle, setThemeStyleState] = useState(getInitialThemeStyle);
  const [colorMode, setColorModeState] = useState(getInitialColorMode);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRestartModalOpen, setIsRestartModalOpen] = useState(false);

  const setThemeStyle = (style) => {
    setThemeStyleState(style);
    try {
      localStorage.setItem('verchon_theme_style', style);
    } catch (err) {
      console.warn('Failed to save theme style preference:', err);
    }
  };

  const setColorMode = (mode) => {
    setColorModeState(mode);
    try {
      localStorage.setItem('verchon_color_mode', mode);
      if (mode === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (err) {
      console.warn('Failed to save color mode preference:', err);
    }
  };

  useEffect(() => {
    if (colorMode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [colorMode]);

  // Backward-compatibility alias for components expecting themeMode
  const themeMode = themeStyle;
  const setThemeMode = setThemeStyle;

  const getInitialTab = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['scanner', 'portfolio', 'deepdive', 'news'].includes(tabParam.toLowerCase())) {
        return tabParam.toLowerCase();
      }
      return localStorage.getItem('verchon_active_tab') || 'scanner';
    } catch {
      return 'scanner';
    }
  };

  const getInitialTicker = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tickerParam = params.get('ticker');
      if (tickerParam) {
        return normalizeTicker(tickerParam);
      }
      return localStorage.getItem('verchon_active_ticker') || 'ICICIBANK.NS';
    } catch {
      return 'ICICIBANK.NS';
    }
  };

  const [activeTab, setActiveTabState] = useState(getInitialTab);
  const [selectedTicker, setSelectedTickerState] = useState(getInitialTicker);

  const setActiveTab = (tab) => {
    setActiveTabState(tab);
    try {
      localStorage.setItem('verchon_active_tab', tab);
    } catch {}
  };

  const setSelectedTicker = (ticker) => {
    const normalized = normalizeTicker(ticker);
    setSelectedTickerState(normalized);
    try {
      localStorage.setItem('verchon_active_ticker', normalized);
    } catch {}
  };

  const getInitialCandidates = () => {
    try {
      const saved = sessionStorage.getItem('verchon_candidates') || localStorage.getItem('verchon_candidates');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  };

  const getInitialAiReport = () => {
    try {
      const saved = sessionStorage.getItem('verchon_ai_report');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  };

  const [regime, setRegime] = useState(null);
  const [candidates, setCandidates] = useState(getInitialCandidates);
  const [loadingScan, setLoadingScan] = useState(false);
  const [aiReport, setAiReport] = useState(getInitialAiReport);
  const [loadingAI, setLoadingAI] = useState(false);
  const [paperPositions, setPaperPositions] = useState([]);
  const [paperAccount, setPaperAccount] = useState(null);
  const [isCommandKOpen, setIsCommandKOpen] = useState(false);

  const [scanElapsed, setScanElapsed] = useState(0);
  const [aiElapsed, setAiElapsed] = useState(0);

  useEffect(() => {
    let interval;
    if (loadingScan) {
      setScanElapsed(0);
      interval = setInterval(() => setScanElapsed((prev) => prev + 1), 1000);
    } else {
      setScanElapsed(0);
    }
    return () => clearInterval(interval);
  }, [loadingScan]);

  useEffect(() => {
    let interval;
    if (loadingAI) {
      setAiElapsed(0);
      interval = setInterval(() => setAiElapsed((prev) => prev + 1), 1000);
    } else {
      setAiElapsed(0);
    }
    return () => clearInterval(interval);
  }, [loadingAI]);

  // Persist scan results and AI report
  useEffect(() => {
    try {
      if (candidates && candidates.length > 0) {
        sessionStorage.setItem('verchon_candidates', JSON.stringify(candidates));
        localStorage.setItem('verchon_candidates', JSON.stringify(candidates));
      }
    } catch (err) {
      console.warn('Failed to persist candidates:', err);
    }
  }, [candidates]);

  useEffect(() => {
    try {
      if (aiReport) {
        sessionStorage.setItem('verchon_ai_report', JSON.stringify(aiReport));
      }
    } catch (err) {
      console.warn('Failed to persist AI report:', err);
    }
  }, [aiReport]);


  // Global Order Modal State
  const [isGlobalOrderModalOpen, setIsGlobalOrderModalOpen] = useState(false);
  const [orderModalTicker, setOrderModalTicker] = useState('TCS.NS');
  const [orderModalStrategy, setOrderModalStrategy] = useState('MANUAL_ENTRY');

  // Synchronize activeTab and selectedTicker to URL & localStorage
  useEffect(() => {
    try {
      localStorage.setItem('verchon_active_tab', activeTab);
      localStorage.setItem('verchon_active_ticker', selectedTicker);
      const url = new URL(window.location.href);
      url.searchParams.set('tab', activeTab);
      url.searchParams.set('ticker', selectedTicker);
      window.history.replaceState({}, '', url.toString());
    } catch (err) {
      console.warn('URL state sync failed:', err);
    }
  }, [activeTab, selectedTicker]);

  // 1. Fetch initial Market Regime, Paper Ledger & Account on mount
  useEffect(() => {
    fetch('/api/regime')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setRegime(data);
      })
      .catch((err) => console.error('Regime fetch error:', err));

    fetchPaperPositions();
    fetchPaperAccount();
  }, []);

  const fetchPaperPositions = async () => {
    try {
      const res = await fetch('/api/paper-trades');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setPaperPositions(data);
        return data;
      }
    } catch (err) {
      console.error('Paper trades fetch error:', err);
    }
    return [];
  };

  const fetchPaperAccount = async () => {
    try {
      const res = await fetch('/api/paper-trades/account');
      if (res.ok) {
        const data = await res.json();
        if (data) setPaperAccount(data);
        return data;
      }
    } catch (err) {
      console.error('Paper account fetch error:', err);
    }
    return null;
  };

  // 2. Global Keyboard Navigation (1, 2, 3 for tabs, Ctrl+K for search, J/K for candidate cycling)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }

      // Command K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandKOpen((prev) => !prev);
        return;
      }

      // Tab Switching
      if (e.key === '1') {
        setActiveTab('scanner');
      } else if (e.key === '2') {
        setActiveTab('portfolio');
      } else if (e.key === '3') {
        setActiveTab('deepdive');
      } else if (e.key === '4') {
        setActiveTab('news');
      }

      // Candidate Cycling with J (next) and K (prev) when candidates exist
      if (candidates.length > 0 && activeTab === 'scanner') {
        const currentIndex = candidates.findIndex((c) => c.ticker === selectedTicker);
        if (e.key.toLowerCase() === 'j') {
          // Next candidate
          const nextIndex = (currentIndex + 1) % candidates.length;
          setSelectedTicker(candidates[nextIndex].ticker);
        } else if (e.key.toLowerCase() === 'k') {
          // Previous candidate
          const prevIndex = (currentIndex - 1 + candidates.length) % candidates.length;
          setSelectedTicker(candidates[prevIndex].ticker);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [candidates, selectedTicker, activeTab]);

  // 3. Actions: Scan Universe
  const handleRunScan = async (params) => {
    setLoadingScan(true);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error(`Scan failed: ${res.statusText}`);
      const data = await res.json();
      const loadedCandidates = data.candidates || [];
      setCandidates(loadedCandidates);
      if (data.market_regime) setRegime(data.market_regime);
      if (loadedCandidates.length > 0) {
        setSelectedTicker(loadedCandidates[0].ticker);
      }
      addToast(`Scan complete: ${loadedCandidates.length} candidate(s) shortlisted`, 'success');
    } catch (err) {
      console.error('Scan error:', err);
      addToast(`Scan error: ${err.message}`, 'error');
    } finally {
      setLoadingScan(false);
    }
  };

  // 4. Actions: Generate AI Report (with SSE Token Streaming)
  const handleGenerateAIReport = async (tickers) => {
    setLoadingAI(true);
    // Initialize temporary report shell for live token updates
    setAiReport({ report_markdown: '', finalist_tickers: tickers || [] });

    try {
      const res = await fetch('/api/ai-report/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers }),
      });
      if (!res.ok) throw new Error(`AI Report failed: ${res.statusText}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let streamBuffer = '';
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        streamBuffer += decoder.decode(value, { stream: true });
        const lines = streamBuffer.split('\n\n');
        streamBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const payload = JSON.parse(trimmed.slice(6));
              if (payload.type === 'token') {
                accumulatedText += payload.content;
                setAiReport((prev) => ({
                  ...(typeof prev === 'object' ? prev : {}),
                  report_markdown: accumulatedText,
                  finalist_tickers: tickers || [],
                }));
              } else if (payload.type === 'done') {
                setAiReport(payload);
                addToast('Institutional AI Briefing generated successfully', 'success');
              } else if (payload.type === 'error') {
                throw new Error(payload.error || 'Stream error');
              }
            } catch (pErr) {
              // Ignore single chunk JSON parse issues
            }
          }
        }
      }
    } catch (err) {
      console.error('AI Report error:', err);
      addToast(`AI Report error: ${err.message}`, 'error');
    } finally {
      setLoadingAI(false);
    }
  };

  // 5. Actions: Paper Trade Management
  const handleAddPaperPosition = async (newPos) => {
    try {
      const res = await fetch('/api/paper-trades/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPos),
      });
      if (res.ok) {
        await fetchPaperPositions();
        await fetchPaperAccount();
        setActiveTab('portfolio');
        addToast(`Order filled: ${newPos.ticker} (${newPos.quantity} shares @ ₹${newPos.entry_price})`, 'success');
      } else {
        addToast(`Failed to record paper trade for ${newPos.ticker}`, 'error');
      }
    } catch (err) {
      console.error('Add position error:', err);
      addToast(`Error adding paper trade: ${err.message}`, 'error');
    }
  };

  const handleClosePaperPosition = async (positionId, exitReason, exitPrice, quantityToClose = null) => {
    try {
      const payload = {
        position_id: positionId,
        exit_reason: exitReason,
        exit_price: exitPrice,
      };
      if (quantityToClose !== null) {
        payload.quantity_to_close = quantityToClose;
      }

      const res = await fetch('/api/paper-trades/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const closedData = await res.json();
        await fetchPaperPositions();
        await fetchPaperAccount();
        const pnlStr = closedData.net_pnl != null ? ` (Net P&L: ₹${closedData.net_pnl.toFixed(2)})` : '';
        addToast(`Closed: ${closedData.ticker} #${positionId} (${exitReason})${pnlStr}`, 'info');
      } else {
        addToast(`Failed to close position #${positionId}`, 'error');
      }
    } catch (err) {
      console.error('Close position error:', err);
      addToast(`Error closing position: ${err.message}`, 'error');
    }
  };

  const handleUpdateStop = async (positionId, newStopPrice) => {
    try {
      const res = await fetch('/api/paper-trades/update-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position_id: positionId,
          new_stop_price: newStopPrice,
        }),
      });
      if (res.ok) {
        fetchPaperPositions();
        fetchPaperAccount();
        addToast(`Stop Loss updated to ₹${Number(newStopPrice).toFixed(2)}`, 'info');
      } else {
        addToast(`Failed to update stop price`, 'error');
      }
    } catch (err) {
      addToast(`Error updating stop: ${err.message}`, 'error');
    }
  };

  const handleUpdateAccount = async (settings) => {
    try {
      const res = await fetch('/api/paper-trades/account/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        const acc = await res.json();
        setPaperAccount(acc);
        addToast(`Portfolio capital updated to ₹${acc.starting_capital.toLocaleString('en-IN')}`, 'success');
      } else {
        addToast('Failed to update portfolio capital', 'error');
      }
    } catch (err) {
      addToast(`Error updating capital: ${err.message}`, 'error');
    }
  };

  const handleResetAccount = async (settings) => {
    try {
      const res = await fetch('/api/paper-trades/account/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        const acc = await res.json();
        setPaperAccount(acc);
        fetchPaperPositions();
        addToast(`Portfolio and trade history reset to ₹${acc.starting_capital.toLocaleString('en-IN')}`, 'success');
      }
    } catch (err) {
      addToast(`Error resetting account: ${err.message}`, 'error');
    }
  };

  const handleOpenTradeModal = (ticker, strategy = 'MANUAL_ENTRY') => {
    if (ticker) setOrderModalTicker(ticker);
    if (strategy) setOrderModalStrategy(strategy);
    setIsGlobalOrderModalOpen(true);
  };

  const isTerminal = themeStyle === 'terminal';

  return (
    <div className={`relative min-h-screen w-full overflow-x-hidden transition-colors duration-200 ${
      isTerminal 
        ? 'bg-[#050508] text-zinc-100 font-mono' 
        : 'bg-[var(--bg-canvas)] text-[var(--text-primary)] font-sans'
    }`}>
      {/* Background Ambience */}
      {isTerminal ? (
        <BackgroundAura />
      ) : (
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-30 dark:opacity-20 transition-opacity duration-500">
          <div className="absolute -top-[25%] -left-[10%] h-[600px] w-[600px] rounded-full bg-blue-500/10 blur-[140px] dark:bg-blue-600/15" />
          <div className="absolute top-[20%] -right-[15%] h-[600px] w-[600px] rounded-full bg-indigo-500/10 blur-[150px] dark:bg-indigo-600/15" />
        </div>
      )}

      {/* Header: Exact Classic Terminal or Humane Apple Header */}
      {isTerminal ? (
        <TerminalHeader
          regime={regime}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenCommandK={() => setIsCommandKOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenRestartModal={() => setIsRestartModalOpen(true)}
          themeMode="terminal"
        />
      ) : (
        <AppleHeader
          regime={regime}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenCommandK={() => setIsCommandKOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenRestartModal={() => setIsRestartModalOpen(true)}
          colorMode={colorMode}
          setColorMode={setColorMode}
        />
      )}

      {/* Main Full-Screen Workspace Body */}
      <main className="relative z-10 w-full">
        {/* Scanner Tab: Exact Classic Monospace Terminal or Humane Apple Scanner */}
        {activeTab === 'scanner' && (
          isTerminal ? (
            <TerminalScannerTab
              candidates={candidates}
              loadingScan={loadingScan}
              regime={regime}
              onRunScan={handleRunScan}
              onSelectCandidate={(ticker) => {
                setSelectedTicker(ticker);
                setActiveTab('deepdive');
              }}
              onOpenTradeModal={handleOpenTradeModal}
              aiReport={aiReport}
              loadingAI={loadingAI}
              onGenerateAIReport={handleGenerateAIReport}
            />
          ) : (
            <AppleScannerTab
              candidates={candidates}
              loadingScan={loadingScan}
              regime={regime}
              onRunScan={handleRunScan}
              onSelectCandidate={(ticker) => {
                setSelectedTicker(ticker);
                setActiveTab('deepdive');
              }}
              onOpenTradeModal={handleOpenTradeModal}
              aiReport={aiReport}
              loadingAI={loadingAI}
              onGenerateAIReport={handleGenerateAIReport}
            />
          )
        )}

        {/* Portfolio Tab: Exact Classic Monospace Terminal or Humane Apple Portfolio Atelier */}
        {activeTab === 'portfolio' && (
          isTerminal ? (
            <TerminalPortfolioTab
              positions={paperPositions}
              account={paperAccount}
              onAddPosition={handleAddPaperPosition}
              onClosePosition={handleClosePaperPosition}
              onUpdateStop={handleUpdateStop}
              onUpdateAccount={handleUpdateAccount}
              onResetAccount={handleResetAccount}
              onRefreshQuotes={() => {
                fetchPaperPositions();
                fetchPaperAccount();
              }}
              candidates={candidates}
            />
          ) : (
            <ApplePortfolioTab
              positions={paperPositions}
              account={paperAccount}
              onAddPosition={handleAddPaperPosition}
              onClosePosition={handleClosePaperPosition}
              onUpdateStop={handleUpdateStop}
              onUpdateAccount={handleUpdateAccount}
              onResetAccount={handleResetAccount}
              onRefreshQuotes={() => {
                fetchPaperPositions();
                fetchPaperAccount();
              }}
              candidates={candidates}
            />
          )
        )}

        {/* Deep Dive Tab */}
        {activeTab === 'deepdive' && (
          <DeepDiveTab
            selectedTicker={selectedTicker}
            onSelectTicker={setSelectedTicker}
            onLogPaperTrade={handleAddPaperPosition}
            onOpenTradeModal={handleOpenTradeModal}
            themeMode={themeMode}
            themeStyle={themeStyle}
            colorMode={colorMode}
          />
        )}

        {/* Corporate News & Events Radar Tab */}
        {activeTab === 'news' && (
          <NewsTab
            onSelectStock={(ticker) => {
              setSelectedTicker(ticker);
              setActiveTab('deepdive');
            }}
          />
        )}
      </main>

      {/* Global Order Execution Modal */}
      <OrderExecutionModal
        isOpen={isGlobalOrderModalOpen}
        onClose={() => setIsGlobalOrderModalOpen(false)}
        initialTicker={orderModalTicker}
        initialStrategy={orderModalStrategy}
        candidateList={candidates}
        onOrderSubmitted={handleAddPaperPosition}
        account={paperAccount}
      />

      {/* Command K Modal */}
      <CommandK
        isOpen={isCommandKOpen}
        onClose={() => setIsCommandKOpen(false)}
        onSelectTicker={(ticker) => setSelectedTicker(ticker)}
        onNavigateTab={(tab) => setActiveTab(tab)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        themeStyle={themeStyle}
        setThemeStyle={setThemeStyle}
        colorMode={colorMode}
        setColorMode={setColorMode}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        onOpenRestartModal={() => setIsRestartModalOpen(true)}
      />

      {/* 1-Click Complete System & AI Engine Restart Modal */}
      <SystemRestartModal
        isOpen={isRestartModalOpen}
        onClose={() => setIsRestartModalOpen(false)}
      />
    </div>
  );
}
