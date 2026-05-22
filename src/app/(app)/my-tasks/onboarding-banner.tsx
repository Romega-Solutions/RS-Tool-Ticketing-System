import Link from 'next/link';
import { Sparkles, UserCircle2, Video, Shirt, MessageCircleQuestion, ArrowRight, CheckCircle2 } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SessionUser } from '@/lib/session';

// SOP §10 — the four "Key Reminders" shown to every onboarder until they
// reach `regularized`. Banner hides automatically once the onboarder row's
// status changes to one of the terminal states.

const REMINDERS = [
  { icon: UserCircle2,         label: 'Profile photo',  body: 'Add a clear professional photo to your Romega Gmail + Teams.' },
  { icon: Video,                label: 'Camera on',      body: 'Default to camera-on in all internal meetings.' },
  { icon: Shirt,                label: 'Dress code',     body: 'Business-casual on camera; smart-casual day-to-day.' },
  { icon: MessageCircleQuestion, label: 'Ask questions', body: 'Bring questions early. The Onboarding Lead is your first stop.' },
];

const HIDE_FOR_STATUSES = new Set(['regularized', 'failed_probation', 'withdrew']);

export async function OnboardingBanner({ session }: { session: SessionUser }) {
  if (!session.isOnboarding) return null;

  // Look up the onboarder row to decide whether to show the intake-form CTA
  // and whether the banner should hide (onboarding done).
  const supabase = createAdminClient();
  const { data: onboarder } = await supabase
    .from('onboarders')
    .select('id, onboarder_type, status, onboarding_form_submitted_at')
    .eq('user_id', session.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (onboarder && HIDE_FOR_STATUSES.has(onboarder.status)) {
    return null;
  }

  const intakeHref = onboarder?.onboarder_type === 'intern'
    ? '/my-tasks/onboarding-intern-intake'
    : '/my-tasks/onboarding-intake';
  const formSubmitted = Boolean(onboarder?.onboarding_form_submitted_at);

  return (
    <div className="rounded-2xl border border-(--rs-primary-100) bg-gradient-to-br from-(--rs-primary-50) to-white p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="rounded-lg bg-(--rs-primary-100) p-2 text-(--rs-primary-700)">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">
            Welcome to Romega, {session.name.split(' ')[0]} 👋
          </h2>
          <p className="mt-0.5 text-sm text-(--rs-neutral-grey-600)">
            A few key reminders while you onboard. Your Onboarding Lead will check in regularly.
          </p>
        </div>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
        {REMINDERS.map(r => {
          const Icon = r.icon;
          return (
            <li key={r.label} className="rounded-lg bg-white/70 border border-(--rs-primary-100)/60 p-3 flex items-start gap-2.5">
              <Icon className="w-4 h-4 mt-0.5 text-(--rs-primary-600) shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">{r.label}</p>
                <p className="text-[11px] text-(--rs-neutral-grey-600) leading-relaxed">{r.body}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {formSubmitted ? (
        <div className="rounded-lg border border-green-200 bg-green-50/70 p-3 flex items-center gap-2 text-sm">
          <CheckCircle2 className="w-4 h-4 text-green-700 shrink-0" />
          <span className="text-green-900">
            Onboarding form submitted. Your Onboarding Lead has it — they&apos;ll reach out with anything else.
          </span>
        </div>
      ) : (
        <Link
          href={intakeHref}
          className="inline-flex items-center gap-1.5 rounded-lg bg-(--rs-primary-600) px-4 py-2 text-sm font-semibold text-white hover:bg-(--rs-primary-700) transition-colors"
        >
          Complete your onboarding form
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}
