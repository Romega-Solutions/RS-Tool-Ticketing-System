import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import {
  Workflow,
  Mail,
  CalendarCheck,
  FileSignature,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { LeadToolHeader, StatCard } from '@/components/lead-tool-header';
import { getSession } from '@/lib/session';
import { canAccessLeadTool } from '@/lib/rbac';
import { AtsTabs } from '../ats-tabs';

type WebhookEntry = {
  envKey:    string;
  label:     string;
  purpose:   string;
  stage:     string;
  configured: boolean;
  icon:      typeof Workflow;
  status:    'live' | 'planned';
};

function isConfigured(envKey: string): boolean {
  return Boolean(process.env[envKey]?.trim());
}

export default async function AutomationsPage() {
  const session = await getSession();
  if (!session || !canAccessLeadTool('recruiting', session.role, session.team)) {
    redirect('/dashboard');
  }

  const webhooks: WebhookEntry[] = [
    {
      envKey:    'N8N_RESUME_PARSER_URL',
      label:     'Resume Parser',
      purpose:   'Extracts structured candidate data (skills, education, experience) from uploaded PDFs.',
      stage:     'On apply / upload',
      configured: isConfigured('N8N_RESUME_PARSER_URL'),
      icon:      FileSignature,
      status:    'live',
    },
    {
      envKey:    'N8N_COMMUNICATION_WEBHOOK_URL',
      label:     'Candidate Communication',
      purpose:   'Sends Gmail templates to the applicant on creation and on status-change events that have an auto-email template.',
      stage:     'On status change',
      configured: isConfigured('N8N_COMMUNICATION_WEBHOOK_URL'),
      icon:      Mail,
      status:    'live',
    },
    {
      envKey:    'N8N_RECRUITER_NOTIFY_URL',
      label:     'Recruiter Notification',
      purpose:   'Pings the position owner (assigned recruiter) the moment a public application lands so it does not sit unseen.',
      stage:     'On public apply',
      configured: isConfigured('N8N_RECRUITER_NOTIFY_URL'),
      icon:      Mail,
      status:    'live',
    },
    {
      envKey:    'N8N_INTERVIEW_INVITE_URL',
      label:     'Internal Interview Invite',
      purpose:   'Creates Google Calendar event with Meet link, sends .ics invite to candidate + recruiter.',
      stage:     'pending_response → interview_romega',
      configured: isConfigured('N8N_INTERVIEW_INVITE_URL'),
      icon:      CalendarCheck,
      status:    'planned',
    },
    {
      envKey:    'N8N_CLIENT_ENDORSEMENT_URL',
      label:     'Client Endorsement',
      purpose:   'Emails the client with resume PDF + candidate one-pager attached.',
      stage:     'interview_romega → endorsed_client',
      configured: isConfigured('N8N_CLIENT_ENDORSEMENT_URL'),
      icon:      Mail,
      status:    'planned',
    },
    {
      envKey:    'N8N_FINAL_INTERVIEW_INVITE_URL',
      label:     'Final Interview Invite',
      purpose:   'Creates Google Calendar event with client + candidate + recruiter, sends invites.',
      stage:     'endorsed_client → final_interview',
      configured: isConfigured('N8N_FINAL_INTERVIEW_INVITE_URL'),
      icon:      CalendarCheck,
      status:    'planned',
    },
    {
      envKey:    'N8N_OFFER_SOW_URL',
      label:     'Offer Letter + SOW',
      purpose:   'Generates Statement of Work + offer letter from a Google Docs template, exports as PDF, emails candidate (BCC recruiter).',
      stage:     'final_interview → offered',
      configured: isConfigured('N8N_OFFER_SOW_URL'),
      icon:      FileSignature,
      status:    'planned',
    },
    {
      envKey:    'N8N_ONBOARDING_REFERENCES_URL',
      label:     'Onboarding + References',
      purpose:   'Sends onboarding pack to candidate, then fires reference-check request emails to each reference on the candidate record.',
      stage:     'offered → hired',
      configured: isConfigured('N8N_ONBOARDING_REFERENCES_URL'),
      icon:      Mail,
      status:    'planned',
    },
  ];

  const liveCount       = webhooks.filter(w => w.status === 'live').length;
  const liveConfigured  = webhooks.filter(w => w.status === 'live' && w.configured).length;
  const plannedCount    = webhooks.filter(w => w.status === 'planned').length;
  const plannedReady    = webhooks.filter(w => w.status === 'planned' && w.configured).length;

  return (
    <div className="space-y-6">
      <LeadToolHeader
        eyebrow="Recruiting tool"
        title="ATS Automations"
        description="n8n workflows that move candidates through the funnel — emails, Google Calendar invites, document generation. Configure each by setting the listed env var to the workflow's production webhook URL."
      />

      <AtsTabs />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="Live workflows"
          value={`${liveConfigured} / ${liveCount}`}
          hint="configured"
        />
        <StatCard
          icon={<Workflow className="w-4 h-4" />}
          label="Planned"
          value={`${plannedReady} / ${plannedCount}`}
          hint="env keys set"
        />
        <StatCard
          icon={<CalendarCheck className="w-4 h-4" />}
          label="Google Calendar"
          value={isConfigured('N8N_INTERVIEW_INVITE_URL') || isConfigured('N8N_FINAL_INTERVIEW_INVITE_URL') ? 'Wired' : 'Not yet'}
          hint="interview invites"
        />
      </div>

      {/* Webhook registry */}
      <Card>
        <CardContent className="p-0">
          <div className="px-6 py-4 border-b border-(--rs-neutral-grey-100)">
            <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Workflow registry</h2>
            <p className="mt-1 text-xs text-(--rs-neutral-grey-500)">
              Each workflow is a separate n8n webhook so they fail independently. Unset env vars are no-ops — the candidate row is always created first; automation is best-effort.
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
                {webhooks.map(w => {
                  const Icon = w.icon;
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
                      <td className="px-4 py-4 text-xs text-(--rs-neutral-grey-600) whitespace-nowrap">
                        {w.stage}
                      </td>
                      <td className="px-4 py-4">
                        <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-[11px] text-(--rs-neutral-grey-800)">
                          {w.envKey}
                        </code>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <StatusBadge configured={w.configured} kind={w.status} />
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
        <CardContent className="p-6 space-y-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-(--rs-accent-50) p-2 text-(--rs-accent-700)">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">
                Open questions before building the planned workflows
              </h2>
              <ul className="mt-3 space-y-2 text-sm text-(--rs-neutral-grey-700) list-disc ml-5 leading-relaxed">
                <li><strong>SOW template</strong> — do we have an existing Google Doc to use, or design a new one?</li>
                <li><strong>References</strong> — collected at apply time, or added by the recruiter later? (No field exists yet.)</li>
                <li><strong>Calendar conflicts</strong> — should n8n check the recruiter&apos;s free/busy before scheduling, or do recruiters pick a known-free time in the UI?</li>
                <li><strong>Client contacts</strong> — <code className="rounded bg-(--rs-neutral-grey-100) px-1 py-0.5 text-xs">positions.client</code> is a free-text string. Do we need a real <code className="rounded bg-(--rs-neutral-grey-100) px-1 py-0.5 text-xs">clients</code> table with contact emails?</li>
                <li><strong>One-pager generator</strong> — render <code className="rounded bg-(--rs-neutral-grey-100) px-1 py-0.5 text-xs">/candidates/[id]/one-pager</code> server-side to PDF, or build it inside n8n?</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ configured, kind }: { configured: boolean; kind: 'live' | 'planned' }) {
  if (configured) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 border border-green-200">
        <CheckCircle2 className="w-3 h-3" />
        Configured
      </span>
    );
  }
  if (kind === 'live') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 border border-red-200">
        <XCircle className="w-3 h-3" />
        Missing
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-(--rs-neutral-grey-50) px-2 py-0.5 text-[11px] font-semibold text-(--rs-neutral-grey-600) border border-(--rs-neutral-grey-200)">
      Planned
    </span>
  );
}
