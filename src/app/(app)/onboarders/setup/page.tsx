import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, AlertCircle, ShieldCheck, CheckCircle2, Workflow, Mail, FileSignature,
  IdCard, Laptop, CalendarCheck, ListChecks,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { LeadToolHeader } from '@/components/lead-tool-header';
import { getSession } from '@/lib/session';
import { canAccessLeadTool } from '@/lib/rbac';
import { TestWorkflowButton } from './test-workflow-button';

type WorkflowEntry = {
  envKey:    string;
  label:     string;
  purpose:   string;
  stage:     string;
  icon:      typeof Workflow;
  phase:     'mvp' | 'post-mvp';
  template?: string;   // template name passed to the test-trigger action
};

function isConfigured(envKey: string): boolean {
  return Boolean(process.env[envKey]?.trim());
}

const WORKFLOWS: WorkflowEntry[] = [
  {
    envKey:   'N8N_BG_CHECK_INITIATE_URL',
    label:    'Background Check Initiate',
    purpose:  'SOP §3 — Emails the new hire the request for 3 character references + employment verification contacts.',
    stage:    'background_check',
    icon:     IdCard,
    phase:    'mvp',
    template: 'bg-check-initiate',
  },
  {
    envKey:   'N8N_REFERENCE_REQUEST_URL',
    label:    'Reference Request',
    purpose:  'SOP §4 — One email per referee asking for a confidential PDF response within 48h.',
    stage:    'background_check',
    icon:     Mail,
    phase:    'mvp',
    template: 'reference-request',
  },
  {
    envKey:   'N8N_EMPLOYMENT_VERIFICATION_URL',
    label:    'Employment Verification',
    purpose:  'SOP §4 — One email per prior-HR contact for factual employment verification.',
    stage:    'background_check',
    icon:     Mail,
    phase:    'mvp',
    template: 'employment-verification',
  },
  {
    envKey:   'N8N_ONBOARDING_WELCOME_URL',
    label:    'Welcome Email (contractor / intern)',
    purpose:  'SOP §5 — Branches on onboarder_type. Includes Teams + onboarding form + W-8 instructions.',
    stage:    'pre_onboarding',
    icon:     FileSignature,
    phase:    'mvp',
    template: 'welcome',
  },
  {
    envKey:   'N8N_GMAIL_SIGNATURE_NUDGE_URL',
    label:    'Gmail + Signature Nudge',
    purpose:  'SOP §6 — Tells the new hire what format their Romega Gmail should follow and links to the signature builder.',
    stage:    'pre_onboarding',
    icon:     Mail,
    phase:    'mvp',
    template: 'gmail-signature-nudge',
  },
  {
    envKey:   'N8N_GROUP_CHAT_ANNOUNCE_URL',
    label:    'Group-chat Announcement',
    purpose:  'SOP §7 — Generates the team-wide welcome message (Teams paste-friendly).',
    stage:    'pre_onboarding',
    icon:     Mail,
    phase:    'mvp',
    template: 'group-chat-announce',
  },
  {
    envKey:   'N8N_SOW_REMINDER_URL',
    label:    'Sweeps (SOW + referee nudges)',
    purpose:  'Daily 08:00 PHT cron — nudges HRBP on unsigned SOWs >48h and chases referees who haven’t responded >48h.',
    stage:    'offer_signed + background_check',
    icon:     FileSignature,
    phase:    'mvp',
    // No test trigger — cron-only workflow with no inbound webhook.
  },
  {
    envKey:   'N8N_30DAY_CHECKIN_URL',
    label:    '30-day Check-in',
    purpose:  'Auto-fires when status flips to thirty_day. Sends the probation check-in email to the new hire.',
    stage:    'day_one → thirty_day',
    icon:     CalendarCheck,
    phase:    'mvp',
  },
  {
    envKey:   'N8N_90DAY_REVIEW_URL',
    label:    '90-day Review',
    purpose:  'Auto-fires on transition to regularized or failed_probation — sends the outcome letter to the new hire.',
    stage:    'ninety_day → regularized / failed_probation',
    icon:     FileSignature,
    phase:    'mvp',
  },
  {
    envKey:  'N8N_DAY1_CALENDAR_URL',
    label:   'Day-1 Calendar',
    purpose: 'Creates a Day-1 schedule in Google Calendar — welcome, tooling tour, team intros, lead 1:1.',
    stage:   'pre_onboarding → day_one',
    icon:    CalendarCheck,
    phase:   'post-mvp',
  },
];

const BACKGROUND_CHECKS = [
  { label: 'Government IDs',                 detail: 'TIN, SSS, PhilHealth, Pag-IBIG — collected and verified format-wise.' },
  { label: 'NBI clearance',                  detail: 'Recent (within 6 months) NBI clearance PDF upload required.' },
  { label: 'Character references (3)',       detail: 'SOP §3 — 3 character references contacted via the automated email.' },
  { label: 'Prior-HR employment verification', detail: 'SOP §4 — 1 per previous employer; factual confirmation only.' },
];

const POST_MVP_PHASES = [
  { letter: 'A', title: 'ATS auto-promotion',    summary: 'When candidates.status flips to "hired", automatically create the onboarder row.' },
  { letter: 'B', title: 'Day-1 checklist UI',    summary: 'Render the seven *_at columns as toggleable checkboxes; auto-advance status when all done.' },
  { letter: 'C', title: 'Two extra emails',      summary: 'Ship gmail-signature-nudge (contractor/intern) and group-chat-announce.' },
  { letter: 'D', title: 'Onboarder-facing UI',   summary: 'In-app intake forms + welcome banner on /my-tasks, replacing the Google Forms.' },
  { letter: 'E', title: '30/90-day workflows',   summary: 'Probation milestone emails and decision UI.' },
  { letter: 'F', title: 'Sweeps cron',           summary: 'Daily 08:00 PHT: nudge unsigned SOWs and non-responding referees.' },
];

const OPEN_QUESTIONS = [
  { q: 'Default Onboarding Lead resolution',      a: 'MVP uses DEFAULT_ONBOARDING_LEAD_USER_ID env var. Replace with per-team lookup once HR confirms.' },
  { q: 'Group-chat announcement delivery',        a: 'Today returns text the Lead pastes. Decide whether to invest in Teams API integration.' },
  { q: 'W-8 attachments',                          a: 'Attach blank+sample W-8 PDFs to welcome email, or host links in a public bucket. Pick after observing bounce rates.' },
  { q: 'SOW e-signature integration',              a: 'MVP records sow_signed_at on manual click. Add webhook from DocuSign / Google Workspace when adopted.' },
  { q: 'Failed probation vs PIP first',            a: 'MVP treats failed_probation as terminal. Revisit after 6 months of data.' },
  { q: 'Intern Romega Gmail format',               a: 'SOP says jsmith.romegasolutions@gmail.com — confirm with Chief of Staff in 2026.' },
  { q: 'Sender Gmail throttling',                  a: 'Watch Gmail send count during hiring sprees; consider Resend/SendGrid if hit.' },
];

export default async function OnboardingSetupPage() {
  const session = await getSession();
  if (!session || !canAccessLeadTool('onboarding', session.role, session.team)) {
    redirect('/dashboard');
  }

  const mvpConfigured = WORKFLOWS.filter(w => w.phase === 'mvp' && isConfigured(w.envKey)).length;
  const mvpTotal      = WORKFLOWS.filter(w => w.phase === 'mvp').length;

  return (
    <div className="space-y-6">
      <Link
        href="/onboarders"
        className="inline-flex items-center gap-1.5 text-sm text-(--rs-neutral-grey-500) hover:text-(--rs-primary-600) transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to onboarders
      </Link>

      <LeadToolHeader
        eyebrow="Reference"
        title="Setup &amp; workflows"
        description="MVP setup checklist, n8n workflow registry, and the post-MVP roadmap. Reference material — operations live on the main /onboarders page."
      />

      {/* MVP setup */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-(--rs-primary-50) p-2 text-(--rs-primary-700)">
              <ListChecks className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">MVP setup checklist</h2>
              <p className="mt-0.5 text-sm text-(--rs-neutral-grey-500)">
                Run these in order. Full spec at <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">docs/INTERNAL_ONBOARDING_MVP_SETUP.md</code>.
              </p>
            </div>
          </div>

          <ol className="space-y-3">
            <SetupItem
              n={1}
              title="Apply the database migration"
              body={<>Run <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">docs/migrations/add-onboarders-tables.sql</code> in the Supabase SQL Editor. Creates 5 tables + the <code>onboarder-docs</code> storage bucket.</>}
            />
            <SetupItem
              n={2}
              title="Onboarding Lead is set to Erich"
              body={<>Hardcoded default — every onboarder is created with <strong>Erich</strong> as the Onboarding Lead, and every email is signed by her. Override at runtime by setting <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">ONBOARDING_LEAD_NAME</code> in env.</>}
            />
            <SetupItem
              n={3}
              title="Deploy the 4 MVP n8n workflows"
              body={<>Already pushed via <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">scripts/deploy-onboarding-workflows.py</code>. Webhook URLs are auto-recorded in <code>.env</code>. Run with <code>--update</code> after editing a workflow JSON.</>}
            />
            <SetupItem
              n={4}
              title="Wire up Gmail credentials in n8n"
              body={<>Each of the 4 workflows has a <strong>Send Gmail</strong> node with a placeholder credential ID. Open each workflow in n8n → click the Gmail node → set its credential to a real Gmail OAuth account (recommended: <code>onboarding@romega-solutions.com</code>) → save. Workflows are already active — they&apos;ll start sending immediately once the credential is set.</>}
            />
            <SetupItem
              n={5}
              title="Smoke test each workflow"
              body={<>In the <strong>Workflow registry</strong> below, click <strong>Test</strong> next to each row, enter your inbox, and confirm the email arrives. Test fires a synthetic payload — no onboarder rows are modified.</>}
            />
            <SetupItem
              n={6}
              title="Migrate the in-flight rows + archive the old Sheet"
              body="Manually copy currently-active onboarders from the old Sheet into the app. Rename the Sheet to '(ARCHIVED — see app)' and lock editing."
            />
          </ol>
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
          <div className="px-6 py-4 border-b border-(--rs-neutral-grey-100) flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Workflow registry</h2>
              <p className="mt-1 text-xs text-(--rs-neutral-grey-500)">
                MVP needs the first four configured. The rest are reserved env keys for post-MVP phases.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-(--rs-primary-50) px-3 py-1 text-xs font-bold text-(--rs-primary-800)">
              MVP {mvpConfigured} / {mvpTotal} configured
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-(--rs-neutral-grey-200) text-left text-xs uppercase tracking-wider text-(--rs-neutral-grey-500) bg-(--rs-neutral-grey-50)">
                <tr>
                  <th className="px-6 py-3 font-semibold">Workflow</th>
                  <th className="px-4 py-3 font-semibold">Phase</th>
                  <th className="px-4 py-3 font-semibold">Env key</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Test</th>
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
                            <div className="mt-1 text-[10px] text-(--rs-neutral-grey-400) uppercase tracking-wider">Fires at: {w.stage}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {w.phase === 'mvp' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-(--rs-primary-50) px-2 py-0.5 text-[11px] font-semibold text-(--rs-primary-700) border border-(--rs-primary-100)">
                            MVP
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-(--rs-accent-50) px-2 py-0.5 text-[11px] font-semibold text-(--rs-accent-700) border border-(--rs-accent-100)">
                            Post-MVP
                          </span>
                        )}
                      </td>
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
                            Not set
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        {w.template ? (
                          <TestWorkflowButton template={w.template} label={w.label} configured={configured} />
                        ) : (
                          <span className="text-[10px] text-(--rs-neutral-grey-400)">—</span>
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

      {/* Post-MVP roadmap */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-(--rs-accent-50) p-2 text-(--rs-accent-700)">
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Post-MVP roadmap</h2>
              <p className="mt-0.5 text-sm text-(--rs-neutral-grey-500)">
                In execution order. Don&apos;t start until the MVP has run clean for one stabilization week.
              </p>
            </div>
          </div>
          <ol className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {POST_MVP_PHASES.map(p => (
              <li key={p.letter} className="rounded-lg border border-(--rs-accent-100) bg-(--rs-accent-50)/30 p-3">
                <div className="flex items-baseline gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-(--rs-accent-100) text-[11px] font-bold text-(--rs-accent-800)">
                    {p.letter}
                  </span>
                  <span className="text-sm font-semibold text-(--rs-neutral-grey-900)">{p.title}</span>
                </div>
                <p className="mt-1.5 text-xs text-(--rs-neutral-grey-600) leading-relaxed">{p.summary}</p>
              </li>
            ))}
          </ol>
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
              <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Open questions — to resolve after MVP + post-MVP phases ship</h2>
              <ul className="mt-3 space-y-2.5 text-sm">
                {OPEN_QUESTIONS.map(o => (
                  <li key={o.q} className="rounded-md border border-(--rs-neutral-grey-100) bg-white px-3 py-2">
                    <p className="font-semibold text-(--rs-neutral-grey-900) leading-snug">{o.q}</p>
                    <p className="mt-1 text-xs text-(--rs-neutral-grey-600) leading-relaxed">{o.a}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SetupItem({ n, title, body }: { n: number; title: string; body: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--rs-primary-100) text-xs font-bold text-(--rs-primary-800)">
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">{title}</p>
        <p className="mt-0.5 text-xs text-(--rs-neutral-grey-600) leading-relaxed">{body}</p>
      </div>
    </li>
  );
}
