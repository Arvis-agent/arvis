import { NextResponse } from 'next/server';
import { registry } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    return NextResponse.json(registry.getAll());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const VALID_ROLES   = ['assistant', 'orchestrator', 'specialist', 'analyst', 'researcher', 'coder', 'writer'] as const;
const SLUG_RE       = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$|^[a-z0-9]$/;

export async function POST(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const body = await request.json() as Record<string, unknown>;

    // ── Required field validation ──────────────────────────────────────────
    if (typeof body.name !== 'string' || !body.name.trim())
      return NextResponse.json({ error: 'name is required' }, { status: 400 });

    if (typeof body.slug !== 'string' || !SLUG_RE.test(body.slug.trim()))
      return NextResponse.json({ error: 'slug must be lowercase letters, numbers, and hyphens (1-50 chars)' }, { status: 400 });

    if (typeof body.role !== 'string' || !(VALID_ROLES as readonly string[]).includes(body.role))
      return NextResponse.json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` }, { status: 400 });

    if (typeof body.model !== 'string' || !body.model.trim())
      return NextResponse.json({ error: 'model is required' }, { status: 400 });

    // ── Optional field type checks ─────────────────────────────────────────
    if (body.description !== undefined && body.description !== null && typeof body.description !== 'string')
      return NextResponse.json({ error: 'description must be a string' }, { status: 400 });

    if (body.systemPrompt !== undefined && body.systemPrompt !== null && typeof body.systemPrompt !== 'string')
      return NextResponse.json({ error: 'systemPrompt must be a string' }, { status: 400 });

    // ── Sanitise to known fields only (no arbitrary injection) ─────────────
    const payload = {
      name:         body.name.trim(),
      slug:         body.slug.trim(),
      role:         body.role as import('@arvis/core').AgentRole,
      model:        (body.model as string).trim(),
      description:  typeof body.description === 'string' ? body.description.trim() || undefined : undefined,
      systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt.trim() || undefined : undefined,
    };

    const agent = registry.create(payload);
    return NextResponse.json(agent, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    const status  = message.toLowerCase().includes('unique') ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
