import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const row = db.get<{ value: string }>(
      "SELECT value FROM config WHERE key = 'conductor_agent_id'",
    );
    return NextResponse.json({
      conductorAgentId: row ? Number(row.value) : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const body = await request.json() as { conductorAgentId: number | null };

    if (body.conductorAgentId === null) {
      db.run("DELETE FROM config WHERE key = 'conductor_agent_id'");
    } else {
      const id = Number(body.conductorAgentId);
      if (isNaN(id)) return NextResponse.json({ error: 'Invalid agent id' }, { status: 400 });

      const agent = db.get<{ id: number }>('SELECT id FROM agents WHERE id = ?', id);
      if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

      db.run(
        "INSERT OR REPLACE INTO config (key, value, updated_at) VALUES ('conductor_agent_id', ?, datetime('now'))",
        String(id),
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
