import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { userInCourseAudience, quizGateFor, type LmsLesson, type LmsCourse } from '@/lib/lms';
import { refreshLessonVideoSignedUrl } from '@/lib/storage';
import { LessonPlayer } from '@/components/lms/lesson-player.client';
import { QuizRunner } from '@/components/lms/quiz-runner.client';
import { QuizLockedCard } from '@/components/lms/quiz-locked-card';
import { TextLesson } from '@/components/lms/text-lesson';
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

  // One parallel batch for everything keyed only on course / lesson / user — no
  // request waterfall. Nested lookups (quiz detail, comment authors, signed
  // upload URL) run in a second parallel batch once their parents are known.
  const [
    { data: courseRow },
    { data: lessonRow },
    { data: completedRow },
    { data: quizRow },
    { data: rawComments },
    { data: siblings },
  ] = await Promise.all([
    admin.from('lms_courses')
      .select('id, title, description, scope, department, cover_image_url, is_published, enforcement, sort_order, created_at, updated_at')
      .eq('id', cid).maybeSingle(),
    admin.from('lms_lessons').select('*').eq('id', lid).eq('course_id', cid).maybeSingle(),
    admin.from('lms_lesson_completions').select('id').eq('user_id', session.id).eq('lesson_id', lid).maybeSingle(),
    admin.from('lms_quizzes').select('id, pass_score, max_attempts').eq('lesson_id', lid).maybeSingle(),
    admin.from('lms_lesson_comments')
      .select('id, body, user_id, parent_id, pinned, deleted_at, created_at')
      .eq('lesson_id', lid).order('created_at', { ascending: true }),
    admin.from('lms_lessons').select('id, title, sort_order')
      .eq('course_id', cid).order('sort_order', { ascending: true }),
  ]);

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

  if (!lessonRow) notFound();
  const lesson: LmsLesson = {
    id: lessonRow.id, courseId: lessonRow.course_id, title: lessonRow.title,
    lessonType: lessonRow.lesson_type, bodyMd: lessonRow.body_md,
    videoSource: lessonRow.video_source, videoUrl: lessonRow.video_url,
    videoDurationSeconds: lessonRow.video_duration_seconds, sortOrder: lessonRow.sort_order,
  };

  const alreadyDone = !!completedRow;

  type CRow = { id: number; body: string; user_id: number; parent_id: number | null; pinned: number; deleted_at: string | null; created_at: string };
  const commentUserIds = [...new Set(((rawComments ?? []) as CRow[]).map(c => c.user_id))];

  // Second parallel batch: re-sign the upload URL (upload lessons only), load
  // quiz detail (only when a quiz exists), and resolve comment authors — each
  // independent of the others.
  const [playableVideoUrl, quizDetail, { data: commentUsers }, quizGate] = await Promise.all([
    (async (): Promise<string | null> => {
      if (lesson.videoSource === 'upload' && lesson.videoUrl) {
        try { return await refreshLessonVideoSignedUrl(lesson.videoUrl); }
        catch { return lesson.videoUrl; }
      }
      return lesson.videoUrl;
    })(),
    (async () => {
      if (!quizRow) return null;
      const [{ data: qs }, { count }, { data: passRow }] = await Promise.all([
        admin.from('lms_quiz_questions')
          .select('id, prompt, question_type, choices, correct_keys, sort_order')
          .eq('quiz_id', quizRow.id).order('sort_order', { ascending: true }),
        admin.from('lms_quiz_attempts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', session.id).eq('quiz_id', quizRow.id),
        admin.from('lms_quiz_attempts').select('id')
          .eq('user_id', session.id).eq('quiz_id', quizRow.id).eq('passed', 1).limit(1),
      ]);
      return { qs, count, passRow };
    })(),
    commentUserIds.length > 0
      ? admin.from('users').select('id, name').in('id', commentUserIds)
      : Promise.resolve({ data: [] as Array<{ id: number; name: string }> }),
    quizRow ? quizGateFor(session.id, lid) : Promise.resolve(null),
  ]);

  let quizQuestions: QuizQuestion[] = [];
  let attemptsUsed = 0;
  let quizPassed = false;
  if (quizDetail) {
    type QRow = { id: number; prompt: string; question_type: string; choices: unknown; correct_keys: unknown };
    quizQuestions = ((quizDetail.qs ?? []) as QRow[]).map(r => ({
      id:           r.id,
      prompt:       r.prompt,
      questionType: r.question_type === 'true_false' ? 'true_false' : 'multiple_choice',
      choices:      Array.isArray(r.choices) ? (r.choices as { key: string; text: string }[]) : [],
      // Only the boolean ships to the client — never the correct keys themselves.
      multiSelect:  Array.isArray(r.correct_keys) && (r.correct_keys as unknown[]).length > 1,
    }));
    attemptsUsed = quizDetail.count ?? 0;
    quizPassed = !!(quizDetail.passRow && quizDetail.passRow.length > 0);
  }

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
  const idx = (siblings ?? []).findIndex((s: { id: number }) => s.id === lid);
  const prev = idx > 0 ? siblings![idx - 1] : null;
  const next = idx >= 0 && idx < (siblings?.length ?? 0) - 1 ? siblings![idx + 1] : null;

  return (
    <div className="space-y-8 max-w-4xl">
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
          {lesson.bodyMd?.trim() && <TextLesson body={lesson.bodyMd} />}
          {quizGate?.locked ? (
            <QuizLockedCard courseId={course.id} gate={quizGate} />
          ) : (
            <QuizRunner
              quizId={quizRow.id}
              passScore={quizRow.pass_score}
              maxAttempts={quizRow.max_attempts}
              attemptsUsed={attemptsUsed}
              questions={quizQuestions}
              alreadyPassed={quizPassed || alreadyDone}
              onSubmit={submitQuizAttempt}
            />
          )}
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
