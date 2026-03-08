'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { XCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastType = 'error' | 'success' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  exiting: boolean;
}

const subscribers = new Set<(msg: string, type: ToastType) => void>();

function emit(message: string, type: ToastType = 'info') {
  subscribers.forEach((fn) => fn(message, type));
}

export const toast = Object.assign(emit, {
  error:   (msg: string) => emit(msg, 'error'),
  success: (msg: string) => emit(msg, 'success'),
  info:    (msg: string) => emit(msg, 'info'),
});

const ICONS  = { error: XCircle, success: CheckCircle2, info: Info } as const;
const STYLES = {
  error:   'border-red-500/20 bg-[#130a0a] text-red-300',
  success: 'border-emerald-500/20 bg-[#0a130d] text-emerald-300',
  info:    'border-border bg-card text-foreground',
} as const;

const DURATION = 3500;
const EXIT_MS  = 300;

export function Toaster() {
  const [toasts, setToasts]   = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const timers                = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => { setMounted(true); }, []);

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  useEffect(() => {
    function onToast(message: string, type: ToastType) {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev.slice(-4), { id, message, type, exiting: false }]);
      timers.current.set(id, setTimeout(() => dismiss(id), DURATION));
    }
    subscribers.add(onToast);
    return () => { subscribers.delete(onToast); };
  }, [dismiss]);

  if (!mounted || toasts.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none w-full max-w-[320px]" aria-live="polite" aria-relevant="additions removals">
      {toasts.map((t) => {
        const Icon = ICONS[t.type];
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-3',
              'shadow-[0_8px_32px_rgba(0,0,0,0.6)]',
              t.exiting ? 'toast-exit' : 'toast-enter',
              STYLES[t.type],
            )}
          >
            <Icon className="h-4 w-4 shrink-0 opacity-70" />
            <p className="flex-1 text-sm leading-snug">{t.message}</p>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="shrink-0 opacity-30 hover:opacity-70 transition-opacity">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
