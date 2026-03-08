import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <p className="font-pixel text-5xl text-muted-foreground/30">404</p>
        <p className="text-sm text-muted-foreground">Page not found</p>
        <Link href="/" className="inline-block mt-4 text-sm text-primary hover:underline">
          Back to overview
        </Link>
      </div>
    </div>
  );
}
