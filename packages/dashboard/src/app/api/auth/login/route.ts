import { NextResponse } from 'next/server';
import { verifyPassword, createToken, COOKIE_NAME } from '@/lib/auth';

export const runtime = 'nodejs';

// ── In-memory brute-force guard ───────────────────────────────────────────────
// Resets on server restart — intentional for a self-hosted single-user tool.
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS    = 15 * 60 * 1000; // 15 minutes

function getIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown';
}

function checkRateLimit(ip: string): { blocked: boolean; remaining: number } {
  const now  = Date.now();
  const rec  = attempts.get(ip);

  if (rec && now < rec.resetAt) {
    if (rec.count >= MAX_ATTEMPTS) return { blocked: true, remaining: 0 };
    return { blocked: false, remaining: MAX_ATTEMPTS - rec.count };
  }

  // Window expired or first attempt — reset
  attempts.set(ip, { count: 0, resetAt: now + WINDOW_MS });
  return { blocked: false, remaining: MAX_ATTEMPTS };
}

function recordAttempt(ip: string) {
  const rec = attempts.get(ip);
  if (rec) rec.count++;
}

function clearAttempts(ip: string) {
  attempts.delete(ip);
}

// ── Route ─────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const ip = getIp(request);
  const { blocked } = checkRateLimit(ip);

  if (blocked) {
    return NextResponse.json(
      { error: 'Too many failed attempts. Try again in 15 minutes.' },
      { status: 429 },
    );
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body.password !== 'string' || !body.password) {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 });
  }

  if (!verifyPassword(body.password)) {
    recordAttempt(ip);
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  // Success — clear the counter and issue cookie
  clearAttempts(ip);
  const token = await createToken();
  const response = NextResponse.json({ ok: true });

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24h
    path: '/',
  });

  return response;
}
