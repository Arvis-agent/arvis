import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_PLATFORMS = ['discord', 'telegram', 'slack', 'whatsapp', 'matrix', 'sms', 'email'] as const;

function maskToken(token: string): string {
  if (token.length <= 8) return '••••••••';
  return '•'.repeat(Math.min(token.length - 6, 24)) + token.slice(-6);
}

export async function GET(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const bots = db.all<{
      id: number; name: string; platform: string; token: string; extra_config: string | null;
      agent_id: number | null; agent_name: string | null; enabled: number; status: string; last_error: string | null; created_at: string;
    }>(`
      SELECT b.*, a.name as agent_name
      FROM bot_instances b
      LEFT JOIN agents a ON a.id = b.agent_id
      ORDER BY b.created_at DESC
    `);
    return NextResponse.json(bots.map((b) => ({
      ...b,
      token: maskToken(b.token),          // never send raw token to frontend
      extra_config: b.extra_config ? JSON.parse(b.extra_config) : null,
    })));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const body = await request.json() as Record<string, unknown>;

    if (typeof body.name !== 'string' || !body.name.trim())
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    if (!VALID_PLATFORMS.includes(body.platform as typeof VALID_PLATFORMS[number]))
      return NextResponse.json({ error: `platform must be one of: ${VALID_PLATFORMS.join(', ')}` }, { status: 400 });
    if (typeof body.token !== 'string' || !body.token.trim())
      return NextResponse.json({ error: 'token is required' }, { status: 400 });

    const extra = body.extra_config && typeof body.extra_config === 'object'
      ? JSON.stringify(body.extra_config) : null;
    const agentId = typeof body.agent_id === 'number' ? body.agent_id : null;

    const result = db.run(
      `INSERT INTO bot_instances (name, platform, token, extra_config, agent_id, enabled)
       VALUES (?, ?, ?, ?, ?, 1)`,
      body.name.trim(),
      body.platform,
      body.token.trim(),
      extra,
      agentId,
    );

    const created = db.get<{
      id: number; name: string; platform: string; token: string; extra_config: string | null;
      agent_id: number | null; enabled: number; status: string; last_error: string | null; created_at: string;
    }>('SELECT * FROM bot_instances WHERE id = ?', Number(result.lastInsertRowid));
    if (!created) return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
    return NextResponse.json({
      ...created,
      token: maskToken(created.token),
      extra_config: created.extra_config ? JSON.parse(created.extra_config) : null,
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}
