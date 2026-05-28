import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { userInCourseAudience, type LmsLesson, type LmsCourse } from '@/lib/lms';
import { refreshLessonVideoSignedUrl } from '@/lib/storage';
import { LessonPlayer } from '@/components/lms/lesson-player.client';
import { markLessonComplete as serverMarkComplete } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function LessonPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;
  const cid = Number(courseId);
  const lid = Number(lessonId);
  if (!Number.isInteger(cid) || !Number.isInteger(lid)) notFound();

  const session = await getSession();
  if (!session) redirect('/login');

  const admin = createAdminClient();
  const { data: courseRow } = await admin
    .from('lms_courses')
    .select('id, title, description, scope, department, cover_image_url, is_published, enforcement, sort_order, created_at, updated_at')
    .eq('id', cid)
    .maybeSingle();
  if (!courseRow || !courseRow.is_published) notFound();
  const course: LmsCourse = {
    id: courseRow.id, title: courseRow.title, description: courseRow.description,
    scope: courseRow.scope, department: courseRow.department,
    coverImageUrl: courseRow.cover_image_url, isPublished: courseRow.is_published,
    enforcement: courseRow.enforcement, sortOrder: courseRow.sort_order,
    createdAt: courseRow.created_at, updatedAt: courseRow.updated_at,
  };

  const isAdmin = session.role === 'admin';
  const inAudience = userInCourseAudience(course, {
    userId: session.id, role: session.role, team: session.team,
  });
  if (!isAdmin && !inAudience) notFound();

  const { data: lessonRow } = await admin
    .from('lms_lessons')
    .select('*')
    .eq('id', lid)
    .eq('course_id', cid)
    .maybeSingle();
  if (!lessonRow) notFound();
  const lesson: LmsLesson = {
    id: lessonRow.id, courseId: lessonRow.course_id, title: lessonRow.title,
    lessonType: lessonRow.lesson_type, bodyMd: lessonRow.body_md,
    videoSource: lessonRow.video_source, videoUrl: lessonRow.video_url,
    videoDurationSeconds: lessonRow.video_duration_seconds, sortOrder: lessonRow.sort_order,
  };

  // For uploaded videos we re-sign on every render so the URL is always fresh.
  let playableVideoUrl: string | null = lesson.videoUrl;
  if (lesson.videoSource === 'upload' && lesson.videoUrl) {
    try {
      playableVideoUrl = await refreshLessonVideoSignedUrl(lesson.videoUrl);
    } catch {
      playableVideoUrl = lesson.videoUrl;
    }
  }

  const { data: completedRow } = await admin
    .from('lms_lesson_completions')
    .select('id')
    .eq('user_id', session.id)
    .eq('lesson_id', lid)
    .maybeSingle();
  const alreadyDone = !!completedRow;

  // Prev/next lesson (by sort_order)
  const { data: siblings } = await admin
    .from('lms_lessons')
    .select('id, title, sort_order')
    .eq('course_id', cid)
    .order('sort_order', { ascending: true });
  const idx = (siblings ?? []).findIndex((s: { id: number }) => s.id === lid);
  const prev = idx > 0 ? siblings![idx - 1] : null;
  const next = idx >= 0 && idx < (siblings?.length ?? 0) - 1 ? siblings![idx + 1] : null;

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="space-y-1">
        <Link href={`/learning/${course.id}`} className="text-xs text-(--rs-primary-600) hover:underline">
          ← {course.title}
        </Link>
        <h1 className="font-serif text-2xl font-semibold text-(--rs-neutral-grey-900)">
          {lesson.title}
        </h1>
      </header>

      <LessonPlayer
        lessonId={lesson.id}
        lessonType={lesson.lessonType}
        bodyMd={lesson.bodyMd}
        videoSource={lesson.videoSource}
        videoUrl={playableVideoUrl}
        alreadyDone={alreadyDone}
        onComplete={serverMarkComplete}
      />

      <nav className="flex items-center justify-between border-t border-(--rs-neutral-grey-100) pt-4">
        {prev ? (
          <Link href={`/learning/${course.id}/${prev.id}`} className="text-sm text-(--rs-primary-600) hover:underline">
            ← {prev.title}
          </Link>
        ) : <span />}
        {next ? (
          <Link href={`/learning/${course.id}/${next.id}`} className="text-sm text-(--rs-primary-600) hover:underline">
            {next.title} →
          </Link>
        ) : <span />}
      </nav>
    </div>
  );
}
