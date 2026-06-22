import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { canAccessLeadTool } from '@/lib/rbac';
import { PositionEditor } from '../position-editor.client';

export default async function NewPositionPage() {
  const session = await getSession();
  if (!session || !canAccessLeadTool('recruiting', session.role, session.team)) {
    redirect('/dashboard');
  }

  return <PositionEditor mode="create" />;
}
