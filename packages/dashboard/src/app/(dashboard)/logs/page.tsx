'use client';

import { useEffect, useState, useCallback, Fragment } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from '@/components/ui/toaster';
import { ChevronDown, ChevronRight, ScrollText, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/format';
import { STATUS_DOT, STATUS_TEXT } from '@/lib/status';

interface QueueJob {
  id: number;
  agent_id: number;
  type: string;
  status: string;
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

const STATUSES = ['', 'pending', 'running', 'completed', 'failed'] as const;

export default function LogsPage() {
  const [jobs, setJobs] = useState<QueueJob[] | null>(null);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const pageSize = 50;

  const fetchJobs = useCallback(async () => {
    const params = new URLSearchParams({ offset: String(page * pageSize), limit: String(pageSize) });
    if (statusFilter) params.set('status', statusFilter);
    try {
      const res = await fetch(`/api/logs?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setJobs(data.jobs);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load logs');
      setJobs([]);
    }
  }, [page, statusFilter]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Queue job history</p>
        </div>
        <button
          className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
        </button>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-1">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(0); }}
            className={cn(
              'rounded px-3 py-1.5 text-xs transition-colors capitalize',
              statusFilter === s
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent',
            )}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      {!jobs ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[48px]" />)}
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-8 w-8" />}
          title="No jobs"
          description={statusFilter ? `No ${statusFilter} jobs` : 'Jobs appear as agents work'}
        />
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-[20px_48px_100px_1fr_110px_44px_72px_52px] border-b border-border px-4 py-2.5 bg-muted/20 gap-3">
                <span />
                <ColHeader>#</ColHeader>
                <ColHeader>Type</ColHeader>
                <ColHeader>Agent</ColHeader>
                <ColHeader>Status</ColHeader>
                <ColHeader>Try</ColHeader>
                <ColHeader>Created</ColHeader>
                <ColHeader>Dur</ColHeader>
              </div>

              {jobs.map((job) => {
                const expanded = expandedId === job.id;
                const dur =
                  job.started_at && job.completed_at
                    ? Math.round(
                        (new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000,
                      )
                    : null;

                return (
                  <Fragment key={job.id}>
                    <div
                      className={cn(
                        'grid grid-cols-[20px_48px_100px_1fr_110px_44px_72px_52px] items-center px-4 py-2.5 border-b border-border/50 cursor-pointer hover:bg-muted/10 transition-colors gap-3',
                        expanded && 'bg-muted/10',
                      )}
                      onClick={() => setExpandedId(expanded ? null : job.id)}
                    >
                      <span className="text-muted-foreground/50">
                        {expanded
                          ? <ChevronDown className="h-3 w-3" />
                          : <ChevronRight className="h-3 w-3" />}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground/60 tabular-nums">#{job.id}</span>
                      <span className="font-mono text-xs text-muted-foreground bg-muted/30 rounded px-1.5 py-0.5 w-fit">{job.type}</span>
                      <span className="font-mono text-xs text-muted-foreground/60 truncate">{job.agent_id}</span>
                      <span className="flex items-center gap-1.5">
                        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', STATUS_DOT[job.status] ?? 'bg-muted-foreground')} />
                        <span className={cn('text-xs', STATUS_TEXT[job.status] ?? 'text-muted-foreground')}>{job.status}</span>
                      </span>
                      <span className="font-mono text-xs text-muted-foreground/60 tabular-nums">
                        {job.attempts}/{job.max_attempts}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground/60 tabular-nums">
                        {formatRelative(job.created_at)}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground/60 tabular-nums">
                        {dur !== null ? `${dur}s` : '—'}
                      </span>
                    </div>
                    {expanded && (
                      <div className="border-b border-border/50 bg-muted/10 px-4 py-4 space-y-4">
                        <Detail label="Payload" content={formatJson(job.payload)} />
                        {job.result && <Detail label="Result" content={job.result} />}
                        {job.error && <Detail label="Error" content={job.error} error />}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Pagination */}
      {jobs && jobs.length > 0 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">Page {page + 1}</span>
          <Button variant="outline" size="sm" disabled={jobs.length < pageSize} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function ColHeader({ children }: { children?: React.ReactNode }) {
  return (
    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{children}</span>
  );
}

function Detail({ label, content, error }: { label: string; content: string; error?: boolean }) {
  return (
    <div>
      <p className={cn('text-xs font-medium uppercase tracking-wider mb-2', error ? 'text-red-400' : 'text-muted-foreground')}>
        {label}
      </p>
      <pre
        className={cn(
          'whitespace-pre-wrap font-mono text-xs leading-relaxed max-h-[200px] overflow-y-auto p-3 rounded-md',
          error ? 'text-red-400 bg-red-500/5' : 'text-muted-foreground bg-muted',
        )}
      >
        {content}
      </pre>
    </div>
  );
}

function formatJson(str: string): string {
  try { return JSON.stringify(JSON.parse(str), null, 2); } catch { return str; }
}

