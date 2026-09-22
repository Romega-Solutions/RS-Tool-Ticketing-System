import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route, parseBody, requireBearer, badRequest } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashPreEmploymentRequestToken } from '@/lib/pre-employment-forms';

export const runtime = 'nodejs';

// Called by an n8n workflow after Jotform has accepted a form submission.
// n8n authenticates with N8N_PRE_EMPLOYMENT_SECRET; candidates never call
// this route directly. The payload remains generic so future forms can reuse
// this intake without gaining direct database access.
const submissionSchema = z.object({
  formKey: z.string().trim().min(1).max(80).regex(/^[a-z0-9_]+$/),
  token: z.string().trim().min(32).max(256),
  provider: z.string().trim().min(1).max(40),
  submissionId: z.string().trim().min(1).max(255),
  submittedAt: z.string().datetime().optional(),
  data: z.unknown(),
});

function stripRequestToken(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  // The raw capability token is needed only for validation at the top level.
  // Never retain it inside the auditable Jotform payload after use.
  const { request_token: _requestToken, ...safeData } = data as Record<string, unknown>;
  return safeData;
}

export const POST = route(async (req: Request) => {
  requireBearer(req, process.env.N8N_PRE_EMPLOYMENT_SECRET);
  const body = await parseBody(req, submissionSchema);

  const safeData = stripRequestToken(body.data);
  let payloadSize = 0;
  try {
    payloadSize = JSON.stringify(safeData).length;
  } catch {
    throw badRequest('data must be JSON serializable');
  }
  if (payloadSize > 1_000_000) {
    throw badRequest('data exceeds the 1 MB submission limit');
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('record_candidate_pre_employment_submission', {
    p_form_key: body.formKey,
    p_token_hash: hashPreEmploymentRequestToken(body.token),
    p_provider: body.provider,
    p_provider_submission_id: body.submissionId,
    p_submitted_at: body.submittedAt ?? new Date().toISOString(),
    p_payload: safeData,
  });

  if (error) {
    // The function rejects unknown, expired, invalidated, already-used, and
    // duplicate-provider submissions atomically. Do not expose those details
    // beyond the authenticated n8n workflow.
    console.warn('[pre-employment submission] rejected:', error.message);
    return NextResponse.json({ ok: false, error: 'Submission rejected' }, { status: 409 });
  }

  const row = Array.isArray(data) ? data[0] : null;
  return NextResponse.json({
    ok: true,
    requestId: row?.request_id ?? null,
    candidateId: row?.candidate_id ?? null,
  });
});
