'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bot, Plus } from 'lucide-react';
import { AgentChat } from '@/components/dashboard/agent-chat';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { STATUS_DOT } from '@/lib/status';

interface Agent {
  id: number;
  slug: string;
  name: string;
  role: string;
  status: 'active' | 'paused' | 'archived';
}


export default function ChatPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [selected, setSelected] = useState<Agent | null>(null);

  useEffect(() => {
    fetch('/api/agents')
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: Agent[]) => {
        const list = Array.isArray(data) ? data : [];
        setAgents(list);
        const active = list.find((a) => a.status === 'active');
        setSelected(active || list[0] || null);
      })
      .catch(() => setAgents([]));
  }, []);

  return (
    // One unified container — sidebar + chat share a single border
    <div className="flex flex-col md:flex-row flex-1 min-h-0 rounded-md border border-border overflow-hidden">
      {/* Agent sidebar — hidden on mobile, horizontal scroll strip instead */}
      {/* Mobile: horizontal agent strip */}
      <div className="md:hidden border-b border-border overflow-x-auto shrink-0">
        <div className="flex items-center gap-1 px-2 py-2 min-w-max">
          {agents === null ? (
            <>
              <Skeleton className="h-7 w-20 rounded-full shrink-0" />
              <Skeleton className="h-7 w-20 rounded-full shrink-0" />
              <Skeleton className="h-7 w-20 rounded-full shrink-0" />
            </>
          ) : agents.length === 0 ? (
            <Link href="/agents" className="text-xs text-muted-foreground px-2 py-1">
              No agents — create one
            </Link>
          ) : agents.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelected(a)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs whitespace-nowrap transition-colors shrink-0',
                selected?.id === a.id
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', STATUS_DOT[a.status])} />
              {a.name}
            </button>
          ))}
        </div>
      </div>
      {/* Desktop: vertical sidebar */}
      <div className="hidden md:flex w-[200px] shrink-0 border-r border-border flex-col">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Agents</p>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {agents === null ? (
            <div className="px-3 py-2 space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
            </div>
          ) : agents.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-muted-foreground mb-3">No agents yet</p>
              <Link href="/agents">
                <Button size="sm" variant="ghost" className="text-xs h-7 gap-1">
                  <Plus className="h-3 w-3" />Create one
                </Button>
              </Link>
            </div>
          ) : agents.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelected(a)}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left',
                selected?.id === a.id
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', STATUS_DOT[a.status])} />
              <span className="truncate text-xs">{a.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Chat panel — no separate border, shares the outer container */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {selected ? (
          <AgentChat key={selected.id} agentId={selected.id} agentName={selected.name} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState icon={<Bot className="h-8 w-8" />} title="Select an agent" />
          </div>
        )}
      </div>
    </div>
  );
}
