import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  const url = new URL(request.url);
  const range = url.searchParams.get('range') || '30d';

  const intervalMap: Record<string, string> = {
    '1d': '-1 day',
    '7d': '-7 days',
    '30d': '-30 days',
    '90d': '-90 days',
  };
  const interval = intervalMap[range] ?? '-30 days';

  try {
    const summary = db.get<{
      total_requests: number;
      input_tokens: number;
      output_tokens: number;
      cost_usd: number;
    }>(
      `SELECT
         COUNT(*)                       AS total_requests,
         COALESCE(SUM(input_tokens), 0) AS input_tokens,
         COALESCE(SUM(output_tokens), 0) AS output_tokens,
         COALESCE(SUM(cost_usd), 0)     AS cost_usd
       FROM usage_log
       WHERE created_at > datetime('now', ?)`,
      interval,
    );

    const daily = db.all<{ day: string; requests: number; input_tokens: number; output_tokens: number; cost_usd: number }>(
      `SELECT
         date(created_at)               AS day,
         COUNT(*)                       AS requests,
         COALESCE(SUM(input_tokens), 0) AS input_tokens,
         COALESCE(SUM(output_tokens), 0) AS output_tokens,
         COALESCE(SUM(cost_usd), 0)     AS cost_usd
       FROM usage_log
       WHERE created_at > datetime('now', ?)
       GROUP BY date(created_at)
       ORDER BY day ASC`,
      interval,
    );

    const byAgent = db.all<{ agent_id: number; agent_name: string; requests: number; cost_usd: number; tokens: number; avg_duration_ms: number }>(
      `SELECT
         u.agent_id,
         COALESCE(a.name, 'Unknown')                        AS agent_name,
         COUNT(*)                                           AS requests,
         COALESCE(SUM(u.cost_usd), 0)                      AS cost_usd,
         COALESCE(SUM(u.input_tokens + u.output_tokens), 0) AS tokens,
         COALESCE(AVG(u.duration_ms), 0)                   AS avg_duration_ms
       FROM usage_log u
       LEFT JOIN agents a ON a.id = u.agent_id
       WHERE u.created_at > datetime('now', ?)
       GROUP BY u.agent_id
       ORDER BY cost_usd DESC
       LIMIT 20`,
      interval,
    );

    const byProvider = db.all<{ provider: string; model: string; requests: number; cost_usd: number; tokens: number }>(
      `SELECT
         provider,
         model,
         COUNT(*)                       AS requests,
         COALESCE(SUM(cost_usd), 0)     AS cost_usd,
         COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
       FROM usage_log
       WHERE created_at > datetime('now', ?)
       GROUP BY provider, model
       ORDER BY cost_usd DESC`,
      interval,
    );

    return NextResponse.json({ summary, daily, byAgent, byProvider });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
