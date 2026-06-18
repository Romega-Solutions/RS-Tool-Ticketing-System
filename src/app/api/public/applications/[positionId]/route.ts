// Public POST endpoint that lets the RS_Web-Digital marketing site submit
// job applications without duplicating the candidate-creation business
// logic. The marketing site renders the apply form on its own domain
// (romega-solutions.com) and forwards the multipart FormData here,
// authenticated with a shared bearer token.
//
// All resume validation, dedup, n8n parsing, candidate insert, storage
// upload and email notifications stay in `createPublicApplication` so
// they don't drift between repos.

import { NextResponse, type NextRequest } from 'next/server';
import { submitPublicApplication } from '@/app/apply/[positionId]/actions';
import { checkRateLimit, keyByIp, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
// Resume PDFs can be up to 10 MB; default body size limit on Vercel is
// 4.5 MB for serverless functions, so we use Node runtime explicitly and
// trust the existing createPublicApplication file-size check.
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ positionId: string }> },
) {
  const rl = await checkRateLimit({ key: keyByIp('apply', clientIp(req)), limit: 5, windowSeconds: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, code: 'RATE_LIMITED', error: 'Too many submissions. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const expected = process.env.PUBLIC_APPLICATIONS_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { ok: false, code: 'NOT_CONFIGURED', error: 'Public applications endpoint not configured' },
      { status: 503 },
    );
  }

  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
  if (token !== expected) {
    return NextResponse.json(
      { ok: false, code: 'UNAUTHORIZED', error: 'Invalid or missing token' },
      { status: 401 },
    );
  }

  const { positionId: rawId } = await ctx.params;
  const positionId = Number.parseInt(rawId, 10);
  if (!Number.isInteger(positionId) || positionId <= 0) {
    return NextResponse.json(
      { ok: false, code: 'INVALID_POSITION', error: 'Invalid position id' },
      { status: 400 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, code: 'BAD_REQUEST', error: 'Expected multipart/form-data' },
      { status: 400 },
    );
  }

  try {
    const result = await submitPublicApplication(positionId, formData);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err) {
    console.error('[public applications] submission failed:', err);
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', error: err instanceof Error ? err.message : 'Submission failed' },
      { status: 500 },
    );
  }
}
