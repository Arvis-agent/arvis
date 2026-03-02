import { NextRequest, NextResponse } from 'next/server';

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

  if (!resendKey) {
    console.log(`[subscribe] No RESEND_API_KEY. Would have subscribed: ${email}`);
    return NextResponse.json({ ok: true });
  }

  // POST /contacts — Resend Contacts API (no audience ID needed)
  const res = await fetch('https://api.resend.com/contacts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, unsubscribed: false }),
  });

  // Already subscribed — treat as success
  if (res.status === 409) {
    return NextResponse.json({ ok: true });
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    const message = (data?.message as string) ?? (data?.name as string) ?? `Resend ${res.status}`;
    console.error('[subscribe] Resend error:', res.status, data);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
