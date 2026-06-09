import { NextResponse } from 'next/server';
import { deleteSavedView } from '@/lib/tickets';
import { route, requireSession } from '@/lib/api';

export const runtime = 'nodejs';

export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();
  const { id } = await params;
  try {
    await deleteSavedView(id, session.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});
