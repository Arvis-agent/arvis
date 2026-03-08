'use client';

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import type { HealthData } from './types';
import { CONNECTORS } from './constants';

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
        <span className="text-xs text-foreground">{value}</span>
      </div>
    </div>
  );
}

interface HealthSectionProps {
  health: HealthData | null;
  connectorStatus: Record<string, boolean>;
}

export function HealthSection({ health, connectorStatus }: HealthSectionProps) {
  const cols = 3;
  const totalRows = Math.ceil(CONNECTORS.length / cols);

  return (
    <>
      {/* Health + Security */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/10">
            <h2 className="text-sm font-medium">System Health</h2>
          </div>
          <div className="p-4">
            {!health ? <Skeleton className="h-[80px]" /> : (
              <div className="space-y-2.5">
                <StatusRow label="Status"   value={health.status} ok={health.status === 'ok'} />
                <StatusRow label="Database" value={health.database ? 'Connected' : 'Error'} ok={health.database} />
                <StatusRow label="Agents"   value={String(health.agents)} ok />
                <StatusRow label="Queue"    value={`${health.queue.running} running, ${health.queue.pending} pending`} ok />
              </div>
            )}
          </div>
        </div>
        <div className="rounded-md border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/10">
            <h2 className="text-sm font-medium">Security</h2>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Authentication</span>
              {health?.authEnabled
                ? <Badge variant="success">Enabled</Badge>
                : <Badge variant="warning">Open</Badge>}
            </div>
            {!health?.authEnabled && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                Set <code className="font-mono text-foreground bg-muted px-1 py-0.5 rounded">DASHBOARD_PASSWORD</code> env var to enable login gate
              </p>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">JWT Secret</span>
              <Badge variant="secondary">Auto-generated</Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Platform Connectors */}
      <div className="rounded-md border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
          <div>
            <h2 className="text-sm font-medium">Platform Connectors</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Set these env vars then restart Arvis to enable each connector</p>
          </div>
        </div>
        {/* Grid: 1 col on mobile, 2 on sm, 3 on lg.
            Right borders: every item that is NOT the last in its row.
            Bottom borders: every item that is NOT in the last row.
            We compute row/col from the index with 3 columns (lg baseline). */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {CONNECTORS.map((c, i) => {
            const configured = connectorStatus[c.key] ?? false;
            // lg: 3-col layout
            const lgCol = i % cols;           // 0, 1, 2
            const lgRow = Math.floor(i / cols);
            const lgNotLastCol = lgCol < cols - 1;
            const lgNotLastRow = lgRow < totalRows - 1;
            // sm: 2-col layout
            const smCol = i % 2;
            const smRow = Math.floor(i / 2);
            const smTotalRows = Math.ceil(CONNECTORS.length / 2);
            const smNotLastCol = smCol < 1;
            const smNotLastRow = smRow < smTotalRows - 1;
            return (
              <div
                key={c.key}
                className={cn(
                  'flex items-start gap-3 p-4',
                  // Bottom border on sm/1col (every item except last row)
                  'border-b border-border/50 last:border-b-0',
                  // sm: right border for left column; override bottom-border for items not in last sm-row
                  smNotLastCol && 'sm:border-r sm:border-border/50',
                  // sm: items in last sm-row get no bottom border
                  !smNotLastRow && 'sm:border-b-0',
                  // sm: but if it IS last row on sm, the left column may still have bottom
                  smNotLastRow && smNotLastCol && 'sm:border-b sm:border-border/50',
                  smNotLastRow && !smNotLastCol && 'sm:border-b sm:border-border/50',
                  // lg: right border for cols 0,1; reset right border for col 2
                  lgNotLastCol ? 'lg:border-r lg:border-border/50' : 'lg:border-r-0',
                  // lg: bottom border if not last row; no bottom border if last row
                  lgNotLastRow ? 'lg:border-b lg:border-border/50' : 'lg:border-b-0',
                )}
              >
                <c.Icon className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-foreground font-medium">{c.label}</p>
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', configured ? 'bg-emerald-500' : 'bg-muted-foreground/30')} />
                    <span className={cn('text-xs', configured ? 'text-emerald-500' : 'text-muted-foreground/50')}>
                      {configured ? 'Configured' : 'Not set'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                    {(c.allEnvs ?? [c.env]).map((envVar) => (
                      <button
                        key={envVar}
                        onClick={() => { navigator.clipboard.writeText(envVar); toast.success('Copied!'); }}
                        className="font-mono text-xs text-primary hover:text-primary/80 transition-colors text-left"
                        title="Click to copy"
                      >
                        {envVar}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{c.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
