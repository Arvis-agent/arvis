import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const { id } = await params;
    const accountId = parseInt(id, 10);
    if (isNaN(accountId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const body = await request.json() as {
      name?: string;
      model?: string;
      priority?: number;
      status?: string;
      base_url?: string | null;
      home_dir?: string | null;
      api_key?: string;
    };

    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.name !== undefined)     { updates.push('name = ?');     values.push(body.name); }
    if (body.model !== undefined)    { updates.push('model = ?');    values.push(body.model); }
    if (body.priority !== undefined) { updates.push('priority = ?'); values.push(body.priority); }
    if (body.status !== undefined)   { updates.push('status = ?');   values.push(body.status); }
    if (body.base_url !== undefined) { updates.push('base_url = ?'); values.push(body.base_url); }
    if (body.home_dir !== undefined) { updates.push('home_dir = ?'); values.push(body.home_dir); }
    if (body.api_key !== undefined)  { updates.push('api_key = ?');  values.push(body.api_key); }

    if (updates.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    values.push(accountId);
    db.run(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`, ...values);

    const updated = db.get('SELECT id, name, type, provider, model, priority, status, base_url, home_dir, rate_limited_until, total_messages FROM accounts WHERE id = ?', accountId);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const { id } = await params;
    const accountId = parseInt(id, 10);
    if (isNaN(accountId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const existing = db.get('SELECT id FROM accounts WHERE id = ?', accountId);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    db.run('DELETE FROM accounts WHERE id = ?', accountId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
