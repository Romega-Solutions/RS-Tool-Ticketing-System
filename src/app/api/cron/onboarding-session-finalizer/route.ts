import { NextResponse } from 'next/server';
import { route, requireBearer } from '@/lib/api';
import { finalizeTodayOnboardingSession } from '@/lib/onboarding-sessions';

export const runtime = 'nodejs';

// Called by the Friday 1 PM PHT n8n schedule. The response carries the final
// confirmed and deferred cohorts for n8n to send the attendee emails.
export const GET = route(async (req: Request) => {
  requireBearer(req, process.env.CRON_ONBOARDER_SECRET);
  const sessions = await finalizeTodayOnboardingSession();
  return NextResponse.json({ ranAt: new Date().toISOString(), sessions });
});
