import { NextResponse, type NextRequest } from 'next/server';
import {
  generateStatusDraft,
  currentWeekStartPht,
  previousWeekStartPht,
} from '@/lib/status-drafter';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const expected = process.env.N8N_BRIEFING_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const week = url.searchParams.get('week') ?? 'current';
  const force = url.searchParams.get('force') === '1';

  let weekStart: string;
  if (week === 'current') weekStart = currentWeekStartPht();
  else if (week === 'previous') weekStart = previousWeekStartPht();
  else if (/^\d{4}-\d{2}-\d{2}$/.test(week)) weekStart = week;
  else return NextResponse.json({ error: 'Invalid "week" param' }, { status: 400 });

  try {
    const { draft, fromCache } = await generateStatusDraft({ weekStart, force });
    return NextResponse.json({
      ok: true,
      weekStart: draft.week_start,
      fromCache,
      hasDraft: !!draft.draft,
      tokens: { in: draft.tokens_in ?? 0, out: draft.tokens_out ?? 0 },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
