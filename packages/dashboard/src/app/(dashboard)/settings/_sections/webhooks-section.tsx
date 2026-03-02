'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toaster';
import { Plus, Trash2, Power, Webhook, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Agent, WebhookEntry } from './types';

// ─── Add Webhook Dialog ───────────────────────────────────────────────────────

function AddWebhookDialog({ open, onClose, onCreated, agents }: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  agents: Agent[];
}) {
  const [form, setForm] = useState({ path: '', agent_id: '', prompt_template: 'Webhook received: {{payload}}' });
  const [saving, setSaving] = useState(false);

  const agentOptions = agents
    .filter((a) => a.status !== 'archived')
    .map((a) => ({ value: String(a.id), label: a.name }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.agent_id) { toast.error('Select an agent'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: form.path.trim(),
          agent_id: parseInt(form.agent_id, 10),
          prompt_template: form.prompt_template.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(`Webhook created at ${data.path}`);
      onCreated();
      onClose();
      setForm({ path: '', agent_id: '', prompt_template: 'Webhook received: {{payload}}' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create webhook');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add Webhook" className="max-w-[500px]">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label>Path * <span className="text-muted-foreground font-normal">(e.g. /webhooks/my-hook)</span></Label>
          <Input
            placeholder="/webhooks/my-hook"
            value={form.path}
            onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))}
            required
          />
        </div>
        <div>
          <Label>Agent *</Label>
          <Select
            value={form.agent_id}
            onChange={(v) => setForm((f) => ({ ...f, agent_id: v }))}
            options={[{ value: '', label: 'Select agent...' }, ...agentOptions]}
          />
        </div>
        <div>
          <Label>Prompt Template *</Label>
          <p className="text-xs text-muted-foreground mb-1">Use <code className="font-mono text-foreground">{'{{payload}}'}</code> where the webhook body should be injected</p>
          <Textarea
            value={form.prompt_template}
            onChange={(e) => setForm((f) => ({ ...f, prompt_template: e.target.value }))}
            spellCheck={false}
            required
            className="min-h-[96px]"
          />
        </div>
        <p className="text-xs text-muted-foreground">A secret will be auto-generated for HMAC signature verification.</p>
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={saving}>{saving ? 'Creating...' : 'Create Webhook'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Webhooks Section ─────────────────────────────────────────────────────────

interface WebhooksSectionProps {
  webhooks: WebhookEntry[] | null;
  agents: Agent[] | null;
  onReload: () => void;
}

export function WebhooksSection({ webhooks, agents, onReload }: WebhooksSectionProps) {
  const [addWebhookOpen, setAddWebhookOpen] = useState(false);
  const [deleteWebhookId, setDeleteWebhookId] = useState<number | null>(null);
  const [deletingWebhook, setDeletingWebhook] = useState(false);

  async function toggleWebhookEnabled(wh: WebhookEntry) {
    const next = wh.enabled === 1 ? false : true;
    try {
      const res = await fetch('/api/webhooks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: wh.id, enabled: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function confirmDeleteWebhook() {
    if (deleteWebhookId === null) return;
    setDeletingWebhook(true);
    try {
      const res = await fetch(`/api/webhooks?id=${deleteWebhookId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Webhook deleted');
      setDeleteWebhookId(null);
      onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete webhook');
    } finally {
      setDeletingWebhook(false);
    }
  }

  return (
    <>
      <div className="rounded-md border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
          <div>
            <h2 className="text-sm font-medium">Webhooks</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {webhooks == null ? 'Loading...' : `${webhooks.length} configured · POST to trigger an agent`}
            </p>
          </div>
          <Button size="sm" onClick={() => setAddWebhookOpen(true)}>
            <Plus className="h-3.5 w-3.5" />Add Webhook
          </Button>
        </div>

        {webhooks == null ? (
          <div className="p-4 space-y-2">{Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : webhooks.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Webhook className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No webhooks configured</p>
            <p className="text-xs text-muted-foreground mt-1">Create a webhook to trigger agents from external services</p>
            <Button size="sm" className="mt-4" onClick={() => setAddWebhookOpen(true)}><Plus className="h-3.5 w-3.5" />Add Webhook</Button>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {webhooks.map((wh) => (
              <div key={wh.id} className={cn('flex items-center gap-3 px-4 py-3 hover:bg-muted/10 transition-colors', wh.enabled === 0 && 'opacity-60')}>
                <div className="h-7 w-7 rounded border border-border flex items-center justify-center shrink-0 text-muted-foreground">
                  <Webhook className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { navigator.clipboard.writeText(wh.path); toast.success('Path copied!'); }}
                      className="font-mono text-sm text-primary hover:text-primary/80 transition-colors truncate"
                      title="Click to copy"
                    >
                      {wh.path}
                    </button>
                    <Copy className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-muted-foreground">→ {wh.agent_name ?? 'unassigned'}</span>
                    <span className="text-xs text-muted-foreground/50">{wh.trigger_count} triggers</span>
                    {wh.last_triggered && (
                      <span className="text-xs text-muted-foreground/50">last: {new Date(wh.last_triggered).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => toggleWebhookEnabled(wh)}
                    className={cn(
                      'flex items-center gap-1 h-7 rounded border px-2 text-xs transition-colors cursor-pointer',
                      wh.enabled ? 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent',
                    )}
                  >
                    <Power className="h-3 w-3" />
                    {wh.enabled ? 'On' : 'Off'}
                  </button>
                  <button
                    onClick={() => setDeleteWebhookId(wh.id)}
                    className="flex h-7 items-center gap-1.5 rounded border border-border px-2 text-xs text-muted-foreground hover:text-red-400 hover:border-red-500/40 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {agents && (
        <AddWebhookDialog open={addWebhookOpen} onClose={() => setAddWebhookOpen(false)} onCreated={onReload} agents={agents} />
      )}
      <Dialog open={deleteWebhookId !== null} onClose={() => setDeleteWebhookId(null)} title="Delete Webhook" className="max-w-sm">
        <p className="text-sm text-muted-foreground mb-5">
          This will permanently delete the webhook. Any external services using this URL will stop working.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDeleteWebhookId(null)}>Cancel</Button>
          <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={confirmDeleteWebhook} disabled={deletingWebhook}>
            {deletingWebhook ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
