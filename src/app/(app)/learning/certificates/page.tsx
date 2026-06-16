import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Award } from 'lucide-react';
import { getSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Row = {
  id:        number;
  course_id: number;
  issued_at: string;
  serial:    string;
  pdf_path:  string | null;
  course_title?: string;
};

export default async function CertificatesPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const admin = createAdminClient();
  const { data: certs } = await admin
    .from('lms_certificates')
    .select('id, course_id, issued_at, serial, pdf_path')
    .eq('user_id', session.id)
    .order('issued_at', { ascending: false });

  const list = (certs ?? []) as Row[];

  // Pull course titles in one extra round-trip (no embed — no FK on user_id).
  if (list.length > 0) {
    const ids = list.map(c => c.course_id);
    const { data: courses } = await admin
      .from('lms_courses').select('id, title').in('id', ids);
    const titleById = new Map((courses ?? []).map((c: { id: number; title: string }) => [c.id, c.title]));
    for (const row of list) row.course_title = titleById.get(row.course_id);
  }

  return (
    <div className="space-y-6">
      <header>
        <Link href="/learning" className="text-xs text-(--rs-primary-600) hover:underline">
          ← My Learning
        </Link>
        <h1 className="font-serif text-2xl font-semibold text-(--rs-neutral-grey-900) mt-2">
          My Certificates
        </h1>
        <p className="mt-1 text-sm text-(--rs-neutral-grey-500)">
          Courses you&apos;ve completed 100%. PDF certificates are issued automatically.
        </p>
      </header>

      {list.length === 0 ? (
        <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-8 text-center">
          <Award className="mx-auto h-8 w-8 text-(--rs-neutral-grey-300)" />
          <p className="mt-3 text-sm text-(--rs-neutral-grey-500)">
            No certificates yet. Finish a course to earn your first one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map(cert => (
            <article key={cert.id} className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-5">
              <div className="flex items-center gap-2 text-xs">
                <Award className="h-4 w-4 text-(--rs-accent-600)" />
                <span className="font-semibold text-(--rs-accent-700)">Certificate</span>
              </div>
              <h3 className="mt-2 font-serif text-lg font-semibold text-(--rs-neutral-grey-900)">
                {cert.course_title ?? `Course #${cert.course_id}`}
              </h3>
              <dl className="mt-3 text-xs text-(--rs-neutral-grey-500) space-y-0.5">
                <div><dt className="inline font-semibold text-(--rs-neutral-grey-700)">Serial: </dt>{cert.serial}</div>
                <div><dt className="inline font-semibold text-(--rs-neutral-grey-700)">Issued: </dt>{new Date(cert.issued_at).toLocaleDateString('en-US')}</div>
              </dl>
              <div className="mt-4">
                {cert.pdf_path ? (
                  <a
                    href={`/api/lms/certificates/${cert.id}`}
                    className="inline-flex items-center rounded-md bg-(--rs-primary-500) text-white text-xs font-semibold px-3 py-1.5 hover:bg-(--rs-primary-600) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300)"
                  >
                    Download PDF
                  </a>
                ) : (
                  <span className="text-xs italic text-(--rs-neutral-grey-400)">
                    PDF pending — re-finish a lesson to trigger render
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
