import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decideReminder, type ReminderDecision } from '@/lib/lms-reminders';
import { route, requireBearer } from '@/lib/api';

export const runtime = 'nodejs';

// GET /api/lms/reminders — bearer-auth on CRON_SECRET. Picks open
// assignments due within 7 days (or overdue) where the user has not yet
// completed the course, POSTs each to the n8n webhook, and updates
// last_reminded_at. Pair this with an n8n schedule trigger every hour or
// once per morning.
export const GET = route(async (req: Request) => {
  requireBearer(req, process.env.CRON_SECRET);

  const webhook = process.env.N8N_LMS_REMINDER_WEBHOOK_URL;
  const now = new Date();
  const admin = createAdminClient();

  const { data: assignments, error } = await admin
    .from('lms_course_assignments')
    .select('id, user_id, course_id, due_at, last_reminded_at, assigned_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (assignments ?? []) as Array<{
    id: number; user_id: number; course_id: number;
    due_at: string | null; last_reminded_at: string | null;
  }>;

  const sent: Array<{ assignmentId: number; window: string; daysRemaining: number }> = [];
  const skipped: Array<{ assignmentId: number; reason: string }> = [];

  for (const row of rows) {
    // Course completion check (cheap-ish, one query per assignment — fine
    // for the size of these audiences).
    const { data: lessons } = await admin
      .from('lms_lessons').select('id').eq('course_id', row.course_id);
    const lessonIds = ((lessons ?? []) as { id: number }[]).map(l => l.id);
    let courseComplete = false;
    if (lessonIds.length > 0) {
      const { data: completed } = await admin
        .from('lms_lesson_completions').select('lesson_id')
        .eq('user_id', row.user_id).in('lesson_id', lessonIds);
      courseComplete = (completed?.length ?? 0) >= lessonIds.length;
    }

    const decision: ReminderDecision = decideReminder({
      dueAt:          row.due_at,
      lastRemindedAt: row.last_reminded_at,
      courseComplete,
      now,
    });

    if (!decision.send) {
      skipped.push({ assignmentId: row.id, reason: decision.reason });
      continue;
    }

    // Fan out: user + course detail for the webhook payload.
    const [{ data: u }, { data: c }] = await Promise.all([
      admin.from('users').select('email, name').eq('id', row.user_id).maybeSingle(),
      admin.from('lms_courses').select('title').eq('id', row.course_id).maybeSingle(),
    ]);

    if (webhook && u?.email && c?.title) {
      try {
        await fetch(webhook, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            userId:        row.user_id,
            email:         u.email,
            name:          u.name,
            courseTitle:   c.title,
            dueAt:         row.due_at,
            daysRemaining: decision.daysRemaining,
            window:        decision.window,
          }),
        });
      } catch (e) {
        skipped.push({ assignmentId: row.id, reason: `webhook failed: ${e instanceof Error ? e.message : 'unknown'}` });
        continue;
      }
    }

    await admin
      .from('lms_course_assignments')
      .update({ last_reminded_at: now.toISOString() })
      .eq('id', row.id);

    sent.push({ assignmentId: row.id, window: decision.window, daysRemaining: decision.daysRemaining });
  }

  return NextResponse.json({ ranAt: now.toISOString(), sent, skipped });
});
