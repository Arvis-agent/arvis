import { NextRequest, NextResponse } from 'next/server';
import { db, registry, queue } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  return NextResponse.json({
    status: 'ok',
    database: db.isHealthy(),
    agents: registry.getAll().length,
    queue: queue.getStatus(),
    authEnabled: !!process.env.DASHBOARD_PASSWORD,
  });
}
