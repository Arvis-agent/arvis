'use client';

import { useState } from 'react';
import { Plus, Trash2, Edit2, Eye, EyeOff, Copy, Key, Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from '@/components/ui/toaster';

export interface Variable {
  id: number;
  key: string;
  value: string;
  description: string | null;
  is_secret: number;
  created_at: string;
}

interface VariablesSectionProps {
  variables: Variable[] | null;
  onReload: () => void;
}

export function VariablesSection({ variables, onReload }: VariablesSectionProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Variable | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Variable | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  function toggleReveal(id: number) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function copyValue(variable: Variable) {
    if (variable.is_secret && !revealed.has(variable.id)) {
      toast.error('Reveal the value first to copy it');
      return;
    }
    navigator.clipboard.writeText(variable.value);
    toast.success(`Copied "${variable.key}"`);
  }

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
        <div className="flex items-center gap-2">
          <Key className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-sm font-medium">Variables & Secrets</h2>
          {variables && (
            <span className="text-xs text-muted-foreground">({variables.length})</span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add Variable
        </Button>
      </div>

      {!variables ? (
        <Skeleton className="h-[120px]" />
      ) : variables.length === 0 ? (
        <EmptyState
          icon={<Key className="h-8 w-8" />}
          title="No variables"
          description="Store API keys, webhook URLs, and config values. Agents access them via the get_variable tool — values never leak into prompts."
          action={
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add Variable
            </Button>
          }
        />
      ) : (
        <div className="divide-y divide-border/50">
          {variables.map((v) => (
            <div key={v.id} className="flex items-center gap-3 px-4 py-3">
              {/* Icon */}
              <div className="shrink-0">
                {v.is_secret
                  ? <Lock className="h-3.5 w-3.5 text-amber-500" />
                  : <Unlock className="h-3.5 w-3.5 text-muted-foreground/50" />
                }
              </div>

              {/* Key + description */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-medium text-foreground truncate">{v.key}</span>
                  {v.is_secret ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">secret</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">plain</Badge>
                  )}
                </div>
                {v.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{v.description}</p>
                )}
              </div>

              {/* Value */}
              <div className="shrink-0 max-w-[200px]">
                <span className="text-xs font-mono text-muted-foreground truncate block">
                  {v.is_secret && !revealed.has(v.id) ? '••••••••' : v.value}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {v.is_secret && (
                  <button
                    onClick={() => toggleReveal(v.id)}
                    className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title={revealed.has(v.id) ? 'Hide value' : 'Reveal value'}
                  >
                    {revealed.has(v.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                )}
                <button
                  onClick={() => copyValue(v)}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Copy value"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setEditTarget(v)}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Edit"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setDeleteTarget(v)}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit dialog */}
      {(addOpen || editTarget) && (
        <VariableDialog
          open
          initial={editTarget}
          onClose={() => { setAddOpen(false); setEditTarget(null); }}
          onSaved={onReload}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <DeleteVariableDialog
          variable={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={onReload}
        />
      )}
    </div>
  );
}

// ── Variable Dialog ────────────────────────────────────────────────────────────
function VariableDialog({
  open, initial, onClose, onSaved,
}: {
  open: boolean;
  initial: Variable | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!initial;
  const [key, setKey] = useState(initial?.key ?? '');
  const [value, setValue] = useState(editing ? '' : ''); // Never pre-fill secret values
  const [description, setDescription] = useState(initial?.description ?? '');
  const [isSecret, setIsSecret] = useState(!!initial?.is_secret);
  const [saving, setSaving] = useState(false);
  const [showValue, setShowValue] = useState(!editing);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) { toast.error('Key is required'); return; }
    // For editing: if value is empty, don't update (keep existing)
    if (!editing && !value) { toast.error('Value is required'); return; }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        key: key.trim(),
        description: description.trim() || undefined,
        isSecret,
      };
      // Only send value if provided (for edits, empty = keep existing)
      if (value) {
        body.value = value;
      } else if (!editing) {
        body.value = value;
      }

      const res = await fetch('/api/variables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(editing ? 'Variable updated' : 'Variable created');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={editing ? 'Edit Variable' : 'Add Variable'} className="max-w-[480px]">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="var-key">Key *</Label>
          <Input
            id="var-key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="MY_API_KEY"
            required
            disabled={editing}
            className="font-mono"
          />
          <p className="mt-1 text-xs text-muted-foreground">Letters, numbers, underscores, hyphens, dots</p>
        </div>

        <div>
          <Label htmlFor="var-value">Value *</Label>
          <div className="relative">
            <Input
              id="var-value"
              type={showValue ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={editing ? '(enter new value)' : 'sk-ant-api03-...'}
              required={!editing}
              className="font-mono pr-10"
            />
            <button
              type="button"
              onClick={() => setShowValue(!showValue)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showValue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <div>
          <Label htmlFor="var-desc">Description</Label>
          <Input
            id="var-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this variable is for (optional)"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isSecret}
            onChange={(e) => setIsSecret(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border accent-primary"
          />
          <span className="text-sm text-muted-foreground">Mark as secret (value hidden in UI)</span>
        </label>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Delete Dialog ──────────────────────────────────────────────────────────────
function DeleteVariableDialog({
  variable, onClose, onDeleted,
}: {
  variable: Variable;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function confirm() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/variables?id=${variable.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(`"${variable.key}" deleted`);
      onDeleted();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Delete Variable" className="max-w-sm">
      <p className="text-sm text-muted-foreground mb-5">
        Delete <span className="font-medium font-mono text-foreground">{variable.key}</span>? Agents using this variable will get "not found" errors.
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
