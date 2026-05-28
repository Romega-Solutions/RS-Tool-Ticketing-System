import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { userInCourseAudience, type LmsLesson, type LmsCourse } from '@/lib/lms';
import { refreshLessonVideoSignedUrl } from '@/lib/storage';
import { LessonPlayer } from '@/components/lms/lesson-player.client';
import { QuizRunner } from '@/components/lms/quiz-runner.client';
import { DiscussionThread, type DiscussionComment } from '@/components/lms/discussion-thread.client';
import type { QuizQuestion } from '@/lib/lms-quiz';
import {
  markLessonComplete as serverMarkComplete,
  submitQuizAttempt,
  postComment,
  deleteOwnComment,
} from '../../actions';
import { pinComment, adminDeleteComment } from '../../../admin/learning/actions';

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

  // Is there a quiz attached to this lesson? Load it + questions (sans
  // correct_keys) so the QuizRunner has everything it needs.
  const { data: quizRow } = await admin
    .from('lms_quizzes')
    .select('id, pass_score, max_attempts')
    .eq('lesson_id', lid)
    .maybeSingle();

  let quizQuestions: QuizQuestion[] = [];
  let attemptsUsed = 0;
  let quizPassed = false;
  if (quizRow) {
    const { data: qs } = await admin
      .from('lms_quiz_questions')
      .select('id, prompt, question_type, choices, sort_order')
      .eq('quiz_id', quizRow.id)
      .order('sort_order', { ascending: true });
    type QRow = { id: number; prompt: string; question_type: string; choices: unknown };
    quizQuestions = ((qs ?? []) as QRow[]).map(r => ({
      id:           r.id,
      prompt:       r.prompt,
      questionType: r.question_type === 'true_false' ? 'true_false' : 'multiple_choice',
      choices:      Array.isArray(r.choices) ? (r.choices as { key: string; text: string }[]) : [],
    }));

    const { count } = await admin
      .from('lms_quiz_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.id).eq('quiz_id', quizRow.id);
    attemptsUsed = count ?? 0;

    const { data: passRow } = await admin
      .from('lms_quiz_attempts').select('id')
      .eq('user_id', session.id).eq('quiz_id', quizRow.id).eq('passed', 1).limit(1);
    quizPassed = !!(passRow && passRow.length > 0);
  }

  // Discussion thread for this lesson.
  const { data: rawComments } = await admin
    .from('lms_lesson_comments')
    .select('id, body, user_id, parent_id, pinned, deleted_at, created_at')
    .eq('lesson_id', lid)
    .order('created_at', { ascending: true });
  type CRow = { id: number; body: string; user_id: number; parent_id: number | null; pinned: number; deleted_at: string | null; created_at: string };
  const commentUserIds = [...new Set(((rawComments ?? []) as CRow[]).map(c => c.user_id))];
  const { data: commentUsers } = commentUserIds.length > 0
    ? await admin.from('users').select('id, name').in('id', commentUserIds)
    : { data: [] as Array<{ id: number; name: string }> };
  const nameById = new Map((commentUsers ?? []).map((u: { id: number; name: string }) => [u.id, u.name]));
  const comments: DiscussionComment[] = ((rawComments ?? []) as CRow[]).map(c => ({
    id:        c.id,
    body:      c.body,
    userId:    c.user_id,
    userName:  nameById.get(c.user_id) ?? `User #${c.user_id}`,
    parentId:  c.parent_id,
    pinned:    c.pinned,
    deletedAt: c.deleted_at,
    createdAt: c.created_at,
  }));

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

      {/*
        Two render branches:
          - Lesson has a quiz → render the body, hide Mark Complete, show QuizRunner.
          - Lesson has no quiz → normal LessonPlayer with Mark Complete.
      */}
      {quizRow ? (
        <div className="space-y-6">
          {(lesson.lessonType === 'text' || lesson.lessonType === 'mixed') && (
            <div>
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-(--rs-neutral-grey-800)">
                {lesson.bodyMd}
              </div>
            </div>
          )}
          <QuizRunner
            quizId={quizRow.id}
            passScore={quizRow.pass_score}
            maxAttempts={quizRow.max_attempts}
            attemptsUsed={attemptsUsed}
            questions={quizQuestions}
            alreadyPassed={quizPassed || alreadyDone}
            onSubmit={submitQuizAttempt}
          />
        </div>
      ) : (
        <LessonPlayer
          lessonId={lesson.id}
          lessonType={lesson.lessonType}
          bodyMd={lesson.bodyMd}
          videoSource={lesson.videoSource}
          videoUrl={playableVideoUrl}
          alreadyDone={alreadyDone}
          onComplete={serverMarkComplete}
        />
      )}

      <DiscussionThread
        lessonId={lesson.id}
        currentUserId={session.id}
        isAdmin={isAdmin}
        comments={comments}
        onPost={postComment}
        onDelete={isAdmin ? adminDeleteComment : deleteOwnComment}
        onPin={pinComment}
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
