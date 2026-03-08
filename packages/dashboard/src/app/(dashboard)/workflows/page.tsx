'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Calendar, Plus, Trash2, Edit2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/format';

interface Agent { id: number; name: string; slug: string; status: string; }
interface Heartbeat { id: number; agent_id: number; agent_name: string; name: string; prompt: string; schedule: string; enabled: number; last_run: string | null; next_run: string | null; }
interface CronJob   { id: number; agent_id: number; agent_name: string; name: string; description: string | null; schedule: string; prompt: string; enabled: number; last_run: string | null; next_run: string | null; }
interface WorkflowData { heartbeats: Heartbeat[]; crons: CronJob[]; }

const CRON_PRESETS = [
  { label: '5 min',    value: '*/5 * * * *' },
  { label: 'Hourly',   value: '0 * * * *'   },
  { label: 'Daily 9am',value: '0 9 * * *'   },
  { label: 'Weekly',   value: '0 9 * * 1'   },
];

// ── Workflow form dialog ──────────────────────────────────────────────────────
function WorkflowDialog({
  open, onClose, onSaved, agents, kind, initial,
}: {
  open: boolean; onClose: () => void; onSaved: () => void;
  agents: Agent[]; kind: 'heartbeat' | 'cron'; initial?: Heartbeat | CronJob | null;
}) {
  const editing = !!initial;
  const [form, setForm] = useState({ name: '', agent_id: '', schedule: '', prompt: '', description: '' });
  const [saving, setSaving] = useState(false);

  const agentOptions = agents.filter((a) => a.status === 'active').map((a) => ({ value: String(a.id), label: a.name }));

  useEffect(() => {
    if (!open) return;
    setForm({
      name:        initial?.name ?? '',
      agent_id:    initial ? String(initial.agent_id) : (agentOptions[0]?.value ?? ''),
      schedule:    initial?.schedule ?? '',
      prompt:      initial?.prompt ?? '',
      description: (initial && 'description' in initial ? (initial.description ?? '') : ''),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.agent_id) { toast.error('Select an agent'); return; }
    if (!form.schedule.trim()) { toast.error('Schedule is required'); return; }
    if (!form.prompt.trim())   { toast.error('Prompt is required'); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        kind,
        name:     form.name.trim(),
        agent_id: parseInt(form.agent_id, 10),
        schedule: form.schedule.trim(),
        prompt:   form.prompt.trim(),
      };
      if (kind === 'cron') body.description = form.description.trim() || null;
      if (editing) body.id = initial!.id;

      const res = await fetch('/api/workflows', {
        method:  editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(editing ? 'Workflow updated' : 'Workflow created');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  const kindLabel = kind === 'heartbeat' ? 'Heartbeat' : 'Cron Job';

  return (
    <Dialog open={open} onClose={onClose} title={editing ? `Edit ${kindLabel}` : `New ${kindLabel}`} className="max-w-[520px]">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="wf-name">Name *</Label>
          <Input id="wf-name" value={form.name} onChange={(e) => set('name', e.target.value)}
            placeholder={kind === 'heartbeat' ? 'Status check' : 'Morning standup'} required />
        </div>

        <div>
          <Label>Agent *</Label>
          {agentOptions.length === 0
            ? <p className="text-xs text-muted-foreground mt-1">No active agents — create one first</p>
            : <Select value={form.agent_id} onChange={(v) => set('agent_id', v)} options={agentOptions} placeholder="Select agent..." />
          }
        </div>

        <div>
          <Label htmlFor="wf-schedule">Schedule (cron expression) *</Label>
          <Input id="wf-schedule" value={form.schedule} onChange={(e) => set('schedule', e.target.value)}
            placeholder="0 9 * * *" required className="font-mono" />
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {CRON_PRESETS.map((p) => (
              <button key={p.value} type="button" onClick={() => set('schedule', p.value)}
                className={cn(
                  'px-2 py-0.5 rounded text-xs border transition-colors',
                  form.schedule === p.value
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent',
                )}>
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">min hour day month weekday (UTC)</p>
        </div>

        {kind === 'cron' && (
          <div>
            <Label htmlFor="wf-desc">Description</Label>
            <Input id="wf-desc" value={form.description} onChange={(e) => set('description', e.target.value)}
              placeholder="What this job does (optional)" />
          </div>
        )}

        <div>
          <Label htmlFor="wf-prompt">Prompt *</Label>
          <Textarea
            id="wf-prompt"
            value={form.prompt}
            onChange={(e) => set('prompt', e.target.value)}
            required
            rows={5}
            placeholder={
              kind === 'heartbeat'
                ? 'Check for any urgent messages or events and post a status summary...'
                : 'Send a good morning message and summarise today\'s agenda...'
            }
            className="min-h-[120px]"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={saving || agentOptions.length === 0}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Create'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Delete confirm dialog ─────────────────────────────────────────────────────
function DeleteDialog({ target, onClose, onDeleted }: {
  target: { kind: 'heartbeat' | 'cron'; id: number; name: string } | null;
  onClose: () => void; onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  async function confirm() {
    if (!target) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/workflows?kind=${target.kind}&id=${target.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(`"${target.name}" deleted`);
      onDeleted();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  }
  return (
    <Dialog open={!!target} onClose={onClose} title="Delete Workflow" className="max-w-sm">
      <p className="text-sm text-muted-foreground mb-5">
        Delete <span className="font-medium text-foreground">{target?.name}</span>? This cannot be undone.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={confirm} disabled={deleting}>
          {deleting ? 'Deleting...' : 'Delete'}
        </Button>
      </div>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WorkflowsPage() {
  const [data, setData]           = useState<WorkflowData | null>(null);
  const [agents, setAgents]       = useState<Agent[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [addKind, setAddKind]     = useState<'heartbeat' | 'cron' | null>(null);
  const [editTarget, setEditTarget] = useState<{ kind: 'heartbeat' | 'cron'; item: Heartbeat | CronJob } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'heartbeat' | 'cron'; id: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [wRes, aRes] = await Promise.all([fetch('/api/workflows'), fetch('/api/agents')]);
      if (!wRes.ok || !aRes.ok) throw new Error(`Failed to load data (HTTP ${wRes.status}/${aRes.status})`);
      setData(await wRes.json());
      setAgents(await aRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows');
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function toggleEnabled(kind: 'heartbeat' | 'cron', id: number, current: number) {
    try {
      const res = await fetch('/api/workflows', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ kind, id, enabled: !current }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  const total  = data ? data.heartbeats.length + data.crons.length : 0;
  const active = data ? data.heartbeats.filter((h) => h.enabled).length + data.crons.filter((c) => c.enabled).length : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Workflows</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data ? `${total} total · ${active} active` : 'Loading...'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={async () => { setRefreshing(true); await fetchData(); setRefreshing(false); }}
            disabled={refreshing}
            title="Refresh"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          </button>
          <Button size="sm" variant="outline" onClick={() => setAddKind('heartbeat')}>
            <Plus className="h-3.5 w-3.5" />Heartbeat
          </Button>
          <Button size="sm" onClick={() => setAddKind('cron')}>
            <Plus className="h-3.5 w-3.5" />Cron Job
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-4 py-8 text-center">
          <p className="text-sm text-red-400 mb-3">{error}</p>
          <Button size="sm" variant="outline" onClick={fetchData}>
            <RefreshCw className="h-3.5 w-3.5" />Retry
          </Button>
        </div>
      ) : !data ? (
        <Skeleton className="h-[200px]" />
      ) : total === 0 ? (
        <EmptyState
          icon={<Calendar className="h-8 w-8" />}
          title="No workflows yet"
          description="Create a heartbeat to poll an agent on a schedule, or a cron job to trigger custom prompts at set times"
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setAddKind('heartbeat')}>
                <Plus className="h-3.5 w-3.5" />Heartbeat
              </Button>
              <Button size="sm" onClick={() => setAddKind('cron')}>
                <Plus className="h-3.5 w-3.5" />Cron Job
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          <Section title="Heartbeats" count={data.heartbeats.length} onAdd={() => setAddKind('heartbeat')}>
            {data.heartbeats.map((hb) => (
              <WfRow
                key={hb.id}
                name={hb.name} agentName={hb.agent_name} schedule={hb.schedule}
                enabled={!!hb.enabled} lastRun={hb.last_run} nextRun={hb.next_run} prompt={hb.prompt}
                onToggle={() => toggleEnabled('heartbeat', hb.id, hb.enabled)}
                onEdit={() => setEditTarget({ kind: 'heartbeat', item: hb })}
                onDelete={() => setDeleteTarget({ kind: 'heartbeat', id: hb.id, name: hb.name })}
              />
            ))}
          </Section>

          <Section title="Cron Jobs" count={data.crons.length} onAdd={() => setAddKind('cron')}>
            {data.crons.map((c) => (
              <WfRow
                key={c.id}
                name={c.name} agentName={c.agent_name} description={c.description} schedule={c.schedule}
                enabled={!!c.enabled} lastRun={c.last_run} nextRun={c.next_run} prompt={c.prompt}
                onToggle={() => toggleEnabled('cron', c.id, c.enabled)}
                onEdit={() => setEditTarget({ kind: 'cron', item: c })}
                onDelete={() => setDeleteTarget({ kind: 'cron', id: c.id, name: c.name })}
              />
            ))}
          </Section>
        </div>
      )}

      {/* Dialogs */}
      {addKind && (
        <WorkflowDialog
          open kind={addKind} agents={agents} initial={null}
          onClose={() => setAddKind(null)} onSaved={fetchData}
        />
      )}
      {editTarget && (
        <WorkflowDialog
          open kind={editTarget.kind} agents={agents} initial={editTarget.item}
          onClose={() => setEditTarget(null)} onSaved={fetchData}
        />
      )}
      <DeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={fetchData}
      />
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────
function Section({ title, count, onAdd, children }: {
  title: string; count: number; onAdd: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
        <h2 className="text-sm font-medium">{title} <span className="text-muted-foreground font-normal">({count})</span></h2>
        <button onClick={onAdd}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <Plus className="h-3 w-3" />Add
        </button>
      </div>
      {count === 0
        ? <div className="px-4 py-8 text-center"><p className="text-sm text-muted-foreground">None configured</p></div>
        : <div className="divide-y divide-border/50">{children}</div>
      }
    </div>
  );
}

// ── WfRow ─────────────────────────────────────────────────────────────────────
function WfRow({ name, agentName, description, schedule, enabled, lastRun, nextRun, prompt, onToggle, onEdit, onDelete }: {
  name: string; agentName: string; description?: string | null; schedule: string;
  enabled: boolean; lastRun: string | null; nextRun: string | null; prompt: string;
  onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* enabled dot — click to toggle */}
        <button
          onClick={onToggle}
          title={enabled ? 'Click to disable' : 'Click to enable'}
          className={cn(
            'h-1.5 w-1.5 rounded-full shrink-0 transition-colors hover:scale-125 cursor-pointer',
            enabled ? 'bg-emerald-500' : 'bg-muted-foreground/30',
          )}
        />

        {/* name + agent — click to expand prompt */}
        <button onClick={() => setOpen(!open)} className="flex-1 min-w-0 text-left">
          <span className="text-xs text-foreground block truncate">{name}</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground truncate">{agentName}</span>
            {description && (
              <span className="text-xs text-muted-foreground/50 truncate hidden sm:block">{description}</span>
            )}
          </div>
        </button>

        <Badge variant="secondary" className="font-mono text-xs shrink-0">{schedule}</Badge>

        <div className="hidden md:flex gap-4 shrink-0">
          <Timing label="Last" value={lastRun ? formatRelative(lastRun) : 'Never'} />
          <Timing label="Next" value={nextRun ? formatRelative(nextRun) : '—'} />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Edit">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/50 px-4 py-3 bg-muted/10">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Prompt</span>
          <pre className="mt-1.5 whitespace-pre-wrap font-mono text-xs text-muted-foreground leading-relaxed max-h-[200px] overflow-y-auto">
            {prompt}
          </pre>
        </div>
      )}
    </div>
  );
}

function Timing({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-xs text-foreground tabular-nums">{value}</p>
    </div>
  );
}
