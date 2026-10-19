import { NextResponse } from 'next/server';
import { route, requireTool, badRequest } from '@/lib/api';
import { coverImageExtension, MAX_COVER_BYTES, researchCoverUrl } from '@/lib/research-posts';
import { uploadResearchCover } from '@/lib/storage';

export const runtime = 'nodejs';

// Cover upload for the /research editor. A route handler rather than a server
// action because actions cap request bodies at 1 MB. Returns the bucket path
// (stored on the post when the form is saved) plus a preview URL.
export const POST = route(async (req: Request) => {
  await requireTool('research');

  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    throw badRequest('Image file is required.');
  }
  if (!coverImageExtension(file)) {
    throw badRequest('Only JPG, PNG, and WebP images are accepted.');
  }
  if (file.size > MAX_COVER_BYTES) {
    throw badRequest('Cover image must be 5 MB or smaller.');
  }

  const { path } = await uploadResearchCover(file);
  return NextResponse.json({ path, url: researchCoverUrl(path) });
});
