'use client';

import { useEffect, useState, useCallback } from 'react';
import { TrendingUp, Cpu, Coins, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { ActivityChart } from '@/components/dashboard/activity-chart';
import { cn } from '@/lib/utils';
import { fmtTokens } from '@/lib/format';

type Range = '1d' | '7d' | '30d' | '90d';

interface UsageData {
  summary: {
    total_requests: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  };
  daily: { day: string; count: number }[];
  byAgent: { agent_id: number; agent_name: string; requests: number; cost_usd: number; tokens: number; avg_duration_ms: number }[];
  byProvider: { provider: string; model: string; requests: number; cost_usd: number; tokens: number }[];
}

const RANGES: { label: string; value: Range }[] = [
  { label: 'Today', value: '1d' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
];

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [range, setRange] = useState<Range>('30d');
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/usage?range=${range}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData({ ...json, daily: json.daily.map((d: { day: string; requests: number }) => ({ day: d.day, count: d.requests })) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load usage');
    }
  }, [range]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Usage</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Token consumption and cost breakdown</p>
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

      {/* Range selector */}
      <div className="flex items-center gap-1">
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={cn(
              'rounded px-3 py-1.5 text-xs transition-colors',
              range === r.value
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {!data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[96px]" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 data-enter">
          <SummaryCard icon={TrendingUp} label="Requests" value={data.summary.total_requests.toLocaleString()} />
          <SummaryCard icon={Cpu} label="Input Tokens" value={fmtTokens(data.summary.input_tokens)} />
          <SummaryCard icon={Cpu} label="Output Tokens" value={fmtTokens(data.summary.output_tokens)} />
          <SummaryCard icon={Coins} label="Cost" value={`$${data.summary.cost_usd.toFixed(4)}`} accent />
        </div>
      )}

      {/* Activity chart */}
      {data && <ActivityChart data={data.daily} label={RANGES.find((r) => r.value === range)?.label ?? range} />}

      {/* By Provider */}
      {!data ? (
        <Skeleton className="h-[160px]" />
      ) : data.byProvider.length > 0 ? (
        <div className="rounded-md border border-border overflow-hidden data-enter">
          <div className="px-4 py-3 border-b border-border bg-muted/10">
            <h2 className="text-sm font-medium">By Provider / Model</h2>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[460px]">
              <div className="grid grid-cols-[1fr_100px_100px_80px_80px] border-b border-border px-4 py-2.5 bg-muted/20">
                <ColHeader>Model</ColHeader>
                <ColHeader>Provider</ColHeader>
                <ColHeader right>Tokens</ColHeader>
                <ColHeader right>Requests</ColHeader>
                <ColHeader right>Cost</ColHeader>
              </div>
              {data.byProvider.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_100px_100px_80px_80px] items-center px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors">
                  <span className="font-mono text-xs text-foreground truncate">{p.model}</span>
                  <span className="text-xs text-muted-foreground capitalize">{p.provider}</span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums text-right">{fmtTokens(p.tokens)}</span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums text-right">{p.requests.toLocaleString()}</span>
                  <span className="font-mono text-xs text-primary tabular-nums text-right">${p.cost_usd.toFixed(4)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* By Agent */}
      {data && data.byAgent.length > 0 && (
        <div className="rounded-md border border-border overflow-hidden data-enter">
          <div className="px-4 py-3 border-b border-border bg-muted/10">
            <h2 className="text-sm font-medium">By Agent</h2>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[480px]">
              <div className="grid grid-cols-[1fr_80px_100px_80px_80px] border-b border-border px-4 py-2.5 bg-muted/20 gap-3">
                <ColHeader>Agent</ColHeader>
                <ColHeader right>Requests</ColHeader>
                <ColHeader right>Tokens</ColHeader>
                <ColHeader right>Avg Time</ColHeader>
                <ColHeader right>Cost</ColHeader>
              </div>
              {data.byAgent.map((a) => (
                <div key={a.agent_id} className="grid grid-cols-[1fr_80px_100px_80px_80px] items-center px-4 py-2.5 border-b border-border/50 hover:bg-muted/10 transition-colors gap-3 last:border-0">
                  <span className="text-xs text-foreground">{a.agent_name}</span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums text-right">{a.requests.toLocaleString()}</span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums text-right">{fmtTokens(a.tokens)}</span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums text-right">
                    {a.avg_duration_ms > 0 ? `${(a.avg_duration_ms / 1000).toFixed(1)}s` : '—'}
                  </span>
                  <span className="font-mono text-xs text-primary tabular-nums text-right">${a.cost_usd.toFixed(4)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {data && data.summary.total_requests === 0 && (
        <div className="rounded-md border border-border py-8 text-center">
          <p className="text-sm text-muted-foreground">No usage data for this period</p>
          <p className="text-xs text-muted-foreground mt-1">Usage is tracked when agents process messages</p>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, accent }: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border border-border p-4">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/40" />
      </div>
      <p className={`font-pixel text-3xl tabular-nums leading-none ${accent ? 'text-primary' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}

function ColHeader({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <span className={`text-[10px] font-medium text-muted-foreground uppercase tracking-wider ${right ? 'text-right' : ''}`}>
      {children}
    </span>
  );
}

