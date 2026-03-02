import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  const url = new URL(request.url);
  const agentId = url.searchParams.get('agent_id');
  const search = url.searchParams.get('q') || '';
  const category = url.searchParams.get('category') || '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (agentId)  { conditions.push('f.agent_id = ?'); params.push(Number(agentId)); }
  if (category) { conditions.push('f.category = ?'); params.push(category); }
  if (search)   { conditions.push('f.content LIKE ?'); params.push(`%${search}%`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const facts = db.all<{
    id: number;
    agent_id: number;
    agent_name: string;
    category: string;
    content: string;
    confidence: number;
    access_count: number;
    created_at: string;
  }>(
    `SELECT
       f.id,
       f.agent_id,
       COALESCE(a.name, 'Unknown') AS agent_name,
       f.category,
       f.content,
       COALESCE(f.confidence, 1.0) AS confidence,
       COALESCE(f.access_count, 0) AS access_count,
       f.created_at
     FROM memory_facts f
     LEFT JOIN agents a ON a.id = f.agent_id
     ${where}
     ORDER BY f.created_at DESC
     LIMIT ? OFFSET ?`,
    ...params, limit, offset,
  );

  const categories = db.all<{ category: string; count: number }>(
    `SELECT category, COUNT(*) as count
     FROM memory_facts
     ${agentId ? 'WHERE agent_id = ?' : ''}
     GROUP BY category
     ORDER BY count DESC`,
    ...(agentId ? [Number(agentId)] : []),
  );

  const total = db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM memory_facts f ${where}`,
    ...params,
  );

  return NextResponse.json({ facts, categories, total: total?.count ?? 0 });
}
