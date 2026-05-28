import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { assignCourse, unassignCourse } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function AdminAssignPage({
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
    .from('lms_courses').select('id, title').eq('id', id).maybeSingle();
  if (!course) notFound();

  const { data: users } = await admin
    .from('users')
    .select('id, name, email, team, role, is_active')
    .eq('is_active', 1)
    .order('name', { ascending: true });

  const { data: existing } = await admin
    .from('lms_course_assignments')
    .select('id, user_id, due_at, assigned_at')
    .eq('course_id', id);
  type ARow = { id: number; user_id: number; due_at: string | null; assigned_at: string };
  const byUser = new Map<number, ARow>((existing ?? []).map((a: ARow) => [a.user_id, a]));

  async function assign(formData: FormData) {
    'use server';
    const userIds = formData.getAll('userIds').map(v => Number(v)).filter(Number.isInteger);
    const dueAt = String(formData.get('dueAt') ?? '');
    if (userIds.length === 0) return;
    await assignCourse({
      courseId: id, userIds,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
    });
    revalidatePath(`/admin/learning/${id}/assign`);
  }
  async function unassign(formData: FormData) {
    'use server';
    const uid = Number(formData.get('userId'));
    if (Number.isInteger(uid)) await unassignCourse(id, uid);
    revalidatePath(`/admin/learning/${id}/assign`);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="space-y-1">
        <Link href={`/admin/learning/${id}`} className="text-xs text-(--rs-primary-600) hover:underline">
          ← {course.title}
        </Link>
        <h1 className="font-serif text-2xl font-semibold text-(--rs-neutral-grey-900)">
          Assign — {course.title}
        </h1>
        <p className="text-sm text-(--rs-neutral-grey-500)">
          Explicit assignment overrides the audience-derived list and sets a due date.
        </p>
      </header>

      <form action={assign} className="space-y-4 rounded-xl border border-(--rs-neutral-grey-200) bg-white p-6">
        <div>
          <label className="block text-sm font-medium text-(--rs-neutral-grey-800) mb-1">Users</label>
          <select name="userIds" multiple size={10}
            className="block w-full rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm">
            {(users ?? []).map((u: { id: number; name: string; team: string | null; role: string }) => (
              <option key={u.id} value={u.id}>
                {u.name} {u.team ? `· ${u.team}` : ''} · {u.role}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-(--rs-neutral-grey-500)">Hold ⌘/Ctrl to select multiple.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-(--rs-neutral-grey-800) mb-1">Due date (optional)</label>
          <input type="date" name="dueAt"
            className="rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm" />
        </div>
        <button type="submit"
          className="rounded-lg bg-(--rs-primary-500) text-white text-sm font-semibold px-4 py-2 hover:bg-(--rs-primary-600)">
          Assign
        </button>
      </form>

      <section className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-6 space-y-3">
        <h2 className="font-serif text-base font-semibold text-(--rs-neutral-grey-800)">Current explicit assignments</h2>
        {byUser.size === 0 ? (
          <p className="text-sm italic text-(--rs-neutral-grey-400)">No explicit assignments yet.</p>
        ) : (
          <ul className="divide-y divide-(--rs-neutral-grey-100) text-sm">
            {[...byUser.entries()].map(([uid, a]) => {
              const u = (users ?? []).find((x: { id: number }) => x.id === uid);
              return (
                <li key={uid} className="py-2 flex items-center gap-3">
                  <span className="flex-1 truncate">{u?.name ?? `User #${uid}`}</span>
                  <span className="text-xs text-(--rs-neutral-grey-500)">
                    {a.due_at ? `Due ${new Date(a.due_at).toLocaleDateString('en-US')}` : 'No due date'}
                  </span>
                  <form action={unassign}>
                    <input type="hidden" name="userId" value={uid} />
                    <button type="submit" className="text-xs text-red-600 hover:underline">Unassign</button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
