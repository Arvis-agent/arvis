'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, type SelectOption } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AgentChat } from '@/components/dashboard/agent-chat';
import { toast } from '@/components/ui/toaster';
import {
  ArrowLeft, AlertCircle, Brain, Database, Copy, Check,
  Save, Power, Archive, Plus, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/format';

interface AgentDetail {
  id: number;
  slug: string;
  name: string;
  role: string;
  description: string | null;
  model: string;
  modelPrimary: string | null;
  modelFallbacks: string[];
  status: 'active' | 'paused' | 'archived';
  systemPrompt: string | null;
  personality: { voice: string; quirks?: string[]; emoji_level: string } | null;
  channels: Record<string, unknown> | null;
  allowedTools: string[];
  createdAt: string;
  updatedAt: string;
  facts: { id: number; category: string; content: string; createdAt: string }[];
  state: { key: string; value: string }[] | { key: string; value: string } | null;
}

const BUILT_IN_TOOLS = [
  { id: 'web_search',  label: 'Web Search',    desc: 'DuckDuckGo instant answers' },
  { id: 'http_fetch',  label: 'HTTP Fetch',     desc: 'Fetch and read any URL (3k chars)' },
  { id: 'calculate',   label: 'Calculator',     desc: 'Safe math expression evaluator' },
  { id: 'get_time',    label: 'Clock',          desc: 'Current date & time' },
];

const ROLE_OPTIONS: SelectOption[] = [
  'assistant', 'orchestrator', 'specialist', 'analyst', 'researcher', 'coder', 'writer',
].map((r) => ({ value: r, label: r }));

const MODEL_OPTIONS: SelectOption[] = [
  // Anthropic
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
  'claude-3-haiku-20240307',
  // OpenAI
  'gpt-4o', 'gpt-4o-mini',
  'o3', 'o3-mini', 'o1', 'o1-mini',
  'gpt-4-turbo',
  // Google
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite-001',
  'gemini-1.5-pro', 'gemini-1.5-flash',
  // OpenRouter
  'openrouter/auto',
  'meta-llama/llama-3.3-70b-instruct',
  'deepseek/deepseek-chat',
  'mistralai/mistral-large',
  'qwen/qwen-2.5-72b-instruct',
].map((m) => ({ value: m, label: m }));

const EMOJI_OPTIONS: SelectOption[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

function buildDefaultPrompt(agent: AgentDetail): string {
  const lines: string[] = [`You are ${agent.name}, a ${agent.role} agent.`];
  if (agent.description) lines.push(agent.description);
  if (agent.personality) {
    lines.push('');
    lines.push(`Voice: ${agent.personality.voice}.`);
    if (agent.personality.quirks?.length) {
      lines.push(`Quirks: ${agent.personality.quirks.join(', ')}.`);
    }
  }
  lines.push('\n// Add your custom instructions here...');
  return lines.join('\n');
}

// ─── Config Tab ────────────────────────────────────────────────────────────────
function ConfigTab({ agent, onSaved }: { agent: AgentDetail; onSaved: (a: AgentDetail) => void }) {
  const [form, setForm] = useState({
    name: agent.name,
    role: agent.role,
    description: agent.description || '',
    model: agent.modelPrimary || agent.model,
    systemPrompt: agent.systemPrompt || '',
    voice: agent.personality?.voice || '',
    emoji_level: agent.personality?.emoji_level || 'low',
    quirks: agent.personality?.quirks?.join(', ') || '',
    channels: agent.channels ? JSON.stringify(agent.channels, null, 2) : '',
  });
  const [enabledTools, setEnabledTools] = useState<Set<string>>(new Set(agent.allowedTools ?? []));
  const [useCustomModel, setUseCustomModel] = useState(
    !MODEL_OPTIONS.some((o) => o.value === (agent.modelPrimary || agent.model))
  );
  const [customModel, setCustomModel] = useState(
    !MODEL_OPTIONS.some((o) => o.value === (agent.modelPrimary || agent.model))
      ? (agent.modelPrimary || agent.model)
      : ''
  );
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const finalModel = useCustomModel ? customModel.trim() : form.model;
      if (!finalModel) { toast.error('Model is required'); return; }

      const body: Record<string, unknown> = {
        name: form.name.trim(),
        role: form.role,
        model: finalModel,
      };
      if (form.description.trim()) body.description = form.description.trim();
      else body.description = null;
      if (form.systemPrompt.trim()) body.systemPrompt = form.systemPrompt.trim();
      else body.systemPrompt = null;

      // personality
      if (form.voice.trim() || form.emoji_level) {
        body.personality = {
          voice: form.voice.trim() || 'professional',
          emoji_level: form.emoji_level || 'low',
          quirks: form.quirks.trim() ? form.quirks.split(',').map((s) => s.trim()).filter(Boolean) : [],
        };
      }

      // channels (JSON)
      if (form.channels.trim()) {
        try {
          body.channels = JSON.parse(form.channels);
        } catch {
          toast.error('Channels must be valid JSON');
          return;
        }
      } else {
        body.channels = null;
      }

      body.allowedTools = [...enabledTools];

      const res = await fetch(`/api/agents/${agent.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success('Agent updated');
      onSaved(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status: 'active' | 'paused' | 'archived') {
    setStatusBusy(true);
    try {
      const res = await fetch(`/api/agents/${agent.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(`Agent ${status}`);
      onSaved(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setStatusBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6 pb-6">
      {/* Basic Info */}
      <section className="rounded-md border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/10">
          <h2 className="text-sm font-medium">Basic Info</h2>
        </div>
        <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cfg-name">Name</Label>
            <Input id="cfg-name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={form.role} onChange={(v) => set('role', v)} options={ROLE_OPTIONS} />
          </div>
        </div>

        <div>
          <Label htmlFor="cfg-desc">Description</Label>
          <Input id="cfg-desc" placeholder="What this agent does..." value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>

        <div>
          <Label>Model</Label>
          <div className="flex gap-1.5">
            {!useCustomModel ? (
              <Select value={form.model} onChange={(v) => set('model', v)} options={MODEL_OPTIONS} className="flex-1" />
            ) : (
              <Input
                placeholder="provider/model or model-id"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                className="flex-1"
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
        </div>
      </section>

      {/* System Prompt */}
      <section className="rounded-md border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
          <h2 className="text-sm font-medium">System Prompt</h2>
          {!form.systemPrompt && (
            <button
              type="button"
              onClick={() => set('systemPrompt', buildDefaultPrompt(agent))}
              className="text-xs text-muted-foreground hover:text-foreground border border-border/60 rounded px-2 py-1 hover:bg-accent transition-colors"
            >
              Load template
            </button>
          )}
        </div>
        <div className="p-4 space-y-3">
        <Textarea
          id="cfg-prompt"
          placeholder="You are a helpful assistant..."
          value={form.systemPrompt}
          onChange={(e) => set('systemPrompt', e.target.value)}
          className="min-h-[180px] font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          {agent.role === 'conductor'
            ? 'Replaces the entire auto-generated orchestrator prompt'
            : 'Appended to the auto-built identity + rules prompt'}
        </p>
        </div>
      </section>

      {/* Personality */}
      <section className="rounded-md border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/10">
          <h2 className="text-sm font-medium">Personality</h2>
        </div>
        <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cfg-voice">Voice / Tone</Label>
            <Input id="cfg-voice" placeholder="professional, casual, friendly..." value={form.voice} onChange={(e) => set('voice', e.target.value)} />
          </div>
          <div>
            <Label>Emoji Level</Label>
            <Select value={form.emoji_level} onChange={(v) => set('emoji_level', v)} options={EMOJI_OPTIONS} />
          </div>
        </div>

        <div>
          <Label htmlFor="cfg-quirks">Quirks <span className="text-muted-foreground font-normal">(comma separated)</span></Label>
          <Input id="cfg-quirks" placeholder="concise, uses bullet points, asks clarifying questions..." value={form.quirks} onChange={(e) => set('quirks', e.target.value)} />
        </div>
        </div>
      </section>

      {/* Tools */}
      <section className="rounded-md border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/10">
          <h2 className="text-sm font-medium">Tools</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Give the agent access to real-world capabilities</p>
        </div>
        <div className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {BUILT_IN_TOOLS.map((tool) => {
            const enabled = enabledTools.has(tool.id);
            return (
              <label
                key={tool.id}
                className={cn(
                  'flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors',
                  enabled ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-accent/50',
                )}
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => {
                    setEnabledTools((prev) => {
                      const next = new Set(prev);
                      if (next.has(tool.id)) next.delete(tool.id); else next.add(tool.id);
                      return next;
                    });
                  }}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <p className="text-xs font-medium">{tool.label}</p>
                  <p className="text-xs text-muted-foreground">{tool.desc}</p>
                </div>
              </label>
            );
          })}
        </div>
        </div>
      </section>

      {/* Channel Bindings */}
      <section className="rounded-md border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/10">
          <h2 className="text-sm font-medium">Channel Bindings <span className="text-xs font-normal text-muted-foreground">(JSON)</span></h2>
        </div>
        <div className="p-4 space-y-3">
        <Textarea
          placeholder={'{\n  "discord": { "guildId": "...", "channelId": "..." }\n}'}
          value={form.channels}
          onChange={(e) => set('channels', e.target.value)}
          className="min-h-[120px] font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">Platform-specific channel configuration for this agent</p>
        </div>
      </section>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
        {/* Status controls */}
        <div className="flex gap-2">
          {agent.status !== 'active' && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setStatus('active')}
              disabled={statusBusy}
              className="text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
            >
              <Power className="h-3.5 w-3.5" />
              Activate
            </Button>
          )}
          {agent.status === 'active' && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setStatus('paused')}
              disabled={statusBusy}
              className="text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/10"
            >
              <Power className="h-3.5 w-3.5" />
              Pause
            </Button>
          )}
          {agent.status !== 'archived' && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setStatus('archived')}
              disabled={statusBusy}
              className="text-red-400 border-red-500/30 hover:bg-red-500/10"
            >
              <Archive className="h-3.5 w-3.5" />
              Archive
            </Button>
          )}
        </div>

        {/* Save */}
        <Button type="submit" size="sm" disabled={saving}>
          <Save className="h-3.5 w-3.5" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}

// ─── Memory Tab ────────────────────────────────────────────────────────────────
function MemoryTab({ agent }: { agent: AgentDetail }) {
  const [facts, setFacts] = useState(agent.facts);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const stateArray = Array.isArray(agent.state) ? agent.state : agent.state ? [agent.state] : [];

  async function deleteFact(id: number) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/memory/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setFacts((prev) => prev.filter((f) => f.id !== id));
      toast.success('Fact deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Facts */}
      <div className="rounded-md border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/10">
          <h2 className="text-sm font-medium">Facts ({facts.length})</h2>
        </div>
        <div className="p-4">
        {facts.length === 0 ? (
          <EmptyState icon={<Brain className="h-8 w-8" />} title="No facts stored" description="Learned from conversations" />
        ) : (
          <div className="space-y-2.5">
            {facts.map((f) => (
              <div key={f.id} className="rounded-md border border-border/50 p-3 group">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{f.category}</Badge>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatRelative(f.createdAt)}</span>
                  </div>
                  <button
                    onClick={() => deleteFact(f.id)}
                    disabled={deletingId === f.id}
                    className="opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title="Delete fact"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{f.content}</p>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>

      {/* State */}
      <div className="rounded-md border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/10">
          <h2 className="text-sm font-medium">State ({stateArray.length})</h2>
        </div>
        <div className="p-4">
        {stateArray.length === 0 ? (
          <EmptyState icon={<Database className="h-8 w-8" />} title="No state" description="Persists across conversations" />
        ) : (
          <div className="divide-y divide-border/50">
            {stateArray.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-muted-foreground font-mono text-xs truncate">{s.key}</span>
                <span className="text-foreground font-mono text-xs truncate max-w-[60%] text-right">{s.value}</span>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/agents/${params.id}`);
      if (!r.ok) throw new Error(r.status === 404 ? 'Not found' : `HTTP ${r.status}`);
      setAgent(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  function copySlug() {
    if (!agent) return;
    navigator.clipboard.writeText(agent.slug);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load agent</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  const primaryModel = agent.modelPrimary || agent.model;

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href="/agents">
        <Button variant="ghost" size="sm" className="-ml-2">
          <ArrowLeft className="h-3.5 w-3.5" /> Agents
        </Button>
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-semibold">{agent.name}</h1>
        <Badge variant={agent.status === 'active' ? 'success' : agent.status === 'paused' ? 'warning' : 'secondary'}>
          {agent.status}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <button onClick={copySlug} className="flex items-center gap-1.5 font-mono text-xs hover:text-foreground transition-colors" title="Copy slug">
          {agent.slug}
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 opacity-40" />}
        </button>
        <span className="text-border">|</span>
        <span className="capitalize">{agent.role}</span>
        <span className="text-border">|</span>
        <span className="font-mono text-xs">{primaryModel}</span>
      </div>

      {agent.description && (
        <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">{agent.description}</p>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Personality */}
            <div className="rounded-md border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/10">
                <h2 className="text-sm font-medium">Personality</h2>
              </div>
              <div className="p-4">
              {agent.personality ? (
                <div className="space-y-2.5">
                  <Row label="Voice" value={agent.personality.voice} />
                  <Row label="Emoji" value={agent.personality.emoji_level} />
                  {agent.personality.quirks && agent.personality.quirks.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground">Quirks</span>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {agent.personality.quirks.map((q, i) => <Badge key={i} variant="secondary">{q}</Badge>)}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Default</p>
              )}
              </div>
            </div>

            {/* Model */}
            <div className="rounded-md border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/10">
                <h2 className="text-sm font-medium">Model</h2>
              </div>
              <div className="p-4">
              <div className="space-y-2.5">
                <Row label="Primary" value={primaryModel} />
                {agent.modelFallbacks.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">Fallbacks</span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {agent.modelFallbacks.map((fb, i) => <Badge key={i} variant="outline">{fb}</Badge>)}
                    </div>
                  </div>
                )}
                <Row label="Created" value={new Date(agent.createdAt).toLocaleDateString()} />
                <Row label="Updated" value={formatRelative(agent.updatedAt)} />
              </div>
              </div>
            </div>

            {/* Channel Bindings */}
            {agent.channels && (
              <div className="rounded-md border border-border overflow-hidden md:col-span-2">
                <div className="px-4 py-3 border-b border-border bg-muted/10">
                  <h2 className="text-sm font-medium">Channel Bindings</h2>
                </div>
                <div className="p-4">
                <pre className="font-mono text-xs text-muted-foreground whitespace-pre-wrap bg-muted rounded-md p-3">
                  {JSON.stringify(agent.channels, null, 2)}
                </pre>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="chat">
          <div className="h-[520px] rounded-md border border-border overflow-hidden">
            <AgentChat agentId={agent.id} agentName={agent.name} compact />
          </div>
        </TabsContent>

        <TabsContent value="memory">
          <MemoryTab agent={agent} />
        </TabsContent>

        <TabsContent value="config">
          <ConfigTab agent={agent} onSaved={(updated) => setAgent((prev) => prev ? { ...prev, ...updated } : prev)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs text-foreground font-mono">{value}</span>
    </div>
  );
}

