import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  updateCourse, togglePublishCourse, deleteCourse,
  createLesson, deleteLesson,
} from '../actions';
import { SubmitButton } from '@/components/learning/submit-button';
import { CourseNav } from '@/components/learning/course-nav.client';
import { CourseSummaryEditor } from './course-summary-editor.client';

export const dynamic = 'force-dynamic';

export default async function AdminCourseEditPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const id = Number(courseId);
  if (!Number.isInteger(id)) notFound();

  const session = await getSession();
  if (!session) redirect('/login');
  if (!canAccessAdmin(session.role)) redirect('/dashboard');

  const admin = createAdminClient();
  const { data: course } = await admin
    .from('lms_courses').select('*').eq('id', id).maybeSingle();
  if (!course) notFound();

  const { data: lessons } = await admin
    .from('lms_lessons')
    .select('id, title, lesson_type, sort_order')
    .eq('course_id', id)
    .order('sort_order', { ascending: true });

  const { data: users } = await admin.from('users').select('team').not('team', 'is', null);
  const teams = [...new Set(((users ?? []) as { team: string | null }[]).map(u => u.team).filter((t): t is string => !!t))].sort();

  async function saveCourse(formData: FormData) {
    'use server';
    await updateCourse(id, {
      title:       String(formData.get('title') ?? ''),
      description: String(formData.get('description') ?? '') || null,
      scope:       String(formData.get('scope') ?? 'foundation'),
      department:  String(formData.get('department') ?? '') || null,
      enforcement: String(formData.get('enforcement') ?? 'soft'),
    });
  }
  async function publishToggle() {
    'use server';
    await togglePublishCourse(id, !course!.is_published);
  }
  async function destroy() {
    'use server';
    await deleteCourse(id);
  }
  async function addLesson(formData: FormData) {
    'use server';
    const title = String(formData.get('title') ?? '').trim();
    if (!title) return;
    await createLesson({
      courseId: id, title, lessonType: 'text', bodyMd: null,
      videoSource: null, videoUrl: null,
    });
  }
  async function removeLesson(formData: FormData) {
    'use server';
    const lid = Number(formData.get('lessonId'));
    if (Number.isInteger(lid)) await deleteLesson(id, lid);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="space-y-3">
        <Link href="/admin/learning" className="text-xs text-(--rs-primary-600) hover:underline">
          ← Manage Learning
        </Link>
        <h1 className="font-serif text-2xl font-semibold text-(--rs-neutral-grey-900)">
          {course.title}
        </h1>
        <CourseNav courseId={id} />
      </header>

      <section className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-6 space-y-4">
        <h2 className="font-serif text-lg font-semibold text-(--rs-neutral-grey-800)">Course settings</h2>
        <form action={saveCourse} className="space-y-3">
          <Field label="Title" name="title" defaultValue={course.title} required />
          <CourseSummaryEditor name="description" defaultValue={course.description ?? ''} />
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-(--rs-neutral-grey-800) mb-1">Audience</label>
              <select name="scope" defaultValue={course.scope}
                className="block w-full rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm">
                <option value="foundation">Foundation</option>
                <option value="intern">Intern Track</option>
                <option value="department">Department</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-(--rs-neutral-grey-800) mb-1">Department</label>
              <select name="department" defaultValue={course.department ?? ''}
                className="block w-full rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm">
                <option value="">—</option>
                {teams.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-(--rs-neutral-grey-800) mb-1">Enforcement</label>
              <select name="enforcement" defaultValue={course.enforcement}
                className="block w-full rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm">
                <option value="soft">Soft</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>
          <SubmitButton
            pendingText="Saving…"
            className="rounded-lg bg-(--rs-primary-500) text-white text-sm font-semibold px-4 py-2 hover:bg-(--rs-primary-600)"
          >
            Save
          </SubmitButton>
        </form>
        <div className="border-t border-(--rs-neutral-grey-100) pt-4 flex items-center gap-3">
          <form action={publishToggle}>
            <SubmitButton className="text-sm font-semibold text-(--rs-primary-600) hover:underline">
              {course.is_published ? 'Unpublish' : 'Publish'}
            </SubmitButton>
          </form>
          <form action={destroy}>
            <SubmitButton
              confirm="Delete this course and all its lessons? This cannot be undone."
              pendingText="Deleting…"
              className="text-sm font-semibold text-red-600 hover:underline"
            >
              Delete course
            </SubmitButton>
          </form>
        </div>
      </section>

      <section className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-6 space-y-4">
        <h2 className="font-serif text-lg font-semibold text-(--rs-neutral-grey-800)">Lessons</h2>
        {(!lessons || lessons.length === 0) ? (
          <p className="text-sm italic text-(--rs-neutral-grey-400)">No lessons yet.</p>
        ) : (
          <ul className="divide-y divide-(--rs-neutral-grey-100)">
            {lessons.map((l, idx) => (
              <li key={l.id} className="flex items-center gap-3 py-2">
                <span className="w-6 text-center text-(--rs-neutral-grey-400)">{idx + 1}</span>
                <Link href={`/admin/learning/${id}/lessons/${l.id}`} className="flex-1 text-sm font-medium text-(--rs-primary-700) hover:underline truncate">
                  {l.title}
                </Link>
                <span className="text-xs text-(--rs-neutral-grey-500) uppercase">{l.lesson_type}</span>
                <form action={removeLesson}>
                  <input type="hidden" name="lessonId" value={l.id} />
                  <SubmitButton
                    confirm={`Delete lesson “${l.title}”?`}
                    spinnerClassName="w-3 h-3"
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={addLesson} className="flex items-center gap-2 pt-2 border-t border-(--rs-neutral-grey-100)">
          <input
            type="text" name="title" placeholder="New lesson title…" required
            className="flex-1 rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm"
          />
          <SubmitButton
            pendingText="Adding…"
            className="rounded-md bg-(--rs-primary-500) text-white text-sm font-semibold px-3 py-2 hover:bg-(--rs-primary-600)"
          >
            Add lesson
          </SubmitButton>
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
        <textarea name={name} defaultValue={defaultValue} rows={3}
          className="block w-full rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm" />
      ) : (
        <input type="text" name={name} defaultValue={defaultValue} required={required}
          className="block w-full rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm" />
      )}
    </div>
  );
}
