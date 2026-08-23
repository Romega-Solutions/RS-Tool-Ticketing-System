import { createHash, randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export type MeetingAvailability = 'pending' | 'yes' | 'no';

export type OnboardingSession = {
  id: number;
  session_date: string;
  starts_at: string;
  cutoff_at: string;
  status: 'scheduled' | 'finalized' | 'cancelled';
};

type OnboardingContact = {
  id: number | null;
  name: string | null;
  email: string | null;
};

type FinalizerAttendee = {
  id: number;
  full_name: string;
  personal_email: string;
  onboardingLead: OnboardingContact;
  directSupervisor: OnboardingContact;
};

const MANILA_TIME_ZONE = 'Asia/Manila';
const FRIDAY = 5;

function manilaParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday'));
  return {
    year: Number(part('year')), month: Number(part('month')), day: Number(part('day')),
    hour: Number(part('hour')), weekday,
  };
}

export function manilaDate(now = new Date()) {
  const local = manilaParts(now);
  return `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
}

/** Returns the session that is still open for enrollment (Friday 6 PM PHT; 1 PM cutoff). */
export function nextOpenOnboardingSession(now = new Date()) {
  const local = manilaParts(now);
  let daysUntilFriday = (FRIDAY - local.weekday + 7) % 7;
  if (daysUntilFriday === 0 && local.hour >= 13) daysUntilFriday = 7;

  const calendar = new Date(Date.UTC(local.year, local.month - 1, local.day + daysUntilFriday));
  const year = calendar.getUTCFullYear();
  const month = calendar.getUTCMonth();
  const day = calendar.getUTCDate();
  const sessionDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // Manila is UTC+8 year-round: Friday 13:00 / 18:00 PHT are 05:00 / 10:00 UTC.
  return {
    sessionDate,
    cutoffAt: new Date(Date.UTC(year, month, day, 5, 0, 0)).toISOString(),
    startsAt: new Date(Date.UTC(year, month, day, 10, 0, 0)).toISOString(),
  };
}

export async function getOrCreateOpenOnboardingSession(now = new Date()): Promise<OnboardingSession> {
  const schedule = nextOpenOnboardingSession(now);
  const supabase = createAdminClient();
  const { data: existing, error: findError } = await supabase
    .from('onboarding_sessions')
    .select('id, session_date, starts_at, cutoff_at, status')
    .eq('session_date', schedule.sessionDate)
    .maybeSingle();
  if (findError) throw new Error(`Failed to load onboarding session: ${findError.message}`);
  if (existing) return existing as OnboardingSession;

  const { data: created, error: createError } = await supabase
    .from('onboarding_sessions')
    .insert({ session_date: schedule.sessionDate, starts_at: schedule.startsAt, cutoff_at: schedule.cutoffAt })
    .select('id, session_date, starts_at, cutoff_at, status')
    .single();
  if (createError) {
    // Another request may have inserted the weekly row first.
    const { data: raced } = await supabase
      .from('onboarding_sessions')
      .select('id, session_date, starts_at, cutoff_at, status')
      .eq('session_date', schedule.sessionDate)
      .maybeSingle();
    if (raced) return raced as OnboardingSession;
    throw new Error(`Failed to create onboarding session: ${createError.message}`);
  }
  return created as OnboardingSession;
}

export async function assignOnboarderToOpenSession(onboarderId: number, now = new Date()) {
  const session = await getOrCreateOpenOnboardingSession(now);
  const supabase = createAdminClient();
  const { error } = await supabase.from('onboarders').update({
    onboarding_session_id: session.id,
    meeting_availability: 'pending',
    meeting_availability_submitted_at: null,
    updated_at: now.toISOString(),
  }).eq('id', onboarderId);
  if (error) throw new Error(`Failed to assign onboarding session: ${error.message}`);
  return session;
}

/** Keep a still-open assignment when a welcome email is retried. */
export async function getOrAssignOnboarderToOpenSession(onboarderId: number, now = new Date()) {
  const supabase = createAdminClient();
  const { data: onboarder, error } = await supabase
    .from('onboarders')
    .select('onboarding_session_id')
    .eq('id', onboarderId)
    .maybeSingle();
  if (error) {
    throw new Error(
      `Onboarding sessions are not set up: ${error.message}. Run docs/migrations/reconcile-candidate-pre-employment.sql in Supabase.`,
    );
  }
  if (!onboarder) throw new Error('Onboarder not found');
  if (onboarder.onboarding_session_id) {
    const { data: session } = await supabase.from('onboarding_sessions')
      .select('id, session_date, starts_at, cutoff_at, status')
      .eq('id', onboarder.onboarding_session_id)
      .maybeSingle();
    if (session && session.status === 'scheduled' && new Date(session.cutoff_at) > now) {
      return session as OnboardingSession;
    }
  }
  return assignOnboarderToOpenSession(onboarderId, now);
}

export function formatSessionForEmail(session: Pick<OnboardingSession, 'session_date'>) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TIME_ZONE,
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date(`${session.session_date}T10:00:00.000Z`));
}

function hashOnboardingFormToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

/** Verifies a public form token without changing the onboarder's state. */
export async function resolveOnboardingFormTarget(formToken: string) {
  const supabase = createAdminClient();
  const { data: onboarder, error } = await supabase
    .from('onboarders')
    .select('id, onboarder_type, onboarding_session_id')
    .eq('onboarding_form_token_hash', hashOnboardingFormToken(formToken))
    .maybeSingle();
  if (error) throw new Error(`Failed to verify onboarding form link: ${error.message}`);
  if (!onboarder) throw new Error('Invalid onboarding form token');

  return {
    onboarderId: onboarder.id,
    onboarderType: onboarder.onboarder_type,
  };
}

/** Issues a new form-link secret without storing the usable token in the database. */
export async function issueOnboardingFormToken(onboarderId: number) {
  const token = randomBytes(32).toString('base64url');
  const supabase = createAdminClient();
  const { error } = await supabase.from('onboarders').update({
    onboarding_form_token_hash: hashOnboardingFormToken(token),
    updated_at: new Date().toISOString(),
  }).eq('id', onboarderId);
  if (error) throw new Error(`Failed to issue onboarding form link: ${error.message}`);
  return token;
}

export function onboardingFormUrl(
  formToken: string,
  onboarderType: 'contractor' | 'intern',
  session: Pick<OnboardingSession, 'session_date'>,
) {
  const configuredUrl = process.env.JOTFORM_ONBOARDING_FORM_URL?.trim();
  if (!configuredUrl) return '';
  const url = new URL(configuredUrl);
  url.searchParams.set('onboarding_form_token', formToken);
  url.searchParams.set('onboarder_type', onboarderType);
  url.searchParams.set('onboarding_session_date', session.session_date);
  return url.toString();
}

async function writeAutomationHistory(onboarderId: number, field: string, summary: string, newValue: string | null) {
  const supabase = createAdminClient();
  await supabase.from('onboarder_history').insert({
    onboarder_id: onboarderId,
    user_name: 'Onboarding Bot',
    field,
    new_value: newValue,
    summary,
  });
}

export async function recordOnboardingAvailability(
  formToken: string,
  availability: Exclude<MeetingAvailability, 'pending'>,
  submittedAt = new Date(),
) {
  const supabase = createAdminClient();
  const { data: onboarder, error } = await supabase
    .from('onboarders')
    .select('id, onboarder_type, onboarding_session_id')
    .eq('onboarding_form_token_hash', hashOnboardingFormToken(formToken))
    .maybeSingle();
  if (error) throw new Error(`Failed to verify onboarding form link: ${error.message}`);
  if (!onboarder) throw new Error('Invalid onboarding form token');
  const onboarderId = onboarder.id;

  let session: OnboardingSession | null = null;
  if (onboarder.onboarding_session_id) {
    const { data } = await supabase.from('onboarding_sessions')
      .select('id, session_date, starts_at, cutoff_at, status')
      .eq('id', onboarder.onboarding_session_id)
      .maybeSingle();
    session = data as OnboardingSession | null;
  }

  // Late submissions never reopen a locked cohort. They apply to the next open Friday instead.
  const needsNewSession = !session || session.status !== 'scheduled' || new Date(session.cutoff_at) <= submittedAt;
  if (needsNewSession) session = await assignOnboarderToOpenSession(onboarderId, submittedAt);
  if (!session) throw new Error('Could not assign an onboarding session');

  const { error: updateError } = await supabase.from('onboarders').update({
    onboarding_form_submitted_at: submittedAt.toISOString(),
    meeting_availability: availability,
    meeting_availability_submitted_at: submittedAt.toISOString(),
    updated_at: submittedAt.toISOString(),
  }).eq('id', onboarderId);
  if (updateError) throw new Error(`Failed to record meeting availability: ${updateError.message}`);

  await writeAutomationHistory(
    onboarderId,
    'meeting_availability',
    `Onboarding form received: attendance ${availability} for ${formatSessionForEmail(session)}`,
    availability,
  );
  return {
    onboarderId,
    onboarderType: onboarder.onboarder_type,
    session,
    reassigned: needsNewSession,
  };
}

export async function finalizeTodayOnboardingSession(now = new Date()) {
  const supabase = createAdminClient();
  const { data: sessions, error } = await supabase.from('onboarding_sessions')
    .select('id, session_date, starts_at, cutoff_at, status')
    .eq('session_date', manilaDate(now))
    .eq('status', 'scheduled');
  if (error) throw new Error(`Failed to load today's onboarding session: ${error.message}`);

  const results: Array<{ session: OnboardingSession; confirmed: FinalizerAttendee[]; deferred: FinalizerAttendee[]; nextSession: OnboardingSession | null }> = [];
  for (const rawSession of (sessions ?? [])) {
    const session = rawSession as OnboardingSession;
    if (new Date(session.cutoff_at) > now) continue;

    const { data: members, error: memberError } = await supabase.from('onboarders')
      .select('id, full_name, personal_email, meeting_availability, onboarding_form_submitted_at, onboarding_lead_id, onboarding_lead, onboarding_lead_teams_email, direct_supervisor_id, direct_supervisor, direct_supervisor_teams_email')
      .eq('onboarding_session_id', session.id);
    if (memberError) throw new Error(`Failed to load cohort members: ${memberError.message}`);
    const cohort = (members ?? []) as Array<{
      id: number;
      full_name: string;
      personal_email: string;
      meeting_availability: MeetingAvailability;
      onboarding_form_submitted_at: string | null;
      onboarding_lead_id: number | null;
      onboarding_lead: string | null;
      onboarding_lead_teams_email: string | null;
      direct_supervisor_id: number | null;
      direct_supervisor: string | null;
      direct_supervisor_teams_email: string | null;
    }>;
    const contactIds = Array.from(new Set(cohort.flatMap(person =>
      [person.onboarding_lead_id, person.direct_supervisor_id].filter((id): id is number => typeof id === 'number'),
    )));
    const contactsById = new Map<number, { name: string | null; email: string | null }>();
    if (contactIds.length) {
      const { data: contacts, error: contactsError } = await supabase.from('users')
        .select('id, name, email')
        .in('id', contactIds);
      if (contactsError) throw new Error(`Failed to load onboarding contacts: ${contactsError.message}`);
      for (const contact of contacts ?? []) {
        contactsById.set(contact.id, { name: contact.name, email: contact.email });
      }
    }
    const toContact = (id: number | null, fallbackName: string | null, teamsEmail: string | null): OnboardingContact => {
      const contact = id ? contactsById.get(id) : undefined;
      return {
        id,
        name: contact?.name?.trim() || fallbackName?.trim() || null,
        email: teamsEmail?.trim() || contact?.email?.trim() || null,
      };
    };
    const enrichedCohort = cohort.map(person => ({
      id: person.id,
      full_name: person.full_name,
      personal_email: person.personal_email,
      meeting_availability: person.meeting_availability,
      onboarding_form_submitted_at: person.onboarding_form_submitted_at,
      onboardingLead: toContact(person.onboarding_lead_id, person.onboarding_lead, person.onboarding_lead_teams_email),
      directSupervisor: toContact(person.direct_supervisor_id, person.direct_supervisor, person.direct_supervisor_teams_email),
    }));
    const confirmed = enrichedCohort.filter(person => person.meeting_availability === 'yes' && !!person.onboarding_form_submitted_at);
    const deferred = enrichedCohort.filter(person => !confirmed.includes(person));
    let nextSession: OnboardingSession | null = null;

    if (deferred.length) {
      nextSession = await getOrCreateOpenOnboardingSession(now);
      const deferredIds = deferred.map(person => person.id);
      const { error: deferError } = await supabase.from('onboarders').update({
        onboarding_session_id: nextSession.id,
        meeting_availability: 'pending',
        meeting_availability_submitted_at: null,
        updated_at: now.toISOString(),
      }).in('id', deferredIds);
      if (deferError) throw new Error(`Failed to defer onboarding cohort: ${deferError.message}`);
      await Promise.all(deferred.map(person => writeAutomationHistory(
        person.id,
        'onboarding_session',
        `Moved to ${formatSessionForEmail(nextSession!)} after the Friday 1 PM cutoff`,
        nextSession!.session_date,
      )));
    }

    await supabase.from('onboarding_sessions').update({
      status: confirmed.length ? 'finalized' : 'cancelled',
      finalized_at: now.toISOString(),
      updated_at: now.toISOString(),
    }).eq('id', session.id);
    results.push({ session, confirmed, deferred, nextSession });
  }
  return results;
}
