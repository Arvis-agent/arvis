import { cn } from '@/lib/utils';

const VARIANTS: Record<string, string> = {
  default: 'border-border text-muted-foreground',
  destructive: 'border-red-500/20 bg-red-500/5 text-red-400',
  warning: 'border-yellow-500/20 bg-yellow-500/5 text-yellow-400',
};

export function Alert({ variant = 'default', className, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'destructive' | 'warning' }) {
  return <div role="alert" className={cn('rounded-md border p-4 text-sm', VARIANTS[variant] || VARIANTS.default, className)} {...props}>{children}</div>;
}

export function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('font-medium', className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-1 text-xs opacity-80', className)} {...props} />;
}
