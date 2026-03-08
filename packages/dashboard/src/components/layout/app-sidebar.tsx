'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  TrendingUp,
  MessagesSquare,
  FileText,
  Bot,
  MessageSquare,
  Workflow,
  Settings2,
  X,
  Zap,
  ListChecks,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from './sidebar-context';

const NAV_GROUPS = [
  {
    label: 'Monitor',
    items: [
      { href: '/',         label: 'Overview',  icon: Activity },
      { href: '/usage',    label: 'Usage',     icon: TrendingUp },
      { href: '/sessions', label: 'Sessions',  icon: MessagesSquare },
      { href: '/logs',     label: 'Logs',      icon: FileText },
      { href: '/queue',    label: 'Queue',     icon: ListChecks },
    ],
  },
  {
    label: 'Agents',
    items: [
      { href: '/agents',    label: 'Agents',    icon: Bot },
      { href: '/chat',      label: 'Chat',      icon: MessageSquare },
      { href: '/workflows', label: 'Workflows', icon: Workflow },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/skills',   label: 'Skills',   icon: Zap },
      { href: '/settings', label: 'Settings', icon: Settings2 },
    ],
  },
];

function SidebarContent({ onNav }: { onNav?: () => void }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <aside className="flex h-screen w-[220px] flex-col border-r border-border bg-background select-none shrink-0">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <Link href="/" onClick={onNav} className="flex items-center gap-0 no-underline">
          <span className="font-mono font-bold leading-none" style={{ fontSize: 15, letterSpacing: '-0.02em' }}>
            <span className="text-primary">&gt;_&lt;</span>
            <span className="text-foreground"> arvis</span>
          </span>
          <span className="ml-2 text-[10px] text-muted-foreground/50 font-mono">v3</span>
        </Link>
        {onNav && (
          <button
            onClick={onNav}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-[10px] font-medium text-muted-foreground/50 uppercase tracking-widest">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNav}
                    className={cn(
                      'relative flex items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors',
                      active
                        ? 'text-foreground bg-primary/5'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 inset-y-1.5 w-[2px] rounded-r bg-primary" />
                    )}
                    <item.icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : '')} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom status */}
      <div className="border-t border-border h-10 flex items-center px-5 shrink-0">
        <div className="flex w-full items-center justify-between font-mono text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Online
          </span>
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">
            {typeof navigator !== 'undefined' && /Mac|iPhone/.test(navigator.userAgent) ? '⌘K' : 'Ctrl+K'}
          </kbd>
        </div>
      </div>
    </aside>
  );
}

export function AppSidebar() {
  const { open, close } = useSidebar();

  return (
    <>
      {/* Desktop sidebar — always visible on lg+ */}
      <div className="hidden lg:flex">
        <SidebarContent />
      </div>

      {/* Mobile drawer — overlay when open */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
            onClick={close}
          />
          <div className="fixed inset-y-0 left-0 z-50 flex lg:hidden animate-in slide-in-from-left">
            <SidebarContent onNav={close} />
          </div>
        </>
      )}
    </>
  );
}
