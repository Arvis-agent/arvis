'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { LogOut, RefreshCw, Search, ChevronRight, Menu } from 'lucide-react';
import { useSidebar } from './sidebar-context';

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Overview',
  '/usage': 'Usage',
  '/sessions': 'Sessions',
  '/agents': 'Agents',
  '/chat': 'Chat',
  '/workflows': 'Workflows',
  '/logs': 'Logs',
  '/settings': 'Settings',
};

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { toggle } = useSidebar();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const segments = pathname.split('/').filter(Boolean);
  const pageTitle =
    ROUTE_TITLES[pathname] ||
    ROUTE_TITLES[`/${segments[0]}`] ||
    segments[segments.length - 1] ||
    'Overview';

  function openCmdK() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 sm:px-6 bg-background">
      {/* Left: mobile menu + breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile hamburger */}
        <button
          onClick={toggle}
          className="lg:hidden flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm min-w-0">
          <span className="font-pixel text-xs tracking-widest text-muted-foreground hidden sm:inline">ARVIS</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 hidden sm:inline" />
          <span className="text-foreground font-medium truncate">{pageTitle}</span>
          {segments.length > 1 && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
              <span className="text-primary font-mono text-xs truncate max-w-[100px]">
                {segments[segments.length - 1]}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Right: search + actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={openCmdK}
          className="hidden sm:flex items-center gap-2 rounded border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground hover:border-border hover:text-foreground hover:bg-muted/50 transition-colors min-w-[160px]"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="ml-auto rounded border border-border/50 bg-background px-1.5 py-0.5 font-mono text-[10px]">
            {typeof navigator !== 'undefined' && /Mac|iPhone/.test(navigator.userAgent) ? '⌘K' : 'Ctrl+K'}
          </kbd>
        </button>

        {/* Mobile search icon only */}
        <button
          onClick={openCmdK}
          className="sm:hidden flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Search"
        >
          <Search className="h-3.5 w-3.5" />
        </button>

        <button
          className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          onClick={() => {
            if (isRefreshing) return;
            setIsRefreshing(true);
            router.refresh();
            setTimeout(() => setIsRefreshing(false), 1000);
          }}
          title="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 transition-transform ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded hover:bg-accent transition-colors">
            <div className="h-6 w-6 rounded-full border border-primary/30 bg-primary/10 flex items-center justify-center">
              <span className="font-pixel text-[10px] text-primary">A</span>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                document.cookie = 'arvis-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
                router.push('/login');
              }}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
