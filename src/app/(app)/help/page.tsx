import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LifeBuoy, Shield, MessageCircle } from 'lucide-react';
import { getSession } from '@/lib/session';
import { canAccessAdmin, roleLabel } from '@/lib/rbac';
import { USER_GUIDES, ADMIN_GUIDES, DailyFlowStrip, HowToCard } from '@/components/guide/guide-content';

export const dynamic = 'force-dynamic';

function SectionNav({ isAdmin }: { isAdmin: boolean }) {
  const items = [
    { href: '#daily-flow',   label: 'Daily flow' },
    { href: '#clock',        label: 'Clock & overtime' },
    { href: '#dashboard',    label: 'Dashboard' },
    { href: '#tasks',        label: 'My Tasks' },
    { href: '#projects',     label: 'Projects' },
    { href: '#learning',     label: 'My Learning' },
    { href: '#certificates', label: 'Certificates' },
    { href: '#reports',      label: 'Weekly reports' },
    ...(isAdmin ? [{ href: '#admin-tools', label: 'Admin tools' }] : []),
  ];
  return (
    <nav aria-label="Guide sections" className="sticky top-2 z-10 mb-8 flex flex-wrap gap-2 rounded-2xl border border-(--rs-neutral-grey-200) bg-white/80 px-3 py-2.5 backdrop-blur">
      {items.map(i => (
        <a
          key={i.href}
          href={i.href}
          className="cursor-pointer rounded-full px-3 py-1 text-xs font-medium text-(--rs-neutral-grey-600) transition-colors hover:bg-(--rs-primary-50) hover:text-(--rs-primary-700) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300)"
        >
          {i.label}
        </a>
      ))}
    </nav>
  );
}

export default async function HelpPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const isAdmin = canAccessAdmin(session.role);

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-(--rs-primary-500) text-white shadow-sm">
            <LifeBuoy className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-semibold text-(--rs-neutral-grey-900)">Help &amp; Guide</h1>
            <p className="mt-1 text-sm text-(--rs-neutral-grey-500)">
              A page-by-page walkthrough of the app — follow it top to bottom or jump to any section.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-(--rs-neutral-grey-100) px-3 py-1 text-xs font-semibold uppercase tracking-wider text-(--rs-neutral-grey-600)">
          <Shield className="h-3.5 w-3.5" />
          {roleLabel(session.role)}
        </span>
      </header>

      <SectionNav isAdmin={isAdmin} />

      {/* Daily flow */}
      <section id="daily-flow" className="scroll-mt-24 rounded-2xl border border-(--rs-neutral-grey-200) bg-white p-6 shadow-sm">
        <h2 className="mb-6 font-serif text-lg font-semibold text-(--rs-neutral-grey-900)">Your daily flow</h2>
        <DailyFlowStrip />
      </section>

      {/* Page-by-page (user) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {USER_GUIDES.map(guide => <HowToCard key={guide.id} guide={guide} />)}
      </div>

      {/* Admin pages — admins only */}
      {isAdmin && (
        <section id="admin-tools" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-(--rs-accent-600)" />
            <h2 className="font-serif text-lg font-semibold text-(--rs-neutral-grey-900)">Admin tools</h2>
            <span className="rounded-full bg-(--rs-accent-50) px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-(--rs-accent-700)">Admins only</span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {ADMIN_GUIDES.map(guide => <HowToCard key={guide.id} guide={guide} />)}
          </div>
        </section>
      )}

      {/* Escalation */}
      <section className="rounded-2xl border border-(--rs-primary-200) bg-(--rs-primary-50) p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-(--rs-primary-600) shadow-sm">
            <MessageCircle className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">Still stuck?</p>
            <p className="mt-0.5 text-sm text-(--rs-neutral-grey-600)">
              Message your team lead or an admin. You can also revisit your{' '}
              <Link href="/profile" className="font-semibold text-(--rs-primary-600) hover:underline">profile</Link>{' '}
              to update your details.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
