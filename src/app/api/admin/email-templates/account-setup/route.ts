import { NextResponse } from 'next/server';
import { route, requireAdmin } from '@/lib/api';
import { getAccountSetupTemplate } from '@/lib/email-templates-store';

export const runtime = 'nodejs';

// Load the saved "account setup" email default so the send dialog can pre-fill
// it. Top-level path (not nested under users/) to avoid sitting as a sibling of
// the [id] dynamic segment.
export const GET = route(async () => {
  await requireAdmin();
  const t = await getAccountSetupTemplate();
  return NextResponse.json({
    subject: t.subject,
    body: t.body,
    updatedAt: t.updatedAt,
    updatedBy: t.updatedBy,
  });
});
