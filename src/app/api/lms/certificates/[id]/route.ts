import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// GET /api/lms/certificates/[id] — returns a 302 to a fresh signed URL of
// the certificate PDF. Owner-or-admin gated; never returns the PDF inline
// (we let the storage CDN serve it).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const certId = Number(id);
  if (!Number.isInteger(certId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: cert } = await admin
    .from('lms_certificates')
    .select('id, user_id, pdf_path, serial')
    .eq('id', certId)
    .maybeSingle();
  if (!cert) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const isOwner = cert.user_id === session.id;
  const isAdmin = session.role === 'admin';
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!cert.pdf_path) {
    return NextResponse.json({ error: 'PDF not yet rendered for this certificate' }, { status: 410 });
  }

  const bucket = process.env.SUPABASE_LEARNING_BUCKET ?? 'learning-content';
  const { data: signed, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(cert.pdf_path, 60 * 60); // 1h is plenty for a download click
  if (error || !signed) {
    return NextResponse.json({ error: 'Could not sign URL' }, { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
