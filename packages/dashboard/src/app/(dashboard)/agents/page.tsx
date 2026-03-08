'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Bot, Search, Plus, Trash2, Eye } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, type SelectOption } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/format';
import { STATUS_DOT } from '@/lib/status';

interface Agent {
  id: number;
  slug: string;
  name: string;
  role: string;
  model: string;
  status: 'active' | 'paused' | 'archived';
  description: string | null;
  updatedAt: string;
}


const ROLE_OPTIONS: SelectOption[] = [
  'assistant', 'orchestrator', 'specialist', 'analyst', 'researcher', 'coder', 'writer',
].map((r) => ({ value: r, label: r }));

const MODEL_OPTIONS: SelectOption[] = [
  'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001',
  'claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022',
  'gpt-4o', 'gpt-4o-mini', 'o3', 'o3-mini', 'o1', 'o1-mini',
  'gemini-2.0-flash-001', 'gemini-2.0-flash-lite-001', 'gemini-1.5-pro', 'gemini-1.5-flash',
  'openrouter/auto', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat',
].map((m) => ({ value: m, label: m }));

// ─── Create Agent Dialog ──────────────────────────────────────────────────────
function CreateAgentDialog({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '', slug: '', role: 'assistant', model: 'claude-sonnet-4-6',
    description: '', systemPrompt: '', customModel: '',
  });
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [saving, setSaving] = useState(false);

  function set(k: string, v: string) {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === 'name') {
        next.slug = v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      }
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const model = useCustomModel ? form.customModel.trim() : form.model;
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        role: form.role,
        model,
      };
      if (form.description.trim())  body.description  = form.description.trim();
      if (form.systemPrompt.trim()) body.systemPrompt = form.systemPrompt.trim();

      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(`Agent "${form.name}" created`);
      onCreated();
      onClose();
      setForm({ name: '', slug: '', role: 'assistant', model: 'claude-sonnet-4-6', description: '', systemPrompt: '', customModel: '' });
      setUseCustomModel(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New Agent" className="max-w-[520px]">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="ag-name">Name *</Label>
            <Input id="ag-name" placeholder="My Assistant" value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="ag-slug">Slug *</Label>
            <Input
              id="ag-slug"
              placeholder="my-assistant"
              value={form.slug}
              onChange={(e) => set('slug', e.target.value)}
              pattern="[a-z0-9-]+"
              title="Lowercase letters, numbers and hyphens only"
              required
            />
          </div>
        </div>

        <div>
          <Label htmlFor="ag-role">Role *</Label>
          <Select id="ag-role" value={form.role} onChange={(v) => set('role', v)} options={ROLE_OPTIONS} />
        </div>

        <div>
          <Label>Model *</Label>
          <div className="flex gap-1.5">
            {!useCustomModel ? (
              <Select value={form.model} onChange={(v) => set('model', v)} options={MODEL_OPTIONS} className="flex-1" />
            ) : (
              <Input
                placeholder="provider/model or model-id"
                value={form.customModel}
                onChange={(e) => set('customModel', e.target.value)}
                className="flex-1"
                required={useCustomModel}
              />
            )}
            <button
              type="button"
              onClick={() => setUseCustomModel(!useCustomModel)}
              className="px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
            >
              {useCustomModel ? 'Preset' : 'Custom'}
            </button>
          </div>
        </div>

        <div>
          <Label htmlFor="ag-desc">Description</Label>
          <Input id="ag-desc" placeholder="What this agent does..." value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>

        <div>
          <Label htmlFor="ag-prompt">System Prompt</Label>
          <Textarea
            id="ag-prompt"
            placeholder="You are a helpful assistant..."
            value={form.systemPrompt}
            onChange={(e) => set('systemPrompt', e.target.value)}
            className="min-h-[110px]"
          />
          <p className="mt-1 text-xs text-muted-foreground">Leave blank to use auto-generated conductor prompt</p>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Creating...' : 'Create Agent'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Agent | null>(null);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/agents');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setAgents(await r.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = agents.filter((a) => {
    if (statusFilter && a.status !== statusFilter) return false;
    const q = search.toLowerCase();
    return !q || a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q) || a.role.toLowerCase().includes(q);
  });

  async function doArchive() {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/agents/${archiveTarget.slug}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(`"${archiveTarget.name}" archived`);
      setAgents((prev) => prev.map((a) => a.id === archiveTarget.id ? { ...a, status: 'archived' } : a));
      setArchiveTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Agents</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {agents.filter((a) => a.status === 'active').length} active · {agents.length} total
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          New Agent
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Filter agents..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-52" />
        </div>
        <div className="flex items-center gap-1">
          {(['', 'active', 'paused', 'archived'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
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
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[52px]" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Bot className="h-8 w-8" />}
          title={search ? 'No matches' : 'No agents yet'}
          description={search ? 'Try a different query' : 'Create your first agent to get started'}
          action={!search ? <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" />New Agent</Button> : undefined}
        />
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[540px]">
              <div className="grid grid-cols-[1fr_100px_150px_80px_72px] border-b border-border px-4 py-2.5 bg-muted/20">
                <ColHeader>Name</ColHeader>
                <ColHeader>Role</ColHeader>
                <ColHeader>Model</ColHeader>
                <ColHeader>Status</ColHeader>
                <ColHeader right>Actions</ColHeader>
              </div>
              {filtered.map((agent) => (
                <div
                  key={agent.id}
                  className="grid grid-cols-[1fr_100px_150px_80px_72px] items-center px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors"
                >
                  <Link href={`/agents/${agent.slug}`} className="flex items-center gap-2 min-w-0">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_DOT[agent.status] || 'bg-muted-foreground'}`} />
                    <span className="text-xs text-foreground truncate hover:text-primary transition-colors">{agent.name}</span>
                    <span className="font-mono text-xs text-muted-foreground truncate hidden sm:block">{agent.slug}</span>
                  </Link>
                  <span className="text-xs text-muted-foreground capitalize">{agent.role}</span>
                  <span className="font-mono text-xs text-muted-foreground truncate">{agent.model}</span>
                  <span className={cn(
                    'text-xs capitalize',
                    agent.status === 'active' ? 'text-emerald-400' : agent.status === 'paused' ? 'text-yellow-400' : 'text-muted-foreground',
                  )}>{agent.status}</span>
                  <div className="flex items-center justify-end gap-0.5">
                    <Link
                      href={`/agents/${agent.slug}`}
                      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      title="View / edit agent"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Link>
                    <button
                      onClick={() => setArchiveTarget(agent)}
                      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Archive agent"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <CreateAgentDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />

      <Dialog open={!!archiveTarget} onClose={() => setArchiveTarget(null)} title="Archive Agent" className="max-w-sm">
        <p className="text-sm text-muted-foreground mb-5">
          Archive <span className="text-foreground font-medium">"{archiveTarget?.name}"</span>? The agent will be disabled but all data (sessions, memory, logs) is kept.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setArchiveTarget(null)}>Cancel</Button>
          <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={doArchive} disabled={archiving}>
            {archiving ? 'Archiving...' : 'Archive'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function ColHeader({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <span className={`text-[10px] font-medium text-muted-foreground uppercase tracking-wider ${right ? 'text-right' : ''}`}>
      {children}
    </span>
  );
}

