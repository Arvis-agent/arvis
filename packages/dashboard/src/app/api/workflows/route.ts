import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const heartbeats = db.all(`
      SELECT h.*, a.name as agent_name, a.slug as agent_slug
      FROM heartbeat_configs h
      LEFT JOIN agents a ON a.id = h.agent_id
      ORDER BY h.enabled DESC, h.name ASC
    `);
    const crons = db.all(`
      SELECT c.*, a.name as agent_name, a.slug as agent_slug
      FROM cron_jobs c
      LEFT JOIN agents a ON a.id = c.agent_id
      ORDER BY c.enabled DESC, c.name ASC
    `);
    return NextResponse.json({ heartbeats, crons });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const body = await request.json() as Record<string, unknown>;
    const { kind } = body;

    if (kind === 'heartbeat') {
      if (typeof body.name !== 'string' || !body.name.trim())
        return NextResponse.json({ error: 'name is required' }, { status: 400 });
      if (typeof body.agent_id !== 'number')
        return NextResponse.json({ error: 'agent_id (number) is required' }, { status: 400 });
      if (typeof body.schedule !== 'string' || !body.schedule.trim())
        return NextResponse.json({ error: 'schedule is required' }, { status: 400 });
      if (typeof body.prompt !== 'string' || !body.prompt.trim())
        return NextResponse.json({ error: 'prompt is required' }, { status: 400 });

      const result = db.run(
        `INSERT INTO heartbeat_configs (agent_id, name, prompt, schedule, channel_id, platform, enabled)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        body.agent_id,
        body.name.trim(),
        body.prompt.trim(),
        body.schedule.trim(),
        typeof body.channel_id === 'string' ? body.channel_id : null,
        typeof body.platform === 'string' ? body.platform : null,
      );
      const created = db.get(`
        SELECT h.*, a.name as agent_name FROM heartbeat_configs h
        LEFT JOIN agents a ON a.id = h.agent_id WHERE h.id = ?
      `, Number(result.lastInsertRowid));
      return NextResponse.json(created, { status: 201 });
    }

    if (kind === 'cron') {
      if (typeof body.name !== 'string' || !body.name.trim())
        return NextResponse.json({ error: 'name is required' }, { status: 400 });
      if (typeof body.agent_id !== 'number')
        return NextResponse.json({ error: 'agent_id (number) is required' }, { status: 400 });
      if (typeof body.schedule !== 'string' || !body.schedule.trim())
        return NextResponse.json({ error: 'schedule is required' }, { status: 400 });
      if (typeof body.prompt !== 'string' || !body.prompt.trim())
        return NextResponse.json({ error: 'prompt is required' }, { status: 400 });

      const result = db.run(
        `INSERT INTO cron_jobs (agent_id, name, description, schedule, prompt, channel_id, platform, enabled, created_by_user)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)`,
        body.agent_id,
        body.name.trim(),
        typeof body.description === 'string' ? body.description.trim() || null : null,
        body.schedule.trim(),
        body.prompt.trim(),
        typeof body.channel_id === 'string' ? body.channel_id : null,
        typeof body.platform === 'string' ? body.platform : null,
      );
      const created = db.get(`
        SELECT c.*, a.name as agent_name FROM cron_jobs c
        LEFT JOIN agents a ON a.id = c.agent_id WHERE c.id = ?
      `, Number(result.lastInsertRowid));
      return NextResponse.json(created, { status: 201 });
    }

    return NextResponse.json({ error: 'kind must be "heartbeat" or "cron"' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const body = await request.json() as Record<string, unknown>;
    const { kind, id, ...fields } = body;

    if (!id || typeof id !== 'number')
      return NextResponse.json({ error: 'id (number) is required' }, { status: 400 });

    if (kind === 'heartbeat') {
      const updates: string[] = [];
      const values: unknown[] = [];
      if (typeof fields.name     === 'string')  { updates.push('name = ?');     values.push(fields.name.trim()); }
      if (typeof fields.prompt   === 'string')  { updates.push('prompt = ?');   values.push(fields.prompt.trim()); }
      if (typeof fields.schedule === 'string')  { updates.push('schedule = ?'); values.push(fields.schedule.trim()); }
      if (typeof fields.enabled  === 'boolean') { updates.push('enabled = ?');  values.push(fields.enabled ? 1 : 0); }
      if (!updates.length) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
      db.run(`UPDATE heartbeat_configs SET ${updates.join(', ')} WHERE id = ?`, ...values, id);
      return NextResponse.json(db.get(`
        SELECT h.*, a.name as agent_name FROM heartbeat_configs h
        LEFT JOIN agents a ON a.id = h.agent_id WHERE h.id = ?
      `, id));
    }

    if (kind === 'cron') {
      const updates: string[] = [];
      const values: unknown[] = [];
      if (typeof fields.name        === 'string')  { updates.push('name = ?');        values.push(fields.name.trim()); }
      if (typeof fields.description === 'string')  { updates.push('description = ?'); values.push(fields.description.trim() || null); }
      if (typeof fields.prompt      === 'string')  { updates.push('prompt = ?');      values.push(fields.prompt.trim()); }
      if (typeof fields.schedule    === 'string')  { updates.push('schedule = ?');    values.push(fields.schedule.trim()); }
      if (typeof fields.enabled     === 'boolean') { updates.push('enabled = ?');     values.push(fields.enabled ? 1 : 0); }
      if (!updates.length) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
      db.run(`UPDATE cron_jobs SET ${updates.join(', ')} WHERE id = ?`, ...values, id);
      return NextResponse.json(db.get(`
        SELECT c.*, a.name as agent_name FROM cron_jobs c
        LEFT JOIN agents a ON a.id = c.agent_id WHERE c.id = ?
      `, id));
    }

    return NextResponse.json({ error: 'kind must be "heartbeat" or "cron"' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const { searchParams } = new URL(request.url);
    const kind = searchParams.get('kind');
    const id   = parseInt(searchParams.get('id') || '', 10);

    if (isNaN(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    if (kind === 'heartbeat') {
      db.run('DELETE FROM heartbeat_configs WHERE id = ?', id);
      return NextResponse.json({ ok: true });
    }
    if (kind === 'cron') {
      db.run('DELETE FROM cron_jobs WHERE id = ?', id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'kind must be "heartbeat" or "cron"' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
