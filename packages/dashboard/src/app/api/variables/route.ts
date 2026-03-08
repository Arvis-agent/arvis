import { NextRequest, NextResponse } from 'next/server';
import { variables } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';

/** GET /api/variables — list all (secrets masked) */
export async function GET(request: NextRequest) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  try {
    const all = variables.getAll();
    return NextResponse.json(all);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load variables' },
      { status: 500 }
    );
  }
}

/** POST /api/variables — create or update */
export async function POST(req: NextRequest) {
  const authErr = await requireAuth(req); if (authErr) return authErr;
  try {
    const body = await req.json();
    const { key, value, description, isSecret } = body as {
      key?: string;
      value?: string;
      description?: string;
      isSecret?: boolean;
    };

    if (!key || typeof key !== 'string' || !key.trim()) {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 });
    }

    // Validate key format: alphanumeric, underscores, hyphens, dots
    if (!/^[a-zA-Z0-9_.\-]+$/.test(key.trim())) {
      return NextResponse.json(
        { error: 'Key must contain only letters, numbers, underscores, hyphens, and dots' },
        { status: 400 }
      );
    }

    // If value is omitted, try to keep the existing value (edit metadata only)
    let finalValue = value;
    if (finalValue === undefined || finalValue === null || finalValue === '') {
      const existing = variables.get(key.trim());
      if (existing !== null) {
        finalValue = existing;
      } else {
        return NextResponse.json({ error: 'Value is required for new variables' }, { status: 400 });
      }
    }

    variables.set(key.trim(), finalValue, description?.trim(), !!isSecret);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save variable' },
      { status: 500 }
    );
  }
}

/** DELETE /api/variables?id=N — delete by ID */
export async function DELETE(req: NextRequest) {
  const authErr = await requireAuth(req); if (authErr) return authErr;
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    const deleted = variables.delete(parseInt(id, 10));
    if (!deleted) {
      return NextResponse.json({ error: 'Variable not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete variable' },
      { status: 500 }
    );
  }
}
