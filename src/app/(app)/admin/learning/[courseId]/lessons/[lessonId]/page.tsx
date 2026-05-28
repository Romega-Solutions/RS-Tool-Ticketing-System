import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateLesson, uploadLessonVideoFile, upsertQuiz, deleteQuiz, createQuestion, deleteQuestion } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function AdminLessonEditPage({
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
  if (!canAccessAdmin(session.role)) redirect('/dashboard');

  const admin = createAdminClient();
  const { data: lesson } = await admin
    .from('lms_lessons').select('*').eq('id', lid).eq('course_id', cid).maybeSingle();
  if (!lesson) notFound();

  const { data: quiz } = await admin
    .from('lms_quizzes').select('*').eq('lesson_id', lid).maybeSingle();
  const { data: questions } = quiz
    ? await admin
        .from('lms_quiz_questions')
        .select('id, prompt, question_type, choices, correct_keys, sort_order')
        .eq('quiz_id', quiz.id)
        .order('sort_order', { ascending: true })
    : { data: [] as Array<{ id: number; prompt: string; question_type: string; choices: unknown; correct_keys: unknown; sort_order: number }> };

  async function save(formData: FormData) {
    'use server';
    await updateLesson(lid, {
      courseId:    cid,
      title:       String(formData.get('title') ?? ''),
      lessonType:  String(formData.get('lessonType') ?? 'text'),
      bodyMd:      String(formData.get('bodyMd') ?? '') || null,
      videoSource: (String(formData.get('videoSource') ?? '') || null) as 'youtube' | 'upload' | null,
      videoUrl:    String(formData.get('videoUrl') ?? '') || null,
    });
  }

  async function uploadVideo(formData: FormData) {
    'use server';
    formData.set('courseId', String(cid));
    formData.set('lessonId', String(lid));
    await uploadLessonVideoFile(formData);
  }

  async function saveQuiz(formData: FormData) {
    'use server';
    await upsertQuiz({
      lessonId:    lid,
      passScore:   Number(formData.get('passScore') ?? 70),
      maxAttempts: formData.get('maxAttempts') ? Number(formData.get('maxAttempts')) : null,
    });
    revalidatePath(`/admin/learning/${cid}/lessons/${lid}`);
  }

  async function removeQuiz() {
    'use server';
    await deleteQuiz(lid);
    revalidatePath(`/admin/learning/${cid}/lessons/${lid}`);
  }

  async function addQuestion(formData: FormData) {
    'use server';
    if (!quiz) return;
    const type = String(formData.get('questionType') ?? 'multiple_choice');
    const prompt = String(formData.get('prompt') ?? '').trim();
    if (!prompt) return;
    if (type === 'true_false') {
      const correct = String(formData.get('correctTF') ?? 'true');
      await createQuestion({
        quizId:       quiz.id,
        prompt,
        questionType: 'true_false',
        choices:      [{ key: 'true', text: 'True' }, { key: 'false', text: 'False' }],
        correctKeys:  [correct === 'false' ? 'false' : 'true'],
      });
    } else {
      // Parse 4-choice MC from `choiceA…choiceD` + `correctKeys` (comma-separated like "a,c").
      const choices = (['a','b','c','d'] as const)
        .map(k => ({ key: k, text: String(formData.get(`choice${k.toUpperCase()}`) ?? '').trim() }))
        .filter(c => c.text.length > 0);
      const correctRaw = String(formData.get('correctKeys') ?? '').toLowerCase();
      const correctKeys = correctRaw.split(',').map(s => s.trim()).filter(Boolean);
      if (choices.length < 2 || correctKeys.length === 0) return;
      await createQuestion({
        quizId: quiz.id, prompt, questionType: 'multiple_choice',
        choices, correctKeys,
      });
    }
    revalidatePath(`/admin/learning/${cid}/lessons/${lid}`);
  }

  async function removeQuestion(formData: FormData) {
    'use server';
    const qid = Number(formData.get('qid'));
    if (Number.isInteger(qid)) await deleteQuestion(qid);
    revalidatePath(`/admin/learning/${cid}/lessons/${lid}`);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="space-y-1">
        <Link href={`/admin/learning/${cid}`} className="text-xs text-(--rs-primary-600) hover:underline">
          ← Course
        </Link>
        <h1 className="font-serif text-2xl font-semibold text-(--rs-neutral-grey-900)">
          Edit lesson — {lesson.title}
        </h1>
      </header>

      <form action={save} className="space-y-4 rounded-xl border border-(--rs-neutral-grey-200) bg-white p-6">
        <Field label="Title" name="title" defaultValue={lesson.title} required />
        <div>
          <label className="block text-sm font-medium text-(--rs-neutral-grey-800) mb-1">Lesson type</label>
          <select name="lessonType" defaultValue={lesson.lesson_type}
            className="block w-full rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm">
            <option value="text">Text only</option>
            <option value="video">Video only</option>
            <option value="mixed">Mixed (text + video)</option>
          </select>
        </div>
        <Field label="Body (Markdown)" name="bodyMd" defaultValue={lesson.body_md ?? ''} textarea />
        <div>
          <label className="block text-sm font-medium text-(--rs-neutral-grey-800) mb-1">Video source</label>
          <select name="videoSource" defaultValue={lesson.video_source ?? ''}
            className="block w-full rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm">
            <option value="">—</option>
            <option value="youtube">YouTube</option>
            <option value="upload">Upload (.mp4)</option>
          </select>
        </div>
        <Field
          label='Video URL or storage path'
          name="videoUrl"
          defaultValue={lesson.video_url ?? ''}
        />
        <button type="submit"
          className="rounded-lg bg-(--rs-primary-500) text-white text-sm font-semibold px-4 py-2 hover:bg-(--rs-primary-600)">
          Save lesson
        </button>
      </form>

      <section className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-6 space-y-4">
        <h2 className="font-serif text-base font-semibold text-(--rs-neutral-grey-800)">Quiz (optional)</h2>
        {!quiz ? (
          <form action={saveQuiz} className="flex items-center gap-2">
            <span className="text-sm text-(--rs-neutral-grey-600)">Pass score</span>
            <input type="number" name="passScore" defaultValue={70} min={0} max={100}
              className="w-20 rounded-md border border-(--rs-neutral-grey-300) bg-white px-2 py-1 text-sm" />
            <span className="text-sm text-(--rs-neutral-grey-600)">Max attempts</span>
            <input type="number" name="maxAttempts" placeholder="∞" min={1}
              className="w-20 rounded-md border border-(--rs-neutral-grey-300) bg-white px-2 py-1 text-sm" />
            <button type="submit"
              className="rounded-md bg-(--rs-primary-500) text-white text-sm font-semibold px-3 py-1.5 hover:bg-(--rs-primary-600)">
              Enable quiz
            </button>
          </form>
        ) : (
          <>
            <form action={saveQuiz} className="flex items-center gap-2">
              <span className="text-sm text-(--rs-neutral-grey-600)">Pass score</span>
              <input type="number" name="passScore" defaultValue={quiz.pass_score} min={0} max={100}
                className="w-20 rounded-md border border-(--rs-neutral-grey-300) bg-white px-2 py-1 text-sm" />
              <span className="text-sm text-(--rs-neutral-grey-600)">Max attempts</span>
              <input type="number" name="maxAttempts" defaultValue={quiz.max_attempts ?? ''} placeholder="∞" min={1}
                className="w-20 rounded-md border border-(--rs-neutral-grey-300) bg-white px-2 py-1 text-sm" />
              <button type="submit"
                className="rounded-md bg-(--rs-primary-500) text-white text-sm font-semibold px-3 py-1.5 hover:bg-(--rs-primary-600)">
                Save
              </button>
              <form action={removeQuiz}>
                <button type="submit" className="text-xs text-red-600 hover:underline">Delete quiz</button>
              </form>
            </form>

            <ul className="divide-y divide-(--rs-neutral-grey-100) text-sm">
              {((questions ?? []) as Array<{ id: number; prompt: string; question_type: string }>).map((q, i) => (
                <li key={q.id} className="py-2 flex items-center gap-3">
                  <span className="w-6 text-center text-(--rs-neutral-grey-400)">{i + 1}</span>
                  <span className="flex-1 truncate">{q.prompt}</span>
                  <span className="text-xs uppercase text-(--rs-neutral-grey-500)">
                    {q.question_type === 'true_false' ? 'T/F' : 'MC'}
                  </span>
                  <form action={removeQuestion}>
                    <input type="hidden" name="qid" value={q.id} />
                    <button type="submit" className="text-xs text-red-600 hover:underline">Remove</button>
                  </form>
                </li>
              ))}
            </ul>

            <form action={addQuestion} className="space-y-2 rounded-md bg-(--rs-neutral-grey-50) p-3">
              <div>
                <label className="block text-xs font-semibold text-(--rs-neutral-grey-700) mb-1">Question type</label>
                <select name="questionType" defaultValue="multiple_choice"
                  className="rounded-md border border-(--rs-neutral-grey-300) bg-white px-2 py-1 text-sm">
                  <option value="multiple_choice">Multiple choice</option>
                  <option value="true_false">True / False</option>
                </select>
              </div>
              <input type="text" name="prompt" placeholder="Question prompt…" required
                className="block w-full rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-1.5 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" name="choiceA" placeholder='Choice "a"'
                  className="rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-1.5 text-sm" />
                <input type="text" name="choiceB" placeholder='Choice "b"'
                  className="rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-1.5 text-sm" />
                <input type="text" name="choiceC" placeholder='Choice "c"'
                  className="rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-1.5 text-sm" />
                <input type="text" name="choiceD" placeholder='Choice "d"'
                  className="rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-1.5 text-sm" />
              </div>
              <p className="text-xs text-(--rs-neutral-grey-500)">
                For MC: correct key(s) e.g. <code>a</code> or <code>a,c</code>. For T/F use the radio below.
              </p>
              <input type="text" name="correctKeys" placeholder="correct keys (MC) e.g. a,c"
                className="block w-full rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-1.5 text-sm" />
              <div className="flex items-center gap-3 text-sm">
                <label className="flex items-center gap-1">
                  <input type="radio" name="correctTF" value="true" defaultChecked /> True (T/F default)
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" name="correctTF" value="false" /> False (T/F)
                </label>
              </div>
              <button type="submit"
                className="rounded-md bg-(--rs-primary-500) text-white text-sm font-semibold px-3 py-1.5 hover:bg-(--rs-primary-600)">
                Add question
              </button>
            </form>
          </>
        )}
      </section>

      <section className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-6 space-y-3">
        <h2 className="font-serif text-base font-semibold text-(--rs-neutral-grey-800)">Upload a video file</h2>
        <p className="text-xs text-(--rs-neutral-grey-500)">
          Uploads land in <code className="text-(--rs-neutral-grey-700)">learning-content/lessons/{lid}/</code> and
          set the lesson&apos;s source to <strong>upload</strong> automatically.
        </p>
        <form action={uploadVideo} className="flex items-center gap-2">
          <input type="file" name="file" accept="video/*" required
            className="block text-sm file:mr-3 file:rounded file:border-0 file:bg-(--rs-primary-50) file:px-3 file:py-1.5 file:text-(--rs-primary-700)" />
          <button type="submit"
            className="rounded-md bg-(--rs-primary-500) text-white text-sm font-semibold px-3 py-2 hover:bg-(--rs-primary-600)">
            Upload
          </button>
        </form>
      </section>
    </div>
  );
}

function Field({ label, name, defaultValue, required, textarea }: {
  label: string; name: string; defaultValue?: string; required?: boolean; textarea?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-(--rs-neutral-grey-800) mb-1">
        {label}{required && <span className="text-red-600"> *</span>}
      </label>
      {textarea ? (
        <textarea name={name} defaultValue={defaultValue} rows={6}
          className="block w-full rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm font-mono" />
      ) : (
        <input type="text" name={name} defaultValue={defaultValue} required={required}
          className="block w-full rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm" />
      )}
    </div>
  );
}
