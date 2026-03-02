'use client';

import { useEffect, useState, useCallback, Fragment } from 'react';
import { Zap, ChevronDown, ChevronRight, Plus, Trash2, RefreshCw, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/format';

interface Skill {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  file_path: string;
  trigger_patterns: string | null;
  category: string | null;
  enabled: number;
  version: string;
  author: string | null;
  install_count: number;
  created_at: string;
  content?: string | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  coding:      'bg-blue-500/10 text-blue-400 border-blue-500/20',
  writing:     'bg-purple-500/10 text-purple-400 border-purple-500/20',
  analysis:    'bg-amber-500/10 text-amber-400 border-amber-500/20',
  research:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  productivity:'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
};

function categoryClass(cat: string | null) {
  if (!cat) return 'bg-muted text-muted-foreground border-border';
  return CATEGORY_COLORS[cat.toLowerCase()] ?? 'bg-muted text-muted-foreground border-border';
}

function parseTriggerPatterns(raw: string | null): { keywords: string[]; patterns: string[] } {
  if (!raw) return { keywords: [], patterns: [] };
  try {
    const p = JSON.parse(raw);
    return { keywords: p.keywords ?? [], patterns: p.patterns ?? [] };
  } catch { return { keywords: [], patterns: [] }; }
}

// ── Import Skill Dialog ────────────────────────────────────────────────────────
function ImportDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!open) setContent(''); }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) { toast.error('Paste skill markdown first'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Import failed'); return; }
      toast.success(`Skill "${data.slug}" imported`);
      onImported();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Import Skill">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-muted-foreground -mt-1">Paste a skill markdown file with YAML frontmatter (slug, name, triggers).</p>
        <div>
          <Label htmlFor="skill-content">Skill Markdown</Label>
          <Textarea
            id="skill-content"
            placeholder={`---\nslug: my-skill\nname: My Skill\ndescription: What this skill does\ncategory: coding\ntriggers:\n  - keywords: [python, code]\n---\n\n# My Skill\n\nInstructions for the agent...`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="mt-1.5 font-mono text-xs min-h-[260px]"
            required
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Importing…' : 'Import'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Import from URL Dialog ─────────────────────────────────────────────────────
function ImportUrlDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!open) setUrl(''); }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) { toast.error('Enter a URL'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/skills/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Import failed'); return; }
      toast.success(`Skill "${data.slug}" imported`);
      onImported();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Import Skill from URL">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-muted-foreground -mt-1">
          Paste a URL to a raw <code>.md</code> skill file (e.g. GitHub raw, Gist, any HTTPS URL).
        </p>
        <div>
          <Label htmlFor="skill-url">Skill URL</Label>
          <Input
            id="skill-url"
            type="url"
            placeholder="https://raw.githubusercontent.com/user/repo/main/skills/my-skill.md"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="mt-1.5 font-mono text-xs"
            required
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Fetching…' : 'Import from URL'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Expanded Skill Detail ──────────────────────────────────────────────────────
function SkillDetail({ skill, onRefresh }: { skill: Skill; onRefresh: () => void }) {
  const [triggers, setTriggers] = useState(() => {
    const p = parseTriggerPatterns(skill.trigger_patterns);
    return {
      keywords: p.keywords.join(', '),
      patterns: p.patterns.join(', '),
    };
  });
  const [content, setContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setLoadingContent(true);
    fetch(`/api/skills?id=${skill.id}&content=true`)
      .then(r => r.json())
      .then((d: Skill & { content?: string | null }) => setContent(d.content ?? null))
      .catch(() => setContent(null))
      .finally(() => setLoadingContent(false));
  }, [skill.id]);

  async function saveTriggers() {
    setSaving(true);
    try {
      const keywords = triggers.keywords.split(',').map(s => s.trim()).filter(Boolean);
      const patterns = triggers.patterns.split(',').map(s => s.trim()).filter(Boolean);
      const res = await fetch('/api/skills', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: skill.id, trigger_patterns: JSON.stringify({ keywords, patterns }) }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error ?? 'Save failed'); return; }
      toast.success('Triggers saved');
      onRefresh();
    } finally { setSaving(false); }
  }

  async function deleteSkill() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/skills?id=${skill.id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); toast.error(d.error ?? 'Delete failed'); return; }
      toast.success('Skill deleted');
      onRefresh();
    } finally { setDeleting(false); setConfirmDelete(false); }
  }

  const parsed = parseTriggerPatterns(skill.trigger_patterns);

  return (
    <div className="border-b border-border/50 bg-muted/5 px-4 py-4 space-y-4">
      {/* Description */}
      {skill.description && (
        <p className="text-xs text-muted-foreground">{skill.description}</p>
      )}

      {/* Trigger editor */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Trigger Patterns</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs" htmlFor={`kw-${skill.id}`}>Keywords (comma-separated)</Label>
            <Input
              id={`kw-${skill.id}`}
              className="mt-1 h-7 text-xs font-mono"
              value={triggers.keywords}
              onChange={e => setTriggers(t => ({ ...t, keywords: e.target.value }))}
              placeholder="python, code, script"
            />
          </div>
          <div>
            <Label className="text-xs" htmlFor={`pt-${skill.id}`}>Regex Patterns (comma-separated)</Label>
            <Input
              id={`pt-${skill.id}`}
              className="mt-1 h-7 text-xs font-mono"
              value={triggers.patterns}
              onChange={e => setTriggers(t => ({ ...t, patterns: e.target.value }))}
              placeholder=".*debug.*"
            />
          </div>
        </div>
        {(parsed.keywords.length > 0 || parsed.patterns.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {parsed.keywords.map(k => (
              <span key={k} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary border border-primary/20">{k}</span>
            ))}
            {parsed.patterns.map(p => (
              <span key={p} className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400 border border-amber-500/20 font-mono">{p}</span>
            ))}
          </div>
        )}
        <Button size="sm" variant="outline" onClick={saveTriggers} disabled={saving} className="h-7 text-xs">
          {saving ? 'Saving…' : 'Save Triggers'}
        </Button>
      </div>

      {/* File path */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">File</p>
        <p className="font-mono text-[10px] text-muted-foreground/60 break-all">{skill.file_path}</p>
      </div>

      {/* Content preview */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Content</p>
        {loadingContent ? (
          <Skeleton className="h-[80px]" />
        ) : content ? (
          <pre className="whitespace-pre-wrap font-mono text-[10px] text-muted-foreground/70 bg-muted rounded p-3 max-h-[180px] overflow-y-auto leading-relaxed">
            {content}
          </pre>
        ) : (
          <p className="text-xs text-muted-foreground/50 italic">File not found</p>
        )}
      </div>

      {/* Delete */}
      <div className="flex items-center gap-2 pt-1">
        {confirmDelete ? (
          <>
            <span className="text-xs text-red-400">Delete this skill?</span>
            <Button size="sm" variant="outline" className="h-6 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={deleteSkill} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Confirm'}
            </Button>
            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </>
        ) : (
          <Button size="sm" variant="outline" className="h-6 text-xs border-red-500/20 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/30" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrlOpen, setImportUrlOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/skills');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSkills(await res.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load skills');
      setSkills([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function toggleEnabled(skill: Skill) {
    const next = skill.enabled ? 0 : 1;
    try {
      const res = await fetch('/api/skills', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: skill.id, enabled: next }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error ?? 'Failed'); return; }
      setSkills(prev => prev?.map(s => s.id === skill.id ? { ...s, enabled: next } : s) ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  const categories = Array.from(new Set(skills?.map(s => s.category).filter(Boolean) as string[])).sort();

  const filtered = skills?.filter(s => {
    const q = search.toLowerCase();
    if (q && !s.name.toLowerCase().includes(q) && !s.slug.toLowerCase().includes(q) && !(s.description?.toLowerCase().includes(q))) return false;
    if (categoryFilter && s.category !== categoryFilter) return false;
    return true;
  });

  const totalTriggers = (s: Skill) => {
    const p = parseTriggerPatterns(s.trigger_patterns);
    return p.keywords.length + p.patterns.length;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Skills</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {skills ? `${skills.length} skill${skills.length !== 1 ? 's' : ''} loaded` : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          </button>
          <Button size="sm" variant="outline" onClick={() => setImportUrlOpen(true)}>
            Import from URL
          </Button>
          <Button size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5 mr-1.5" /> Import
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Input
            placeholder="Search skills…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-sm pl-3"
          />
        </div>
        {categories.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCategoryFilter('')}
              className={cn(
                'rounded px-3 py-1.5 text-xs transition-colors capitalize',
                !categoryFilter
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent',
              )}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat === categoryFilter ? '' : cat)}
                className={cn(
                  'rounded px-3 py-1.5 text-xs transition-colors capitalize',
                  categoryFilter === cat
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent',
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      {!skills ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[52px]" />)}
        </div>
      ) : filtered?.length === 0 ? (
        <EmptyState
          icon={<Zap className="h-8 w-8" />}
          title="No skills"
          description={search || categoryFilter ? 'No skills match your filters' : 'Import a skill markdown file to get started'}
          action={!search && !categoryFilter ? (
            <Button size="sm" onClick={() => setImportOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Import Skill
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[540px]">
              {/* Header row */}
              <div className="grid grid-cols-[20px_1fr_100px_80px_72px_52px] items-center px-4 py-2.5 bg-muted/20 border-b border-border gap-3">
                <span />
                <ColHeader>Name</ColHeader>
                <ColHeader>Category</ColHeader>
                <ColHeader>Triggers</ColHeader>
                <ColHeader>Added</ColHeader>
                <ColHeader>Active</ColHeader>
              </div>
              {filtered?.map(skill => {
                const expanded = expandedId === skill.id;
                const trigCount = totalTriggers(skill);

                return (
                  <Fragment key={skill.id}>
                    <div
                      className={cn(
                        'grid grid-cols-[20px_1fr_100px_80px_72px_52px] items-center px-4 py-2.5 border-b border-border/50 cursor-pointer hover:bg-muted/10 transition-colors gap-3',
                        expanded && 'bg-muted/10',
                        !skill.enabled && 'opacity-50',
                      )}
                      onClick={() => setExpandedId(expanded ? null : skill.id)}
                    >
                      <span className="text-muted-foreground/50">
                        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </span>

                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{skill.name}</p>
                        <p className="text-[10px] font-mono text-muted-foreground/50">{skill.slug}</p>
                      </div>

                      <span>
                        {skill.category ? (
                          <Badge className={cn('text-[10px] border capitalize', categoryClass(skill.category))}>
                            {skill.category}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </span>

                      <span className="font-mono text-xs text-muted-foreground/60 tabular-nums">
                        {trigCount > 0 ? trigCount : <span className="text-muted-foreground/30">none</span>}
                      </span>

                      <span className="font-mono text-xs text-muted-foreground/60 tabular-nums">
                        {formatRelative(skill.created_at)}
                      </span>

                      {/* Toggle */}
                      <div className="flex justify-end" onClick={e => { e.stopPropagation(); toggleEnabled(skill); }}>
                        <button
                          className={cn(
                            'relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                            skill.enabled
                              ? 'border-primary bg-primary'
                              : 'border-muted-foreground/20 bg-muted',
                          )}
                          role="switch"
                          aria-checked={!!skill.enabled}
                        >
                          <span
                            className={cn(
                              'pointer-events-none block h-2.5 w-2.5 rounded-full bg-white shadow transition-transform',
                              skill.enabled ? 'translate-x-3' : 'translate-x-0',
                            )}
                          />
                        </button>
                      </div>
                    </div>

                    {expanded && (
                      <SkillDetail skill={skill} onRefresh={load} />
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Import dialogs */}
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />
      <ImportUrlDialog open={importUrlOpen} onClose={() => setImportUrlOpen(false)} onImported={load} />
    </div>
  );
}

function ColHeader({ children }: { children?: React.ReactNode }) {
  return (
    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{children}</span>
  );
}
