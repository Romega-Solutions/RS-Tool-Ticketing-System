import { NextResponse } from 'next/server';
import { getAllOnline } from '@/lib/presence';
import { hydrateOpenPresenceFromDB } from '@/lib/presence-hydration';
import { route, requireSession } from '@/lib/api';

export const runtime = 'nodejs';

// Polled by clients every few minutes (see who-is-in-panel.tsx / live/page.tsx).
// Was previously an SSE stream held open for the life of the tab — that kept a
// Vercel function instance (and its provisioned memory) alive for hours per
// connected user, which dominated the project's Fluid Compute bill.
export const GET = route(async () => {
  await requireSession();
  await hydrateOpenPresenceFromDB();
  return NextResponse.json({ online: getAllOnline() });
});
