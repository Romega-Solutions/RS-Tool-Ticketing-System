import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, FileText, ShieldCheck, Wallet, Phone } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { getSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { submitContractorIntake } from './actions';

export default async function ContractorOnboardingIntakePage() {
  const session = await getSession();
  if (!session)                redirect('/login');
  if (!session.isOnboarding)   redirect('/my-tasks');

  const supabase = createAdminClient();
  const { data: onb } = await supabase
    .from('onboarders')
    .select('id, full_name, personal_email, onboarder_type, onboarding_form_submitted_at')
    .eq('user_id', session.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // If the lead set them as intern, redirect to the intern intake instead.
  if (onb?.onboarder_type === 'intern') redirect('/my-tasks/onboarding-intern-intake');

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/my-tasks"
        className="inline-flex items-center gap-1.5 text-sm text-(--rs-neutral-grey-500) hover:text-(--rs-primary-600) transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to My Tasks
      </Link>

      <div>
        <h1 className="font-serif text-2xl font-bold text-(--rs-neutral-grey-900)">Contractor onboarding form</h1>
        <p className="mt-1 text-sm text-(--rs-neutral-grey-600)">
          Replaces the Google Form. Submit once — your Onboarding Lead will follow up on Teams.
        </p>
      </div>

      {onb?.onboarding_form_submitted_at ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-(--rs-neutral-grey-700)">
              You already submitted this form on{' '}
              <strong>{new Date(onb.onboarding_form_submitted_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>.
              Contact HR if anything needs to change.
            </p>
          </CardContent>
        </Card>
      ) : (
        <form action={submitContractorIntake} className="space-y-6">
          {/* Personal */}
          <Section title="Personal" icon={<FileText className="w-4 h-4" />}>
            <Row>
              <Field name="legalName" label="Legal full name *" required defaultValue={onb?.full_name ?? ''} />
              <Field name="preferredName" label="Preferred name" />
            </Row>
            <Row>
              <Field name="phone" label="Phone (with country code)" type="tel" placeholder="+63 917 123 4567" />
              <Field name="dateOfBirth" label="Date of birth" type="date" />
            </Row>
            <Field name="mailingAddress" label="Mailing address" textarea />
          </Section>

          {/* Tax / Compliance */}
          <Section title="Tax & Compliance" icon={<ShieldCheck className="w-4 h-4" />}>
            <Row>
              <Field name="country" label="Country of residence" placeholder="Philippines" />
              <Field name="taxId" label="Tax ID (TIN / SSN / equivalent)" />
            </Row>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-(--rs-neutral-grey-600) mb-1.5">
                W-8 form (PDF) *
              </label>
              <input
                type="file"
                name="w8File"
                accept="application/pdf"
                required
                className="block w-full text-sm text-(--rs-neutral-grey-800) file:mr-3 file:rounded-lg file:border-0 file:bg-(--rs-primary-50) file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-(--rs-primary-800) hover:file:bg-(--rs-primary-100) cursor-pointer"
              />
              <p className="mt-1 text-[11px] text-(--rs-neutral-grey-500)">
                Upload your completed W-8. Use the blank form your Onboarding Lead shared on Teams; a sample is attached for reference.
              </p>
            </div>
          </Section>

          {/* Banking — Wise */}
          <Section title="Banking — Wise" icon={<Wallet className="w-4 h-4" />}>
            <Row>
              <Field name="wiseHolderName" label="Wise account holder name" />
              <Field name="wiseEmail" label="Wise email" type="email" />
            </Row>
            <Field name="wiseCurrency" label="Preferred payout currency (USD / PHP / etc.)" placeholder="USD" />
          </Section>

          {/* Emergency contact */}
          <Section title="Emergency contact" icon={<Phone className="w-4 h-4" />}>
            <Row>
              <Field name="emergencyName" label="Contact name" />
              <Field name="emergencyRel" label="Relationship" placeholder="Spouse, parent, sibling…" />
            </Row>
            <Field name="emergencyPhone" label="Contact phone" type="tel" />
          </Section>

          {/* Consent */}
          <Section title="Consent" icon={<ShieldCheck className="w-4 h-4" />}>
            <label className="flex items-start gap-3 text-sm text-(--rs-neutral-grey-700)">
              <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 rounded border-(--rs-neutral-grey-300) text-(--rs-primary-600) focus:ring-(--rs-primary-200)" />
              <span>
                I confirm the information above is accurate and I agree to the{' '}
                <strong>Romega Independent Contractor Agreement</strong> attached in the SOW your HRBP sent you.
              </span>
            </label>
          </Section>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/my-tasks"
              className="inline-flex h-10 items-center rounded-lg border border-(--rs-neutral-grey-200) bg-white px-4 text-sm font-semibold text-(--rs-neutral-grey-700) hover:bg-(--rs-neutral-grey-50) transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="inline-flex h-10 items-center rounded-lg bg-(--rs-primary-600) px-5 text-sm font-semibold text-white hover:bg-(--rs-primary-700) transition-colors"
            >
              Submit onboarding form
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── tiny inline form primitives (page-local, intentional duplication) ──────

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <h2 className="font-serif text-base font-bold text-(--rs-neutral-grey-900) flex items-center gap-2">
          <span className="text-(--rs-primary-600)">{icon}</span>
          {title}
        </h2>
        {children}
      </CardContent>
    </Card>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>;
}

function Field({
  name, label, type = 'text', placeholder, defaultValue, required, textarea,
}: {
  name:          string;
  label:         string;
  type?:         string;
  placeholder?:  string;
  defaultValue?: string;
  required?:     boolean;
  textarea?:     boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-wider text-(--rs-neutral-grey-600) mb-1">
        {label}
      </span>
      {textarea ? (
        <textarea
          name={name}
          placeholder={placeholder}
          defaultValue={defaultValue}
          required={required}
          rows={3}
          className="w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white p-2.5 text-sm text-(--rs-neutral-grey-900) placeholder:text-(--rs-neutral-grey-400) focus:outline-none focus:ring-2 focus:ring-(--rs-primary-200)"
        />
      ) : (
        <input
          type={type}
          name={name}
          placeholder={placeholder}
          defaultValue={defaultValue}
          required={required}
          className="w-full h-10 rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 text-sm text-(--rs-neutral-grey-900) placeholder:text-(--rs-neutral-grey-400) focus:outline-none focus:ring-2 focus:ring-(--rs-primary-200)"
        />
      )}
    </label>
  );
}
