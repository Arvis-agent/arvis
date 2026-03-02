import { NextResponse } from 'next/server';
import { db, registry, queue } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    database: db.isHealthy(),
    agents: registry.getAll().length,
    queue: queue.getStatus(),
  });
}
