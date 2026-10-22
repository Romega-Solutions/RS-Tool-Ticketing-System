import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { route, requireBearer } from '@/lib/api';
import { createNotification } from '@/lib/notifications';
import { sendEmailAwaited } from '@/lib/n8n';
import { renderNotificationEmail } from '@/lib/email-templates';
import { isHrTeam } from '@/lib/rbac';
import { findFounderId } from '@/lib/reporting-tree';
import {
  manilaToday, planMilestone, sowAlertMode, sowCcRecipients, addDays, parseIsoDate,
  type SowPerson,
} from '@/lib/sow-alerts';

export const runtime = 'nodejs';

const DEFAULT_TO = 'hr@romega-solutions.com';
// Without SOW_ALERTS_START_DATE, a milestone may be caught up for at most this
// many days (covers a weekend plus a missed weekday), never a launch backfill.
const DEFAULT_CATCHUP_DAYS = 4;

type UserRow = {
  id: number; name: string | null; email: string | null; role: string | null;
  team: string | null; is_active: number | null; end_date: string | null;
};

// GET /api/cron/sow-end-reminders
// Vercel cron, Mon–Fri 13:00 UTC (9 PM Manila). For each active user whose SOW
// end date hits a 75/60/45-day milestone (weekend milestones shift to Monday),
// email HR (CC the lead chain) once, and ring the bell for HR admins + the lead.
//
// SOW_ALERTS_MODE: 'log' (default) computes and reports only, writing nothing;
// 'send' records + emails; 'off' does nothing.
export const GET = route(async (req: Request) => {
  requireBearer(req, process.env.CRON_SECRET);

  const mode = sowAlertMode(process.env.SOW_ALERTS_MODE);
  const today = manilaToday();
  if (mode === 'off') return NextResponse.json({ ranAt: new Date().toISOString(), today, mode, planned: 0 });

  const startEnv = process.env.SOW_ALERTS_START_DATE?.trim();
  const launchCutoff = startEnv && parseIsoDate(startEnv) != null ? startEnv : addDays(today, -DEFAULT_CATCHUP_DAYS);

  const sb = createAdminClient();
  const [{ data: users, error: usersErr }, { data: reporting }] = await Promise.all([
    sb.from('users').select('id, name, email, role, team, is_active, end_date'),
    sb.from('user_reporting').select('user_id, reports_to_user_id'),
  ]);
  if (usersErr) {
    return NextResponse.json({ ranAt: new Date().toISOString(), today, mode, planned: 0, note: usersErr.message });
  }

  const all = (users ?? []) as UserRow[];
  const people = new Map<number, SowPerson>(all.map(u => [u.id, { id: u.id, email: u.email, isActive: Boolean(u.is_active) }]));
  const byId = new Map(all.map(u => [u.id, u]));
  const reportsTo = new Map<number, number | null>(
    ((reporting ?? []) as Array<{ user_id: number; reports_to_user_id: number | null }>)
      .map(r => [Number(r.user_id), r.reports_to_user_id == null ? null : Number(r.reports_to_user_id)]),
  );
  const founderId = findFounderId(all.map(u => ({ id: u.id, role: u.role, isActive: Boolean(u.is_active) })));
  const hrAdminIds = all.filter(u => u.is_active && u.role === 'admin' && isHrTeam(u.team)).map(u => u.id);

  const candidates = all.filter(u => u.is_active && parseIsoDate(u.end_date) != null);

  // Existing rows for these users (dedupe), keyed by "userId|endDate".
  const recorded = new Map<string, Set<number>>();
  if (candidates.length) {
    const { data: rows, error } = await sb.from('sow_end_reminders')
      .select('user_id, end_date, milestone_days')
      .in('user_id', candidates.map(u => u.id));
    if (error) {
      // Table missing (migration not applied) or transient: write nothing.
      return NextResponse.json({ ranAt: new Date().toISOString(), today, mode, planned: 0, note: error.message });
    }
    for (const r of (rows ?? []) as Array<{ user_id: number; end_date: string; milestone_days: number }>) {
      const k = `${r.user_id}|${r.end_date}`;
      if (!recorded.has(k)) recorded.set(k, new Set());
      recorded.get(k)!.add(Number(r.milestone_days));
    }
  }

  const to = process.env.SOW_ALERTS_TO?.trim() || DEFAULT_TO;
  const results: Array<{ userId: number; milestone: number; status: string; cc: number; founderFallback: boolean }> = [];

  for (const u of candidates) {
    const endDate = u.end_date as string;
    const plan = planMilestone(endDate, today, recorded.get(`${u.id}|${endDate}`) ?? new Set(), launchCutoff);
    if (plan.send == null) continue;

    const { ccIds, leadId, usedFounderFallback } = sowCcRecipients(u.id, reportsTo, people, founderId);
    if (leadId == null) console.warn(`[sow-alerts] user ${u.id} has no active lead; HR + CEO fallback only`);

    if (mode === 'log') {
      console.log(`[sow-alerts] (log-only) would send ${plan.send}-day reminder for user ${u.id} (cc ${ccIds.length})`);
      results.push({ userId: u.id, milestone: plan.send, status: 'would_send', cc: ccIds.length, founderFallback: usedFounderFallback });
      continue;
    }

    // Older milestones due on the same run are recorded as skipped.
    if (plan.skip.length) {
      await sb.from('sow_end_reminders').upsert(
        plan.skip.map(m => ({ user_id: u.id, end_date: endDate, milestone_days: m, status: 'skipped' })),
        { onConflict: 'user_id,end_date,milestone_days', ignoreDuplicates: true },
      );
    }

    // Claim the milestone. Only a newly inserted row may send (a double run or
    // a concurrent cron gets nothing back and stops here).
    const { data: claimed, error: claimErr } = await sb.from('sow_end_reminders')
      .upsert(
        { user_id: u.id, end_date: endDate, milestone_days: plan.send, status: 'pending' },
        { onConflict: 'user_id,end_date,milestone_days', ignoreDuplicates: true },
      )
      .select('id');
    if (claimErr) { console.error(`[sow-alerts] claim failed for user ${u.id}: ${claimErr.message}`); continue; }
    const rowId = (claimed as Array<{ id: number }> | null)?.[0]?.id;
    if (rowId == null) continue;

    const name = u.name?.trim() || `User ${u.id}`;
    const title = `SOW ends in ${plan.daysLeft} days: ${name}`;
    const body = `${name}'s SOW end date is ${endDate} (${plan.daysLeft} days from today, the ${plan.send}-day reminder). Please confirm a renewal or start offboarding.`;
    const link = '/admin/users';
    const rendered = renderNotificationEmail({ title, body, link });
    const cc = ccIds.map(id => people.get(id)?.email ?? '').filter(Boolean);

    const sent = await sendEmailAwaited({ to, cc, subject: rendered.subject, html: rendered.html, text: rendered.text });
    await sb.from('sow_end_reminders')
      .update(sent.ok
        ? { status: 'sent', sent_at: new Date().toISOString(), error: null }
        : { status: 'failed', error: sent.error.slice(0, 500) })
      .eq('id', rowId);

    // Bell: HR admins + the direct lead (in-app only; 'sow_end' never emails).
    const bellIds = new Set([...hrAdminIds, ...(leadId != null ? [leadId] : [])]);
    bellIds.delete(u.id);
    for (const uid of bellIds) {
      if (!byId.get(uid)?.is_active) continue;
      await createNotification({ userId: uid, type: 'sow_end', title, body, link });
    }

    results.push({ userId: u.id, milestone: plan.send, status: sent.ok ? 'sent' : 'failed', cc: ccIds.length, founderFallback: usedFounderFallback });
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), today, mode, launchCutoff, planned: results.length, results });
});
