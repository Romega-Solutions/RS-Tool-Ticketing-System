import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { canAccessAdmin, normalizeRole, roleLabel, type AppRole } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { userInCourseAudience, type LmsCourse } from '@/lib/lms';
import { assignCourse, unassignCourse } from '../../actions';
import { SubmitButton } from '@/components/learning/submit-button';
import { CourseNav } from '@/components/learning/course-nav.client';
import { AssignPicker, type PickerUser } from '@/components/learning/assign-picker.client';

export const dynamic = 'force-dynamic';

const ROLE_ORDER: AppRole[] = ['intern', 'ic', 'lead', 'admin'];

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
    .from('lms_courses').select('id, title, scope, department').eq('id', id).maybeSingle();
  if (!course) notFound();

  const [{ data: users }, { data: existing }] = await Promise.all([
    admin.from('users')
      .select('id, name, email, team, role, is_active')
      .eq('is_active', 1)
      .order('name', { ascending: true }),
    admin.from('lms_course_assignments')
      .select('id, user_id, due_at, assigned_at')
      .eq('course_id', id),
  ]);

  type URow = { id: number; name: string; email: string | null; team: string | null; role: string };
  type ARow = { id: number; user_id: number; due_at: string | null; assigned_at: string };
  const byUser = new Map<number, ARow>(((existing ?? []) as ARow[]).map(a => [a.user_id, a]));

  const lmsCourse = { ...course } as unknown as LmsCourse;
  const pickerUsers: PickerUser[] = ((users ?? []) as URow[]).map(u => {
    const nrole = normalizeRole(u.role);
    return {
      id: u.id, name: u.name, email: u.email, team: u.team,
      role: nrole, roleLabel: roleLabel(nrole),
      inAudience: userInCourseAudience(lmsCourse, { userId: u.id, role: nrole, team: u.team }),
      assigned: byUser.has(u.id),
    };
  });

  const teams = [...new Set(((users ?? []) as URow[]).map(u => u.team).filter((t): t is string => !!t))].sort();
  const presentRoles = new Set(((users ?? []) as URow[]).map(u => normalizeRole(u.role)));
  const roles = ROLE_ORDER.filter(r => presentRoles.has(r)).map(r => ({ value: r, label: roleLabel(r) }));

  async function assignAction(userIds: number[], dueAtIso: string | null) {
    'use server';
    const ids = userIds.filter(Number.isInteger);
    if (ids.length === 0) return;
    await assignCourse({ courseId: id, userIds: ids, dueAt: dueAtIso });
    revalidatePath(`/admin/learning/${id}/assign`);
    revalidatePath(`/admin/learning/${id}/roster`);
  }
  async function unassign(formData: FormData) {
    'use server';
    const uid = Number(formData.get('userId'));
    if (Number.isInteger(uid)) await unassignCourse(id, uid);
    revalidatePath(`/admin/learning/${id}/assign`);
    revalidatePath(`/admin/learning/${id}/roster`);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="space-y-1">
        <Link href={`/admin/learning/${id}`} className="text-xs text-(--rs-primary-600) hover:underline">
          ← {course.title}
        </Link>
        <h1 className="font-serif text-2xl font-semibold text-(--rs-neutral-grey-900)">
          Assign — {course.title}
        </h1>
        <p className="text-sm text-(--rs-neutral-grey-500)">
          Search and pick people, set a due date, and assign. Explicit assignments override the audience-derived list.
        </p>
      </header>

      <CourseNav courseId={id} />

      <AssignPicker users={pickerUsers} teams={teams} roles={roles} assignAction={assignAction} />

      <section className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-6 space-y-3">
        <h2 className="font-serif text-base font-semibold text-(--rs-neutral-grey-800)">Current explicit assignments</h2>
        {byUser.size === 0 ? (
          <p className="text-sm italic text-(--rs-neutral-grey-400)">No explicit assignments yet.</p>
        ) : (
          <ul className="divide-y divide-(--rs-neutral-grey-100) text-sm">
            {[...byUser.entries()].map(([uid, a]) => {
              const u = ((users ?? []) as URow[]).find(x => x.id === uid);
              return (
                <li key={uid} className="py-2 flex items-center gap-3">
                  <span className="flex-1 truncate">{u?.name ?? `User #${uid}`}</span>
                  <span className="text-xs text-(--rs-neutral-grey-500)">
                    {a.due_at ? `Due ${new Date(a.due_at).toLocaleDateString('en-US')}` : 'No due date'}
                  </span>
                  <form action={unassign}>
                    <input type="hidden" name="userId" value={uid} />
                    <SubmitButton spinnerClassName="w-3 h-3" className="text-xs text-red-600 hover:underline">
                      Unassign
                    </SubmitButton>
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
