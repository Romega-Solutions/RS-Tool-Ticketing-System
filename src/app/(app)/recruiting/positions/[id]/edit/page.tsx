import { redirect, notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { hasToolAccess } from '@/lib/rbac';
import { PositionEditor } from '../../position-editor.client';
import type { PositionDefaults } from '../../position-fields';

export default async function EditPositionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || !hasToolAccess('recruiting', session.role, session.toolAccess)) {
    redirect('/dashboard');
  }

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('positions')
    .select('job_title, placement_type, location, compensation, employment_type, openings, job_description')
    .eq('id', id)
    .maybeSingle();
  if (!data) notFound();

  return <PositionEditor mode="edit" positionId={id} defaults={data as PositionDefaults} />;
}
