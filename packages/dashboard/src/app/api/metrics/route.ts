import { NextResponse } from 'next/server';
import { db, registry, queue } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  const agents = registry.getAll();
  const queueStatus = queue.getStatus();

  // Messages in last 24h
  const messagesRow = db.get<{ count: number }>(
    "SELECT COUNT(*) as count FROM messages WHERE created_at > datetime('now', '-1 day')",
  );

  // Total conversations
  const convsRow = db.get<{ count: number }>(
    'SELECT COUNT(*) as count FROM conversations',
  );

  // Usage cost (last 30 days)
  const costRow = db.get<{ total: number }>(
    "SELECT COALESCE(SUM(cost_usd), 0) as total FROM usage_log WHERE created_at > datetime('now', '-30 days')",
  );

  // Activity over last 7 days — fill every day (even empty ones) so chart always has 7 bars
  const rawActivity = db.all<{ day: string; count: number }>(
    `SELECT date(created_at) as day, COUNT(*) as count
     FROM messages
     WHERE created_at > datetime('now', '-7 days')
     GROUP BY date(created_at)
     ORDER BY day ASC`,
  );
  const activityMap = new Map<string, number>(rawActivity.map((r) => [r.day, r.count]));
  const activity: { day: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = d.toISOString().slice(0, 10);
    activity.push({ day, count: activityMap.get(day) ?? 0 });
  }

  // Recent activity (last 10 messages)
  const recentMessages = db.all<{
    id: number;
    role: string;
    content: string;
    created_at: string;
    conversation_id: number;
  }>(
    `SELECT id, role, substr(content, 1, 120) as content, created_at, conversation_id
     FROM messages
     ORDER BY created_at DESC
     LIMIT 10`,
  );

  return NextResponse.json({
    agents: {
      total: agents.length,
      active: agents.filter(a => a.status === 'active').length,
      paused: agents.filter(a => a.status === 'paused').length,
    },
    queue: queueStatus,
    messages24h: messagesRow?.count ?? 0,
    conversations: convsRow?.count ?? 0,
    cost30d: costRow?.total ?? 0,
    activity,
    recentMessages,
  });
}
