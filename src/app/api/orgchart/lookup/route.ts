import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { lookupPersonByName } from '@/lib/orgchart';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const name = request.nextUrl.searchParams.get('name')?.trim() ?? '';
  if (name.length < 2) return NextResponse.json({ match: null });

  const match = await lookupPersonByName(name);
  return NextResponse.json({ match });
}
