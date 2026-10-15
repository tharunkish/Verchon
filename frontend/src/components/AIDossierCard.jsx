import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  Sparkles, 
  AlertTriangle, 
  HelpCircle, 
  Eye, 
  ChevronDown, 
  ChevronUp, 
  FileText, 
  CheckCircle, 
  RefreshCw,
  Terminal,
  XCircle,
  X,
  MessageSquare,
  Send
} from 'lucide-react';

function DevDiagnosticsDrawer({ diagnostics, onClose, onRefresh }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-[#08080c] p-4 text-left font-mono text-xs shadow-2xl">
      <div className="mb-3 flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
        <div className="flex items-center space-x-2">
          <Terminal className="h-4 w-4 text-emerald-400" />
          <span className="font-bold text-zinc-100">GEMINI MODEL EXECUTION & FALLBACK CONSOLE</span>
        </div>
        <div className="flex items-center space-x-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="flex items-center space-x-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-200"
              title="Refresh server logs"
            >
              <RefreshCw className="h-2.5 w-2.5" />
              <span>Refresh</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:text-zinc-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {diagnostics && diagnostics.length > 0 ? (
        <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
          {diagnostics.map((d, idx) => {
            const isSuccess = d.status === 'SUCCESS' || d.status === 'FALLBACK_SUCCESS' || d.status === 'FALLBACK_CONFIG_SUCCESS';
            const isDenied = d.status?.includes('RATE_LIMITED') || d.status?.includes('DENIED') || d.status?.includes('429');
            const isBusy = d.status?.includes('503') || d.status?.includes('BUSY');

            return (
              <div
                key={idx}
                className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-2.5 text-[11px] leading-relaxed"
              >
                <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-zinc-100">{d.model}</span>
                    <span className="text-zinc-500 text-[10px]">[{d.stage || 'Pipeline'}]</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                        isSuccess
                          ? 'border border-emerald-600/50 bg-emerald-950/40 text-emerald-300'
                          : isDenied
                          ? 'border border-rose-600/50 bg-rose-950/40 text-rose-300'
                          : isBusy
                          ? 'border border-amber-600/50 bg-amber-950/40 text-amber-300'
                          : 'border border-zinc-700 bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {d.status}
                    </span>
                    <span className="text-zinc-400 font-mono text-[10px]">{d.latency_ms}ms</span>
                  </div>
                </div>

                <div className="text-zinc-300">{d.message}</div>

                {d.tokens_in != null && (
                  <div className="mt-1 text-[10px] text-zinc-500">
                    Tokens: {d.tokens_in} prompt · {d.tokens_out} completion
                  </div>
                )}

                {d.error && (
                  <div className="mt-1.5 rounded border border-rose-900/50 bg-rose-950/30 p-2 text-[10px] text-rose-300/90 break-all">
                    <span className="font-bold text-rose-200">Rejection Detail:</span> {d.error}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-6 text-center text-zinc-500 text-xs">
          No model calls executed in this session yet. Trigger "Synthesize Stock AI Dossier" to trace live model events.
        </div>
      )}
    </div>
  );
}

export default function AIDossierCard({ 
  ticker, 
  aiDossier, 
  loading, 
  streamingText = '',
  onGenerateDossier,
  onCancel,
  diagnostics = [],
  errorMessage 
}) {
  const [showFullRaw, setShowFullRaw] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showDevConsole, setShowDevConsole] = useState(false);
  const [liveDiagnostics, setLiveDiagnostics] = useState(diagnostics);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    if (diagnostics && diagnostics.length > 0) {
      setLiveDiagnostics(diagnostics);
    }
  }, [diagnostics]);

  const handleFetchServerDiagnostics = async () => {
    try {
      const res = await fetch('/api/ai-diagnostics');
      if (res.ok) {
        const data = await res.json();
        if (data.diagnostics) {
          setLiveDiagnostics(data.diagnostics);
        }
      }
    } catch {
      // Ignore network errors on diagnostics polling
    }
  };

  const handleSendChatMessage = async (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userText = chatInput.trim();
    const updatedHistory = [...chatMessages, { role: 'user', content: userText }];
    setChatMessages(updatedHistory);
    setChatInput('');
    setChatLoading(true);

    // Append initial empty assistant message for live streaming
    setChatMessages([...updatedHistory, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch(`/api/ai-chat/${ticker}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          history: chatMessages,
        }),
      });

      if (!res.ok) {
        throw new Error(`Chat request failed (${res.status})`);
      }

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
                setChatMessages([...updatedHistory, { role: 'assistant', content: accumulatedText }]);
              } else if (payload.type === 'done') {
                accumulatedText = payload.reply || accumulatedText;
                setChatMessages([...updatedHistory, { role: 'assistant', content: accumulatedText }]);
              } else if (payload.type === 'error') {
                setChatMessages([...updatedHistory, { role: 'assistant', content: `Error: ${payload.error}` }]);
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      setChatMessages([...updatedHistory, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Live timer during loading state
  useEffect(() => {
    let timer;
    if (loading) {
      setElapsedSeconds(0);
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(timer);
  }, [loading]);

  if (!aiDossier && !loading) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/60 p-6 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-purple-950/40 text-purple-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <h4 className="mt-2 font-mono text-xs font-semibold text-zinc-200">
            NO VERCHON VECTOR DOSSIER LOADED FOR {ticker}
          </h4>
          <p className="mx-auto mt-1 max-w-md text-[11px] text-zinc-500">
            Generate an institutional-grade, multi-factor AI research briefing synthesizing earnings quality, thesis invalidation levels, and key decision questions.
          </p>

          {errorMessage && (
            <div className="mx-auto mt-3 max-w-md rounded border border-rose-800/80 bg-rose-950/40 p-2 font-mono text-[11px] text-rose-300">
              {errorMessage}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={onGenerateDossier}
              disabled={loading}
              className="inline-flex items-center space-x-2 rounded-lg border border-rose-500/40 bg-rose-950/40 px-4 py-2 font-mono text-xs font-semibold text-rose-300 transition hover:bg-rose-900/50 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Synthesize Stock AI Dossier</span>
            </button>
            <button
              onClick={() => {
                setShowDevConsole(!showDevConsole);
                if (!showDevConsole) handleFetchServerDiagnostics();
              }}
              className="inline-flex items-center space-x-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 font-mono text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 transition"
              title="Inspect Gemini model attempts, rate limit denials & fallbacks"
            >
              <Terminal className="h-3.5 w-3.5 text-emerald-400" />
              <span>Dev Output</span>
            </button>
          </div>
        </div>

        {showDevConsole && (
          <DevDiagnosticsDrawer
            diagnostics={liveDiagnostics}
            onClose={() => setShowDevConsole(false)}
            onRefresh={handleFetchServerDiagnostics}
          />
        )}
      </div>
    );
  }

  if (loading) {
    const currentStage = 
      elapsedSeconds < 8 ? 'Ingesting 1Y OHLCV & 7-Pillar Fundamentals...'
      : elapsedSeconds < 25 ? 'Executing Gemini Stage 2 Multi-Factor Synthesis...'
      : elapsedSeconds < 45 ? 'Structuring Invalidation Boundaries & Contradictions...'
      : 'Finalizing Publication-Grade Dossier...';

    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 p-8 text-center font-mono">
          <div className="mx-auto flex h-10 w-10 animate-spin items-center justify-center rounded-full border-2 border-rose-400 border-t-transparent">
            <RefreshCw className="h-5 w-5 text-rose-400" />
          </div>
          <h4 className="mt-3 text-xs font-semibold text-rose-200">
            SYNTHESIZING DEEP REASONING DOSSIER FOR {ticker} ({elapsedSeconds}s)
          </h4>

          {/* Live Stage Progress Indicator */}
          <div className="mx-auto mt-3 max-w-md rounded-lg border border-rose-800/60 bg-zinc-950/80 p-3 text-left text-[11px]">
            <div className="flex items-center justify-between text-zinc-400 mb-1">
              <span>ACTIVE STAGE:</span>
              <span className="text-rose-300 font-bold">{elapsedSeconds}s elapsed</span>
            </div>
            <div className="text-zinc-200 font-semibold">{currentStage}</div>

            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
              <div 
                className="h-full bg-rose-500 transition-all duration-1000"
                style={{ width: `${Math.min(95, Math.max(10, elapsedSeconds * 2.2))}%` }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500">
              <span>Typical: 15–45s (Max ~60s recommended)</span>
              <span>Cancelable anytime</span>
            </div>
          </div>

          {/* Real-Time Token Stream Terminal */}
          {streamingText && (
            <div className="mx-auto mt-4 max-w-2xl rounded-xl border border-zinc-800 bg-[#090a0f] p-4 text-left shadow-2xl">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2 mb-2 font-mono text-[10px]">
                <div className="flex items-center space-x-2 text-rose-400">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                  <span className="font-bold tracking-wider">LIVE TOKEN STREAM (LOCAL QWEN 2.5 CODER 7B)</span>
                </div>
                <span className="text-zinc-500 font-mono">Real-Time Synthesis</span>
              </div>
              <div className="max-h-52 overflow-y-auto font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap select-text pr-1 scrollbar-thin scrollbar-thumb-zinc-700">
                {streamingText}
                <span className="inline-block w-1.5 h-3.5 ml-1 bg-rose-500 animate-pulse align-middle" />
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-center space-x-3">
            {onCancel && (
              <button
                onClick={onCancel}
                className="inline-flex items-center space-x-1.5 rounded-lg border border-rose-800/80 bg-rose-950/80 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-900 transition"
              >
                <XCircle className="h-3.5 w-3.5" />
                <span>Cancel Synthesis</span>
              </button>
            )}
            <button
              onClick={() => {
                setShowDevConsole(!showDevConsole);
                if (!showDevConsole) handleFetchServerDiagnostics();
              }}
              className="inline-flex items-center space-x-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition"
            >
              <Terminal className="h-3.5 w-3.5 text-emerald-400" />
              <span>{showDevConsole ? 'Hide Dev Console' : 'View Model Console'}</span>
            </button>
          </div>
        </div>

        {showDevConsole && (
          <DevDiagnosticsDrawer
            diagnostics={liveDiagnostics}
            onClose={() => setShowDevConsole(false)}
            onRefresh={handleFetchServerDiagnostics}
          />
        )}
      </div>
    );
  }

  const {
    thesis = [],
    key_evidence = [],
    announcements = [],
    contradiction = {},
    risks = {},
    research_questions = [],
    strengthen_conditions = [],
    weaken_conditions = [],
    raw_section = '',
    diagnostics: cardDiagnostics = [],
  } = aiDossier || {};

  const effectiveDiagnostics = (cardDiagnostics && cardDiagnostics.length > 0) ? cardDiagnostics : liveDiagnostics;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0c0c10]/80 shadow-2xl backdrop-blur-xl">
        {/* 1. Header Bar */}
        <div className="flex flex-wrap items-center justify-between border-b border-zinc-900 bg-rose-950/20 px-5 py-3">
          <div className="flex items-center space-x-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-500/20 text-rose-300">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-xs font-bold tracking-wide text-zinc-100">
                  VERCHON VECTOR DOSSIER
                </span>
                <span className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.2 font-mono text-[9px] font-semibold text-rose-300">
                  STAGE 2 REASONING
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                setShowDevConsole(!showDevConsole);
                if (!showDevConsole) handleFetchServerDiagnostics();
              }}
              className={`flex items-center space-x-1.5 rounded border px-2.5 py-1 font-mono text-[11px] transition ${
                showDevConsole
                  ? 'border-emerald-600/60 bg-emerald-950/40 text-emerald-300'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}
              title="Inspect Gemini model attempts, rate limit denials & fallbacks"
            >
              <Terminal className="h-3 w-3" />
              <span>Dev Output</span>
            </button>
            <button
              onClick={onGenerateDossier}
              disabled={loading}
              className="flex items-center space-x-1.5 rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1 font-mono text-[11px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
              title="Re-run AI Synthesis for this stock"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Refresh</span>
            </button>
            <button
              onClick={() => setChatOpen(!chatOpen)}
              className={`flex items-center space-x-1.5 rounded border px-2.5 py-1 font-mono text-[11px] transition ${
                chatOpen
                  ? 'border-purple-600/60 bg-purple-950/40 text-purple-300'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}
              title="Interactive conversation about this stock"
            >
              <MessageSquare className="h-3 w-3 text-purple-400" />
              <span>{chatOpen ? 'Hide Chat' : 'Chat with Stock'}</span>
            </button>
            <button
              onClick={() => setShowFullRaw(!showFullRaw)}
              className="flex items-center space-x-1.5 rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1 font-mono text-[11px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
            >
              <FileText className="h-3 w-3" />
              <span>{showFullRaw ? 'Executive Cards' : 'Raw Markdown'}</span>
            </button>
          </div>
        </div>


      {/* 2. Executive View vs Raw Markdown */}
      {showFullRaw ? (
        <div className="p-6">
          <div className="prose prose-invert max-w-none font-sans text-xs leading-relaxed text-zinc-300">
            <ReactMarkdown>{raw_section || 'No raw section content available.'}</ReactMarkdown>
          </div>
        </div>
      ) : (
        <div className="p-5 space-y-4">
          {/* A. Core Shortlist Thesis & Key Evidence (2-Column Grid) */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Bull Thesis / Shortlist Rationale */}
            <div className="rounded-lg border border-emerald-950/60 bg-emerald-950/15 p-4">
              <div className="mb-2 flex items-center space-x-2 text-emerald-400 font-mono text-xs font-semibold">
                <CheckCircle className="h-3.5 w-3.5" />
                <span>WHY IT QUALIFIES (THESIS)</span>
              </div>
              <ul className="space-y-1.5 text-xs text-zinc-300">
                {thesis.length > 0 ? (
                  thesis.map((point, idx) => (
                    <li key={idx} className="flex items-start space-x-2">
                      <span className="text-emerald-400 font-bold">•</span>
                      <span>{point}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-zinc-500">No specific thesis bullet points extracted.</li>
                )}
              </ul>
            </div>

            {/* Key Fundamental & Technical Evidence */}
            <div className="rounded-lg border border-rose-950/60 bg-rose-950/15 p-4">
              <div className="mb-2 flex items-center space-x-2 text-rose-400 font-mono text-xs font-semibold">
                <Eye className="h-3.5 w-3.5" />
                <span>KEY EMPIRICAL EVIDENCE</span>
              </div>
              <ul className="space-y-1.5 text-xs text-zinc-300">
                {key_evidence.length > 0 ? (
                  key_evidence.map((point, idx) => (
                    <li key={idx} className="flex items-start space-x-2">
                      <span className="text-rose-400 font-bold">•</span>
                      <span>{point}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-zinc-500">No specific evidence points extracted.</li>
                )}
              </ul>
            </div>
          </div>

          {/* Corporate Catalysts & Distilled Regulation 30 Filings */}
          {announcements && announcements.length > 0 && (
            <div className="rounded-lg border border-cyan-950/60 bg-cyan-950/15 p-4 text-xs font-mono">
              <div className="mb-2 flex items-center justify-between text-cyan-400 font-semibold">
                <div className="flex items-center space-x-2">
                  <FileText className="h-3.5 w-3.5" />
                  <span>CORPORATE CATALYSTS & REGULATION 30 FILINGS (SHORT-FORM)</span>
                </div>
                <span className="text-[10px] text-zinc-500 font-normal">AI Event Synthesis</span>
              </div>
              <ul className="space-y-1.5 text-xs text-zinc-300 font-sans">
                {announcements.map((item, idx) => (
                  <li key={idx} className="flex items-start space-x-2">
                    <span className="text-cyan-400 font-bold font-mono">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* B. Invalidation & Deterioration Triggers (Red Box) */}
          <div className="rounded-lg border border-rose-950/60 bg-rose-950/15 p-4 font-mono text-xs">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-rose-400 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>KILL SWITCH & INVALIDATION TRIGGERS</span>
              </div>
              <span className="text-[10px] text-zinc-500">Non-Predictive Risk Boundary</span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 text-xs md:grid-cols-3">
              <div className="rounded bg-rose-950/30 p-2.5 border border-rose-900/30">
                <div className="text-[10px] font-semibold text-rose-300">SETUP INVALIDATION</div>
                <div className="mt-1 text-zinc-300">
                  {risks.setup_invalidation || 'Follow core engine stop-loss level.'}
                </div>
              </div>

              <div className="rounded bg-rose-950/30 p-2.5 border border-rose-900/30">
                <div className="text-[10px] font-semibold text-rose-300">TREND DETERIORATION</div>
                <div className="mt-1 text-zinc-300">
                  {risks.trend_deterioration || 'Closes below 50 DMA with negative slope.'}
                </div>
              </div>

              <div className="rounded bg-rose-950/30 p-2.5 border border-rose-900/30">
                <div className="text-[10px] font-semibold text-rose-300">CORE BUSINESS / GOVERNANCE RISK</div>
                <div className="mt-1 text-zinc-300">
                  {risks.fundamental_risk || 'Monitor promoter pledge and quarterly working capital.'}
                </div>
              </div>
            </div>
          </div>

          {/* C. Important Contradiction Check (If detected) */}
          {contradiction.evidence && (
            <div className="rounded-lg border border-amber-950/60 bg-amber-950/15 p-4 text-xs font-mono">
              <div className="mb-2 flex items-center space-x-2 text-amber-400 font-semibold">
                <span>⚠️ IMPORTANT ANALYTICAL CONTRADICTION</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded bg-zinc-900/60 p-2 border border-zinc-800/80">
                  <div className="text-[10px] text-zinc-500">EVIDENCE</div>
                  <div className="text-zinc-200 mt-0.5">{contradiction.evidence}</div>
                </div>
                <div className="rounded bg-zinc-900/60 p-2 border border-zinc-800/80">
                  <div className="text-[10px] text-zinc-500">INTERPRETATION</div>
                  <div className="text-zinc-200 mt-0.5">{contradiction.interpretation}</div>
                </div>
                <div className="rounded bg-zinc-900/60 p-2 border border-zinc-800/80">
                  <div className="text-[10px] text-zinc-500">WHY IT MATTERS</div>
                  <div className="text-zinc-200 mt-0.5">{contradiction.why_it_matters}</div>
                </div>
                <div className="rounded bg-zinc-900/60 p-2 border border-zinc-800/80">
                  <div className="text-[10px] text-zinc-500">WHAT WOULD RESOLVE IT</div>
                  <div className="text-zinc-200 mt-0.5">{contradiction.resolution}</div>
                </div>
              </div>
            </div>
          )}

          {/* D. Research Questions & Observable Confirmation Conditions */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Decision-Relevant Research Questions */}
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-4">
              <div className="mb-2 flex items-center space-x-2 text-purple-300 font-mono text-xs font-semibold">
                <HelpCircle className="h-3.5 w-3.5" />
                <span>DECISION-RELEVANT QUESTIONS</span>
              </div>
              <ul className="space-y-1.5 text-xs text-zinc-300">
                {research_questions.length > 0 ? (
                  research_questions.map((q, idx) => (
                    <li key={idx} className="flex items-start space-x-2">
                      <span className="text-purple-400 font-mono text-[11px] font-bold">Q{idx + 1}.</span>
                      <span>{q}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-zinc-500">Verify upcoming quarterly earnings calendar and concall notes.</li>
                )}
              </ul>
            </div>

            {/* Observable Confirmation Conditions */}
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-4">
              <div className="mb-2 flex items-center space-x-2 text-blue-300 font-mono text-xs font-semibold">
                <Eye className="h-3.5 w-3.5" />
                <span>OBSERVABLE CONFIRMATION CONDITIONS</span>
              </div>
              
              <div className="space-y-2 text-xs">
                {strengthen_conditions.length > 0 && (
                  <div>
                    <span className="font-mono text-[10px] text-emerald-400 font-bold">STRENGTHEN THESIS:</span>
                    <ul className="mt-0.5 space-y-1 text-zinc-300">
                      {strengthen_conditions.map((c, i) => (
                        <li key={i} className="flex items-start space-x-1.5">
                          <span className="text-emerald-400 font-bold">+</span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {weaken_conditions.length > 0 && (
                  <div>
                    <span className="font-mono text-[10px] text-rose-400 font-bold">WEAKEN THESIS:</span>
                    <ul className="mt-0.5 space-y-1 text-zinc-300">
                      {weaken_conditions.map((c, i) => (
                        <li key={i} className="flex items-start space-x-1.5">
                          <span className="text-rose-400 font-bold">-</span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {strengthen_conditions.length === 0 && weaken_conditions.length === 0 && (
                  <div className="text-zinc-500">
                    Sustained trading volume expansion on up-days confirms buying interest; multiple closes below 50 DMA invalidates the swing.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Interactive Stock Chat Interface */}
      {chatOpen && (
        <div className="border-t border-zinc-800/80 bg-zinc-950/80 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-purple-300 font-mono text-xs font-semibold">
              <MessageSquare className="h-4 w-4" />
              <span>TALK WITH {ticker} (POWERED BY QWEN 3.5 4B)</span>
            </div>
            <button
              onClick={() => setChatMessages([])}
              className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition"
            >
              Clear chat
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2 mb-3 pr-1 text-xs font-sans">
            {chatMessages.length === 0 ? (
              <div className="rounded border border-dashed border-zinc-800 p-3 text-center text-[11px] text-zinc-500 font-mono">
                Ask anything about {ticker}—e.g. "What is the primary risk?", "Is the P/E justified?", "What confirms an entry tomorrow?"
              </div>
            ) : (
              chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg p-2.5 leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-purple-950/50 text-purple-200 border border-purple-800/50'
                        : 'bg-zinc-900/80 text-zinc-200 border border-zinc-800'
                    }`}
                  >
                    <div className="text-[9px] font-mono font-bold mb-1 opacity-60">
                      {msg.role === 'user' ? 'YOU' : `${ticker} RESEARCH ANALYST`}
                    </div>
                    <div>{msg.content}</div>
                  </div>
                </div>
              ))
            )}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-zinc-900/80 p-2.5 text-xs text-purple-400 border border-zinc-800 flex items-center space-x-2">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span>Thinking...</span>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSendChatMessage} className="flex items-center space-x-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={`Ask a question about ${ticker}...`}
              disabled={chatLoading}
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:border-purple-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || chatLoading}
              className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-40 transition flex items-center space-x-1"
            >
              <Send className="h-3 w-3" />
              <span>Send</span>
            </button>
          </form>
        </div>
      )}
      </div>

      {showDevConsole && (
        <DevDiagnosticsDrawer
          diagnostics={effectiveDiagnostics}
          onClose={() => setShowDevConsole(false)}
          onRefresh={handleFetchServerDiagnostics}
        />
      )}
    </div>
  );
}

