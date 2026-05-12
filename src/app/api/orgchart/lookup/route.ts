import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { lookupPerson } from '@/lib/orgchart';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const email = request.nextUrl.searchParams.get('email')?.trim() ?? '';
  const name  = request.nextUrl.searchParams.get('name')?.trim()  ?? '';

  if (!email && name.length < 2) return NextResponse.json({ match: null });

  const match = await lookupPerson({
    email: email || undefined,
    name:  name  || undefined,
  });

  return NextResponse.json({ match });
}
