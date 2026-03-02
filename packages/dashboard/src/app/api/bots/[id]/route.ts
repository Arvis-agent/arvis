import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function maskToken(token: string): string {
  if (token.length <= 8) return '••••••••';
  return '•'.repeat(Math.min(token.length - 6, 24)) + token.slice(-6);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const { id } = await params;
    const bot = db.get<{
      id: number; name: string; platform: string; token: string; extra_config: string | null;
      agent_id: number | null; agent_name: string | null; enabled: number; status: string;
      last_error: string | null; created_at: string;
    }>(`
      SELECT b.*, a.name as agent_name
      FROM bot_instances b
      LEFT JOIN agents a ON a.id = b.agent_id
      WHERE b.id = ?
    `, Number(id));
    if (!bot) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({
      ...bot,
      token: maskToken(bot.token),
      extra_config: bot.extra_config ? JSON.parse(bot.extra_config) : null,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const { id } = await params;
    const botId = Number(id);
    const body = await request.json() as Record<string, unknown>;

    const exists = db.get<{ id: number }>('SELECT id FROM bot_instances WHERE id = ?', botId);
    if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updates: string[] = [];
    const values: unknown[] = [];

    if (typeof body.name === 'string' && body.name.trim()) {
      updates.push('name = ?'); values.push(body.name.trim());
    }
    if (typeof body.token === 'string' && body.token.trim()) {
      updates.push('token = ?'); values.push(body.token.trim());
    }
    if (typeof body.enabled === 'boolean') {
      updates.push('enabled = ?'); values.push(body.enabled ? 1 : 0);
    }
    // agent_id can be null (unassign) or a number
    if ('agent_id' in body) {
      updates.push('agent_id = ?');
      values.push(typeof body.agent_id === 'number' ? body.agent_id : null);
    }
    if (body.extra_config !== undefined) {
      updates.push('extra_config = ?');
      values.push(body.extra_config && typeof body.extra_config === 'object'
        ? JSON.stringify(body.extra_config) : null);
    }

    if (!updates.length) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

    db.run(`UPDATE bot_instances SET ${updates.join(', ')} WHERE id = ?`, ...values, botId);

    const updated = db.get<{
      id: number; name: string; platform: string; token: string; extra_config: string | null;
      agent_id: number | null; agent_name: string | null; enabled: number; status: string;
      last_error: string | null; created_at: string;
    }>(`
      SELECT b.*, a.name as agent_name
      FROM bot_instances b
      LEFT JOIN agents a ON a.id = b.agent_id
      WHERE b.id = ?
    `, botId);
    return NextResponse.json({
      ...updated,
      token: maskToken((updated as { token: string }).token),
      extra_config: (updated as { extra_config: string | null }).extra_config
        ? JSON.parse((updated as { extra_config: string }).extra_config) : null,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const { id } = await params;
    const botId = Number(id);
    const exists = db.get<{ id: number }>('SELECT id FROM bot_instances WHERE id = ?', botId);
    if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    db.run('DELETE FROM bot_instances WHERE id = ?', botId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}
