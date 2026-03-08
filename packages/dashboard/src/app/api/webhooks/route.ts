import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const webhooks = db.all<Record<string, unknown>>(`
      SELECT w.*, a.name as agent_name, a.slug as agent_slug
      FROM webhooks w
      LEFT JOIN agents a ON a.id = w.agent_id
      ORDER BY w.enabled DESC, w.created_at DESC
    `);
    // Mask secrets on GET — only show last 4 chars
    return NextResponse.json(webhooks.map((w) => ({
      ...w,
      secret: typeof w.secret === 'string' && w.secret.length > 4
        ? `${'•'.repeat(Math.min(w.secret.length - 4, 20))}${w.secret.slice(-4)}`
        : '••••',
    })));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const body = await request.json() as Record<string, unknown>;

    if (typeof body.path !== 'string' || !body.path.trim())
      return NextResponse.json({ error: 'path is required' }, { status: 400 });
    if (typeof body.agent_id !== 'number')
      return NextResponse.json({ error: 'agent_id (number) is required' }, { status: 400 });
    if (typeof body.prompt_template !== 'string' || !body.prompt_template.trim())
      return NextResponse.json({ error: 'prompt_template is required' }, { status: 400 });

    // Normalize path: must start with /
    let webhookPath = body.path.trim();
    if (!webhookPath.startsWith('/')) webhookPath = '/' + webhookPath;

    // Auto-generate secret if not provided
    const secret = typeof body.secret === 'string' && body.secret.trim()
      ? body.secret.trim()
      : crypto.randomBytes(24).toString('hex');

    const result = db.run(
      `INSERT INTO webhooks (path, agent_id, prompt_template, channel_id, platform, secret, enabled)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      webhookPath,
      body.agent_id,
      body.prompt_template.trim(),
      typeof body.channel_id === 'string' ? body.channel_id || null : null,
      typeof body.platform === 'string' ? body.platform || null : null,
      secret,
    );

    const created = db.get(`
      SELECT w.*, a.name as agent_name FROM webhooks w
      LEFT JOIN agents a ON a.id = w.agent_id WHERE w.id = ?
    `, Number(result.lastInsertRowid));

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    const status = message.includes('UNIQUE') ? 409 : 500;
    return NextResponse.json({ error: status === 409 ? 'Path already exists' : message }, { status });
  }
}

export async function DELETE(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get('id') || '', 10);
    if (isNaN(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const exists = db.get('SELECT id FROM webhooks WHERE id = ?', id);
    if (!exists) return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });

    db.run('DELETE FROM webhooks WHERE id = ?', id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = body.id;
    if (typeof id !== 'number') return NextResponse.json({ error: 'id (number) is required' }, { status: 400 });

    const updates: string[] = [];
    const values: unknown[] = [];

    if (typeof body.enabled === 'boolean') { updates.push('enabled = ?'); values.push(body.enabled ? 1 : 0); }
    if (typeof body.prompt_template === 'string') { updates.push('prompt_template = ?'); values.push(body.prompt_template.trim()); }
    if (typeof body.agent_id === 'number') { updates.push('agent_id = ?'); values.push(body.agent_id); }

    if (!updates.length) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

    db.run(`UPDATE webhooks SET ${updates.join(', ')} WHERE id = ?`, ...values, id);
    return NextResponse.json(db.get(`
      SELECT w.*, a.name as agent_name FROM webhooks w
      LEFT JOIN agents a ON a.id = w.agent_id WHERE w.id = ?
    `, id));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
