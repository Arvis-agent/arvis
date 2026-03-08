'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Bot, MessageSquare, Layers, Coins, AlertTriangle, ArrowRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ActivityChart } from '@/components/dashboard/activity-chart';
import { toast } from '@/components/ui/toaster';
import { formatRelative } from '@/lib/format';

interface Metrics {
  agents: { total: number; active: number; paused: number };
  queue: { pending: number; running: number; completed: number; failed: number };
  messages24h: number;
  conversations: number;
  cost30d: number;
  activity: { day: string; count: number }[];
  recentMessages: {
    id: number;
    role: string;
    content: string;
    created_at: string;
    conversation_id: number;
  }[];
}

export default function OverviewPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [fetchError, setFetchError] = useState(false);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/metrics');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMetrics(await res.json());
      setLastUpdated(new Date());
      setFetchError(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load metrics');
      setFetchError(true);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const i = setInterval(fetchMetrics, 30_000);
    return () => clearInterval(i);
  }, [fetchMetrics]);

  if (!metrics) {
    if (fetchError) {
      return (
        <div className="space-y-6">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-4">Failed to load metrics</p>
            <button
              onClick={() => { setFetchError(false); fetchMetrics(); }}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[100px]" />)}
        </div>
        <Skeleton className="h-[220px]" />
      </div>
    );
  }

  const hasFailed = metrics.queue.failed > 0;
  const hasRunning = metrics.queue.running > 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h1 className="text-base font-semibold">Overview</h1>
          {/* Live indicator */}
          <span className="relative flex items-center">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="absolute h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping opacity-75" />
          </span>
        </div>
        {lastUpdated && (
          <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums">
            {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </div>

      {/* Failed jobs banner */}
      {hasFailed && (
        <Link
          href="/queue"
          className="flex items-center justify-between gap-4 rounded-md border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm no-underline group transition-colors hover:border-amber-500/40 hover:bg-amber-500/10"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <span className="font-medium text-amber-400">
              {metrics.queue.failed} failed job{metrics.queue.failed > 1 ? 's' : ''}
            </span>
            <span className="text-muted-foreground">— check logs for details</span>
          </div>
          <span className="flex items-center gap-1 text-xs text-amber-400/60 group-hover:text-amber-400 transition-colors shrink-0">
            View queue <ArrowRight className="h-3 w-3" />
          </span>
        </Link>
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={Bot}
          label="Agents"
          value={metrics.agents.total}
          sub={`${metrics.agents.active} active, ${metrics.agents.paused} paused`}
          color="#a78bfa"
        />
        <MetricCard
          icon={MessageSquare}
          label="Messages / 24h"
          value={metrics.messages24h.toLocaleString()}
          sub={`${metrics.conversations} conversations`}
          color="#34d399"
        />
        <MetricCard
          icon={Layers}
          label="Queue"
          value={metrics.queue.running}
          sub={`${metrics.queue.pending} pending`}
          color={hasFailed ? '#f59e0b' : hasRunning ? '#60a5fa' : undefined}
          badge={hasFailed ? { label: `${metrics.queue.failed} failed`, color: '#f59e0b' } : undefined}
        />
        <MetricCard
          icon={Coins}
          label="Cost / 30d"
          value={`$${metrics.cost30d.toFixed(2)}`}
          color="#8B5CF6"
          accent
        />
      </div>

      {/* Chart */}
      <ActivityChart data={metrics.activity} />

      {/* Recent activity */}
      <div className="rounded-md border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
          <h2 className="text-sm font-medium">Recent Activity</h2>
          <span className="font-mono text-xs text-muted-foreground/50 tabular-nums">
            {metrics.recentMessages.length} messages
          </span>
        </div>
        {metrics.recentMessages.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No messages yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[480px]">
              <div className="grid grid-cols-[80px_1fr_72px] border-b border-border px-4 py-2.5 bg-muted/20">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Role</span>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Content</span>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-right">Time</span>
              </div>
              {metrics.recentMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="grid grid-cols-[80px_1fr_72px] items-center px-4 py-2.5 border-b border-border/50 hover:bg-muted/10 transition-colors last:border-0"
                >
                  <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium w-fit ${
                    msg.role === 'assistant'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted/40 text-muted-foreground'
                  }`}>
                    {msg.role}
                  </span>
                  <span className="text-xs text-muted-foreground truncate pr-4">
                    {msg.content}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums text-right">
                    {formatRelative(msg.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  color,
  badge,
}: {
  icon: typeof Bot;
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  color?: string;
  badge?: { label: string; color: string };
}) {
  return (
    <div
      className="rounded-md border border-border bg-card/50 p-4 relative overflow-hidden transition-colors hover:border-border/80"
      style={color ? { borderTopColor: color, borderTopWidth: 2 } : undefined}
    >
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <Icon
          className="h-3.5 w-3.5 shrink-0"
          style={{ color: color ?? 'var(--color-muted-foreground)', opacity: color ? 0.7 : 0.35 }}
        />
      </div>
      <div className="flex items-end gap-2">
        <p
          className={`font-pixel text-3xl tabular-nums leading-none ${
            accent ? 'text-primary' : 'text-foreground'
          }`}
        >
          {value}
        </p>
        {badge && (
          <span
            className="mb-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium"
            style={{ color: badge.color, background: `${badge.color}15` }}
          >
            {badge.label}
          </span>
        )}
      </div>
      {sub && <p className="mt-2 text-[11px] text-muted-foreground/60">{sub}</p>}
    </div>
  );
}
