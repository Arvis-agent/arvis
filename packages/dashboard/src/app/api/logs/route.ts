import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const { searchParams } = new URL(request.url);
    const offset  = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));
    const limit   = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '50', 10)), 200);
    const status  = searchParams.get('status');
    const agentId = searchParams.get('agent_id');

    const conditions: string[] = [];
    const params: unknown[]    = [];

    if (status)  { conditions.push('q.status = ?');   params.push(status); }
    if (agentId) { conditions.push('q.agent_id = ?'); params.push(Number(agentId)); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const jobs = db.all(
      `SELECT q.*, a.name AS agent_name, a.slug AS agent_slug
       FROM queue q
       LEFT JOIN agents a ON a.id = q.agent_id
       ${where}
       ORDER BY q.created_at DESC
       LIMIT ? OFFSET ?`,
      ...params, limit, offset,
    );

    const total = db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM queue q ${where}`,
      ...params,
    );

    return NextResponse.json({ jobs, total: total?.count ?? 0, limit, offset });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
