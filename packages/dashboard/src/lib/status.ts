const DEFAULT_DOT = 'bg-muted-foreground/40';
const DEFAULT_TEXT = 'text-muted-foreground';

/** Tailwind dot color classes for all status values (agents, queue jobs, conversations) */
export const STATUS_DOT: Record<string, string> = {
  // Agent statuses
  active:    'bg-emerald-500',
  paused:    'bg-yellow-500',
  archived:  'bg-muted-foreground/40',
  // Queue job statuses
  pending:   'bg-yellow-500',
  running:   'bg-primary animate-pulse',
  completed: 'bg-emerald-500',
  failed:    'bg-red-500',
  // Conversation statuses
  compacted: 'bg-yellow-500',
};

/** Tailwind text color classes for all status values */
export const STATUS_TEXT: Record<string, string> = {
  // Agent statuses
  active:    'text-emerald-400',
  paused:    'text-yellow-400',
  archived:  'text-muted-foreground',
  // Queue job statuses
  pending:   'text-yellow-400',
  running:   'text-primary',
  completed: 'text-emerald-400',
  failed:    'text-red-400',
  // Conversation statuses
  compacted: 'text-yellow-400',
};

/** Safe accessors with fallback for unknown statuses */
export function getStatusDot(status: string): string {
  return STATUS_DOT[status] ?? DEFAULT_DOT;
}
export function getStatusText(status: string): string {
  return STATUS_TEXT[status] ?? DEFAULT_TEXT;
}
