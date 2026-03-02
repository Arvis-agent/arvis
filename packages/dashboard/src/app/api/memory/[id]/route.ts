import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const { id } = await params;
    const factId = parseInt(id, 10);
    if (isNaN(factId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const fact = db.get<{ id: number }>('SELECT id FROM memory_facts WHERE id = ?', factId);
    if (!fact) return NextResponse.json({ error: 'Fact not found' }, { status: 404 });

    db.run('DELETE FROM memory_facts WHERE id = ?', factId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
