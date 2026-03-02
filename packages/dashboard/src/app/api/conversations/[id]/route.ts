import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authErr = await requireAuth(request); if (authErr) return authErr;

  try {
    const { id } = await params;
    const convId = parseInt(id, 10);
    if (isNaN(convId)) {
      return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 });
    }

    const conv = db.get<{
      id: number;
      agent_id: number;
      agent_name: string;
      platform: string;
      channel_id: string | null;
      user_id: string | null;
      status: string;
      message_count: number;
      total_tokens_estimate: number;
      started_at: string;
      last_message_at: string;
    }>(
      `SELECT c.id, c.agent_id, COALESCE(a.name, 'Unknown') AS agent_name,
              c.platform, c.channel_id, c.user_id, c.status,
              c.message_count, c.total_tokens_estimate,
              c.started_at, c.last_message_at
       FROM conversations c
       LEFT JOIN agents a ON a.id = c.agent_id
       WHERE c.id = ?`,
      convId,
    );

    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 500);
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

    const messages = db.all<{
      id: number;
      role: string;
      content: string;
      tokens_estimate: number | null;
      created_at: string;
    }>(
      `SELECT id, role, content, tokens_estimate, created_at
       FROM messages
       WHERE conversation_id = ?
         AND role IN ('user', 'assistant')
         AND content NOT LIKE '<instructions>%'
         AND content NOT LIKE '[user]:%'
         AND content NOT LIKE '[assistant]:%'
       ORDER BY created_at ASC
       LIMIT ? OFFSET ?`,
      convId, limit, offset,
    );

    return NextResponse.json({ conversation: conv, messages, limit, offset });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
