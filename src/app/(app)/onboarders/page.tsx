import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import {
  GraduationCap,
  ShieldCheck,
  FileSignature,
  CalendarCheck,
  Mail,
  Laptop,
  IdCard,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  Workflow,
} from 'lucide-react';
import { LeadToolHeader, StatCard } from '@/components/lead-tool-header';
import { getSession } from '@/lib/session';
import { canAccessLeadTool } from '@/lib/rbac';

type Stage = {
  key:         string;
  label:       string;
  description: string;
  color:       'grey' | 'amber' | 'blue' | 'primary' | 'green' | 'red';
};

const STAGES: Stage[] = [
  { key: 'offer_signed',     label: 'Offer signed',     description: 'Candidate accepted the offer; start date scheduled.',            color: 'grey' },
  { key: 'background_check', label: 'Background check', description: 'Gov IDs, NBI, prior-employer references, credential checks.',    color: 'amber' },
  { key: 'pre_onboarding',   label: 'Pre-onboarding',   description: 'Contract + NDA signed, BIR/SSS/Pag-IBIG/PhilHealth, equipment.',  color: 'blue' },
  { key: 'day_one',          label: 'Day 1',            description: 'Account provisioning, team intros, calendar handoff.',            color: 'primary' },
  { key: 'thirty_day',       label: '30-day check-in',  description: 'First review with the lead — fit, blockers, training gaps.',     color: 'primary' },
  { key: 'ninety_day',       label: '90-day review',    description: 'End of probation — pass/fail decision documented.',              color: 'primary' },
  { key: 'regularized',      label: 'Regularized',      description: 'Full-time hire; onboarding flow complete.',                       color: 'green' },
];

const TERMINAL_FAIL = [
  { key: 'failed_probation', label: 'Failed probation', description: 'Did not pass the 90-day review.' },
  { key: 'withdrew',         label: 'Withdrew',         description: 'Resigned during onboarding.' },
];

type WorkflowEntry = {
  envKey:    string;
  label:     string;
  purpose:   string;
  stage:     string;
  icon:      typeof Workflow;
};

function isConfigured(envKey: string): boolean {
  return Boolean(process.env[envKey]?.trim());
}

const WORKFLOWS: WorkflowEntry[] = [
  {
    envKey:  'N8N_BG_CHECK_INITIATE_URL',
    label:   'Background Check Initiate',
    purpose: 'Emails the new hire a secure form to upload gov IDs (TIN, SSS, PhilHealth, Pag-IBIG, NBI clearance) and consent to checks.',
    stage:   'offer_signed → background_check',
    icon:    IdCard,
  },
  {
    envKey:  'N8N_REFERENCE_REQUEST_URL',
    label:   'Reference Request',
    purpose: 'Emails each prior-employer reference a short questionnaire (tenure, role fit, eligibility for rehire). Replies feed back to the onboarding record.',
    stage:   'background_check',
    icon:    Mail,
  },
  {
    envKey:  'N8N_ONBOARDING_PACK_URL',
    label:   'Onboarding Pack',
    purpose: 'Sends welcome email + contract + NDA + employee handbook PDF; collects e-signatures via the configured provider.',
    stage:   'background_check → pre_onboarding',
    icon:    FileSignature,
  },
  {
    envKey:  'N8N_EQUIPMENT_REQUEST_URL',
    label:   'Equipment Provisioning',
    purpose: 'Opens an IT ticket for laptop + accounts (Google Workspace, Slack, GitHub, Plane/PM tool) based on the role.',
    stage:   'pre_onboarding',
    icon:    Laptop,
  },
  {
    envKey:  'N8N_DAY1_CALENDAR_URL',
    label:   'Day-1 Calendar',
    purpose: 'Creates a Day-1 schedule in Google Calendar — welcome, tooling tour, team intros, lead 1:1.',
    stage:   'pre_onboarding → day_one',
    icon:    CalendarCheck,
  },
  {
    envKey:  'N8N_30DAY_CHECKIN_URL',
    label:   '30-day Check-in',
    purpose: 'Sends survey to new hire + schedules a 30-day 1:1 with their lead.',
    stage:   'day_one → thirty_day',
    icon:    CalendarCheck,
  },
  {
    envKey:  'N8N_90DAY_REVIEW_URL',
    label:   '90-day Review',
    purpose: 'Triggers regularization-decision form for the lead, sends outcome letter (PDF) to the new hire.',
    stage:   'thirty_day → ninety_day → regularized',
    icon:    FileSignature,
  },
];

const BACKGROUND_CHECKS = [
  { label: 'Government IDs', detail: 'TIN, SSS, PhilHealth, Pag-IBIG — collected and verified format-wise.' },
  { label: 'NBI clearance', detail: 'Recent (within 6 months) NBI clearance PDF upload required.' },
  { label: 'Previous employer references', detail: 'At least 2 references contacted via automated email.' },
  { label: 'Educational credentials', detail: 'Diploma / transcript of records check via uploaded copy.' },
  { label: 'Address verification', detail: 'Proof of address (utility bill / barangay cert) collected.' },
];

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session || !canAccessLeadTool('onboarding', session.role, session.team)) {
    redirect('/dashboard');
  }

  const configuredCount = WORKFLOWS.filter(w => isConfigured(w.envKey)).length;

  return (
    <div className="space-y-6">
      <LeadToolHeader
        eyebrow="People ops"
        title="Internal Onboarding"
        description="Move new Romega hires from offer-signed to regularized — background checks, gov IDs, contracts, Day-1 setup, 30/90-day reviews. Separate from the ATS (which tracks candidates being placed at clients)."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<GraduationCap className="w-4 h-4" />} label="Active onboarders" value="—" hint="not yet wired" />
        <StatCard icon={<ShieldCheck className="w-4 h-4" />}    label="Awaiting BG check" value="—" hint="background_check stage" />
        <StatCard icon={<CalendarCheck className="w-4 h-4" />}  label="Day-1 this week"   value="—" hint="upcoming starts" />
        <StatCard icon={<Workflow className="w-4 h-4" />}       label="Workflows configured" value={`${configuredCount} / ${WORKFLOWS.length}`} hint="n8n webhooks set" accent />
      </div>

      {/* Setup required */}
      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-(--rs-accent-50) p-2 text-(--rs-accent-700)">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Setup required</h2>
              <p className="mt-1 text-sm text-(--rs-neutral-grey-600)">
                This module is scaffolded but not yet active. Before onboarders can be tracked here, the following needs to land:
              </p>
              <ol className="mt-3 list-decimal text-sm text-(--rs-neutral-grey-700) ml-5 space-y-1.5 leading-relaxed">
                <li>
                  Supabase table <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">onboarders</code> with the stages listed below, plus a child table <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">onboarder_documents</code> for uploaded gov IDs / NBI / contracts.
                </li>
                <li>Supabase Storage bucket <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">onboarder-docs</code> (private) for the uploads.</li>
                <li>
                  n8n workflows for each row in <strong>Workflow registry</strong> below, with the matching env vars wired in <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">.env</code>.
                </li>
                <li>Promotion from <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">candidates.status = &apos;hired&apos;</code> → auto-creates an onboarder row.</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Funnel */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="rounded-lg bg-(--rs-primary-50) p-2 text-(--rs-primary-700)">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Onboarding funnel</h2>
              <p className="mt-0.5 text-sm text-(--rs-neutral-grey-500)">7 happy-path stages + 2 terminal-fail states.</p>
            </div>
          </div>

          <ol className="space-y-3">
            {STAGES.map((stage, i) => (
              <li key={stage.key} className="flex items-start gap-3">
                <div className={`shrink-0 mt-0.5 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${stageBadgeCls(stage.color)}`}>
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-(--rs-neutral-grey-900)">{stage.label}</span>
                    <code className="text-[10px] text-(--rs-neutral-grey-400)">{stage.key}</code>
                    {i < STAGES.length - 1 && (
                      <ArrowRight className="w-3 h-3 text-(--rs-neutral-grey-300)" />
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-(--rs-neutral-grey-500) leading-relaxed">{stage.description}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-5 pt-5 border-t border-(--rs-neutral-grey-100)">
            <div className="text-[10px] font-bold uppercase tracking-widest text-(--rs-neutral-grey-500) mb-2">Terminal-fail states</div>
            <div className="grid sm:grid-cols-2 gap-3">
              {TERMINAL_FAIL.map(t => (
                <div key={t.key} className="rounded-lg border border-red-100 bg-red-50/40 p-3">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-3.5 h-3.5 text-red-600" />
                    <span className="text-sm font-semibold text-red-900">{t.label}</span>
                    <code className="text-[10px] text-red-700/70">{t.key}</code>
                  </div>
                  <p className="mt-1 text-xs text-red-700/80">{t.description}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Background check policy */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="rounded-lg bg-(--rs-primary-50) p-2 text-(--rs-primary-700)">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Background check checklist</h2>
              <p className="mt-0.5 text-sm text-(--rs-neutral-grey-500)">Every new hire passes through these before reaching <code className="rounded bg-(--rs-neutral-grey-100) px-1 py-0.5 text-[10px]">pre_onboarding</code>.</p>
            </div>
          </div>
          <ul className="space-y-2.5">
            {BACKGROUND_CHECKS.map(c => (
              <li key={c.label} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-(--rs-primary-600)" />
                <div>
                  <span className="font-semibold text-(--rs-neutral-grey-900)">{c.label}</span>
                  <span className="text-(--rs-neutral-grey-600)"> — {c.detail}</span>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Workflow registry */}
      <Card>
        <CardContent className="p-0">
          <div className="px-6 py-4 border-b border-(--rs-neutral-grey-100)">
            <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Workflow registry</h2>
            <p className="mt-1 text-xs text-(--rs-neutral-grey-500)">
              Each onboarding stage transition fires its own n8n webhook. Unset env vars are no-ops — the onboarder record is always the source of truth.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-(--rs-neutral-grey-200) text-left text-xs uppercase tracking-wider text-(--rs-neutral-grey-500) bg-(--rs-neutral-grey-50)">
                <tr>
                  <th className="px-6 py-3 font-semibold">Workflow</th>
                  <th className="px-4 py-3 font-semibold">Fires on</th>
                  <th className="px-4 py-3 font-semibold">Env key</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--rs-neutral-grey-100)">
                {WORKFLOWS.map(w => {
                  const Icon = w.icon;
                  const configured = isConfigured(w.envKey);
                  return (
                    <tr key={w.envKey} className="align-top">
                      <td className="px-6 py-4 max-w-md">
                        <div className="flex items-start gap-3">
                          <div className="rounded-md bg-(--rs-neutral-grey-50) p-1.5 text-(--rs-neutral-grey-600)">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-(--rs-neutral-grey-900)">{w.label}</div>
                            <div className="mt-0.5 text-xs text-(--rs-neutral-grey-500) leading-relaxed">{w.purpose}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-xs text-(--rs-neutral-grey-600) whitespace-nowrap">{w.stage}</td>
                      <td className="px-4 py-4">
                        <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-[11px] text-(--rs-neutral-grey-800)">
                          {w.envKey}
                        </code>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {configured ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 border border-green-200">
                            <CheckCircle2 className="w-3 h-3" />
                            Configured
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-(--rs-neutral-grey-50) px-2 py-0.5 text-[11px] font-semibold text-(--rs-neutral-grey-600) border border-(--rs-neutral-grey-200)">
                            Planned
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Open questions */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-(--rs-accent-50) p-2 text-(--rs-accent-700)">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Open questions before turning this on</h2>
              <ul className="mt-3 space-y-2 text-sm text-(--rs-neutral-grey-700) list-disc ml-5 leading-relaxed">
                <li><strong>Background check provider</strong> — DIY via gov-ID uploads + NBI scan, or integrate a paid provider (e.g. CheckPH, ApprovedDirect)?</li>
                <li><strong>E-signature</strong> — Google Workspace native, DocuSign, or a free alternative for contract + NDA?</li>
                <li><strong>References count</strong> — how many references per hire (2? 3?), and are they required or nice-to-have?</li>
                <li><strong>Equipment list</strong> — is there a per-role template (e.g. dev = laptop + GitHub + Plane, designer = laptop + Figma + Adobe), or one-size-fits-all?</li>
                <li><strong>Probation review</strong> — does failing 90-day mean immediate termination, or a 30-day PIP first?</li>
                <li><strong>Promotion from ATS</strong> — automatic when a candidate moves to <code className="rounded bg-(--rs-neutral-grey-100) px-1 py-0.5 text-xs">hired</code>, or a manual &quot;Start onboarding&quot; button?</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function stageBadgeCls(color: Stage['color']): string {
  switch (color) {
    case 'grey':    return 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-700)';
    case 'amber':   return 'bg-amber-100 text-amber-800';
    case 'blue':    return 'bg-blue-100 text-blue-800';
    case 'primary': return 'bg-(--rs-primary-100) text-(--rs-primary-800)';
    case 'green':   return 'bg-green-100 text-green-800';
    case 'red':     return 'bg-red-100 text-red-800';
  }
}
