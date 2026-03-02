import { AppSidebar } from '@/components/layout/app-sidebar';
import { SiteHeader } from '@/components/layout/site-header';
import { StatusBar } from '@/components/layout/status-bar';
import { CommandPalette } from '@/components/layout/command-palette';
import { SidebarProvider } from '@/components/layout/sidebar-context';
import { Toaster } from '@/components/ui/toaster';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <SiteHeader />
          <main className="flex-1 overflow-y-auto flex flex-col min-h-0">
            <div className="mx-auto max-w-5xl w-full px-4 sm:px-6 py-6 page-enter flex flex-col flex-1 min-h-0">
              {children}
            </div>
          </main>
          <StatusBar />
        </div>
        <CommandPalette />
        <Toaster />
      </div>
    </SidebarProvider>
  );
}
