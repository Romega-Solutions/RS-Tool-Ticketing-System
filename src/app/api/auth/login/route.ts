import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Auth is handled client-side via Supabase signInWithPassword.
// This endpoint is kept for backwards-compatibility but is no longer called.
export async function POST() {
  return NextResponse.json(
    { error: 'Use Supabase client-side auth instead' },
    { status: 410 },
  );
}
