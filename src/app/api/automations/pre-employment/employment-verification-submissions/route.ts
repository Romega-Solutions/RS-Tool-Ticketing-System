import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route, parseBody, requireBearer, badRequest } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashPreEmploymentRequestToken } from '@/lib/pre-employment-forms';

export const runtime = 'nodejs';

const submissionSchema = z.object({
  token: z.string().trim().min(32).max(256),
  provider: z.string().trim().min(1).max(40),
  submissionId: z.string().trim().min(1).max(255),
  submittedAt: z.string().datetime().optional(),
  data: z.unknown(),
});

function stripRequestToken(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const {
    request_token: _token,
    q17_request_token: _employmentJotformToken,
    q22_request_token: _jotformToken,
    ...safeData
  } = data as Record<string, unknown>;
  return safeData;
}

export const POST = route(async (req: Request) => {
  requireBearer(req, process.env.N8N_PRE_EMPLOYMENT_SECRET);
  const body = await parseBody(req, submissionSchema);
  const payload = stripRequestToken(body.data);
  try {
    if (JSON.stringify(payload).length > 1_000_000) throw badRequest('data exceeds the 1 MB submission limit');
  } catch (error) {
    if (error instanceof Error && error.message === 'data exceeds the 1 MB submission limit') throw error;
    throw badRequest('data must be JSON serializable');
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('record_candidate_employment_verification_form_submission', {
    p_token_hash: hashPreEmploymentRequestToken(body.token), p_provider: body.provider,
    p_provider_submission_id: body.submissionId, p_submitted_at: body.submittedAt ?? new Date().toISOString(), p_payload: payload,
  });
  if (error) return NextResponse.json({ ok: false, error: 'Submission rejected' }, { status: 409 });
  const row = Array.isArray(data) ? data[0] : null;
  return NextResponse.json({ ok: true, verificationId: row?.verification_id ?? null, candidateId: row?.candidate_id ?? null });
});
