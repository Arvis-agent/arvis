import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';

/**
 * REST fallback for chat when WebSocket isn't available.
 * Posts message to connector-web's REST endpoint.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  const { id } = await params;
  const body = await request.json();
  const { content } = body as { content: string };

  const port = process.env.CONNECTOR_WEB_PORT || '5070';
  const host = process.env.CONNECTOR_WEB_HOST || 'localhost';

  const res = await fetch(`http://${host}:${port}/api/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content,
      userId: `dashboard-${id}`,
      userName: 'Dashboard User',
      channelId: `dashboard-agent-${id}`,
    }),
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 502 },
    );
  }

  const result = await res.json();
  return NextResponse.json(result);
}
