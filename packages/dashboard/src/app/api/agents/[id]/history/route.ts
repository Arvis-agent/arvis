import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/agents/[id]/history
 * Returns messages from the most recent dashboard conversation for this agent.
 * Used to restore chat history on page refresh.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  const { id } = await params;
  const agentId = Number(id);

  try {
    // Find the most recent conversation this dashboard session created
    const conv = db.get<{ id: number }>(
      `SELECT id FROM conversations
       WHERE agent_id = ? AND channel_id = ?
       ORDER BY last_message_at DESC
       LIMIT 1`,
      agentId,
      `dashboard-agent-${agentId}`,
    );

    if (!conv) return NextResponse.json({ messages: [] });

    const messages = db.all<{
      id: number;
      role: string;
      content: string;
      created_at: string;
    }>(
      `SELECT id, role, content, created_at
       FROM messages
       WHERE conversation_id = ? AND role IN ('user', 'assistant')
       ORDER BY created_at ASC`,
      conv.id,
    );

    return NextResponse.json({
      conversationId: conv.id,
      messages: messages.map((m) => ({
        id: String(m.id),
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.created_at,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
