import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const accounts = db.all(
      'SELECT id, name, type, provider, model, priority, status, base_url, home_dir, rate_limited_until, total_messages FROM accounts ORDER BY priority ASC',
    );
    return NextResponse.json({ accounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authErr = await requireAuth(req); if (authErr) return authErr;
  try {
    const body = await req.json() as {
      name: string;
      type: 'api_key' | 'cli_subscription';
      provider: string;
      model: string;
      api_key?: string;
      home_dir?: string;
      base_url?: string;
      priority?: number;
    };

    if (!body.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (!body.provider?.trim()) return NextResponse.json({ error: 'Provider is required' }, { status: 400 });
    if (!body.model?.trim()) return NextResponse.json({ error: 'Model is required' }, { status: 400 });
    if (body.type === 'api_key' && !body.api_key?.trim()) {
      return NextResponse.json({ error: 'API key is required for api_key type' }, { status: 400 });
    }

    db.run(
      `INSERT INTO accounts (name, type, provider, model, api_key, home_dir, base_url, priority, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      body.name.trim(),
      body.type,
      body.provider.trim(),
      body.model.trim(),
      body.api_key?.trim() || null,
      body.home_dir?.trim() || null,
      body.base_url?.trim() || null,
      body.priority ?? 100,
    );

    const created = db.get('SELECT id, name, type, provider, model, priority, status, base_url FROM accounts WHERE name = ?', body.name.trim());
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    const status = message.includes('UNIQUE') ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
