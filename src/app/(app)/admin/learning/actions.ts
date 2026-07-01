'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import { uploadLessonVideo } from '@/lib/storage';
import { extractYoutubeId, isYoutubeUrl } from '@/lib/youtube';
import { LMS_COURSES_TAG } from '@/lib/cache-tags';

async function requireAdmin() {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  if (!canAccessAdmin(session.role)) throw new Error('Not authorized');
  return session;
}

// ── Courses ────────────────────────────────────────────────────────────────

const courseInput = z.object({
  title:        z.string().trim().min(1).max(200),
  description:  z.string().trim().max(8000).nullable().optional(),
  scope:        z.enum(['foundation', 'department', 'intern']),
  department:   z.string().trim().max(120).nullable().optional(),
  enforcement:  z.enum(['soft', 'hard']).default('soft'),
});

export async function createCourse(input: unknown): Promise<{ id: number }> {
  const session = await requireAdmin();
  const v = courseInput.parse(input);
  if (v.scope === 'department' && !v.department) {
    throw new Error('Department is required when scope is "department".');
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('lms_courses')
    .insert({
      title:        v.title,
      description:  v.description ?? null,
      scope:        v.scope,
      department:   v.scope === 'department' ? v.department : null,
      enforcement:  v.enforcement,
      created_by:   session.id,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`createCourse failed: ${error?.message ?? 'no row'}`);
  revalidatePath('/admin/learning');
  revalidateTag(LMS_COURSES_TAG, { expire: 0 });
  return { id: data.id };
}

export async function updateCourse(id: number, input: unknown): Promise<void> {
  await requireAdmin();
  const v = courseInput.parse(input);
  if (v.scope === 'department' && !v.department) {
    throw new Error('Department is required when scope is "department".');
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from('lms_courses')
    .update({
      title:        v.title,
      description:  v.description ?? null,
      scope:        v.scope,
      department:   v.scope === 'department' ? v.department : null,
      enforcement:  v.enforcement,
      updated_at:   new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`updateCourse failed: ${error.message}`);
  revalidatePath('/admin/learning');
  revalidatePath(`/admin/learning/${id}`);
  revalidatePath('/learning');
  revalidateTag(LMS_COURSES_TAG, { expire: 0 });
}

export async function togglePublishCourse(id: number, isPublished: boolean): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from('lms_courses')
    .update({ is_published: isPublished ? 1 : 0, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`togglePublishCourse failed: ${error.message}`);
  revalidatePath('/admin/learning');
  revalidatePath(`/admin/learning/${id}`);
  revalidatePath('/learning');
  revalidateTag(LMS_COURSES_TAG, { expire: 0 });
}

export async function deleteCourse(id: number): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from('lms_courses').delete().eq('id', id);
  if (error) throw new Error(`deleteCourse failed: ${error.message}`);
  revalidatePath('/admin/learning');
  revalidateTag(LMS_COURSES_TAG, { expire: 0 });
  redirect('/admin/learning');
}

// ── Lessons ────────────────────────────────────────────────────────────────

const lessonInput = z.object({
  courseId:             z.number().int().positive(),
  title:                z.string().trim().min(1).max(200),
  lessonType:           z.enum(['text', 'video', 'mixed']),
  bodyMd:               z.string().nullable().optional(),
  videoSource:          z.enum(['youtube', 'upload']).nullable().optional(),
  videoUrl:             z.string().trim().max(1000).nullable().optional(),
  videoDurationSeconds: z.number().int().nonnegative().nullable().optional(),
});

// Make "paste a YouTube link" actually play for learners. A lesson only shows
// its video when type is video/mixed AND source is set AND the URL parses — easy
// to get wrong across three fields, so we reconcile them on save:
//   • a YouTube-looking URL with no source → source = youtube
//   • a YouTube lesson left as "text"      → bumped to mixed (has body) / video
//   • a youtube source with an unparseable URL → rejected with a clear message
function normalizeLessonVideo(v: z.infer<typeof lessonInput>): {
  lessonType:  'text' | 'video' | 'mixed';
  videoSource: 'youtube' | 'upload' | null;
  videoUrl:    string | null;
} {
  let lessonType  = v.lessonType;
  let videoSource = v.videoSource ?? null;
  const videoUrl  = v.videoUrl?.trim() ? v.videoUrl.trim() : null;

  if (videoUrl && !videoSource && isYoutubeUrl(videoUrl)) {
    videoSource = 'youtube';
  }
  if (videoSource === 'youtube' && videoUrl) {
    if (!extractYoutubeId(videoUrl)) {
      throw new Error('That doesn’t look like a valid YouTube link. Use a youtube.com/watch?v=… or youtu.be/… URL.');
    }
    if (lessonType === 'text') {
      lessonType = v.bodyMd?.trim() ? 'mixed' : 'video';
    }
  }
  return { lessonType, videoSource, videoUrl };
}

export async function createLesson(input: unknown): Promise<{ id: number }> {
  await requireAdmin();
  const v = lessonInput.parse(input);
  const vid = normalizeLessonVideo(v);
  if ((vid.lessonType === 'video' || vid.lessonType === 'mixed') && !vid.videoUrl) {
    throw new Error('Video URL is required for video and mixed lessons.');
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('lms_lessons')
    .select('sort_order')
    .eq('course_id', v.courseId)
    .order('sort_order', { ascending: false })
    .limit(1);
  const nextOrder = ((existing?.[0]?.sort_order ?? -1) as number) + 1;

  const { data, error } = await admin
    .from('lms_lessons')
    .insert({
      course_id:              v.courseId,
      title:                  v.title,
      lesson_type:            vid.lessonType,
      body_md:                v.bodyMd ?? null,
      video_source:           vid.videoSource,
      video_url:              vid.videoUrl,
      video_duration_seconds: v.videoDurationSeconds ?? null,
      sort_order:             nextOrder,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`createLesson failed: ${error?.message ?? 'no row'}`);
  revalidatePath(`/admin/learning/${v.courseId}`);
  revalidatePath(`/learning/${v.courseId}`);
  return { id: data.id };
}

export async function updateLesson(id: number, input: unknown): Promise<void> {
  await requireAdmin();
  const v = lessonInput.parse(input);
  const vid = normalizeLessonVideo(v);
  if ((vid.lessonType === 'video' || vid.lessonType === 'mixed') && !vid.videoUrl) {
    throw new Error('Video URL is required for video and mixed lessons.');
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from('lms_lessons')
    .update({
      title:                  v.title,
      lesson_type:            vid.lessonType,
      body_md:                v.bodyMd ?? null,
      video_source:           vid.videoSource,
      video_url:              vid.videoUrl,
      video_duration_seconds: v.videoDurationSeconds ?? null,
      updated_at:             new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`updateLesson failed: ${error.message}`);
  revalidatePath(`/admin/learning/${v.courseId}`);
  revalidatePath(`/admin/learning/${v.courseId}/lessons/${id}`);
  revalidatePath(`/learning/${v.courseId}`);
  revalidatePath(`/learning/${v.courseId}/${id}`);
}

export async function deleteLesson(courseId: number, lessonId: number): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from('lms_lessons').delete().eq('id', lessonId);
  if (error) throw new Error(`deleteLesson failed: ${error.message}`);
  revalidatePath(`/admin/learning/${courseId}`);
  revalidatePath(`/learning/${courseId}`);
}

// ── Quiz CRUD (Phase 2) ───────────────────────────────────────────────────

const quizUpsertInput = z.object({
  lessonId:    z.number().int().positive(),
  passScore:   z.number().int().min(0).max(100),
  maxAttempts: z.number().int().positive().nullable().optional(),
});

export async function upsertQuiz(input: unknown): Promise<{ id: number }> {
  await requireAdmin();
  const v = quizUpsertInput.parse(input);
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('lms_quizzes').select('id').eq('lesson_id', v.lessonId).maybeSingle();

  if (existing) {
    const { error } = await admin
      .from('lms_quizzes')
      .update({
        pass_score:   v.passScore,
        max_attempts: v.maxAttempts ?? null,
        updated_at:   new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) throw new Error(`Quiz update failed: ${error.message}`);
    return { id: existing.id };
  }

  const { data, error } = await admin
    .from('lms_quizzes')
    .insert({
      lesson_id:    v.lessonId,
      pass_score:   v.passScore,
      max_attempts: v.maxAttempts ?? null,
    })
    .select('id').single();
  if (error || !data) throw new Error(`Quiz create failed: ${error?.message ?? 'no row'}`);
  return { id: data.id };
}

export async function deleteQuiz(lessonId: number): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();
  await admin.from('lms_quizzes').delete().eq('lesson_id', lessonId);
}

const questionInput = z.object({
  quizId:       z.number().int().positive(),
  prompt:       z.string().trim().min(1).max(2000),
  questionType: z.enum(['multiple_choice', 'true_false']),
  choices:      z.array(z.object({ key: z.string().min(1).max(20), text: z.string().min(1).max(500) })).min(2).max(10),
  correctKeys:  z.array(z.string()).min(1),
});

export async function createQuestion(input: unknown): Promise<{ id: number }> {
  await requireAdmin();
  const v = questionInput.parse(input);
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('lms_quiz_questions')
    .select('sort_order')
    .eq('quiz_id', v.quizId)
    .order('sort_order', { ascending: false })
    .limit(1);
  const nextOrder = ((existing?.[0]?.sort_order ?? -1) as number) + 1;
  const { data, error } = await admin
    .from('lms_quiz_questions')
    .insert({
      quiz_id:       v.quizId,
      prompt:        v.prompt,
      question_type: v.questionType,
      choices:       v.choices,
      correct_keys:  v.correctKeys,
      sort_order:    nextOrder,
    }).select('id').single();
  if (error || !data) throw new Error(`Question create failed: ${error?.message ?? 'no row'}`);
  return { id: data.id };
}

export async function deleteQuestion(id: number): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();
  await admin.from('lms_quiz_questions').delete().eq('id', id);
}

// ── Assignments + comments moderation (Phase 3) ───────────────────────────

const assignInput = z.object({
  courseId: z.number().int().positive(),
  userIds:  z.array(z.number().int().positive()).min(1),
  dueAt:    z.string().nullable().optional(),
});

export async function assignCourse(input: unknown): Promise<{ inserted: number }> {
  const session = await requireAdmin();
  const v = assignInput.parse(input);
  const admin = createAdminClient();
  const rows = v.userIds.map(uid => ({
    user_id:     uid,
    course_id:   v.courseId,
    due_at:      v.dueAt ?? null,
    assigned_by: session.id,
  }));
  const { error, count } = await admin
    .from('lms_course_assignments')
    .upsert(rows, { onConflict: 'user_id,course_id', count: 'exact' });
  if (error) throw new Error(`assignCourse failed: ${error.message}`);
  revalidatePath(`/admin/learning/${v.courseId}/assign`);
  revalidatePath(`/admin/learning/${v.courseId}/roster`);
  return { inserted: count ?? rows.length };
}

export async function unassignCourse(courseId: number, userId: number): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from('lms_course_assignments')
    .delete()
    .eq('course_id', courseId)
    .eq('user_id',   userId);
  if (error) throw new Error(`unassignCourse failed: ${error.message}`);
  revalidatePath(`/admin/learning/${courseId}/assign`);
  revalidatePath(`/admin/learning/${courseId}/roster`);
}

export async function pinComment(commentId: number, pinned: boolean): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from('lms_lesson_comments')
    .update({ pinned: pinned ? 1 : 0 })
    .eq('id', commentId);
  if (error) throw new Error(`pinComment failed: ${error.message}`);
  revalidatePath('/learning', 'layout');
}

export async function adminDeleteComment(commentId: number): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from('lms_lesson_comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', commentId);
  if (error) throw new Error(`adminDeleteComment failed: ${error.message}`);
  revalidatePath('/learning', 'layout');
}

// ──────────────────────────────────────────────────────────────────────────

export async function uploadLessonVideoFile(formData: FormData): Promise<{ path: string; signedUrl: string }> {
  await requireAdmin();
  const courseId = Number(formData.get('courseId'));
  const lessonId = Number(formData.get('lessonId'));
  const file     = formData.get('file');
  if (!Number.isInteger(courseId) || !Number.isInteger(lessonId)) {
    throw new Error('Invalid courseId or lessonId.');
  }
  if (!(file instanceof File)) throw new Error('No file provided.');

  const upload = await uploadLessonVideo({ lessonId, file });

  const admin = createAdminClient();
  const { error } = await admin
    .from('lms_lessons')
    .update({
      video_source: 'upload',
      video_url:    upload.path,
      updated_at:   new Date().toISOString(),
    })
    .eq('id', lessonId);
  if (error) throw new Error(`Updating lesson with video path failed: ${error.message}`);

  revalidatePath(`/admin/learning/${courseId}/lessons/${lessonId}`);
  revalidatePath(`/learning/${courseId}/${lessonId}`);
  return upload;
}
