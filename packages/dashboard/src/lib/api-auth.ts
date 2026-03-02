import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { verifyToken, isAuthEnabled, COOKIE_NAME } from './auth';

// ─── Auth guard ───────────────────────────────────────────────────────────────
/**
 * Call at the top of every protected API route handler.
 * Returns a 401 NextResponse if auth fails, otherwise null.
 *
 * Safe to call even when auth is disabled — returns null immediately.
 *
 * Accepts auth in two forms (checked in order):
 *  1. JWT cookie (arvis-token) — set by browser login
 *  2. Bearer token or X-API-Key header — set by DASHBOARD_API_KEY env var
 *     Useful for VPS programmatic access / external integrations.
 *     Generate a strong random key and set it in .env:
 *       DASHBOARD_API_KEY=$(openssl rand -hex 32)
 *     Then pass it as:
 *       Authorization: Bearer <key>
 *       X-API-Key: <key>
 */
export async function requireAuth(request: Request): Promise<NextResponse | null> {
  if (!isAuthEnabled()) return null;

  // ── Method 1: JWT cookie (browser sessions) ───────────────────────────────
  const raw = request.headers.get('cookie') ?? '';
  const match = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  const cookieToken = match?.[1];
  if (cookieToken && await verifyToken(cookieToken)) return null;

  // ── Method 2: API key (programmatic / VPS access) ─────────────────────────
  const configuredApiKey = process.env.DASHBOARD_API_KEY;
  if (configuredApiKey) {
    // Check Authorization: Bearer <key>
    const authHeader = request.headers.get('authorization') ?? '';
    const bearerKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    // Check X-API-Key: <key>
    const headerKey = request.headers.get('x-api-key');
    const providedKey = (bearerKey ?? headerKey ?? '').trim();

    if (providedKey) {
      // Timing-safe comparison — prevents brute-force via timing oracle
      const pad = (s: string) => s.padEnd(128, '\0');
      const a = Buffer.from(pad(providedKey));
      const b = Buffer.from(pad(configuredApiKey));
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return null;
    }
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
