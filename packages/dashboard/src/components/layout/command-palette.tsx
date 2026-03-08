'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  Activity,
  TrendingUp,
  MessagesSquare,
  Bot,
  Workflow,
  FileText,
  Settings2,
  MessageSquare,
  Search,
} from 'lucide-react';

interface Agent {
  id: number;
  slug: string;
  name: string;
  role: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open && agents.length === 0) {
      fetch('/api/agents').then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then((data) => { if (Array.isArray(data)) setAgents(data); }).catch(() => {});
    }
  }, [open, agents.length]);

  const go = useCallback(
    (path: string) => { router.push(path); setOpen(false); },
    [router],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Panel */}
      <div className="fixed left-1/2 top-[18%] w-full max-w-[480px] -translate-x-1/2 px-4">
        <Command
          className="overflow-hidden rounded-lg border border-border bg-background shadow-[0_0_60px_rgba(0,0,0,0.9),0_0_0_1px_rgba(139,92,246,0.1)]"
          label="Command palette"
        >
          {/* Search */}
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              placeholder="Search pages, agents..."
              className="flex h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>

          <Command.List className="max-h-[300px] overflow-y-auto py-2">
            <Command.Empty className="py-10 text-center text-xs text-muted-foreground">
              No results found
            </Command.Empty>

            <CmdGroup label="Pages">
              <CmdItem icon={Activity}       label="Overview"   onSelect={() => go('/')} />
              <CmdItem icon={TrendingUp}    label="Usage"      onSelect={() => go('/usage')} />
              <CmdItem icon={MessagesSquare} label="Sessions"  onSelect={() => go('/sessions')} />
              <CmdItem icon={Bot}           label="Agents"     onSelect={() => go('/agents')} />
              <CmdItem icon={MessageSquare} label="Chat"       onSelect={() => go('/chat')} />
              <CmdItem icon={Workflow}      label="Workflows"  onSelect={() => go('/workflows')} />
              <CmdItem icon={FileText}      label="Logs"       onSelect={() => go('/logs')} />
              <CmdItem icon={Settings2}     label="Settings"   onSelect={() => go('/settings')} />
            </CmdGroup>

            {agents.length > 0 && (
              <CmdGroup label="Agents">
                {agents.map((a) => (
                  <CmdItem
                    key={a.id}
                    icon={Bot}
                    label={a.name}
                    subtitle={a.role}
                    onSelect={() => go(`/agents/${a.slug}`)}
                  />
                ))}
              </CmdGroup>
            )}
          </Command.List>

          {/* Footer */}
          <div className="flex items-center gap-2 border-t border-border px-4 py-2">
            <span className="text-[10px] text-muted-foreground">Navigate</span>
            <Kbd>↑↓</Kbd>
            <Kbd>↵</Kbd>
            <span className="ml-auto text-[10px] text-muted-foreground">Close</span>
            <Kbd>Esc</Kbd>
          </div>
        </Command>
      </div>
    </div>
  );
}

function CmdGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Command.Group>
      <div className="px-3 pb-1 pt-2">
        <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
      </div>
      {children}
    </Command.Group>
  );
}

function CmdItem({
  icon: Icon,
  label,
  subtitle,
  onSelect,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  subtitle?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="mx-2 mb-0.5 flex cursor-pointer items-center gap-3 rounded px-3 py-2.5 text-sm text-muted-foreground transition-colors aria-selected:bg-primary/8 aria-selected:text-foreground"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {subtitle && <span className="text-xs text-muted-foreground/50">{subtitle}</span>}
    </Command.Item>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {children}
    </kbd>
  );
}
