import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { JobDescriptionEditor } from './job-description-editor.client';

const inputClass =
  'h-11 rounded-xl border-(--rs-neutral-grey-200) focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100)';

const selectClass =
  'h-11 w-full rounded-xl border border-(--rs-neutral-grey-200) bg-white px-3 text-sm text-(--rs-neutral-grey-800) outline-none transition-all focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100)';

export type PositionDefaults = {
  job_title?:       string;
  placement_type?:  string | null;  // 'internal' | 'external'
  location?:        string | null;
  compensation?:    string | null;
  employment_type?: string | null;  // 'full_time' | 'part_time'
  openings?:        number | null;
  job_description?: string | null;
};

/**
 * Shared form fields for both the "Add position" and "Edit position" dialogs,
 * so the field layout/validation lives in one place. Pass `defaults` to
 * pre-fill (edit mode); omit it for a blank create form.
 */
export function PositionFields({ defaults }: { defaults?: PositionDefaults }) {
  const placement  = defaults?.placement_type ?? 'internal';
  const employment = defaults?.employment_type ?? 'full_time';

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="jobTitle" className="text-(--rs-neutral-grey-700) font-medium">Job title *</Label>
          <Input id="jobTitle" name="jobTitle" required defaultValue={defaults?.job_title ?? ''} placeholder="Senior Frontend Engineer" className={inputClass} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="placementType" className="text-(--rs-neutral-grey-700) font-medium">Placement</Label>
          <select id="placementType" name="placementType" defaultValue={placement} className={selectClass}>
            <option value="internal">Internal</option>
            <option value="external">External</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="location" className="text-(--rs-neutral-grey-700) font-medium">Location</Label>
          <Input id="location" name="location" defaultValue={defaults?.location ?? ''} placeholder="Remote · PH" className={inputClass} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="employmentType" className="text-(--rs-neutral-grey-700) font-medium">Employment type</Label>
          <select id="employmentType" name="employmentType" defaultValue={employment} className={selectClass}>
            <option value="full_time">Full time</option>
            <option value="part_time">Part time</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="openings" className="text-(--rs-neutral-grey-700) font-medium">Number of openings</Label>
          <Input id="openings" name="openings" type="number" min={1} step={1} defaultValue={defaults?.openings ?? 1} className={inputClass} />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="compensation" className="text-(--rs-neutral-grey-700) font-medium">Compensation</Label>
          <Input id="compensation" name="compensation" defaultValue={defaults?.compensation ?? ''} placeholder="$1,500 – $2,500 / month" className={inputClass} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="jobDescription" className="text-(--rs-neutral-grey-700) font-medium">Job description</Label>
        <JobDescriptionEditor name="jobDescription" defaultValue={defaults?.job_description ?? ''} />
      </div>
    </>
  );
}
