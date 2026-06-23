import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { hasToolAccess } from '@/lib/rbac';
import { PositionEditor } from '../position-editor.client';

export default async function NewPositionPage() {
  const session = await getSession();
  if (!session || !hasToolAccess('recruiting', session.role, session.toolAccess)) {
    redirect('/dashboard');
  }

  return <PositionEditor mode="create" />;
}
