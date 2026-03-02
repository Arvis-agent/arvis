'use client';

import { useEffect, useState, useCallback } from 'react';
import { MessagesSquare, RefreshCw, Download, ChevronRight, ChevronDown, User, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { formatRelative, fmtTokens } from '@/lib/format';
import { STATUS_DOT, STATUS_TEXT } from '@/lib/status';

interface Session {
  id: number;
  agent_id: number;
  agent_name: string;
  platform: string;
  channel_id: string | null;
  user_id: string | null;
  status: string;
  message_count: number;
  total_tokens_estimate: number;
  created_at: string;
  updated_at: string;
  last_message: string | null;
}

interface Message {
  id: number;
  role: string;
  content: string;
  tokens_estimate: number | null;
  created_at: string;
}

const STATUS_FILTERS = ['', 'active', 'archived', 'compacted'] as const;

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Record<number, Message[] | 'loading'>>({});
  const pageSize = 50;

  const fetchSessions = useCallback(async () => {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    if (statusFilter) params.set('status', statusFilter);
    try {
      const res = await fetch(`/api/sessions?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSessions(data.sessions);
      setTotal(data.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load sessions');
      setSessions([]);
    }
  }, [page, statusFilter]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchSessions();
    setRefreshing(false);
  }

  async function toggleExpand(sessionId: number) {
    if (expandedId === sessionId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(sessionId);
    if (messages[sessionId]) return; // already loaded

    setMessages((prev) => ({ ...prev, [sessionId]: 'loading' }));
    try {
      const res = await fetch(`/api/conversations/${sessionId}?limit=200`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages((prev) => ({ ...prev, [sessionId]: data.messages ?? [] }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load messages');
      setMessages((prev) => ({ ...prev, [sessionId]: [] }));
    }
  }

  function exportJson(session: Session) {
    const msgs = messages[session.id];
    if (!msgs || msgs === 'loading') {
      toast.error('Load the conversation first');
      return;
    }
    const payload = {
      conversation: {
        id: session.id,
        agent: session.agent_name,
        platform: session.platform,
        channel_id: session.channel_id,
        status: session.status,
        started_at: session.created_at,
        last_message_at: session.updated_at,
        message_count: session.message_count,
        total_tokens: session.total_tokens_estimate,
      },
      messages: msgs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-${session.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Sessions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total > 0 ? `${total.toLocaleString()} conversations` : 'Active and archived conversations'}
          </p>
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

      {/* Filters */}
      <div className="flex items-center gap-1">
        {STATUS_FILTERS.map((s) => (
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
      {!sessions ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[56px]" />)}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare className="h-8 w-8" />}
          title="No sessions"
          description={statusFilter ? `No ${statusFilter} sessions` : 'Sessions are created when agents chat'}
        />
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Header */}
              <div className="grid grid-cols-[24px_1fr_90px_70px_90px_80px_80px] border-b border-border px-4 py-2.5 bg-muted/20 gap-4">
                <span />
                <ColHeader>Agent · Channel</ColHeader>
                <ColHeader>Platform</ColHeader>
                <ColHeader right>Msgs</ColHeader>
                <ColHeader right>Tokens</ColHeader>
                <ColHeader>Status</ColHeader>
                <ColHeader right>Updated</ColHeader>
              </div>

              {sessions.map((s) => {
                const expanded = expandedId === s.id;
                const sessionMessages = messages[s.id];

                return (
                  <div key={s.id}>
                    {/* Row */}
                    <div
                      className={cn(
                        'grid grid-cols-[24px_1fr_90px_70px_90px_80px_80px] items-center px-4 py-2.5 border-b border-border/50 cursor-pointer hover:bg-muted/10 transition-colors gap-4',
                        expanded && 'bg-muted/10',
                      )}
                      onClick={() => toggleExpand(s.id)}
                    >
                      <span className="text-muted-foreground/40">
                        {expanded
                          ? <ChevronDown className="h-3.5 w-3.5" />
                          : <ChevronRight className="h-3.5 w-3.5" />}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-medium text-foreground truncate">{s.agent_name}</span>
                          {s.channel_id && (
                            <span className="font-mono text-xs text-muted-foreground/60 truncate shrink-0 hidden sm:block">
                              {s.channel_id}
                            </span>
                          )}
                        </div>
                        {s.last_message && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5 pr-4">{s.last_message}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground capitalize">{s.platform}</span>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums text-right">{s.message_count.toLocaleString()}</span>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums text-right">{fmtTokens(s.total_tokens_estimate)}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', STATUS_DOT[s.status] ?? 'bg-muted-foreground/40')} />
                        <span className={cn('text-xs', STATUS_TEXT[s.status] ?? 'text-muted-foreground')}>{s.status}</span>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums text-right">{formatRelative(s.updated_at)}</span>
                    </div>

                    {/* Expanded message thread */}
                    {expanded && (
                      <div className="border-b border-border/50 bg-[#080808]">
                        {/* Thread header */}
                        <div className="flex items-center justify-between px-6 py-3 border-b border-border/30">
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{s.agent_name} · {s.platform}</span>
                            {s.channel_id && (
                              <span className="font-mono text-muted-foreground/50">{s.channel_id}</span>
                            )}
                            {s.user_id && (
                              <span className="font-mono text-muted-foreground/50">user: {s.user_id}</span>
                            )}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); exportJson(s); }}
                            className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            title="Export as JSON"
                          >
                            <Download className="h-3 w-3" />
                            Export
                          </button>
                        </div>

                        {/* Messages */}
                        <div className="px-6 py-4 space-y-3 max-h-[480px] overflow-y-auto">
                          {sessionMessages === 'loading' ? (
                            <div className="space-y-3">
                              {Array.from({ length: 4 }, (_, i) => (
                                <Skeleton key={i} className={cn('h-[60px]', i % 2 === 0 ? 'w-3/4' : 'w-2/3 ml-auto')} />
                              ))}
                            </div>
                          ) : !sessionMessages || sessionMessages.length === 0 ? (
                            <p className="text-center text-sm text-muted-foreground py-8">No messages</p>
                          ) : (
                            sessionMessages.map((msg) => (
                              <MessageBubble key={msg.id} message={msg} />
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Pagination */}
      {sessions && sessions.length > 0 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total.toLocaleString()}
          </span>
          <Button variant="outline" size="sm" disabled={sessions.length < pageSize} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex gap-2.5', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border mt-1',
        isUser
          ? 'border-primary/30 bg-primary/10'
          : 'border-border bg-muted',
      )}>
        {isUser
          ? <User className="h-3 w-3 text-primary" />
          : <Bot className="h-3 w-3 text-muted-foreground" />}
      </div>
      <div className={cn('flex flex-col gap-1 max-w-[72%]', isUser && 'items-end')}>
        <div className={cn(
          'rounded-lg px-3 py-2 text-sm leading-relaxed',
          isUser
            ? 'bg-primary/10 text-foreground border border-primary/10'
            : 'bg-muted text-foreground',
        )}>
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        <div className={cn('flex items-center gap-2', isUser && 'flex-row-reverse')}>
          <span className="font-mono text-[10px] text-muted-foreground/40 tabular-nums">
            {formatRelative(message.created_at)}
          </span>
          {message.tokens_estimate != null && message.tokens_estimate > 0 && (
            <span className="font-mono text-[10px] text-muted-foreground/40 tabular-nums">
              {message.tokens_estimate.toLocaleString()} tok
            </span>
          )}
        </div>
      </div>
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
