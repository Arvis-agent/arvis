'use client';

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-3" role="alert">
        <p className="text-sm text-red-400">Something went wrong</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          {error.message?.includes('/') || error.message?.includes('\\')
            ? 'An unexpected error occurred'
            : error.message}
        </p>
        <button onClick={reset} className="text-sm text-primary hover:underline">
          Try again
        </button>
      </div>
    </div>
  );
}
