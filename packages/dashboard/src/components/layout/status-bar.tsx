'use client';

import { useEffect, useState } from 'react';

interface HealthData {
  status: string;
  agents: number;
  queue: { pending: number; running: number };
}

export function StatusBar() {
  const [health, setHealth] = useState<HealthData | null>(null);

  useEffect(() => {
    function fetchHealth() {
      fetch('/api/health')
        .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then((data) => {
          if (data && typeof data.status === 'string') setHealth(data);
        })
        .catch(() => setHealth(null));
    }
    fetchHealth();
    const i = setInterval(fetchHealth, 30_000);
    return () => clearInterval(i);
  }, []);

  return (
    <footer className="flex h-10 shrink-0 items-center justify-between border-t border-border bg-background px-4 font-mono text-xs text-muted-foreground" role="status">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${health?.status === 'ok' ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
          {health?.status === 'ok' ? 'Operational' : 'Checking...'}
        </span>
        {health && (
          <>
            <span className="text-border/60">&middot;</span>
            <span>{health.agents} agents</span>
            <span className="text-border/60">&middot;</span>
            <span>{health.queue?.running ?? 0} running, {health.queue?.pending ?? 0} queued</span>
          </>
        )}
      </div>
      <span className="font-pixel text-[10px] tracking-widest">ARVIS v3</span>
    </footer>
  );
}
