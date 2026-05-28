import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateLesson, uploadLessonVideoFile } from '../../../actions';

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
