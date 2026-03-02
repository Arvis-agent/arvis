'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toaster';
import { Bot, Crown, GitBranch, Upload, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Agent } from './types';

// ─── Import Agent Dialog ──────────────────────────────────────────────────────

function ImportAgentDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const cfg = JSON.parse(text);
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(`Agent "${data.name}" imported`);
      onImported();
      onClose();
      setText('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid JSON or failed to import');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Import Agent" className="max-w-[540px]">
      <p className="text-xs text-muted-foreground mb-3">
        Paste an agent config JSON. Required fields: <code className="font-mono text-foreground">name</code>, <code className="font-mono text-foreground">slug</code>, <code className="font-mono text-foreground">role</code>, <code className="font-mono text-foreground">model</code>.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Textarea
          className="min-h-[160px] font-mono text-xs"
          placeholder={'{\n  "name": "My Agent",\n  "slug": "my-agent",\n  "role": "assistant",\n  "model": "claude-sonnet-4-6"\n}'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={saving}>{saving ? 'Importing...' : 'Import'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Section Props ────────────────────────────────────────────────────────────

interface OrchestratorSectionProps {
  agents: Agent[] | null;
  conductorId: number | null;
  savingConductor: boolean;
  onSaveConductor: (id: number) => void;
  onReload: () => void;
}

// ─── Orchestrator Section ─────────────────────────────────────────────────────

export function OrchestratorSection({
  agents,
  conductorId,
  savingConductor,
  onSaveConductor,
  onReload,
}: OrchestratorSectionProps) {
  const [importOpen, setImportOpen] = useState(false);

  function exportAgent(agent: Agent) {
    const cfg = { name: agent.name, slug: agent.slug, role: agent.role, model: agent.model };
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${agent.slug}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {/* Default Orchestrator */}
      <div className="rounded-md border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
          <div>
            <h2 className="text-sm font-medium">Default Orchestrator</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              The main agent that handles all incoming messages and coordinates sub-agents
            </p>
          </div>
        </div>

        {!agents ? (
          <div className="p-4 space-y-2">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : agents.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Bot className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No agents yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create an agent first, then set it as the orchestrator</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {agents.filter(a => a.status !== 'archived' && a.role === 'conductor').length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Crown className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No conductor agents found</p>
                <p className="text-xs text-muted-foreground mt-1">Create an agent with role <span className="font-mono">conductor</span> to use as orchestrator</p>
              </div>
            ) : agents.filter(a => a.status !== 'archived' && a.role === 'conductor').map((agent) => {
              const isSelected = agent.id === conductorId;
              const subAgents = agents.filter(a => a.created_by === agent.id && a.status !== 'archived');
              return (
                <div key={agent.id}>
                  <button
                    onClick={() => { if (!isSelected) onSaveConductor(agent.id); }}
                    disabled={savingConductor}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                      isSelected ? 'bg-primary/5' : 'hover:bg-muted/10',
                    )}
                  >
                    <div className={cn(
                      'h-7 w-7 rounded-md border flex items-center justify-center shrink-0 transition-colors',
                      isSelected ? 'border-primary/50 bg-primary/10' : 'border-border',
                    )}>
                      {isSelected
                        ? <Crown className="h-3.5 w-3.5 text-primary" />
                        : <Bot className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn('text-sm font-medium', isSelected && 'text-primary')}>{agent.name}</span>
                        <span className="text-xs text-muted-foreground capitalize">{agent.role}</span>
                        {isSelected && <Badge variant="success" className="text-[10px] px-1.5 py-0">Conductor</Badge>}
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">{agent.model}</span>
                    </div>
                    <div className={cn(
                      'h-4 w-4 rounded-full border-2 shrink-0 transition-colors',
                      isSelected ? 'border-primary bg-primary' : 'border-border',
                    )} />
                  </button>
                  {isSelected && subAgents.length > 0 && (
                    <div className="px-4 py-2 border-t border-border/30 bg-muted/5">
                      <div className="flex items-center gap-1.5 mb-2">
                        <GitBranch className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Sub-agents ({subAgents.length})</span>
                      </div>
                      <div className="space-y-1 pl-3 border-l border-border/50">
                        {subAgents.map(sa => (
                          <div key={sa.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Bot className="h-3 w-3 shrink-0" />
                            <span className="font-medium text-foreground/70">{sa.name}</span>
                            <span className="capitalize">{sa.role}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Agent Configs */}
      <div className="rounded-md border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
          <div>
            <h2 className="text-sm font-medium">Agent Configs</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Import agents from JSON or export existing ones</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5" />Import
          </Button>
        </div>
        {!agents || agents.filter(a => a.status !== 'archived').length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">No agents to export</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {agents.filter(a => a.status !== 'archived').map((agent) => (
              <div key={agent.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10 transition-colors">
                <div className="h-7 w-7 rounded border border-border flex items-center justify-center shrink-0">
                  <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-foreground">{agent.name}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{agent.slug}</span>
                </div>
                <button
                  onClick={() => exportAgent(agent)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent"
                >
                  <Download className="h-3 w-3" />Export
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ImportAgentDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={onReload} />
    </>
  );
}
