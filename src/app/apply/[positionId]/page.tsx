import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { Briefcase, MapPin, Building2, AlertCircle } from 'lucide-react';
import { ApplyForm } from './apply-form';

type Position = {
  id:              number;
  job_title:       string;
  client:          string | null;
  location:        string | null;
  job_description: string | null;
  is_open:         boolean;
};

export default async function ApplyPage({
  params,
}: {
  params: Promise<{ positionId: string }>;
}) {
  const { positionId } = await params;
  const id = parseInt(positionId, 10);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('positions')
    .select('id, job_title, client, location, job_description, is_open')
    .eq('id', id)
    .maybeSingle();

  if (error?.message?.toLowerCase().includes('does not exist')) {
    return <NotConfigured />;
  }
  if (!data) notFound();

  const position = data as Position;

  return (
    <div className="min-h-screen bg-(--rs-neutral-grey-50) py-10 px-4 sm:px-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-(--rs-primary-700)">
            Romega Solutions · Careers
          </p>
          <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-bold text-(--rs-neutral-grey-900) leading-tight">
            {position.job_title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-sm text-(--rs-neutral-grey-600)">
            {position.client && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-(--rs-neutral-grey-400)" />
                {position.client}
              </span>
            )}
            {position.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-(--rs-neutral-grey-400)" />
                {position.location}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-(--rs-neutral-grey-400)" />
              {position.is_open ? 'Open' : 'Closed'}
            </span>
          </div>
        </header>

        {!position.is_open ? (
          <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-6 sm:p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-500) flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">
              This position is closed
            </h2>
            <p className="mt-2 text-sm text-(--rs-neutral-grey-600)">
              We&apos;re no longer accepting applications for this role. Please check{' '}
              <a href="/careers" className="text-(--rs-primary-700) hover:underline">our other open roles</a>.
            </p>
          </div>
        ) : (
          <>
            {position.job_description && (
              <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-5 sm:p-6">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-(--rs-neutral-grey-500) mb-2">
                  About the role
                </h2>
                <p className="text-sm text-(--rs-neutral-grey-700) leading-relaxed whitespace-pre-wrap">
                  {position.job_description}
                </p>
              </div>
            )}

            <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-5 sm:p-6">
              <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900) mb-1">
                Apply
              </h2>
              <p className="text-sm text-(--rs-neutral-grey-500) mb-5">
                Submit your details and resume below. We&apos;ll send you a confirmation email.
              </p>
              <ApplyForm positionId={position.id} jobTitle={position.job_title} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md text-center space-y-3">
        <h1 className="font-serif text-2xl font-bold text-(--rs-neutral-grey-900)">Careers page not ready</h1>
        <p className="text-sm text-(--rs-neutral-grey-600)">
          The recruiting database hasn&apos;t been set up yet. Please come back soon.
        </p>
      </div>
    </div>
  );
}
