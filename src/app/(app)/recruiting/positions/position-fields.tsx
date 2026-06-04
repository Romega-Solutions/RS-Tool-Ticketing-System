import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const inputClass =
  'h-11 rounded-xl border-(--rs-neutral-grey-200) focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100)';

export type PositionDefaults = {
  job_title?:       string;
  client?:          string | null;
  location?:        string | null;
  job_description?: string | null;
};

/**
 * Shared form fields for both the "Add position" and "Edit position" dialogs,
 * so the field layout/validation lives in one place. Pass `defaults` to
 * pre-fill (edit mode); omit it for a blank create form.
 */
export function PositionFields({ defaults }: { defaults?: PositionDefaults }) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="jobTitle" className="text-(--rs-neutral-grey-700) font-medium">Job title *</Label>
          <Input id="jobTitle" name="jobTitle" required defaultValue={defaults?.job_title ?? ''} placeholder="Senior Frontend Engineer" className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="client" className="text-(--rs-neutral-grey-700) font-medium">Client</Label>
          <Input id="client" name="client" defaultValue={defaults?.client ?? ''} placeholder="Romega Solutions" className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="location" className="text-(--rs-neutral-grey-700) font-medium">Location</Label>
          <Input id="location" name="location" defaultValue={defaults?.location ?? ''} placeholder="Remote · PH" className={inputClass} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="jobDescription" className="text-(--rs-neutral-grey-700) font-medium">Job description</Label>
        <textarea
          id="jobDescription"
          name="jobDescription"
          rows={6}
          defaultValue={defaults?.job_description ?? ''}
          placeholder="Responsibilities, requirements, and any other context recruiters should know…"
          className="flex w-full rounded-xl border border-(--rs-neutral-grey-200) bg-white px-4 py-3 text-sm placeholder:text-(--rs-neutral-grey-400) outline-none transition-all focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100)"
        />
      </div>
    </>
  );
}
