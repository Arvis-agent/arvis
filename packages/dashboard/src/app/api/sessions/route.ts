import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const url = new URL(request.url);
    const agentId = url.searchParams.get('agent_id');
    const status = url.searchParams.get('status') || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (agentId) { conditions.push('c.agent_id = ?'); params.push(Number(agentId)); }
    if (status)   { conditions.push('c.status = ?');   params.push(status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // conversations schema: started_at, last_message_at (NOT created_at / updated_at)
    const sessions = db.all<{
      id: number;
      agent_id: number;
      agent_name: string;
      platform: string;
      channel_id: string | null;
      user_id: string | null;
      status: string;
      message_count: number;
      total_tokens_estimate: number;
      created_at: string;
      updated_at: string;
      last_message: string | null;
    }>(
      `SELECT
         c.id,
         c.agent_id,
         COALESCE(a.name, 'Unknown') AS agent_name,
         c.platform,
         c.channel_id,
         c.user_id,
         c.status,
         c.message_count,
         c.total_tokens_estimate,
         c.started_at          AS created_at,
         c.last_message_at     AS updated_at,
         (SELECT substr(content, 1, 100)
          FROM messages m
          WHERE m.conversation_id = c.id
            AND m.role IN ('user', 'assistant')
            AND m.content NOT LIKE '<instructions>%'
            AND m.content NOT LIKE '[user]:%'
            AND m.content NOT LIKE '[assistant]:%'
          ORDER BY m.created_at DESC
          LIMIT 1) AS last_message
       FROM conversations c
       LEFT JOIN agents a ON a.id = c.agent_id
       ${where}
       ORDER BY c.last_message_at DESC
       LIMIT ? OFFSET ?`,
      ...params, limit, offset,
    );

    const total = db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM conversations c ${where}`,
      ...params,
    );

    return NextResponse.json({ sessions, total: total?.count ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
