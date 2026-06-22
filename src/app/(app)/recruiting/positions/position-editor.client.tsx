'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Briefcase, AlertCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { PositionDetailFields, type PositionDefaults } from './position-fields';
import { JobDescriptionEditor } from './job-description-editor.client';
import { createPosition, updatePosition } from './actions';

/**
 * Full-page, wide-screen position editor. Replaces the old cramped modal: the
 * structured details sit in a sticky left column while the long job-description
 * editor gets the full width of the right column (and scrolls inside its own
 * box), so a long JD no longer turns the form into an endless vertical scroll.
 */
export function PositionEditor({
  mode,
  positionId,
  defaults,
}: {
  mode: 'create' | 'edit';
  positionId?: number;
  defaults?: PositionDefaults;
}) {
  const router = useRouter();
  const [isPending, start]      = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setErrorMsg(null);
    start(async () => {
      try {
        if (mode === 'edit' && positionId != null) {
          await updatePosition(positionId, formData);
        } else {
          await createPosition(formData);
        }
        router.push('/recruiting/positions');
        router.refresh();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to save position');
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-6">
      {/* Header / breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/recruiting/positions"
            className="inline-flex items-center gap-1.5 text-sm text-(--rs-neutral-grey-500) hover:text-(--rs-primary-600)"
          >
            <ArrowLeft className="w-4 h-4" /> Back to positions
          </Link>
          <h1 className="mt-2 font-serif text-2xl font-bold text-(--rs-neutral-grey-900)">
            {mode === 'edit' ? 'Edit position' : 'Add a new position'}
          </h1>
          <p className="text-sm text-(--rs-neutral-grey-500)">
            {mode === 'edit'
              ? 'Update this role. The application link and any linked candidates stay the same.'
              : 'Track an open role inside the ATS. Candidates can be linked from the Candidates tab.'}
          </p>
        </div>
      </div>

      {/* Wide two-column layout: details (left) · job description (right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(320px,420px)_1fr] lg:items-start">
        {/* Left column — sticky so the Save button stays reachable on long JDs */}
        <div className="lg:sticky lg:top-6 space-y-4">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="inline-flex items-center gap-2 w-fit px-2.5 py-1 rounded-full bg-(--rs-primary-50) text-(--rs-primary-700) text-[10px] font-bold uppercase tracking-wider">
                <Briefcase className="w-3 h-3" /> Role details
              </div>
              <PositionDetailFields defaults={defaults} />
            </CardContent>
          </Card>

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isPending} className="gap-2">
              {isPending ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Saving…
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" /> {mode === 'edit' ? 'Save changes' : 'Save position'}
                </>
              )}
            </Button>
            <Button type="button" variant="outline" disabled={isPending} render={<Link href="/recruiting/positions" />}>
              Cancel
            </Button>
          </div>
        </div>

        {/* Right column — full-width job description editor */}
        <Card>
          <CardContent className="p-5 space-y-2">
            <Label htmlFor="jobDescription" className="text-(--rs-neutral-grey-700) font-medium">
              Job description
            </Label>
            <p className="text-xs text-(--rs-neutral-grey-500)">
              Responsibilities, requirements, and any context candidates should know. Applicants
              apply through the form on the public listing — no need to add an email address here.
            </p>
            <JobDescriptionEditor
              name="jobDescription"
              defaultValue={defaults?.job_description ?? ''}
              bodyClassName="min-h-[55vh] max-h-[70vh] overflow-y-auto"
            />
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
