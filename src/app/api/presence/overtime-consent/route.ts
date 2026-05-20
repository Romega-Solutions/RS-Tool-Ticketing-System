import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// Each consent extends the auto-clock-out deadline by 1 hour — the same
// interval at which the browser-side guardrail re-prompts.
const CONSENT_EXTENSION_MS = 60 * 60 * 1000;

// POST /api/presence/overtime-consent
// User clicked "Yes, continue working" in the overtime guardrail dialog.
// Marks the open session as consented so the auto-clock-out cron will
// skip it for the next hour even if the browser is later closed.
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: open } = await admin
    .from('timesheets')
    .select('id')
    .eq('user_id', session.id)
    .is('clocked_out_at', null)
    .maybeSingle();

  if (!open) {
    return NextResponse.json({ error: 'No open clock-in session' }, { status: 400 });
  }

  const consentUntil = new Date(Date.now() + CONSENT_EXTENSION_MS).toISOString();
  const { error } = await admin
    .from('timesheets')
    .update({ overtime_consent_until: consentUntil })
    .eq('id', open.id);

  if (error) {
    return NextResponse.json({ error: `Consent update failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ consentUntil });
}
