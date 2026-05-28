'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { canMarkComplete } from '@/lib/lms';

// Mark a lesson complete for the current user. Server-side gate enforces
// the lesson-type rule — a client that fakes watchedToEnd for a video
// lesson cannot complete it. We just refuse to insert.
//
// Idempotent: ON CONFLICT DO NOTHING via PostgREST's `upsert` with the
// existing unique (user_id, lesson_id) constraint.
export async function markLessonComplete(lessonId: number, watchedToEnd: boolean): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');

  const admin = createAdminClient();

  // Look up the lesson + parent course so we can validate the gate and
  // revalidate the right route.
  const { data: lesson, error: le } = await admin
    .from('lms_lessons')
    .select('id, course_id, lesson_type')
    .eq('id', lessonId)
    .maybeSingle();
  if (le)        throw new Error(`Lesson lookup failed: ${le.message}`);
  if (!lesson)   throw new Error('Lesson not found.');

  const allowed = canMarkComplete({
    lessonType:    lesson.lesson_type === 'video' || lesson.lesson_type === 'mixed' ? lesson.lesson_type : 'text',
    watchedToEnd,
  });
  if (!allowed) {
    throw new Error('You must finish the video before marking this lesson complete.');
  }

  const { error: ie } = await admin
    .from('lms_lesson_completions')
    .upsert(
      { user_id: session.id, lesson_id: lessonId },
      { onConflict: 'user_id,lesson_id', ignoreDuplicates: true },
    );
  if (ie) throw new Error(`Completion insert failed: ${ie.message}`);

  revalidatePath(`/learning/${lesson.course_id}`);
  revalidatePath(`/learning/${lesson.course_id}/${lessonId}`);
  revalidatePath('/learning');
  revalidatePath('/dashboard');
}
