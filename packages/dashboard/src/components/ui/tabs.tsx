'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

const TabsContext = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
} | null>(null);

function useTabs() {
  const c = React.useContext(TabsContext);
  if (!c) throw new Error('Tabs context required');
  return c;
}

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue: string;
  value?: string;
  onValueChange?: (v: string) => void;
}

function Tabs({ defaultValue, value: cv, onValueChange, className, children, ...props }: TabsProps) {
  const [iv, setIv] = React.useState(defaultValue);
  return (
    <TabsContext.Provider value={{ value: cv ?? iv, onValueChange: onValueChange ?? setIv }}>
      <div className={className} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center gap-0 border-b border-border', className)}
      role="tablist"
      {...props}
    />
  );
}

function TabsTrigger({
  value,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const { value: sel, onValueChange } = useTabs();
  const active = sel === value;
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => onValueChange(value)}
      className={cn(
        'px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px cursor-pointer',
        active
          ? 'text-foreground border-primary font-medium'
          : 'text-muted-foreground border-transparent hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  value,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const { value: sel } = useTabs();
  if (sel !== value) return null;
  return (
    <div role="tabpanel" className={cn('mt-6', className)} {...props}>
      {children}
    </div>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
