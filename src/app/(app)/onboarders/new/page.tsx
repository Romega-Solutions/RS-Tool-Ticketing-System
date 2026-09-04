import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, GraduationCap, UserPlus2, ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { LeadToolHeader } from '@/components/lead-tool-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSession } from '@/lib/session';
import { hasToolAccess } from '@/lib/rbac';
import { APP_DEPARTMENTS } from '@/lib/orgchart';
import { createOnboarder } from '../actions';
import { getGlobalOnboardingLeadSetting, listOnboardingLeadOptions } from '@/lib/onboarding-lead';

export default async function NewOnboarderPage() {
  const session = await getSession();
  if (!session || !hasToolAccess('onboarding', session.role, session.toolAccess)) {
    redirect('/dashboard');
  }
  const [onboardingLeads, globalLeadSetting] = await Promise.all([
    listOnboardingLeadOptions(),
    getGlobalOnboardingLeadSetting(),
  ]);

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/onboarders"
        className="inline-flex items-center gap-1.5 text-sm text-(--rs-neutral-grey-500) hover:text-(--rs-primary-600) transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to onboarders
      </Link>

      <LeadToolHeader
        eyebrow="Internal onboarding"
        title="Start a new onboarding record"
        description="Creates an onboarding record for a new hire. Pre-employment requirements are managed from Recruitment before onboarding begins."
      />

      <Card>
        <CardContent className="p-6">
          <form action={createOnboarder} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
              <Field id="fullName"          label="Full name *"         required minLength={2} placeholder="Juan Dela Cruz" />
              <Field id="personalEmail"     label="Personal email *"    required type="email" placeholder="juan@example.com" />
              <Field id="phone"             label="Phone"               placeholder="+63 917 555 1234" />
              <div className="space-y-1.5">
                <Label htmlFor="onboarderType" className="text-(--rs-neutral-grey-700) font-medium">Type *</Label>
                <div className="relative">
                  <select
                    id="onboarderType"
                    name="onboarderType"
                    required
                    defaultValue="contractor"
                    className="appearance-none flex h-11 w-full rounded-xl border border-(--rs-neutral-grey-200) bg-white pl-3 pr-9 py-2 text-sm text-(--rs-neutral-grey-900) outline-none transition-all focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100) cursor-pointer"
                  >
                    <option value="contractor" style={{ backgroundColor: '#fff', color: '#0f172a' }}>Independent contractor</option>
                    <option value="intern"     style={{ backgroundColor: '#fff', color: '#0f172a' }}>Intern</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--rs-neutral-grey-400)" />
                </div>
              </div>
              <Field id="roleTitle"         label="Role title"          placeholder="Frontend Engineer" />

              <div className="space-y-1.5">
                <Label className="text-(--rs-neutral-grey-700) font-medium">Onboarding lead</Label>
                <div className="flex h-11 items-center rounded-xl border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) px-3 text-sm font-medium text-(--rs-neutral-grey-800)">
                  {globalLeadSetting.lead?.name ?? 'Not configured — use Setup & workflows'}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="team" className="text-(--rs-neutral-grey-700) font-medium">Department *</Label>
                <div className="relative">
                  <select
                    id="team"
                    name="team"
                    required
                    defaultValue=""
                    className="appearance-none flex h-11 w-full rounded-xl border border-(--rs-neutral-grey-200) bg-white pl-3 pr-9 py-2 text-sm text-(--rs-neutral-grey-900) outline-none transition-all focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100) cursor-pointer"
                  >
                    <option value="" disabled style={{ backgroundColor: '#fff', color: '#0f172a' }}>— Select department —</option>
                    {APP_DEPARTMENTS.map(d => (
                      <option key={d} value={d} style={{ backgroundColor: '#fff', color: '#0f172a' }}>{d}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--rs-neutral-grey-400)" />
                </div>
                <p className="text-[11px] text-(--rs-neutral-grey-500)">
                  Must match a department on the org chart. Required so reports can group by team.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="directSupervisorId" className="text-(--rs-neutral-grey-700) font-medium">Direct supervisor</Label>
                <div className="relative">
                  <select
                    id="directSupervisorId"
                    name="directSupervisorId"
                    defaultValue=""
                    className="appearance-none flex h-11 w-full rounded-xl border border-(--rs-neutral-grey-200) bg-white pl-3 pr-9 py-2 text-sm text-(--rs-neutral-grey-900) outline-none transition-all focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100) cursor-pointer"
                  >
                    <option value="" style={{ backgroundColor: '#fff', color: '#0f172a' }}>No direct supervisor yet</option>
                    {onboardingLeads.map(lead => (
                      <option key={lead.id} value={lead.id} style={{ backgroundColor: '#fff', color: '#0f172a' }}>{lead.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--rs-neutral-grey-400)" />
                </div>
              </div>
              <Field id="startDate"         label="Start date"          type="date" />
            </div>

            <div className="rounded-lg border border-(--rs-accent-100) bg-(--rs-accent-50)/40 p-4 flex items-start gap-3">
              <GraduationCap className="w-4 h-4 mt-0.5 text-(--rs-accent-700) shrink-0" />
              <p className="text-xs text-(--rs-neutral-grey-700) leading-relaxed">
                After creating: you&apos;ll be taken to the detail page to send onboarding emails and upload onboarding documents.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3">
              <Link
                href="/onboarders"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-(--rs-neutral-grey-200) bg-white px-6 text-sm font-semibold text-(--rs-neutral-grey-700) hover:bg-(--rs-neutral-grey-50) transition-colors"
              >
                Cancel
              </Link>
              <Button
                type="submit"
                disabled={!globalLeadSetting.lead}
                className="h-11 px-8 rounded-xl bg-(--rs-primary-600) hover:bg-(--rs-primary-700) shadow-lg shadow-(--rs-primary-100) gap-2 transition-all active:scale-[0.98]"
              >
                <UserPlus2 className="w-4 h-4" /> Create onboarder
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  id, label, type = 'text', required, placeholder, minLength,
}: {
  id: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  minLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-(--rs-neutral-grey-700) font-medium">{label}</Label>
      <Input
        id={id}
        name={id}
        type={type}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        className="h-11 rounded-xl border-(--rs-neutral-grey-200) focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100)"
      />
    </div>
  );
}

