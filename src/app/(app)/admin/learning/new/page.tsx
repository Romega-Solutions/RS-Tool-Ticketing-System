import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCourse } from '../actions';

export const dynamic = 'force-dynamic';

export default async function NewCoursePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!canAccessAdmin(session.role)) redirect('/dashboard');

  // Populate the department dropdown from distinct users.team values.
  const admin = createAdminClient();
  const { data: users } = await admin.from('users').select('team').not('team', 'is', null);
  const teams = [...new Set(((users ?? []) as { team: string | null }[]).map(u => u.team).filter((t): t is string => !!t))].sort();

  async function action(formData: FormData) {
    'use server';
    const result = await createCourse({
      title:       String(formData.get('title') ?? ''),
      description: String(formData.get('description') ?? '') || null,
      scope:       String(formData.get('scope') ?? 'foundation'),
      department:  String(formData.get('department') ?? '') || null,
      enforcement: String(formData.get('enforcement') ?? 'soft'),
    });
    redirect(`/admin/learning/${result.id}`);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <header>
        <Link href="/admin/learning" className="text-xs text-(--rs-primary-600) hover:underline">
          ← Manage Learning
        </Link>
        <h1 className="font-serif text-2xl font-semibold text-(--rs-neutral-grey-900) mt-2">New course</h1>
      </header>
      <form action={action} className="space-y-4 rounded-xl border border-(--rs-neutral-grey-200) bg-white p-6">
        <Field label="Title" name="title" required />
        <Field label="Description (optional)" name="description" textarea />
        <div>
          <label className="block text-sm font-medium text-(--rs-neutral-grey-800) mb-1">Audience</label>
          <select name="scope" defaultValue="foundation"
            className="block w-full rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm">
            <option value="foundation">Foundation (everyone)</option>
            <option value="intern">Intern Track (interns only)</option>
            <option value="department">Department (one team)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-(--rs-neutral-grey-800) mb-1">
            Department (only used when scope = Department)
          </label>
          <select name="department"
            className="block w-full rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm">
            <option value="">—</option>
            {teams.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-(--rs-neutral-grey-800) mb-1">Enforcement</label>
          <select name="enforcement" defaultValue="soft"
            className="block w-full rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm">
            <option value="soft">Soft — dashboard banner only</option>
            <option value="hard">Hard — block onboarding users until complete</option>
          </select>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <button type="submit"
            className="rounded-lg bg-(--rs-primary-500) text-white text-sm font-semibold px-4 py-2 hover:bg-(--rs-primary-600)">
            Create course
          </button>
          <Link href="/admin/learning" className="text-sm text-(--rs-neutral-grey-600) hover:underline">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({ label, name, required, textarea }: { label: string; name: string; required?: boolean; textarea?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-(--rs-neutral-grey-800) mb-1">
        {label}{required && <span className="text-red-600"> *</span>}
      </label>
      {textarea ? (
        <textarea name={name} rows={3}
          className="block w-full rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm" />
      ) : (
        <input type="text" name={name} required={required}
          className="block w-full rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm" />
      )}
    </div>
  );
}
