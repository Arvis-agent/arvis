'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

const CLOSE_MS = 160;

export function Select({ value, onChange, options, placeholder = 'Select...', disabled, className, id }: CustomSelectProps) {
  const [open, setOpen]       = useState(false);
  const [closing, setClosing] = useState(false);
  const ref                   = useRef<HTMLDivElement>(null);
  const selected              = options.find((o) => o.value === value);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, CLOSE_MS);
  }, []);

  const toggle = useCallback(() => {
    if (open) close();
    else setOpen(true);
  }, [open, close]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (open) close();
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open, close]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { if (open) close(); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      const idx = options.findIndex((o) => o.value === value);
      const next = options[Math.min(idx + 1, options.length - 1)];
      if (next) onChange(next.value);
    }
    if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      const idx = options.findIndex((o) => o.value === value);
      const prev = options[Math.max(idx - 1, 0)];
      if (prev) onChange(prev.value);
    }
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onKeyDown={onKey}
        onClick={toggle}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors',
          'focus-visible:outline-none focus-visible:border-primary/50',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          open && 'border-primary/50',
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground shrink-0 ml-2 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            'absolute z-50 mt-1 w-full min-w-[160px] rounded-md border border-border bg-background shadow-lg overflow-hidden',
            closing ? 'select-dropdown-exit' : 'select-dropdown-enter',
          )}
        >
          <div className="max-h-[240px] overflow-y-auto">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                onClick={() => { onChange(opt.value); close(); }}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-2.5 text-sm transition-colors text-left',
                  opt.value === value
                    ? 'bg-primary/15 text-primary'
                    : 'text-foreground hover:bg-accent',
                )}
              >
                <span className="truncate">{opt.label}</span>
                {opt.value === value && <Check className="h-3.5 w-3.5 shrink-0 ml-2 opacity-70" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
