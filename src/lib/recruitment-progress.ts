type Contact = { request_sent_at: string | null; responded_at: string | null; last_reminder_sent_at?: string | null };
type Request = { sent_at: string | null; last_reminder_sent_at?: string | null; expires_at: string; invalidated_at: string | null; submitted_at: string | null };
export type RecruitmentProgressInput = {
  status: string;
  submittedAt: string | null;
  request: Request | null;
  references: Contact[];
  verifications: Contact[];
  documents: { kind: string; sent_at: string | null; signed_at?: string | null }[];
};
export type RecruitmentAction = {
  kind: 'send_background' | 'send_references' | 'send_verifications' | 'remind' | 'review';
  label: string;
  group: string;
  reminderKind?: 'background_check' | 'reference_check' | 'employment_verification' | 'sow';
  count?: number;
  lastSentAt?: string | null;
  tab?: 'background-check' | 'documents';
};

export function recruitmentDashboardActions(actions: RecruitmentAction[]): RecruitmentAction[] {
  return actions.filter(action => action.kind !== 'remind');
}
function latest(values: (string | null | undefined)[]) {
  return values.filter((v): v is string => !!v).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}

export function isActiveRecruitmentRequest(request: Request | null, now = Date.now()): boolean {
  return Boolean(request?.sent_at && !request.invalidated_at && !request.submitted_at && Date.parse(request.expires_at) > now);
}

// Groups advance independently. Partial responses never hide remaining reminders.
export function recruitmentActions(input: RecruitmentProgressInput, now = Date.now()): RecruitmentAction[] {
  if (input.status !== 'offered') return [];
  const { request, submittedAt, references, verifications, documents } = input;
  if (!submittedAt) {
    const active = isActiveRecruitmentRequest(request, now);
    return active && request ? [{ kind: 'remind', group: 'Candidate form', label: 'Remind candidate', reminderKind: 'background_check', count: 1,
      lastSentAt: latest([request.sent_at, request.last_reminder_sent_at]) }]
      : [{ kind: 'send_background', group: 'Candidate form', label: request ? 'Send new form request' : 'Send form request' }];
  }
  const result: RecruitmentAction[] = [];
  for (const [group, contacts, sendKind, reminderKind] of [
    ['References', references, 'send_references', 'reference_check'],
    ['Employment verification', verifications, 'send_verifications', 'employment_verification'],
  ] as const) {
    const unsent = contacts.filter(row => !row.request_sent_at && !row.responded_at);
    const pending = contacts.filter(row => row.request_sent_at && !row.responded_at);
    if (!contacts.length) result.push({ kind: 'review', group, label: 'Review contacts', tab: 'background-check' });
    else if (unsent.length) result.push({ kind: sendKind, group, label: `Send ${group.toLowerCase()} requests`, count: unsent.length });
    else if (pending.length) result.push({ kind: 'remind', group, label: `Remind ${group.toLowerCase()}`, reminderKind, count: pending.length,
      lastSentAt: latest(pending.flatMap(row => [row.request_sent_at, row.last_reminder_sent_at])) });
    else result.push({ kind: 'review', group, label: `Review ${group.toLowerCase()} responses`, tab: 'background-check' });
  }
  const allReceived = references.length > 0 && verifications.length > 0 && [...references, ...verifications].every(row => row.responded_at);
  if (!allReceived) return result;
  const required = ['sow', 'job_description', 'ai_policy', 'nda'];
  const packageSent = required.every(kind => documents.some(doc => doc.kind === kind && doc.sent_at));
  const latestResponse = latest([submittedAt, ...references.map(row => row.responded_at), ...verifications.map(row => row.responded_at)]);
  const latestPackage = latest(documents.map(doc => doc.sent_at));
  if (!packageSent || !latestPackage || Date.parse(latestResponse!) > Date.parse(latestPackage)) {
    return [{ kind: 'review', group: 'Responses received', label: 'Review responses', tab: 'background-check' },
      { kind: 'review', group: 'Next step', label: 'Prepare / send package', tab: 'documents' }];
  }
  if (documents.some(doc => doc.kind === 'sow' && doc.signed_at)) {
    return [{ kind: 'review', group: 'Signed SOW recorded', label: 'Review for onboarding', tab: 'documents' }];
  }
  // SOW replies are checked manually. Preserve resend-package, not a SOW reminder.
  return [{ kind: 'remind', group: 'Awaiting signed SOW', label: 'Remind about SOW', reminderKind: 'sow', count: 1, lastSentAt: latestPackage },
    { kind: 'review', group: 'SOW email reply', label: 'Review / confirm signed SOW', tab: 'documents' }];
}
