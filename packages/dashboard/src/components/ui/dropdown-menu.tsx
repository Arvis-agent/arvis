'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface DropdownState {
  open: boolean;
  setOpen: (v: boolean) => void;
  instanceId: string;
}

const Ctx = React.createContext<DropdownState>({
  open: false,
  setOpen: () => {},
  instanceId: '',
});

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const instanceId = React.useId();
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open]);

  return (
    <Ctx.Provider value={{ open, setOpen, instanceId }}>
      <div ref={ref} className="relative inline-block">
        {children}
      </div>
    </Ctx.Provider>
  );
}

export function DropdownMenuTrigger({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { open, setOpen } = React.useContext(Ctx);
  return (
    <button
      className={className}
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-haspopup="menu"
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

export function DropdownMenuContent({
  className,
  align = 'end',
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { align?: 'start' | 'end' }) {
  const { open } = React.useContext(Ctx);
  const ref = React.useRef<HTMLDivElement>(null);

  // Arrow key navigation
  React.useEffect(() => {
    if (!open || !ref.current) return;
    const el = ref.current;
    const items = () => Array.from(el.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));

    const onKey = (e: KeyboardEvent) => {
      const list = items();
      if (list.length === 0) return;
      const idx = list.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        list[idx < list.length - 1 ? idx + 1 : 0]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        list[idx > 0 ? idx - 1 : list.length - 1]?.focus();
      }
    };
    el.addEventListener('keydown', onKey);

    // Focus first item on open
    requestAnimationFrame(() => {
      const first = items()[0];
      first?.focus();
    });

    return () => el.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      role="menu"
      className={cn(
        'absolute z-50 mt-1 min-w-[160px] overflow-hidden rounded-md border border-border bg-background p-1',
        'shadow-[0_4px_24px_rgba(0,0,0,0.8)] animate-in fade-in-0 zoom-in-95',
        align === 'end' ? 'right-0' : 'left-0',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function DropdownMenuItem({
  className,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = React.useContext(Ctx);
  return (
    <button
      role="menuitem"
      type="button"
      className={cn(
        'flex w-full items-center gap-2 rounded px-2.5 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer',
        className,
      )}
      onClick={(e) => {
        onClick?.(e);
        setOpen(false);
      }}
      {...props}
    />
  );
}
