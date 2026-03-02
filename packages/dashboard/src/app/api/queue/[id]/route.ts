import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const { id } = await params;
    const jobId  = parseInt(id, 10);
    if (isNaN(jobId)) return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });

    const job = db.get<{ id: number; status: string }>('SELECT id, status FROM queue WHERE id = ?', jobId);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const body = await request.json() as { action?: string };

    if (body.action === 'retry') {
      if (job.status !== 'failed') {
        return NextResponse.json({ error: 'Only failed jobs can be retried' }, { status: 400 });
      }
      db.run(
        `UPDATE queue SET status = 'pending', attempts = 0, error = NULL,
         started_at = NULL, completed_at = NULL
         WHERE id = ?`,
        jobId,
      );
      return NextResponse.json(db.get('SELECT * FROM queue WHERE id = ?', jobId));
    }

    if (body.action === 'kill') {
      db.run(
        `UPDATE queue SET status = 'failed', error = 'Killed by user',
         completed_at = datetime('now')
         WHERE id = ?`,
        jobId,
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'action must be "retry" or "kill"' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const { id } = await params;
    const jobId  = parseInt(id, 10);
    if (isNaN(jobId)) return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });

    const job = db.get<{ id: number; status: string }>('SELECT id, status FROM queue WHERE id = ?', jobId);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    if (job.status === 'running') {
      return NextResponse.json({ error: 'Cannot cancel a running job' }, { status: 409 });
    }

    db.run('DELETE FROM queue WHERE id = ?', jobId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
