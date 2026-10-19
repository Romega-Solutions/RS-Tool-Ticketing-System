import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { route, requireBearer } from '@/lib/api';
import { createNotification } from '@/lib/notifications';
import { projectPath } from '@/lib/project-slug';
import { getProjectSlugMap } from '@/lib/project-slug-server';

export const runtime = 'nodejs';

// YYYY-MM-DD for "today + offsetDays" in Asia/Manila (the team's timezone).
// en-CA renders ISO-style dates, and target_date is stored as a date string.
function manilaDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

// GET /api/cron/task-due-reminders
// Daily Vercel cron: for every active work item due TODAY (the due date is
// within the day), notify its assignee(s) once. Re-running the same day is
// idempotent (dedupe by link).
export const GET = route(async (req: Request) => {
  requireBearer(req, process.env.CRON_SECRET);

  const sb = createAdminClient();
  const today      = manilaDate(0);
  const todayStart = today; // dedupe window: due reminders created today (Manila)

  const { data: items, error } = await sb.from('work_items')
    .select('id, project_id, name, completed_at, work_item_assignees(user_id)')
    .eq('target_date', today)
    .eq('archived', 0);

  if (error) {
    // Fail soft (e.g. transient) — the next daily run will retry.
    return NextResponse.json({ ranAt: new Date().toISOString(), created: 0, note: error.message });
  }

  // Readable link when the project has a slug; numeric otherwise (pre-migration).
  const slugs: Record<string, string> = await getProjectSlugMap().catch(() => ({}));

  let created = 0;
  for (const it of (items ?? []) as Array<Record<string, unknown>>) {
    if (it.completed_at) continue; // already done

    const assignees = ((it.work_item_assignees as Array<{ user_id: number }> | null) ?? [])
      .map(a => Number(a.user_id))
      .filter(Boolean);
    if (!assignees.length) continue;

    const query = { task: Number(it.id) };
    const numericLink = projectPath({ id: Number(it.project_id) }, '', query);
    const link = projectPath({ id: Number(it.project_id), slug: slugs[String(it.project_id)] }, '', query);

    // Who already received a due reminder for this item today?
    const { data: existing } = await sb.from('notifications')
      .select('user_id')
      .eq('type', 'task_due')
      // Match both link shapes so the day the slug migration lands cannot
      // double-send a reminder that already went out with the numeric link.
      .in('link', link === numericLink ? [link] : [link, numericLink])
      .gte('created_at', todayStart);
    const already = new Set((existing ?? []).map(r => Number((r as { user_id: number }).user_id)));

    for (const uid of assignees) {
      if (already.has(uid)) continue;
      await createNotification({
        userId: uid,
        type:   'task_due',
        title:  'Your task is due today',
        body:   String(it.name ?? ''),
        link,
      });
      created++;
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), today, created });
});
