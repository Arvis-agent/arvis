'use client';

import { useEffect, useState } from 'react';

export function StatusBar() {
  const [health, setHealth] = useState<{ status: string; agents: number; queue: { pending: number; running: number } } | null>(null);

  useEffect(() => {
    function fetchHealth() {
      fetch('/api/health')
        .then((r) => r.json())
        .then(setHealth)
        .catch(() => {});
    }
    fetchHealth();
    const i = setInterval(fetchHealth, 30_000);
    return () => clearInterval(i);
  }, []);

  return (
    <footer className="flex h-10 shrink-0 items-center justify-between border-t border-border bg-background px-4 font-mono text-xs text-muted-foreground">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${health?.status === 'ok' ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
          {health?.status === 'ok' ? 'Operational' : 'Checking...'}
        </span>
        {health && (
          <>
            <span className="text-border/60">·</span>
            <span>{health.agents} agents</span>
            <span className="text-border/60">·</span>
            <span>{health.queue.running} running, {health.queue.pending} queued</span>
          </>
        )}
      </div>
      <span className="font-pixel text-[10px] tracking-widest">ARVIS v3.0</span>
    </footer>
  );
}
