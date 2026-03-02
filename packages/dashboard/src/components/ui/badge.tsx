import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive';
}

const VARIANTS: Record<string, string> = {
  default: 'bg-muted text-foreground border-border',
  secondary: 'bg-transparent text-muted-foreground border-border',
  outline: 'bg-transparent text-muted-foreground border-border',
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  destructive: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export function Badge({ variant = 'default', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
