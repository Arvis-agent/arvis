'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toaster';
import { CustomProviderIcon } from '@/components/ui/platform-icons';
import { Plus, Trash2, Edit2, Key, Eye, EyeOff, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Account } from './types';
import { PROVIDERS, PROVIDER_OPTIONS, PROVIDER_COLORS, PROVIDER_ICONS } from './constants';

// ─── Account Setup Guide ──────────────────────────────────────────────────────

function AccountSetupGuide() {
  const [open, setOpen] = useState(false);
  const isWindows = typeof navigator !== 'undefined' && navigator.platform.includes('Win');

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-7 items-center gap-1.5 rounded border border-border px-2 text-xs text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
        title="Setup guide for multiple accounts"
      >
        <Info className="h-3 w-3" />
        Guide
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Multi-Account Setup Guide" className="max-w-[580px]">
        <div className="space-y-5 text-xs max-h-[70vh] overflow-y-auto pr-1">
          <section>
            <p className="font-medium text-foreground mb-1.5">How rotation works</p>
            <p className="text-muted-foreground leading-relaxed">
              Accounts are tried by <span className="text-foreground font-mono">priority</span> (lower = first). When account A hits rate limits, Arvis silently switches to account B — users never see an error. CLI subscriptions (priority 10+) run complex jobs; API keys (priority 20+) run fast/simple ones.
            </p>
          </section>

          <section>
            <p className="font-medium text-foreground mb-1.5">CLI Subscription accounts</p>
            <p className="text-muted-foreground mb-2">
              Each Claude subscription needs its own credential directory. Works on Windows, Linux VPS, Mac — the login flow is URL-based, no browser needed on the server.
            </p>
            <p className="text-muted-foreground/70 mb-1 uppercase tracking-wide text-[10px]">
              {isWindows ? 'Windows (PowerShell)' : 'Linux / VPS (bash)'}
            </p>
            <pre className="bg-black/60 rounded p-3 text-foreground/90 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">{isWindows
              ? `# For each account, create a folder and log in:\nmkdir C:\\arvis-accounts\\acc1\n$env:USERPROFILE="C:\\arvis-accounts\\acc1"\n$env:HOME="C:\\arvis-accounts\\acc1"\nclaude login\n# → Opens a URL → paste into any browser → auth with Account 1\n\nmkdir C:\\arvis-accounts\\acc2\n$env:USERPROFILE="C:\\arvis-accounts\\acc2"\n$env:HOME="C:\\arvis-accounts\\acc2"\nclaude login\n# → Auth with Account 2`
              : `# For each account, create a folder and log in:\nmkdir -p /opt/arvis/acc1\nHOME=/opt/arvis/acc1 claude login\n# → Prints a URL → open on your LOCAL browser → auth with Account 1\n\nmkdir -p /opt/arvis/acc2\nHOME=/opt/arvis/acc2 claude login\n# → Auth with Account 2`}
            </pre>
            <p className="text-muted-foreground/70 mt-3 mb-1 uppercase tracking-wide text-[10px]">.env (auto-loads on restart)</p>
            <pre className="bg-black/60 rounded p-3 text-foreground/90 overflow-x-auto leading-relaxed">{isWindows
              ? `CLAUDE_CLI_HOME=C:\\arvis-accounts\\acc1\nCLAUDE_CLI_HOME_1=C:\\arvis-accounts\\acc2\nCLAUDE_CLI_HOME_2=C:\\arvis-accounts\\acc3\nCLAUDE_CLI_MODEL=claude-sonnet-4-6`
              : `CLAUDE_CLI_HOME=/opt/arvis/acc1\nCLAUDE_CLI_HOME_1=/opt/arvis/acc2\nCLAUDE_CLI_HOME_2=/opt/arvis/acc3\nCLAUDE_CLI_MODEL=claude-sonnet-4-6`}
            </pre>
            <p className="text-muted-foreground mt-2 leading-relaxed">
              Or skip .env entirely — use <span className="font-medium text-foreground">Add Account</span>, pick <span className="font-mono text-foreground">CLI Subscription</span>, paste the home dir path. Saved to DB immediately, no restart needed.
            </p>
          </section>

          <section>
            <p className="font-medium text-foreground mb-1.5">API Key accounts (VPS / no subscription)</p>
            <p className="text-muted-foreground mb-2">Stack multiple keys per provider for more throughput. All support indexed env vars:</p>
            <pre className="bg-black/60 rounded p-3 text-foreground/90 overflow-x-auto leading-relaxed">{`ANTHROPIC_API_KEY=sk-ant-key-from-account-1\nANTHROPIC_API_KEY_1=sk-ant-key-from-account-2\nANTHROPIC_API_KEY_2=sk-ant-key-from-account-3\n\n# OpenRouter (best for VPS — one key, access to all models)\nOPENROUTER_API_KEY=sk-or-...\nOPENROUTER_MODEL=anthropic/claude-sonnet-4-6`}</pre>
          </section>

          <section>
            <p className="font-medium text-foreground mb-1.5">Default priorities</p>
            <div className="rounded border border-border overflow-hidden">
              {[
                ['CLI Subscription', '10, 11, 12…', 'Full/complex jobs first'],
                ['Anthropic API', '20, 21…', 'Fast jobs + CLI fallback'],
                ['OpenAI API', '50, 51…', 'Fallback'],
                ['OpenRouter API', '60, 61…', 'Fallback'],
                ['Google Gemini', '70, 71…', 'Fallback'],
                ['Ollama (local)', '200', 'Last resort'],
              ].map(([type, priority, note]) => (
                <div key={type} className="grid grid-cols-[160px_80px_1fr] border-b border-border/50 last:border-0 px-3 py-2">
                  <span className="text-foreground/80">{type}</span>
                  <span className="font-mono text-primary/80">{priority}</span>
                  <span className="text-muted-foreground">{note}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </Dialog>
    </>
  );
}

// ─── Add Account Dialog ───────────────────────────────────────────────────────

function AddAccountDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '', provider: 'anthropic', type: 'api_key' as 'api_key' | 'cli_subscription',
    api_key: '', model: '', base_url: '', home_dir: '', priority: '100', customModel: '',
  });
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const prov = PROVIDERS[form.provider];
  const needsBaseUrl = form.provider === 'custom' || form.provider === 'ollama';
  const needsApiKey  = form.type === 'api_key';

  function setField(k: string, v: string) {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === 'provider') {
        next.model       = PROVIDERS[v]?.models[0] ?? '';
        next.base_url    = v === 'ollama' ? 'http://localhost:11434' : '';
        next.customModel = '';
        setUseCustomModel(false);
      }
      return next;
    });
  }

  const modelOptions = prov.models.map((m) => ({ value: m, label: m }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const model = useCustomModel ? form.customModel.trim() : form.model;
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:     form.name.trim(),
          provider: form.provider,
          type:     form.type,
          api_key:  needsApiKey ? form.api_key.trim() : undefined,
          home_dir: form.type === 'cli_subscription' && form.home_dir.trim() ? form.home_dir.trim() : undefined,
          model,
          base_url: needsBaseUrl ? form.base_url.trim() : undefined,
          priority: parseInt(form.priority, 10) || 100,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(`Account "${form.name}" added`);
      onCreated();
      onClose();
      setForm({ name: '', provider: 'anthropic', type: 'api_key', api_key: '', model: '', base_url: '', home_dir: '', priority: '100', customModel: '' });
      setShowKey(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add account');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add LLM Account" className="max-w-[480px]">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="acc-name">Name *</Label>
            <Input id="acc-name" placeholder="my-anthropic-key" value={form.name} onChange={(e) => setField('name', e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="acc-priority">Priority</Label>
            <Input id="acc-priority" type="number" min="1" max="999" placeholder="100" value={form.priority} onChange={(e) => setField('priority', e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Lower = higher priority</p>
          </div>
        </div>

        <div>
          <Label>Provider *</Label>
          <Select value={form.provider} onChange={(v) => setField('provider', v)} options={PROVIDER_OPTIONS} />
        </div>

        {form.provider === 'anthropic' && (
          <div>
            <Label>Account Type</Label>
            <div className="flex gap-2">
              {(['api_key', 'cli_subscription'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setField('type', t)}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-2 text-xs transition-colors',
                    form.type === t ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t === 'api_key' ? 'API Key' : 'CLI Subscription'}
                </button>
              ))}
            </div>
          </div>
        )}

        {needsApiKey && (
          <div>
            <Label>API Key *</Label>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                placeholder={form.provider === 'anthropic' ? 'sk-ant-...' : form.provider === 'openai' ? 'sk-...' : 'API key'}
                value={form.api_key}
                onChange={(e) => setField('api_key', e.target.value)}
                required={needsApiKey}
                className="pr-9"
              />
              <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        )}

        {form.type === 'cli_subscription' && (
          <div>
            <Label>Home Directory</Label>
            <Input
              placeholder={typeof navigator !== 'undefined' && /Win/.test(navigator.platform) ? 'C:\\Users\\AccountName' : '/home/username'}
              value={form.home_dir}
              onChange={(e) => setField('home_dir', e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Directory where <span className="font-mono">claude</span> is logged in. Each subscription account needs a different home dir.
            </p>
          </div>
        )}

        <div>
          <Label>Model *</Label>
          {!useCustomModel && modelOptions.length > 0 ? (
            <div className="flex gap-1.5">
              <Select value={form.model} onChange={(v) => setField('model', v)} options={modelOptions} className="flex-1" />
              <button type="button" onClick={() => setUseCustomModel(true)} className="px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0">Custom</button>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <Input placeholder={form.provider === 'openrouter' ? 'openai/gpt-4o' : 'model-id'} value={form.customModel} onChange={(e) => setField('customModel', e.target.value)} className="flex-1" required />
              {modelOptions.length > 0 && (
                <button type="button" onClick={() => setUseCustomModel(false)} className="px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0">Preset</button>
              )}
            </div>
          )}
        </div>

        {needsBaseUrl && (
          <div>
            <Label>Base URL</Label>
            <Input placeholder={form.provider === 'ollama' ? 'http://localhost:11434' : 'https://your-api.com'} value={form.base_url} onChange={(e) => setField('base_url', e.target.value)} />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={saving}>{saving ? 'Adding...' : 'Add Account'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Edit Account Dialog ──────────────────────────────────────────────────────

function EditAccountDialog({ account, onClose, onSaved, onDelete }: {
  account: Account;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: number) => void;
}) {
  const prov = PROVIDERS[account.provider];
  const modelOptions = (prov?.models ?? []).map((m) => ({ value: m, label: m }));
  const [form, setForm] = useState({
    name: account.name, model: account.model,
    priority: String(account.priority), base_url: account.base_url ?? '',
    home_dir: account.home_dir ?? '', api_key: '',
  });
  const [useCustomModel, setUseCustomModel] = useState(!prov || !prov.models.includes(account.model));
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const needsBaseUrl = account.provider === 'custom' || account.provider === 'ollama';
  const isCliSub    = account.type === 'cli_subscription';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        model: form.model.trim(),
        priority: parseInt(form.priority, 10),
        base_url: form.base_url.trim() || null,
        home_dir: isCliSub ? (form.home_dir.trim() || null) : undefined,
      };
      if (form.api_key.trim()) body.api_key = form.api_key.trim();
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success('Account updated');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Edit: ${account.name}`} className="max-w-[420px]">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <Label>Priority</Label>
            <Input type="number" min="1" max="999" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} />
          </div>
        </div>

        <div>
          <Label>Model *</Label>
          {!useCustomModel && modelOptions.length > 0 ? (
            <div className="flex gap-1.5">
              <Select value={form.model} onChange={(v) => setForm((f) => ({ ...f, model: v }))} options={modelOptions} className="flex-1" />
              <button type="button" onClick={() => setUseCustomModel(true)} className="px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0">Custom</button>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} className="flex-1" required />
              {modelOptions.length > 0 && (
                <button type="button" onClick={() => setUseCustomModel(false)} className="px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0">Preset</button>
              )}
            </div>
          )}
        </div>

        {needsBaseUrl && (
          <div>
            <Label>Base URL</Label>
            <Input value={form.base_url} onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))} />
          </div>
        )}

        {isCliSub && (
          <div>
            <Label>Home Directory</Label>
            <Input
              placeholder="C:\arvis-accounts\acc1  or  /opt/arvis/acc1"
              value={form.home_dir}
              onChange={(e) => setForm((f) => ({ ...f, home_dir: e.target.value }))}
            />
            <p className="mt-1 text-xs text-muted-foreground">Directory where <span className="font-mono">claude login</span> was run for this account</p>
          </div>
        )}

        {!isCliSub && (
          <div>
            <Label>New API Key <span className="text-muted-foreground font-normal">(leave blank to keep current)</span></Label>
            <div className="relative">
              <Input type={showKey ? 'text' : 'password'} placeholder="Paste new key to replace..." value={form.api_key} onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))} className="pr-9" />
              <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <button
            type="button"
            onClick={() => { onClose(); onDelete(account.id); }}
            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />Delete account
          </button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Accounts Section ─────────────────────────────────────────────────────────

interface AccountsSectionProps {
  accounts: Account[] | null;
  onReload: () => void;
}

export function AccountsSection({ accounts, onReload }: AccountsSectionProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function toggleStatus(a: Account) {
    const next = a.status === 'active' ? 'disabled' : 'active';
    try {
      const res = await fetch(`/api/accounts/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function confirmDelete() {
    if (deleteId === null) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/accounts/${deleteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Account deleted');
      setDeleteId(null);
      onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="rounded-md border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
          <div>
            <h2 className="text-sm font-medium">LLM Accounts</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{accounts?.length ?? 0} configured · priority-based rotation</p>
          </div>
          <div className="flex items-center gap-2">
            <AccountSetupGuide />
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" />Add Account
            </Button>
          </div>
        </div>

        {!accounts ? (
          <div className="p-4 space-y-2">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : accounts.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Key className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No accounts yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add your first API key to get started</p>
            <Button size="sm" className="mt-4" onClick={() => setAddOpen(true)}><Plus className="h-3.5 w-3.5" />Add Account</Button>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {accounts.map((a) => {
              const ProviderIcon = PROVIDER_ICONS[a.provider] ?? CustomProviderIcon;
              return (
                <div key={a.id} className={cn('flex items-center gap-3 px-4 py-3 hover:bg-muted/10 transition-colors', a.status === 'disabled' && 'opacity-50')}>
                  <div className={cn('w-7 h-7 rounded border border-border flex items-center justify-center shrink-0', PROVIDER_COLORS[a.provider] ?? 'text-muted-foreground')}>
                    <ProviderIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-foreground font-medium truncate">{a.name}</span>
                      <Badge variant="secondary" className="capitalize shrink-0">{a.provider}</Badge>
                      {a.type === 'cli_subscription'
                        ? <Badge variant="outline" className="shrink-0 border-primary/40 text-primary/80 text-[10px]">CLI Sub</Badge>
                        : <Badge variant="outline" className="shrink-0 text-[10px]">API Key</Badge>}
                      {a.rate_limited_until && <Badge variant="destructive" className="shrink-0">Rate limited</Badge>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground truncate">{a.model}</span>
                      {a.type === 'cli_subscription' && a.home_dir && (
                        <span className="font-mono text-xs text-primary/60 truncate" title={a.home_dir}>
                          ~/{a.home_dir.split(/[\\/]/).slice(-2).join('/')}
                        </span>
                      )}
                      {a.base_url && <span className="font-mono text-xs text-muted-foreground/50 truncate">{a.base_url}</span>}
                      <span className="text-xs text-muted-foreground shrink-0">P{a.priority}</span>
                      {a.total_messages > 0 && (
                        <span className="text-xs text-muted-foreground shrink-0">{a.total_messages.toLocaleString()} msgs</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant={a.status === 'active' ? 'success' : a.status === 'rate_limited' ? 'warning' : 'secondary'}>
                      {a.status === 'rate_limited' ? 'limited' : a.status}
                    </Badge>
                    <button
                      onClick={() => setEditTarget(a)}
                      className="flex h-7 items-center gap-1.5 rounded border border-border px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      title="Edit account"
                    >
                      <Edit2 className="h-3 w-3" />Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AddAccountDialog open={addOpen} onClose={() => setAddOpen(false)} onCreated={onReload} />
      {editTarget && (
        <EditAccountDialog
          account={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={onReload}
          onDelete={(id) => { setEditTarget(null); setDeleteId(id); }}
        />
      )}
      <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Account" className="max-w-sm">
        <p className="text-sm text-muted-foreground mb-5">
          This will permanently delete the account. Agents using it will fall back to other accounts.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={confirmDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
