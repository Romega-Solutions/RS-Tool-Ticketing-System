import { NextRequest, NextResponse } from 'next/server';
import { lookupPerson } from '@/lib/orgchart';
import { route, requireSession } from '@/lib/api';

export const runtime = 'nodejs';

export const GET = route(async (request: NextRequest) => {
  await requireSession();

  const email = request.nextUrl.searchParams.get('email')?.trim() ?? '';
  const name  = request.nextUrl.searchParams.get('name')?.trim()  ?? '';

  if (!email && name.length < 2) return NextResponse.json({ match: null });

  const match = await lookupPerson({
    email: email || undefined,
    name:  name  || undefined,
  });

  return NextResponse.json({ match });
});
