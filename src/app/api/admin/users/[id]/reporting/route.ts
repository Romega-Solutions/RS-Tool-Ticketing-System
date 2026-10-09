import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route, requireAdmin, parseBody, badRequest } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { enforceRateLimit, keyByUser } from '@/lib/rate-limit';
import { uploadUserPhoto, userPhotoUrl } from '@/lib/storage';
import { photoError, isImageBytes } from '@/lib/user-photo';

export const runtime = 'nodejs';

const bodySchema = z.object({
  reportsToUserId:      z.number().int().positive().nullable(),
  alsoReportsToUserIds: z.array(z.number().int().positive()),
});

async function userIdFrom(params: Promise<{ id: string }>): Promise<number> {
  const userId = Number((await params).id);
  if (!Number.isInteger(userId) || userId <= 0) throw badRequest('Invalid user id');
  return userId;
}

// PUT — set who this user reports to. null = the default (the founder).
export const PUT = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireAdmin();
  await enforceRateLimit({ key: keyByUser('admin-users-write', session.id), limit: 30, windowSeconds: 60 });
  const userId = await userIdFrom(params);
  const { reportsToUserId, alsoReportsToUserIds } = await parseBody(req, bodySchema);
  const also = [...new Set(alsoReportsToUserIds)].filter(id => id !== reportsToUserId);
  if (reportsToUserId === userId || also.includes(userId)) throw badRequest('A user cannot report to themselves');

  const admin = createAdminClient();
  const { error } = await admin.from('user_reporting').upsert(
    { user_id: userId, reports_to_user_id: reportsToUserId, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(error.message);

  const { error: delError } = await admin.from('user_secondary_leads').delete().eq('user_id', userId);
  if (delError) throw new Error(delError.message);
  if (also.length) {
    const { error: insError } = await admin.from('user_secondary_leads')
      .insert(also.map(id => ({ user_id: userId, also_reports_to_user_id: id })));
    if (insError) throw new Error(insError.message);
  }

  return NextResponse.json({ reportsToUserId, alsoReportsToUserIds: also });
});

// POST — upload a new profile photo (multipart, field "photo").
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireAdmin();
  await enforceRateLimit({ key: keyByUser('admin-users-write', session.id), limit: 30, windowSeconds: 60 });
  const userId = await userIdFrom(params);

  const file = (await req.formData()).get('photo');
  if (!(file instanceof File)) throw badRequest('photo is required');
  const invalid = photoError(file);
  if (invalid) throw badRequest(invalid);
  if (!isImageBytes(new Uint8Array(await file.slice(0, 12).arrayBuffer()))) {
    throw badRequest('That file is not a valid JPG, PNG or WebP image');
  }

  const path = await uploadUserPhoto(userId, file);
  const { error } = await createAdminClient().from('user_reporting').upsert(
    { user_id: userId, photo_path: path, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(error.message);

  return NextResponse.json({ photoUrl: userPhotoUrl(path) });
});
