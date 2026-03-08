import { SignJWT, jwtVerify } from 'jose';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Auth is DORMANT by default.
 * Only activates when DASHBOARD_PASSWORD env var is set.
 * - Homeserver: no password → no auth → open access on localhost
 * - VPS: set DASHBOARD_PASSWORD → login gate activates
 */

export function isAuthEnabled(): boolean {
  return !!process.env.DASHBOARD_PASSWORD;
}

function getJwtSecret(): Uint8Array {
  // Try env var first
  if (process.env.JWT_SECRET) {
    return new TextEncoder().encode(process.env.JWT_SECRET);
  }

  // Auto-generate and persist to data dir
  const dataDir = process.env.ARVIS_DATA_DIR || './data';
  const secretPath = path.join(dataDir, '.jwt-secret');

  try {
    const existing = fs.readFileSync(secretPath, 'utf-8').trim();
    if (existing) return new TextEncoder().encode(existing);
  } catch {
    // File doesn't exist yet
  }

  const secret = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(secretPath, secret, { mode: 0o600 });
  return new TextEncoder().encode(secret);
}

const JWT_SECRET = getJwtSecret();
const COOKIE_NAME = 'arvis-token';

/**
 * PBKDF2 with 120k iterations + instance-specific salt derived from JWT secret.
 * ~100x harder to brute-force than plain SHA-256.
 * Private — only used internally by verifyPassword.
 */
function hashPassword(password: string): string {
  const salt = Buffer.from(JWT_SECRET).slice(0, 32);
  return crypto.pbkdf2Sync(password, salt, 120_000, 32, 'sha256').toString('hex');
}

// Cache the expected password hash — derived once, not on every login attempt
let cachedExpectedHash: Buffer | null = null;
let cachedPasswordSource: string | undefined;

export function verifyPassword(input: string): boolean {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return true;
  // Re-derive only if password env var changed (hot reload)
  if (!cachedExpectedHash || cachedPasswordSource !== expected) {
    cachedExpectedHash = Buffer.from(hashPassword(expected));
    cachedPasswordSource = expected;
  }
  // Constant-time comparison prevents timing attacks
  const a = Buffer.from(hashPassword(input));
  return a.length === cachedExpectedHash.length && crypto.timingSafeEqual(a, cachedExpectedHash);
}

export async function createToken(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

export { COOKIE_NAME };
