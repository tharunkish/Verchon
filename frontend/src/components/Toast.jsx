import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', durationMs = 4000) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    if (durationMs > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, durationMs);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Toast Notification Container (Bottom Right) */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col space-y-2 pointer-events-none">
        {toasts.map((toast) => {
          let borderClass = 'border-zinc-800 bg-zinc-950 text-zinc-200';
          let Icon = Info;
          let iconColor = 'text-rose-400';

          if (toast.type === 'success') {
            borderClass = 'border-emerald-800/80 bg-zinc-950 text-emerald-200 shadow-emerald-950/40';
            Icon = CheckCircle2;
            iconColor = 'text-emerald-400';
          } else if (toast.type === 'error') {
            borderClass = 'border-rose-800/80 bg-zinc-950 text-rose-200 shadow-rose-950/40';
            Icon = AlertCircle;
            iconColor = 'text-rose-400';
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-center space-x-3 rounded-lg border px-4 py-3 shadow-xl backdrop-blur-md transition font-mono text-xs ${borderClass}`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
              <div className="max-w-xs">{toast.message}</div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return { addToast: () => {} };
  }
  return context;
}
