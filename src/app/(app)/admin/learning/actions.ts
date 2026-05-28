'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import { uploadLessonVideo } from '@/lib/storage';

async function requireAdmin() {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  if (!canAccessAdmin(session.role)) throw new Error('Not authorized');
  return session;
}

// ── Courses ────────────────────────────────────────────────────────────────

const courseInput = z.object({
  title:        z.string().trim().min(1).max(200),
  description:  z.string().trim().max(2000).nullable().optional(),
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
}

export async function deleteCourse(id: number): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from('lms_courses').delete().eq('id', id);
  if (error) throw new Error(`deleteCourse failed: ${error.message}`);
  revalidatePath('/admin/learning');
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

export async function createLesson(input: unknown): Promise<{ id: number }> {
  await requireAdmin();
  const v = lessonInput.parse(input);
  if ((v.lessonType === 'video' || v.lessonType === 'mixed') && !v.videoUrl) {
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
      lesson_type:            v.lessonType,
      body_md:                v.bodyMd ?? null,
      video_source:           v.videoSource ?? null,
      video_url:              v.videoUrl ?? null,
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
  if ((v.lessonType === 'video' || v.lessonType === 'mixed') && !v.videoUrl) {
    throw new Error('Video URL is required for video and mixed lessons.');
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from('lms_lessons')
    .update({
      title:                  v.title,
      lesson_type:            v.lessonType,
      body_md:                v.bodyMd ?? null,
      video_source:           v.videoSource ?? null,
      video_url:              v.videoUrl ?? null,
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
