import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { canAccessLeadTool } from '@/lib/rbac';
import { LeadCreatePageForm } from '../lead-create-page-form';

export default async function NewLeadPage() {
  const session = await getSession();
  if (!session || !canAccessLeadTool('sales', session.role, session.team)) {
    redirect('/dashboard');
  }

  return <LeadCreatePageForm />;
}
