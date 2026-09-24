import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route, parseBody, requireBearer, badRequest } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// Called by n8n immediately after it creates the Google Calendar event for a
// finalized Friday cohort. The same body may be safely retried.
const meetingSchema = z.object({
  sessionId: z.number().int().positive(),
  googleCalendarEventId: z.string().trim().min(1).max(512),
  googleMeetUrl: z.string().trim().max(2048).refine(
    (value) => /^https:\/\/meet\.google\.com\/[a-z-]+(?:[?#].*)?$/i.test(value),
    'Google Meet URL must be a valid meet.google.com link',
  ),
});

export const POST = route(async (req: Request) => {
  requireBearer(req, process.env.N8N_ONBOARDING_SECRET);
  const body = await parseBody(req, meetingSchema);
  const supabase = createAdminClient();
  const { data: session, error: findError } = await supabase
    .from('onboarding_sessions')
    .select('id, status, google_calendar_event_id, google_meet_url')
    .eq('id', body.sessionId)
    .maybeSingle();
  if (findError) throw new Error(`Failed to load onboarding session: ${findError.message}`);
  if (!session) throw badRequest('Onboarding session not found');
  if (session.status !== 'finalized') {
    throw badRequest('A Google Meet can only be recorded after the session is finalized');
  }

  const alreadyRecorded = Boolean(session.google_calendar_event_id || session.google_meet_url);
  if (alreadyRecorded) {
    if (
      session.google_calendar_event_id === body.googleCalendarEventId
      && session.google_meet_url === body.googleMeetUrl
    ) {
      return NextResponse.json({ ok: true, alreadyRecorded: true });
    }
    throw badRequest('This onboarding session already has a different Google Meet event recorded');
  }

  const { error: updateError } = await supabase.from('onboarding_sessions').update({
    google_calendar_event_id: body.googleCalendarEventId,
    google_meet_url: body.googleMeetUrl,
    meeting_created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', body.sessionId);
  if (updateError) throw new Error(`Failed to save Google Meet details: ${updateError.message}`);

  return NextResponse.json({ ok: true, alreadyRecorded: false });
});
