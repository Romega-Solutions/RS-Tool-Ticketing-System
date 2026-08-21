import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route, parseBody, requireBearer } from '@/lib/api';
import { recordOnboardingAvailability } from '@/lib/onboarding-sessions';

export const runtime = 'nodejs';

// Called only by n8n after it receives the Jotform submission. Candidates do
// not call this route directly; n8n authenticates with N8N_ONBOARDING_SECRET.
const availabilitySchema = z.object({
  formToken: z.string().trim().min(32).max(128),
  availability: z.enum(['yes', 'no']),
  submittedAt: z.string().datetime().optional(),
  providerSubmissionId: z.string().trim().min(1).max(255).optional(),
});

export const POST = route(async (req: Request) => {
  requireBearer(req, process.env.N8N_ONBOARDING_SECRET);
  const body = await parseBody(req, availabilitySchema);
  const submittedAt = body.submittedAt ? new Date(body.submittedAt) : new Date();
  const result = await recordOnboardingAvailability(body.formToken, body.availability, submittedAt);
  return NextResponse.json({
    ok: true,
    onboarderId: result.onboarderId,
    onboarderType: result.onboarderType,
    availability: body.availability,
    reassigned: result.reassigned,
    session: {
      date: result.session.session_date,
      startsAt: result.session.starts_at,
      cutoffAt: result.session.cutoff_at,
    },
  });
});
