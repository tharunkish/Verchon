import React from 'react';
import { CheckCircle2, XCircle, Shield } from 'lucide-react';

export default function RuleChecklist({ rules }) {
  if (!rules || rules.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-500">
        No rule breakdown available.
      </div>
    );
  }

  const passedCount = rules.filter((r) => r.passed).length;
  const totalCount = rules.length;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0c0c10]/80 p-4 shadow-lg backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between border-b border-zinc-900 pb-2">
        <div className="flex items-center space-x-2">
          <Shield className="h-4 w-4 text-rose-400" />
          <span className="font-mono text-xs font-semibold text-zinc-200">
            STRATEGY SAFETY & ENTRY CHECKLIST
          </span>
        </div>
        <span className="font-mono text-xs font-bold text-zinc-400">
          {passedCount}/{totalCount} PASSED
        </span>
      </div>

      <div className="space-y-2">
        {rules.map((item, index) => (
          <div
            key={index}
            className={`flex items-start justify-between rounded-md border p-2.5 transition ${
              item.passed
                ? 'border-emerald-950/60 bg-emerald-950/20'
                : 'border-zinc-800/60 bg-zinc-900/30'
            }`}
          >
            <div className="flex items-start space-x-2.5">
              {item.passed ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              )}
              <div>
                <div
                  className={`font-mono text-xs font-medium ${
                    item.passed ? 'text-zinc-200' : 'text-zinc-400'
                  }`}
                >
                  {item.rule}
                </div>
                {item.detail && (
                  <div className="mt-0.5 font-mono text-[11px] text-zinc-500">
                    {item.detail}
                  </div>
                )}
              </div>
            </div>
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                item.passed
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/10 text-rose-400'
              }`}
            >
              {item.passed ? 'PASSED' : 'NOT MET'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
