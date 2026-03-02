import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/subscribe
 *
 * Adds an email to the newsletter.
 *
 * Integration options:
 *  - Set RESEND_API_KEY + RESEND_AUDIENCE_ID → uses Resend Contacts API
 *  - No env vars → logs to console (dev mode)
 *
 * To enable Resend:
 *   1. Create account at resend.com (free tier: 3k emails/mo)
 *   2. Create an audience in the Resend dashboard
 *   3. Set RESEND_API_KEY and RESEND_AUDIENCE_ID in .env
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = (body as Record<string, unknown>)?.email;
  if (typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;

  if (resendKey && audienceId) {
    // Real Resend integration
    const res = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        unsubscribed: false,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('[subscribe] Resend error:', data);
      return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  // No API key configured — log and return success (dev/no-op mode)
  console.log(`[subscribe] New subscriber (no Resend key configured): ${email}`);
  return NextResponse.json({ ok: true });
}
