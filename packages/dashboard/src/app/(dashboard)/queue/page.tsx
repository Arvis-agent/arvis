'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from '@/components/ui/toaster';
import { ListChecks, Loader2, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/format';

interface QueueJob {
  id: number;
  agent_id: number;
  agent_name: string | null;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  priority: number;
  payload: string;
  result: string | null;
  error: string | null;
  attempts: number;
  max_attempts: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface QueueData {
  running: QueueJob[];
  pending: QueueJob[];
  failed: QueueJob[];
  lastRefreshed: Date;
}

const REFRESH_INTERVAL_MS = 3000;

export default function QueuePage() {
  const [data, setData] = useState<QueueData | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [actioning, setActioning] = useState<Set<number>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const [runningRes, pendingRes, failedRes] = await Promise.all([
        fetch('/api/logs?status=running&limit=50'),
        fetch('/api/logs?status=pending&limit=50'),
        fetch('/api/logs?status=failed&limit=50'),
      ]);

      if (!runningRes.ok || !pendingRes.ok || !failedRes.ok) {
        throw new Error('Failed to fetch queue data');
      }

      const [runningData, pendingData, failedData] = await Promise.all([
        runningRes.json(),
        pendingRes.json(),
        failedRes.json(),
      ]);

      setData({
        running: runningData.jobs ?? [],
        pending: pendingData.jobs ?? [],
        failed: failedData.jobs ?? [],
        lastRefreshed: new Date(),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load queue');
      setAutoRefresh(false);
    }
  }, []);

  // Auto-refresh
  useEffect(() => {
    fetchQueue();
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchQueue, REFRESH_INTERVAL_MS);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchQueue, autoRefresh]);

  async function handleRetry(jobId: number) {
    setActioning(prev => new Set(prev).add(jobId));
    try {
      const res = await fetch(`/api/queue/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      toast.success(`Job #${jobId} re-queued`);
      await fetchQueue();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setActioning(prev => { const next = new Set(prev); next.delete(jobId); return next; });
    }
  }

  async function handleKill(jobId: number) {
    setActioning(prev => new Set(prev).add(jobId));
    try {
      const res = await fetch(`/api/queue/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'kill' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      toast.success(`Job #${jobId} killed`);
      await fetchQueue();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kill failed');
    } finally {
      setActioning(prev => { const next = new Set(prev); next.delete(jobId); return next; });
    }
  }

  async function handleCancel(jobId: number) {
    setActioning(prev => new Set(prev).add(jobId));
    try {
      const res = await fetch(`/api/queue/${jobId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      toast.success(`Job #${jobId} cancelled`);
      await fetchQueue();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setActioning(prev => { const next = new Set(prev); next.delete(jobId); return next; });
    }
  }

  const totalActive = (data?.running.length ?? 0) + (data?.pending.length ?? 0);
  const totalFailed = data?.failed.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Queue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data
              ? `${totalActive} active · ${totalFailed} failed`
              : 'Live job queue monitor'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums hidden sm:block">
              {data.lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => setAutoRefresh((p) => !p)}
            title={autoRefresh ? 'Pause auto-refresh' : 'Resume auto-refresh'}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
              autoRefresh
                ? 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20',
            )}
          >
            {autoRefresh ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                Pause
              </>
            ) : (
              <>
                <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="currentColor">
                  <polygon points="2,1 9,5 2,9" />
                </svg>
                Resume
              </>
            )}
          </button>
        </div>
      </div>

      {/* Running — prominent top section */}
      <Section
        title="Running"
        indicator={
          <span className="flex items-center gap-1.5 text-xs text-amber-400">
            {(data?.running.length ?? 0) > 0 && (
              <span className="h-3.5 w-3.5 rounded-full border-2 border-amber-400/25 border-t-amber-400 inline-block queue-spinner" />
            )}
            {data?.running.length ?? 0} active
          </span>
        }
        highlight
      >
        {!data ? (
          <Skeleton className="h-[52px]" />
        ) : data.running.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No running jobs</p>
        ) : (
          <JobTable
            jobs={data.running}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
            actioning={actioning}
            onKill={handleKill}
          />
        )}
      </Section>

      {/* Pending */}
      <Section
        title="Pending"
        indicator={
          <span className="text-xs text-muted-foreground">{data?.pending.length ?? 0} queued</span>
        }
      >
        {!data ? (
          <Skeleton className="h-[52px]" />
        ) : data.pending.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Queue is empty</p>
        ) : (
          <JobTable
            jobs={data.pending}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
            actioning={actioning}
            onCancel={handleCancel}
          />
        )}
      </Section>

      {/* Failed */}
      <Section
        title="Failed"
        indicator={
          <span className={cn('text-xs', totalFailed > 0 ? 'text-red-400' : 'text-muted-foreground')}>
            {totalFailed} failed
          </span>
        }
      >
        {!data ? (
          <Skeleton className="h-[52px]" />
        ) : data.failed.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="h-8 w-8" />}
            title="No failed jobs"
            description="Failed jobs appear here for retry"
          />
        ) : (
          <JobTable
            jobs={data.failed}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
            actioning={actioning}
            onRetry={handleRetry}
            onCancel={handleCancel}
          />
        )}
      </Section>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  indicator,
  highlight,
  children,
}: {
  title: string;
  indicator?: React.ReactNode;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-md border', highlight ? 'border-amber-500/20 bg-amber-500/[0.03]' : 'border-border')}>
      <div className={cn('flex items-center justify-between px-4 py-3 border-b', highlight ? 'border-amber-500/20' : 'border-border')}>
        <h2 className={cn('text-sm font-medium', highlight ? 'text-amber-400' : 'text-foreground')}>
          {title}
        </h2>
        {indicator}
      </div>
      {children}
    </div>
  );
}

// ─── Job table ────────────────────────────────────────────────────────────────

function JobTable({
  jobs,
  expandedId,
  setExpandedId,
  actioning,
  onRetry,
  onCancel,
  onKill,
}: {
  jobs: QueueJob[];
  expandedId: number | null;
  setExpandedId: (id: number | null) => void;
  actioning: Set<number>;
  onRetry?: (id: number) => void;
  onCancel?: (id: number) => void;
  onKill?: (id: number) => void;
}) {
  const hasActions = !!(onRetry || onCancel || onKill);

  return (
    <div className="overflow-x-auto">
      <div className={cn('min-w-[480px]')}>
        {/* Header */}
        <div className={cn(
          'grid items-center px-4 py-2.5 border-b border-border/50 bg-muted/20 gap-3',
          hasActions
            ? 'grid-cols-[44px_1fr_120px_60px_68px_80px]'
            : 'grid-cols-[44px_1fr_120px_60px_68px]',
        )}>
          <ColHeader>#</ColHeader>
          <ColHeader>Agent · Type</ColHeader>
          <ColHeader>Created</ColHeader>
          <ColHeader>Try</ColHeader>
          <ColHeader>Dur</ColHeader>
          {hasActions && <ColHeader />}
        </div>

        {/* Rows */}
        {jobs.map((job) => {
          const expanded = expandedId === job.id;
          const isActioning = actioning.has(job.id);
          const dur = job.started_at && job.completed_at
            ? Math.round((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000)
            : job.started_at
              ? Math.round((Date.now() - new Date(job.started_at).getTime()) / 1000)
              : null;

          return (
            <div key={job.id}>
              <div
                className={cn(
                  'grid items-center px-4 py-2.5 border-b border-border/50 cursor-pointer hover:bg-muted/10 transition-colors gap-3',
                  expanded && 'bg-muted/10',
                  hasActions
                    ? 'grid-cols-[44px_1fr_120px_60px_68px_80px]'
                    : 'grid-cols-[44px_1fr_120px_60px_68px]',
                )}
                onClick={() => setExpandedId(expanded ? null : job.id)}
              >
                <span className="font-mono text-xs text-muted-foreground/50 tabular-nums">
                  #{job.id}
                </span>
                <div className="min-w-0">
                  <span className="text-xs text-foreground truncate block">
                    {job.agent_name ?? `Agent ${job.agent_id}`}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground/60 bg-muted/30 rounded px-1 py-px">
                    {job.type}
                  </span>
                </div>
                <span className="font-mono text-xs text-muted-foreground/60 tabular-nums">
                  {formatRelative(job.created_at)}
                </span>
                <span className="font-mono text-xs text-muted-foreground/60 tabular-nums">
                  {job.attempts}/{job.max_attempts}
                </span>
                <span className="font-mono text-xs text-muted-foreground/60 tabular-nums">
                  {dur !== null ? `${dur}s` : '—'}
                </span>
                {hasActions && (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {onKill && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isActioning}
                        onClick={() => onKill(job.id)}
                        title="Kill job"
                        className="h-6 w-6 p-0 text-red-500/60 hover:text-red-400"
                      >
                        {isActioning ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                    {onRetry && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isActioning}
                        onClick={() => onRetry(job.id)}
                        title="Retry"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                      >
                        {isActioning ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                    {onCancel && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isActioning}
                        onClick={() => onCancel(job.id)}
                        title="Cancel"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                      >
                        {isActioning ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {expanded && (
                <div className="border-b border-border/50 bg-muted/10 px-4 py-4 space-y-3">
                  {job.error && (
                    <div>
                      <p className="text-xs font-medium text-red-400 uppercase tracking-wider mb-1.5">Error</p>
                      <pre className="whitespace-pre-wrap font-mono text-xs text-red-400/80 bg-red-500/5 p-3 rounded max-h-[140px] overflow-y-auto leading-relaxed">
                        {job.error}
                      </pre>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Payload</p>
                    <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground bg-muted p-3 rounded max-h-[160px] overflow-y-auto leading-relaxed">
                      {formatJson(job.payload)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ColHeader({ children }: { children?: React.ReactNode }) {
  return (
    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
      {children}
    </span>
  );
}

function formatJson(str: string): string {
  try {
    const parsed = JSON.parse(str);
    // Truncate large base64 image data
    if (parsed.images) {
      parsed.images = parsed.images.map((img: { base64?: string; mimeType?: string }) => ({
        mimeType: img.mimeType,
        base64: img.base64 ? `[${img.base64.length} chars]` : undefined,
      }));
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return str;
  }
}
