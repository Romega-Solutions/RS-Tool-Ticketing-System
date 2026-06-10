import { NextResponse } from 'next/server';
import { getWorkItemDetail } from '@/lib/tickets';
import { canEditWorkItem } from '@/lib/permissions';
import { route, requireSession, badRequest, forbidden, notFound } from '@/lib/api';
import { isAllowedTaskImageUpload } from '@/lib/task-image-uploads';
import { uploadTaskImageToStorage } from '@/lib/storage';

export const runtime = 'nodejs';

export const POST = route(async (req: Request, ctx: RouteContext<'/api/tickets/work-items/[id]/images'>) => {
  const session = await requireSession();
  const { id } = await ctx.params;

  const item = await getWorkItemDetail(id);
  if (!item) throw notFound();
  if (!(await canEditWorkItem(session, { id: item.id, projectId: item.project_id }))) {
    throw forbidden();
  }

  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    throw badRequest('Image file is required.');
  }
  if (!isAllowedTaskImageUpload(file)) {
    throw badRequest('Only JPG and PNG images are accepted.');
  }

  const upload = await uploadTaskImageToStorage({
    workItemId: Number(item.id),
    file,
  });

  return NextResponse.json({
    url: upload.signedUrl,
    path: upload.path,
    name: file.name,
    mimeType: upload.mimeType,
    sizeBytes: upload.sizeBytes,
  });
});
