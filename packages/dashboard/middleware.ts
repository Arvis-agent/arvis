import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Auth middleware — only active when DASHBOARD_PASSWORD is set.
 * No password = open access (homeserver mode).
 * With password = require JWT cookie on all routes except /login.
 */
export function middleware(request: NextRequest) {
  const authEnabled = !!process.env.DASHBOARD_PASSWORD;
  if (!authEnabled) return NextResponse.next();

  const { pathname } = request.nextUrl;

  // Allow login page, API login, and static assets
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('arvis-token')?.value;
  if (!token) {
    // API routes → 401 JSON (don't redirect — breaks fetch() callers)
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Cookie present — full JWT verification runs inside each API route handler
  // via requireAuth() from lib/api-auth.ts (Node.js runtime, async-capable).
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
