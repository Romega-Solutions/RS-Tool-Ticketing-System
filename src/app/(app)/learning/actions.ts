'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { canMarkComplete, quizGateFor } from '@/lib/lms';
import { gradeQuiz, formatCertificateSerial, type QuizQuestionWithAnswers } from '@/lib/lms-quiz';
import { renderCertificatePdf } from '@/components/lms/certificate-pdf';

// Mark a lesson complete for the current user. Server-side gate enforces
// the lesson-type rule AND the quiz gate — a client that fakes watchedToEnd
// for a video lesson cannot complete it, and a lesson with a quiz can only
// be marked complete via submitQuizAttempt → passed.
export async function markLessonComplete(lessonId: number, watchedToEnd: boolean): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');

  const admin = createAdminClient();

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

  // Quiz gate — if a quiz exists on this lesson, the user must have a
  // passed attempt. Direct Mark Complete is blocked; only the internal
  // markLessonCompleteAfterQuiz path can bypass this check (it's called
  // from submitQuizAttempt after a successful grade).
  const { data: quiz } = await admin
    .from('lms_quizzes').select('id').eq('lesson_id', lessonId).maybeSingle();
  if (quiz) {
    const { data: pass } = await admin
      .from('lms_quiz_attempts').select('id').eq('user_id', session.id).eq('quiz_id', quiz.id).eq('passed', 1).limit(1);
    if (!pass || pass.length === 0) {
      throw new Error('Pass the quiz before marking this lesson complete.');
    }
  }

  await insertCompletionAndMaybeCertify({ userId: session.id, lessonId, courseId: lesson.course_id });
}

// Submit a quiz attempt. Grades server-side; the client never has the
// answer key. On pass, the parent lesson is auto-marked complete and a
// certificate is issued if the course is now 100% done.
export async function submitQuizAttempt(
  quizId: number,
  answers: Record<string, string[]>,
): Promise<{ score: number; passed: boolean; correctCount: number; totalCount: number }> {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');

  const admin = createAdminClient();

  const { data: quiz, error: qe } = await admin
    .from('lms_quizzes')
    .select('id, lesson_id, pass_score, max_attempts')
    .eq('id', quizId)
    .maybeSingle();
  if (qe || !quiz) throw new Error('Quiz not found.');

  // Sequential-progression gate — the quiz can't be attempted (even by hitting
  // this action directly) until every preceding lesson in the course is done.
  const gate = await quizGateFor(session.id, quiz.lesson_id);
  if (gate.locked) {
    throw new Error('Complete the earlier lessons before taking this quiz.');
  }

  // Attempt-limit gate.
  if (quiz.max_attempts != null) {
    const { count } = await admin
      .from('lms_quiz_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.id)
      .eq('quiz_id', quizId);
    if ((count ?? 0) >= quiz.max_attempts) {
      throw new Error('Maximum attempts reached.');
    }
  }

  const { data: questions, error: qse } = await admin
    .from('lms_quiz_questions')
    .select('id, prompt, question_type, choices, correct_keys, sort_order')
    .eq('quiz_id', quizId)
    .order('sort_order', { ascending: true });
  if (qse) throw new Error(`Questions lookup failed: ${qse.message}`);

  type Row = { id: number; prompt: string; question_type: string; choices: unknown; correct_keys: unknown; sort_order: number };
  const qs: QuizQuestionWithAnswers[] = ((questions ?? []) as Row[]).map(r => ({
    id:           r.id,
    prompt:       r.prompt,
    questionType: r.question_type === 'true_false' ? 'true_false' : 'multiple_choice',
    choices:      Array.isArray(r.choices) ? (r.choices as { key: string; text: string }[]) : [],
    correctKeys:  Array.isArray(r.correct_keys) ? (r.correct_keys as string[]) : [],
  }));

  const result = gradeQuiz({ questions: qs, answers, passScore: quiz.pass_score });

  const { error: ae } = await admin
    .from('lms_quiz_attempts')
    .insert({
      user_id: session.id, quiz_id: quizId,
      answers, score: result.score, passed: result.passed ? 1 : 0,
    });
  if (ae) throw new Error(`Attempt insert failed: ${ae.message}`);

  if (result.passed) {
    // Look up the lesson's course_id so we can complete + maybe certify.
    const { data: lesson } = await admin
      .from('lms_lessons').select('id, course_id').eq('id', quiz.lesson_id).maybeSingle();
    if (lesson) {
      await insertCompletionAndMaybeCertify({
        userId: session.id, lessonId: lesson.id, courseId: lesson.course_id,
      });
    }
  }

  return result;
}

// Shared write path: insert the completion row (idempotent) and, if the
// course is now 100% complete, issue a certificate.
async function insertCompletionAndMaybeCertify(args: {
  userId: number; lessonId: number; courseId: number;
}): Promise<void> {
  const admin = createAdminClient();

  const { error: ie } = await admin
    .from('lms_lesson_completions')
    .upsert(
      { user_id: args.userId, lesson_id: args.lessonId },
      { onConflict: 'user_id,lesson_id', ignoreDuplicates: true },
    );
  if (ie) throw new Error(`Completion insert failed: ${ie.message}`);

  await maybeIssueCertificate({ userId: args.userId, courseId: args.courseId });

  revalidatePath(`/learning/${args.courseId}`);
  revalidatePath(`/learning/${args.courseId}/${args.lessonId}`);
  revalidatePath('/learning');
  revalidatePath('/learning/certificates');
  revalidatePath('/dashboard');
}

// Issue a certificate iff every lesson in the course is complete for this
// user. Idempotent via the (user_id, course_id) unique constraint.
async function maybeIssueCertificate(args: { userId: number; courseId: number }): Promise<void> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('lms_certificates').select('id').eq('user_id', args.userId).eq('course_id', args.courseId).maybeSingle();
  if (existing) return;

  const { data: lessons } = await admin
    .from('lms_lessons').select('id').eq('course_id', args.courseId);
  const lessonIds = ((lessons ?? []) as { id: number }[]).map(l => l.id);
  if (lessonIds.length === 0) return;

  const { data: completed } = await admin
    .from('lms_lesson_completions').select('lesson_id')
    .eq('user_id', args.userId).in('lesson_id', lessonIds);
  if (!completed || completed.length < lessonIds.length) return;

  // Course + user lookups for the PDF.
  const { data: course } = await admin
    .from('lms_courses').select('id, title').eq('id', args.courseId).maybeSingle();
  const { data: user } = await admin
    .from('users').select('id, name, member_code').eq('id', args.userId).maybeSingle();
  if (!course || !user) return;

  // Atomically take a serial via the sequence.
  let sequence: number;
  try {
    const { data: seqRow } = await admin.rpc('nextval_lms_certificate_serial');
    sequence = Number(seqRow);
    if (!Number.isFinite(sequence)) throw new Error('Sequence returned non-numeric');
  } catch {
    // Fallback: count existing certs + 1. Not collision-proof but never
    // throws — better than blocking the completion path on a missing RPC.
    const { count } = await admin
      .from('lms_certificates').select('id', { count: 'exact', head: true });
    sequence = (count ?? 0) + 1;
  }
  const year = new Date().getFullYear();
  const serial = formatCertificateSerial(year, sequence);

  // Render PDF and upload to the learning-content bucket.
  const pdfBytes = await renderCertificatePdf({
    learnerName: user.name,
    memberCode:  user.member_code ?? null,
    courseTitle: course.title,
    issuedAt:    new Date(),
    serial,
  });
  const path = `certificates/${args.userId}/${args.courseId}.pdf`;
  const bucket = process.env.SUPABASE_LEARNING_BUCKET ?? 'learning-content';
  const { error: upErr } = await admin.storage.from(bucket).upload(path, pdfBytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (upErr) {
    // Upload failure shouldn't block the cert row — we can re-render later.
    console.warn(`Certificate PDF upload failed: ${upErr.message}`);
  }

  await admin.from('lms_certificates').insert({
    user_id: args.userId,
    course_id: args.courseId,
    pdf_path: path,
    serial,
  });
}

// ── Discussion (Phase 3) ──────────────────────────────────────────────────

export async function postComment(lessonId: number, body: string, parentId: number | null): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  const text = body.trim();
  if (!text) throw new Error('Comment cannot be empty.');
  if (text.length > 5000) throw new Error('Comment too long (max 5000 characters).');

  const admin = createAdminClient();
  const { error } = await admin.from('lms_lesson_comments').insert({
    lesson_id: lessonId,
    user_id:   session.id,
    body:      text,
    parent_id: parentId,
  });
  if (error) throw new Error(`Could not post comment: ${error.message}`);

  // We don't know the courseId cheaply here; revalidate the lesson route
  // pattern so all lesson pages re-fetch on next nav. The next navigation
  // will pick up the new comment.
  revalidatePath('/learning', 'layout');
}

export async function deleteOwnComment(commentId: number): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  const admin = createAdminClient();

  const { data: row } = await admin
    .from('lms_lesson_comments').select('id, user_id').eq('id', commentId).maybeSingle();
  if (!row || row.user_id !== session.id) {
    throw new Error('You can only delete your own comments.');
  }
  await admin
    .from('lms_lesson_comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', commentId);
  revalidatePath('/learning', 'layout');
}
