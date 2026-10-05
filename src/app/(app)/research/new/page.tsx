import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { hasToolAccess } from '@/lib/rbac';
import { PostEditor } from '../post-editor.client';

export default async function NewResearchPostPage() {
  const session = await getSession();
  if (!session || !hasToolAccess('research', session.role, session.toolAccess)) {
    redirect('/dashboard');
  }

  return <PostEditor mode="create" defaultAuthorName={session.name} />;
}
