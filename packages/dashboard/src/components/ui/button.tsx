import * as React from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline' | 'primary';
  size?: 'default' | 'sm' | 'icon';
}

const VARIANTS: Record<string, string> = {
  default: 'bg-muted text-foreground border border-border hover:bg-accent',
  ghost: 'text-muted-foreground hover:text-foreground hover:bg-muted',
  outline: 'bg-transparent text-muted-foreground border border-border hover:bg-muted hover:text-foreground',
  primary: 'bg-[#8B5CF6] text-white font-medium hover:bg-[#7c4dff]',
};

const SIZES: Record<string, string> = {
  default: 'h-9 px-4 text-sm',
  sm: 'h-8 px-3 text-xs',
  icon: 'h-9 w-9 p-0 flex items-center justify-center',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export { Button };
export type { ButtonProps };
