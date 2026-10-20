import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  Sparkles, 
  MessageSquare, 
  Send, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp, 
  Scissors, 
  Lock, 
  ShieldAlert, 
  CheckCircle2, 
  ArrowRight,
  Bot,
  User,
  Zap,
  TrendingUp,
  AlertCircle,
  Activity,
  Layers,
  Coins
} from 'lucide-react';

/**
 * Extracts action tags from assistant text and strips any dangling action headers.
 */
function parseMessageActions(text = '') {
  if (!text) return { cleanText: '', actions: [] };

  const actions = [];
  // 1. Clean Windows UTF-8 mojibake for Rupee symbol and punctuation
  let cleanText = text
    .replace(/â¹|â‚¹/g, '₹')
    .replace(/â€™/g, "'")
    .replace(/â€œ|â€\x9d/g, '"')
    .replace(/â€”/g, '—');

  // 2. TRIM_50 pattern: [ACTION:TRIM_50:TICKER:QTY:LABEL] or **ACTION:TRIM_50:...**
  const trimRegex = /(?:\[|\*\*|\*|)ACTION:TRIM_50:([A-Z0-9_\.]+):?(\d*):?([^\]\*]*)(?:\]|\*\*|\*|)/gi;
  let match;
  while ((match = trimRegex.exec(cleanText)) !== null) {
    const sym = match[1].replace('.NS', '').replace('.BO', '');
    const customLabel = match[3] && !match[3].includes('BUTTON_LABEL') ? match[3].trim() : null;
    actions.push({
      type: 'TRIM_50',
      ticker: match[1],
      qty: match[2] ? parseInt(match[2]) : null,
      label: customLabel || `Bank 50% on ${sym}`,
    });
  }
  cleanText = cleanText.replace(trimRegex, '');

  // 3. UPDATE_STOP pattern
  const stopRegex = /(?:\[|\*\*|\*|)ACTION:UPDATE_STOP:([A-Z0-9_\.]+):([0-9\.]+):?([^\]\*]*)(?:\]|\*\*|\*|)/gi;
  while ((match = stopRegex.exec(cleanText)) !== null) {
    const sym = match[1].replace('.NS', '').replace('.BO', '');
    const customLabel = match[3] && !match[3].includes('BUTTON_LABEL') ? match[3].trim() : null;
    actions.push({
      type: 'UPDATE_STOP',
      ticker: match[1],
      price: parseFloat(match[2]),
      label: customLabel || `Tighten Stop to ₹${match[2]} on ${sym}`,
    });
  }
  cleanText = cleanText.replace(stopRegex, '');

  // 4. EXIT pattern
  const exitRegex = /(?:\[|\*\*|\*|)ACTION:EXIT:([A-Z0-9_\.]+):?([^\]\*]*)(?:\]|\*\*|\*|)/gi;
  while ((match = exitRegex.exec(cleanText)) !== null) {
    const sym = match[1].replace('.NS', '').replace('.BO', '');
    const customLabel = match[2] && !match[2].includes('BUTTON_LABEL') ? match[2].trim() : null;
    actions.push({
      type: 'EXIT',
      ticker: match[1],
      label: customLabel || `Exit ${sym} Now`,
    });
  }
  cleanText = cleanText.replace(exitRegex, '');

  // 5. Clean up dangling empty bullet headers left after tag extraction
  cleanText = cleanText
    .replace(/\*\*(?:Recommended Actions|Actions|Actionable Directives)\*\*[:\s]*/gi, '')
    .replace(/(?:^|\n)\s*[-*•]\s*\*\*[A-Z0-9_.\s]+:\*\*\s*(?=\n|$)/gi, '')
    .trim();

  return { cleanText, actions };
}

export default function PortfolioAiAssistant({
  positions = [],
  account = null,
  onTriggerPartial,
  onTriggerUpdateStop,
  onTriggerClose,
}) {
  const [briefing, setBriefing] = useState('');
  const [telemetry, setTelemetry] = useState(null);
  const [provider, setProvider] = useState('qwen');
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [isConsultOpen, setIsConsultOpen] = useState(false);
  const [lastAuditTime, setLastAuditTime] = useState(null);

  // Multi-turn chat state
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'I am your Quantitative Risk Officer. Ask me to stress-test your portfolio against market drops, evaluate trailing stops, or analyze dry powder deployment.',
      actions: [],
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const chatBottomRef = useRef(null);

  // Quick suggestion prompts
  const suggestionChips = [
    'What needs my immediate attention today?',
    'Any upcoming earnings or catalyst threats?',
    'Stress test: What if market drops 2% tomorrow?',
    'Should I take profits or let my winners run?',
  ];

  // NOTE: On-demand ONLY. No automatic execution on mount.
  const handleGenerateBriefing = async (force = true) => {
    setLoadingBriefing(true);
    try {
      const url = force ? '/api/paper-trades/ai-briefing?force_refresh=true' : '/api/paper-trades/ai-briefing';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setBriefing(data.briefing || '');
        setTelemetry(data.telemetry || null);
        if (data.provider) setProvider(data.provider);
        setLastAuditTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
    } catch (err) {
      console.warn('Failed to fetch portfolio briefing:', err);
    } finally {
      setLoadingBriefing(false);
    }
  };

  useEffect(() => {
    if (isConsultOpen && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isConsultOpen, isStreaming]);

  // Execute an action from AI suggestion
  const handleExecuteAction = (action) => {
    if (!action || !action.ticker) return;
    const cleanSym = action.ticker.replace('.NS', '').replace('.BO', '').toUpperCase();
    const matchingPos = positions.find((p) => {
      const pSym = (p.ticker || '').replace('.NS', '').replace('.BO', '').toUpperCase();
      return pSym === cleanSym && p.status === 'OPEN';
    });

    if (!matchingPos) {
      alert(`No open position found for ${cleanSym}`);
      return;
    }

    if (action.type === 'TRIM_50' && onTriggerPartial) {
      const qtyToTrim = action.qty || Math.floor((matchingPos.quantity || 1) / 2) || 1;
      onTriggerPartial(matchingPos, qtyToTrim);
    } else if (action.type === 'UPDATE_STOP' && onTriggerUpdateStop) {
      if (action.price) {
        onTriggerUpdateStop(matchingPos.id, action.price);
      }
    } else if (action.type === 'EXIT' && onTriggerClose) {
      onTriggerClose(
        matchingPos.id,
        'AI_ADVISORY_EXIT',
        matchingPos.current_price || matchingPos.entry_price
      );
    }
  };

  // Send a message in back-and-forth chat
  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isStreaming) return;

    setInputMessage('');
    const newHistory = [...messages, { role: 'user', content: text, actions: [] }];
    setMessages(newHistory);
    setIsStreaming(true);

    const assistantIndex = newHistory.length;
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '', actions: [] }
    ]);

    try {
      const res = await fetch('/api/paper-trades/ai-consult/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: newHistory
            .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
            .map((m) => ({ role: m.role, content: m.content }))
            .slice(-8),
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.type === 'token') {
                accumulated += data.content;
                setMessages((prev) => {
                  const updated = [...prev];
                  const { cleanText, actions } = parseMessageActions(accumulated);
                  updated[assistantIndex] = {
                    role: 'assistant',
                    content: cleanText,
                    actions: actions,
                  };
                  return updated;
                });
              } else if (data.type === 'done') {
                const finalReply = data.reply || accumulated;
                const { cleanText, actions } = parseMessageActions(finalReply);
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[assistantIndex] = {
                    role: 'assistant',
                    content: cleanText,
                    actions: actions,
                  };
                  return updated;
                });
              }
            } catch (err) {
              console.warn('SSE parse error:', err);
            }
          }
        }
      }
    } catch (err) {
      console.error('Consult stream error:', err);
      setMessages((prev) => {
        const updated = [...prev];
        updated[assistantIndex] = {
          role: 'assistant',
          content: `Unable to complete consultation: ${err.message}`,
          actions: [],
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const { cleanText: briefingClean, actions: briefingActions } = parseMessageActions(briefing);

  // Instant local calculations for idle status strip
  const openPositions = positions.filter((p) => p.status === 'OPEN');
  const availableCash = account?.available_cash ?? 10958;
  const startingCap = account?.starting_capital ?? 100000;
  const totalEquity = account?.total_equity || (availableCash + openPositions.reduce((acc, p) => acc + (p.current_price || p.entry_price) * p.quantity, 0));
  const cashPct = totalEquity > 0 ? ((availableCash / totalEquity) * 100).toFixed(1) : '100';
  const totalRiskAtStop = openPositions.reduce(
    (acc, p) => acc + Math.max(0, (p.entry_price - p.stop_price) * p.quantity),
    0
  );

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0F1626] p-5 shadow-sm transition-all space-y-4">
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
        <div className="flex items-center space-x-2.5">
          <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-semibold tracking-tight text-zinc-100">
                Portfolio Risk & Strategy Intelligence
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-zinc-800/80 text-zinc-400 border border-white/[0.05]">
                {provider === 'qwen' ? 'Qwen 3.5 (Local Engine)' : 'Gemini Cloud'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              On-demand quantitative risk assessment, position targets, and catalyst threats
            </p>
          </div>
        </div>

        {/* Console Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleGenerateBriefing(true)}
            disabled={loadingBriefing}
            className="flex items-center space-x-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/[0.08] px-3 py-1.5 text-xs font-semibold shadow-sm transition active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingBriefing ? 'animate-spin text-sky-400' : ''}`} />
            <span>{loadingBriefing ? 'Analyzing...' : briefing ? 'Refresh Briefing' : 'Generate Briefing'}</span>
          </button>

          <button
            onClick={() => setIsConsultOpen(!isConsultOpen)}
            className={`flex items-center space-x-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition shadow-sm active:scale-95 ${
              isConsultOpen
                ? 'bg-sky-500 text-zinc-950 hover:bg-sky-400'
                : 'border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>{isConsultOpen ? 'Hide Consultation' : 'Ask Assistant'}</span>
            {isConsultOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Briefing Section: Idle Zero-State vs Structured Markdown Output */}
      {!briefing && !loadingBriefing ? (
        /* ==================== IDLE STATE (Zero background waste) ==================== */
        <div className="rounded-xl border border-white/[0.04] bg-zinc-900/40 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-semibold text-zinc-200">
                Ready to Underwrite Portfolio Health
              </span>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Click "Generate Briefing" to run on-demand local AI evaluation across your {openPositions.length} open campaigns.
              </p>
            </div>

            <button
              onClick={() => handleGenerateBriefing(true)}
              className="inline-flex items-center space-x-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-zinc-950 font-semibold px-3 py-1.5 text-xs shadow-sm transition self-start sm:self-auto active:scale-95"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Run Live Analysis</span>
            </button>
          </div>

          {/* Instant Telemetry Badges (Calculated Locally) */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/[0.04]">
            <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-zinc-800/80 text-zinc-300 border border-white/[0.06]">
              Dry Powder: <strong className="text-zinc-100 font-bold">{cashPct}% Cash</strong>
            </span>
            <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-zinc-800/80 text-zinc-300 border border-white/[0.06]">
              Campaigns: <strong className="text-zinc-100 font-bold">{openPositions.length} In Flight</strong>
            </span>
            <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-zinc-800/80 text-zinc-300 border border-white/[0.06]">
              Risk at Stop: <strong className="text-rose-400 font-bold">₹{Math.round(totalRiskAtStop).toLocaleString('en-IN')}</strong>
            </span>
          </div>
        </div>
      ) : loadingBriefing && !briefing ? (
        /* ==================== LOADING STATE ==================== */
        <div className="rounded-xl border border-white/[0.04] bg-zinc-900/40 p-6 flex items-center justify-center space-x-3 text-xs text-zinc-400">
          <RefreshCw className="h-4 w-4 animate-spin text-sky-400" />
          <span>Synthesizing ledger telemetry, open trailing stops, and market regime...</span>
        </div>
      ) : (
        /* ==================== ACTIVE BRIEFING STATE (Rich Markdown) ==================== */
        <div className="rounded-xl border border-white/[0.04] bg-zinc-900/40 p-4 space-y-3">
          {lastAuditTime && (
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 pb-2 border-b border-white/[0.04]">
              <span>EXECUTIVE PORTFOLIO BRIEFING</span>
              <span>Audited at {lastAuditTime}</span>
            </div>
          )}

          {/* Markdown Content Block */}
          <div className="text-xs text-zinc-300 leading-relaxed space-y-2">
            <ReactMarkdown
              components={{
                h1: ({ node, ...props }) => <h1 className="text-sm font-bold text-zinc-100 mt-2 mb-1" {...props} />,
                h2: ({ node, ...props }) => <h2 className="text-xs font-bold text-zinc-100 uppercase tracking-wider mt-2.5 mb-1" {...props} />,
                h3: ({ node, ...props }) => <h3 className="text-xs font-bold text-sky-300 uppercase tracking-wider mt-2 mb-1" {...props} />,
                p: ({ node, ...props }) => <p className="mb-2 leading-relaxed text-zinc-200" {...props} />,
                strong: ({ node, ...props }) => <strong className="font-semibold text-zinc-100" {...props} />,
                ul: ({ node, ...props }) => <ul className="space-y-1.5 my-2 pl-3 list-none border-l-2 border-sky-500/30" {...props} />,
                li: ({ node, ...props }) => (
                  <li className="text-xs text-zinc-300 leading-relaxed pl-1" {...props} />
                ),
              }}
            >
              {briefingClean}
            </ReactMarkdown>
          </div>

          {/* Actionable Directives Pill Bar */}
          {briefingActions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/[0.05]">
              <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                Actionable Directives:
              </span>
              {briefingActions.map((act, i) => (
                <button
                  key={i}
                  onClick={() => handleExecuteAction(act)}
                  className="inline-flex items-center space-x-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-3 py-1.5 text-xs font-semibold transition active:scale-95 shadow-sm"
                >
                  {act.type === 'TRIM_50' && <Scissors className="h-3.5 w-3.5" />}
                  {act.type === 'UPDATE_STOP' && <Lock className="h-3.5 w-3.5" />}
                  {act.type === 'EXIT' && <AlertCircle className="h-3.5 w-3.5 text-rose-400" />}
                  <span>{act.label}</span>
                  <ArrowRight className="h-3 w-3 opacity-70" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Multi-Turn Back-and-Forth Consultation Drawer */}
      {isConsultOpen && (
        <div className="space-y-3 pt-3 border-t border-white/[0.06]">
          {/* Suggestion Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {suggestionChips.map((chip, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(chip)}
                disabled={isStreaming}
                className="text-[11px] rounded-full border border-white/[0.08] bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 px-3 py-1 transition hover:text-white"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Conversation History Stream with ReactMarkdown */}
          <div className="max-h-[380px] overflow-y-auto space-y-3 rounded-xl bg-zinc-950/40 p-4 border border-white/[0.04]">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex space-x-2.5 text-xs ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="h-6 w-6 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-xl p-3 leading-relaxed space-y-2 ${
                    msg.role === 'user'
                      ? 'bg-sky-500/15 border border-sky-500/20 text-zinc-100 font-medium'
                      : 'bg-zinc-900/70 border border-white/[0.06] text-zinc-200'
                  }`}
                >
                  <ReactMarkdown
                    components={{
                      p: ({ node, ...props }) => <p className="mb-1.5 leading-relaxed text-zinc-200" {...props} />,
                      strong: ({ node, ...props }) => <strong className="font-semibold text-zinc-100" {...props} />,
                      ul: ({ node, ...props }) => <ul className="space-y-1 my-1.5 pl-3 list-none border-l-2 border-sky-500/30" {...props} />,
                      li: ({ node, ...props }) => <li className="text-xs text-zinc-300 pl-1" {...props} />,
                    }}
                  >
                    {msg.content || (isStreaming && idx === messages.length - 1 ? 'Thinking...' : '')}
                  </ReactMarkdown>

                  {/* 1-Click Action Buttons Inside Chat Bubble */}
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/[0.06]">
                      {msg.actions.map((act, actIdx) => (
                        <button
                          key={actIdx}
                          onClick={() => handleExecuteAction(act)}
                          className="inline-flex items-center space-x-1.5 rounded-lg border border-sky-400/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 px-2.5 py-1 text-[11px] font-semibold transition active:scale-95 shadow-sm"
                        >
                          {act.type === 'TRIM_50' && <Scissors className="h-3 w-3 text-emerald-400" />}
                          {act.type === 'UPDATE_STOP' && <Lock className="h-3 w-3 text-amber-400" />}
                          {act.type === 'EXIT' && <AlertCircle className="h-3 w-3 text-rose-400" />}
                          <span>{act.label}</span>
                          <ArrowRight className="h-2.5 w-2.5 opacity-70" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="h-6 w-6 rounded-md bg-zinc-800 text-zinc-300 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          {/* Interactive Chat Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center space-x-2"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask anything about your portfolio, stress-test scenarios, or trades..."
              disabled={isStreaming}
              className="flex-1 rounded-xl border border-white/[0.08] bg-zinc-900/80 px-3.5 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-sky-500/50 transition"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || isStreaming}
              className="flex items-center space-x-1 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-zinc-950 font-semibold px-4 py-2 text-xs transition active:scale-95 shadow-sm"
            >
              <Send className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ask</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
