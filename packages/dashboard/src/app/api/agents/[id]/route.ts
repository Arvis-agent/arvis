import { NextResponse } from 'next/server';
import { registry, memory, db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function findAgent(id: string) {
  const agentId = parseInt(id, 10);
  return !isNaN(agentId)
    ? registry.getAll().find((a) => a.id === agentId)
    : registry.getBySlug(id);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const { id } = await params;
    const agent = findAgent(id);
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    const facts = memory.getFacts(agent.id, { limit: 20 });
    const state = memory.getState(agent.id);
    return NextResponse.json({ ...agent, facts, state });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const { id } = await params;
    const agent = findAgent(id);
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    const body = await request.json();

    // status is on Agent not AgentConfig — update it directly
    if (body.status !== undefined) {
      db.run('UPDATE agents SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', body.status, agent.id);
    }

    // Whitelist allowed config fields to prevent arbitrary property injection
    const ALLOWED_FIELDS = [
      'name', 'role', 'model', 'modelFallbacks', 'systemPrompt', 'personality',
      'temperature', 'maxTokens', 'topP', 'allowedTools', 'channels',
      'contextWindow', 'compactionThreshold', 'description',
    ];
    const { status: _status, ...rawConfig } = body;
    const config: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in rawConfig) config[key] = rawConfig[key];
    }
    if (Object.keys(config).length > 0) {
      registry.update(agent.slug, config);
    }

    const fresh = findAgent(id);
    return NextResponse.json(fresh);
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
    const agent = findAgent(id);
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    db.run('UPDATE agents SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', 'archived', agent.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
