import { redirect } from 'next/navigation';
import { LifeBuoy, Shield } from 'lucide-react';
import { getSession } from '@/lib/session';
import { canAccessAdmin, roleLabel } from '@/lib/rbac';
import { DailyFlowStrip } from '@/components/guide/guide-content';
import { GuideWizard } from '@/components/guide/guide-wizard.client';

export const dynamic = 'force-dynamic';

export default async function HelpPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const isAdmin = canAccessAdmin(session.role);

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-8">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-(--rs-primary-500) text-white shadow-sm">
            <LifeBuoy className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-semibold text-(--rs-neutral-grey-900)">Help &amp; Guide</h1>
            <p className="mt-1 text-sm text-(--rs-neutral-grey-500)">
              A step-by-step walkthrough — move through it with Back / Next, or jump to any step.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-(--rs-neutral-grey-100) px-3 py-1 text-xs font-semibold uppercase tracking-wider text-(--rs-neutral-grey-600)">
          <Shield className="h-3.5 w-3.5" />
          {roleLabel(session.role)}
        </span>
      </header>

      {/* Big picture */}
      <section className="rounded-2xl border border-(--rs-neutral-grey-200) bg-white p-5 shadow-sm">
        <h2 className="mb-5 text-xs font-bold uppercase tracking-widest text-(--rs-neutral-grey-400)">Your daily flow</h2>
        <DailyFlowStrip />
      </section>

      {/* Step-by-step workflow */}
      <GuideWizard isAdmin={isAdmin} />
    </div>
  );
}
