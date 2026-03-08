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
import { Plus, Trash2, Edit2, Eye, EyeOff, Bot, Power } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Agent, BotInstance } from './types';
import { BOT_PLATFORM_MAP, BOT_PLATFORM_OPTIONS, BOT_STATUS_DOT } from './constants';

// ─── Extra Fields (platform-specific) ────────────────────────────────────────

function ExtraFields({ platform, extra, onChange }: {
  platform: string;
  extra: Record<string, string>;
  onChange: (k: string, v: string) => void;
}) {
  if (platform === 'discord') return (
    <div>
      <Label>Allowed Channels <span className="text-muted-foreground font-normal">(optional — comma-separated channel IDs)</span></Label>
      <Input
        placeholder="Leave blank to respond in all channels"
        value={extra.allowed_channels ?? ''}
        onChange={(e) => onChange('allowed_channels', e.target.value)}
      />
      <p className="text-xs text-muted-foreground mt-1">e.g. 1478027300946579586, 1234567890123456</p>
    </div>
  );
  if (platform === 'slack') return (
    <div className="space-y-3">
      <div>
        <Label>App Token * <span className="text-muted-foreground font-normal">(xapp-)</span></Label>
        <Input placeholder="xapp-1-..." value={extra.app_token ?? ''} onChange={(e) => onChange('app_token', e.target.value)} required />
      </div>
      <div>
        <Label>Signing Secret</Label>
        <Input placeholder="Optional" value={extra.signing_secret ?? ''} onChange={(e) => onChange('signing_secret', e.target.value)} />
      </div>
    </div>
  );
  if (platform === 'whatsapp') return (
    <div className="space-y-3">
      <div>
        <Label>Phone Number ID *</Label>
        <Input placeholder="1234567890" value={extra.phone_number_id ?? ''} onChange={(e) => onChange('phone_number_id', e.target.value)} required />
      </div>
      <div>
        <Label>Verify Token <span className="text-muted-foreground font-normal">(default: arvis-verify)</span></Label>
        <Input placeholder="arvis-verify" value={extra.verify_token ?? ''} onChange={(e) => onChange('verify_token', e.target.value)} />
      </div>
    </div>
  );
  if (platform === 'matrix') return (
    <div className="space-y-3">
      <div>
        <Label>Homeserver URL *</Label>
        <Input placeholder="https://matrix.org" value={extra.homeserver_url ?? ''} onChange={(e) => onChange('homeserver_url', e.target.value)} required />
      </div>
      <div>
        <Label>User ID</Label>
        <Input placeholder="@bot:matrix.org" value={extra.user_id ?? ''} onChange={(e) => onChange('user_id', e.target.value)} />
      </div>
    </div>
  );
  if (platform === 'sms') return (
    <div className="space-y-3">
      <div>
        <Label>Auth Token *</Label>
        <Input placeholder="Twilio Auth Token" value={extra.auth_token ?? ''} onChange={(e) => onChange('auth_token', e.target.value)} required />
      </div>
      <div>
        <Label>Phone Number * <span className="text-muted-foreground font-normal">(+1...)</span></Label>
        <Input placeholder="+12345678900" value={extra.phone_number ?? ''} onChange={(e) => onChange('phone_number', e.target.value)} required />
      </div>
      <div>
        <Label>Webhook Port <span className="text-muted-foreground font-normal">(default: 5080)</span></Label>
        <Input placeholder="5080" value={extra.port ?? ''} onChange={(e) => onChange('port', e.target.value)} />
      </div>
    </div>
  );
  if (platform === 'email') return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>IMAP Host *</Label>
          <Input placeholder="imap.gmail.com" value={extra.imap_host ?? ''} onChange={(e) => onChange('imap_host', e.target.value)} required />
        </div>
        <div>
          <Label>IMAP Port</Label>
          <Input placeholder="993" value={extra.imap_port ?? ''} onChange={(e) => onChange('imap_port', e.target.value)} />
        </div>
      </div>
      <div>
        <Label>IMAP Username (email address) *</Label>
        <Input placeholder="you@gmail.com" value={extra.imap_user ?? ''} onChange={(e) => onChange('imap_user', e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>SMTP Host *</Label>
          <Input placeholder="smtp.gmail.com" value={extra.smtp_host ?? ''} onChange={(e) => onChange('smtp_host', e.target.value)} required />
        </div>
        <div>
          <Label>SMTP Port</Label>
          <Input placeholder="587" value={extra.smtp_port ?? ''} onChange={(e) => onChange('smtp_port', e.target.value)} />
        </div>
      </div>
      <div>
        <Label>SMTP Username <span className="text-muted-foreground font-normal">(if different from IMAP)</span></Label>
        <Input placeholder="you@gmail.com" value={extra.smtp_user ?? ''} onChange={(e) => onChange('smtp_user', e.target.value)} />
      </div>
      <div>
        <Label>SMTP Password <span className="text-muted-foreground font-normal">(if different from IMAP)</span></Label>
        <Input type="password" placeholder="Leave blank to reuse IMAP password" value={extra.smtp_pass ?? ''} onChange={(e) => onChange('smtp_pass', e.target.value)} />
      </div>
      <div>
        <Label>From Address <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input placeholder="you@gmail.com" value={extra.from_address ?? ''} onChange={(e) => onChange('from_address', e.target.value)} />
      </div>
    </div>
  );
  return null;
}

// ─── Add Bot Dialog ───────────────────────────────────────────────────────────

function AddBotDialog({ open, onClose, onCreated, agents }: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  agents: Agent[];
}) {
  const [form, setForm] = useState({ name: '', platform: 'discord', token: '', agent_id: '' });
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);

  function setExtraField(k: string, v: string) { setExtra((e) => ({ ...e, [k]: v })); }

  function setPlatform(p: string) {
    setForm((f) => ({ ...f, platform: p }));
    setExtra({});
  }

  const agentOptions = [
    { value: '', label: 'No agent (unassigned)' },
    ...agents.filter((a) => a.status !== 'archived').map((a) => ({ value: String(a.id), label: a.name })),
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          platform: form.platform,
          token: form.token.trim(),
          agent_id: form.agent_id ? parseInt(form.agent_id, 10) : null,
          extra_config: Object.keys(extra).length > 0 ? extra : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(`Bot "${form.name}" created`);
      onCreated();
      onClose();
      setForm({ name: '', platform: 'discord', token: '', agent_id: '' });
      setExtra({});
      setShowToken(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create bot');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add Bot" className="max-w-[480px]">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Name *</Label>
            <Input placeholder={`My ${BOT_PLATFORM_MAP[form.platform]?.label ?? 'Bot'} Bot`} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <Label>Platform *</Label>
            <Select value={form.platform} onChange={setPlatform} options={BOT_PLATFORM_OPTIONS} />
          </div>
        </div>

        <div>
          <Label>
            {form.platform === 'sms'   ? 'Account SID *' :
             form.platform === 'email' ? 'IMAP Password *' :
             'Token *'}
          </Label>
          <div className="relative">
            <Input
              type={showToken ? 'text' : 'password'}
              placeholder={
                form.platform === 'discord'  ? 'Bot token from Developer Portal' :
                form.platform === 'telegram' ? 'Token from @BotFather' :
                form.platform === 'slack'    ? 'xoxb- bot token' :
                form.platform === 'whatsapp' ? 'Access token from Meta Business API' :
                form.platform === 'sms'      ? 'Twilio Account SID (AC...)' :
                form.platform === 'email'    ? 'IMAP password / app password' :
                'Access token from homeserver'
              }
              value={form.token}
              onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
              required
              className="pr-9"
            />
            <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <ExtraFields platform={form.platform} extra={extra} onChange={setExtraField} />

        <div>
          <Label>Agent Assignment</Label>
          <Select value={form.agent_id} onChange={(v) => setForm((f) => ({ ...f, agent_id: v }))} options={agentOptions} />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={saving}>{saving ? 'Creating...' : 'Create Bot'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Edit Bot Dialog ──────────────────────────────────────────────────────────

function EditBotDialog({ bot, onClose, onSaved, onDelete, agents }: {
  bot: BotInstance;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: number) => void;
  agents: Agent[];
}) {
  const [form, setForm] = useState({
    name: bot.name,
    token: '',
    agent_id: bot.agent_id ? String(bot.agent_id) : '',
    enabled: bot.enabled === 1,
  });
  const [extra, setExtra] = useState<Record<string, string>>(bot.extra_config ?? {});
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);

  function setExtraField(k: string, v: string) { setExtra((e) => ({ ...e, [k]: v })); }

  const agentOptions = [
    { value: '', label: 'No agent (unassigned)' },
    ...agents.filter((a) => a.status !== 'archived').map((a) => ({ value: String(a.id), label: a.name })),
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        agent_id: form.agent_id ? parseInt(form.agent_id, 10) : null,
        enabled: form.enabled,
        extra_config: Object.keys(extra).length > 0 ? extra : null,
      };
      if (form.token.trim()) body.token = form.token.trim();
      const res = await fetch(`/api/bots/${bot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success('Bot updated');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Edit: ${bot.name}`} className="max-w-[480px]">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label>Name *</Label>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
        </div>

        <div>
          <Label>New Token <span className="text-muted-foreground font-normal">(leave blank to keep current)</span></Label>
          <div className="relative">
            <Input
              type={showToken ? 'text' : 'password'}
              placeholder="Paste new token to replace..."
              value={form.token}
              onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
              className="pr-9"
            />
            <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <ExtraFields platform={bot.platform} extra={extra} onChange={setExtraField} />

        <div>
          <Label>Agent Assignment</Label>
          <Select value={form.agent_id} onChange={(v) => setForm((f) => ({ ...f, agent_id: v }))} options={agentOptions} />
        </div>

        <div className="flex items-center gap-3">
          <Label>Enabled</Label>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
            className={cn(
              'flex items-center gap-1.5 h-7 rounded border px-2.5 text-xs transition-colors',
              form.enabled ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' : 'border-border text-muted-foreground',
            )}
          >
            <Power className="h-3 w-3" />
            {form.enabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <button
            type="button"
            onClick={() => { onClose(); onDelete(bot.id); }}
            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />Delete bot
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

// ─── Bots Section ─────────────────────────────────────────────────────────────

interface BotsSectionProps {
  bots: BotInstance[] | null;
  agents: Agent[] | null;
  onReload: () => void;
}

export function BotsSection({ bots, agents, onReload }: BotsSectionProps) {
  const [addBotOpen, setAddBotOpen] = useState(false);
  const [editBotTarget, setEditBotTarget] = useState<BotInstance | null>(null);
  const [deleteBotId, setDeleteBotId] = useState<number | null>(null);
  const [deletingBot, setDeletingBot] = useState(false);

  async function toggleBotEnabled(bot: BotInstance) {
    const next = bot.enabled === 1 ? false : true;
    try {
      const res = await fetch(`/api/bots/${bot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function confirmDeleteBot() {
    if (deleteBotId === null) return;
    setDeletingBot(true);
    try {
      const res = await fetch(`/api/bots/${deleteBotId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Bot deleted');
      setDeleteBotId(null);
      onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete bot');
    } finally {
      setDeletingBot(false);
    }
  }

  return (
    <>
      <div className="rounded-md border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
          <div>
            <h2 className="text-sm font-medium">Bot Instances</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {bots == null ? 'Loading...' : `${bots.length} bot${bots.length !== 1 ? 's' : ''} · each assigned to an agent`}
            </p>
          </div>
          <Button size="sm" onClick={() => setAddBotOpen(true)}>
            <Plus className="h-3.5 w-3.5" />Add Bot
          </Button>
        </div>

        {bots == null ? (
          <div className="p-4 space-y-2">{Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : bots.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Bot className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No bots configured</p>
            <p className="text-xs text-muted-foreground mt-1">Add a bot to connect Discord, Telegram, Slack, WhatsApp or Matrix</p>
            <Button size="sm" className="mt-4" onClick={() => setAddBotOpen(true)}><Plus className="h-3.5 w-3.5" />Add Bot</Button>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {bots.map((bot) => {
              const platform = BOT_PLATFORM_MAP[bot.platform];
              const PlatformIcon = platform?.Icon ?? Bot;
              const statusDot = BOT_STATUS_DOT[bot.status] ?? BOT_STATUS_DOT.stopped;
              return (
                <div key={bot.id} className={cn('flex items-center gap-3 px-4 py-3 hover:bg-muted/10 transition-colors', bot.enabled === 0 && 'opacity-60')}>
                  <div className="h-7 w-7 rounded border border-border flex items-center justify-center shrink-0 text-muted-foreground">
                    <PlatformIcon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{bot.name}</span>
                      <Badge variant="secondary" className="capitalize shrink-0">{bot.platform}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <div className="flex items-center gap-1.5" title={bot.last_error ?? undefined}>
                        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', statusDot)} />
                        <span className={cn('text-xs', bot.status === 'running' ? 'text-emerald-400' : bot.status === 'error' ? 'text-red-400' : 'text-muted-foreground/60')}>
                          {bot.status}
                        </span>
                      </div>
                      {bot.agent_name ? (
                        <span className="text-xs text-muted-foreground truncate">→ {bot.agent_name}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">unassigned</span>
                      )}
                      <span className="font-mono text-xs text-muted-foreground/40 truncate">{bot.token && bot.token.length > 6 ? `••••••${bot.token.slice(-6)}` : '••••••'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => toggleBotEnabled(bot)}
                      className={cn(
                        'flex items-center gap-1 h-7 rounded border px-2 text-xs transition-colors cursor-pointer',
                        bot.enabled ? 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent',
                      )}
                      title={bot.enabled ? 'Disable bot' : 'Enable bot'}
                    >
                      <Power className="h-3 w-3" />
                      {bot.enabled ? 'On' : 'Off'}
                    </button>
                    <button
                      onClick={() => setEditBotTarget(bot)}
                      className="flex h-7 items-center gap-1.5 rounded border border-border px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
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

      {agents && (
        <AddBotDialog open={addBotOpen} onClose={() => setAddBotOpen(false)} onCreated={onReload} agents={agents} />
      )}
      {editBotTarget && agents && (
        <EditBotDialog
          bot={editBotTarget}
          onClose={() => setEditBotTarget(null)}
          onSaved={onReload}
          onDelete={(id) => { setEditBotTarget(null); setDeleteBotId(id); }}
          agents={agents}
        />
      )}
      <Dialog open={deleteBotId !== null} onClose={() => setDeleteBotId(null)} title="Delete Bot" className="max-w-sm">
        <p className="text-sm text-muted-foreground mb-5">
          This will permanently delete the bot. The connector will stop on the next sync (within 30 seconds).
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDeleteBotId(null)}>Cancel</Button>
          <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={confirmDeleteBot} disabled={deletingBot}>
            {deletingBot ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
