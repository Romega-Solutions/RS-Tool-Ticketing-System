import { NextResponse, type NextRequest } from 'next/server';
import { generateBriefing, yesterdayPht, todayPht } from '@/lib/briefing';

// Daily cron endpoint hit by n8n. Authenticated via shared secret in the
// `Authorization: Bearer <token>` header — the same value as N8N_BRIEFING_SECRET
// in our env. Anyone with that token can trigger a regeneration.

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
  const which = url.searchParams.get('for') ?? 'yesterday'; // 'yesterday' | 'today' | YYYY-MM-DD
  const force = url.searchParams.get('force') === '1';

  let dateYmd: string;
  if (which === 'yesterday')     dateYmd = yesterdayPht();
  else if (which === 'today')    dateYmd = todayPht();
  else if (/^\d{4}-\d{2}-\d{2}$/.test(which)) dateYmd = which;
  else return NextResponse.json({ error: 'Invalid "for" param' }, { status: 400 });

  try {
    const { briefing, fromCache } = await generateBriefing({ dateYmd, force });
    return NextResponse.json({
      ok:         true,
      date:       briefing.date,
      fromCache,
      hasNarrative: !!briefing.narrative,
      tokens:     { in: briefing.tokens_in ?? 0, out: briefing.tokens_out ?? 0 },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
