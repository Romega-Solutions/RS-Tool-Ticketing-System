import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { hasToolAccess } from '@/lib/rbac';
import { LeadCreatePageForm } from '../lead-create-page-form';

export default async function NewLeadPage() {
  const session = await getSession();
  if (!session || !hasToolAccess('sales', session.role, session.toolAccess)) {
    redirect('/dashboard');
  }

  return <LeadCreatePageForm />;
}
