// Position employment types (positions.employment_type). Single source of truth
// for the dropdown, the save action, the filter and every label. Must match the
// CHECK constraint in drizzle/0019_positions_employment_type_check.sql.

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contractual', 'internship'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time:   'Full-time',
  part_time:   'Part-time',
  contractual: 'Contractual',
  internship:  'Internship',
};

export const EMPLOYMENT_TYPE_OPTIONS = EMPLOYMENT_TYPES.map(value => ({ value, label: EMPLOYMENT_TYPE_LABELS[value] }));

export function isEmploymentType(v: unknown): v is EmploymentType {
  return typeof v === 'string' && (EMPLOYMENT_TYPES as readonly string[]).includes(v);
}

/** Display label. Unknown or empty values show "Not specified", never a guess. */
export function employmentLabel(v: string | null | undefined): string {
  return isEmploymentType(v) ? EMPLOYMENT_TYPE_LABELS[v] : 'Not specified';
}

/** Validate a submitted value. Throws a readable error instead of defaulting. */
export function parseEmploymentType(raw: unknown): EmploymentType {
  const v = String(raw ?? '').trim();
  if (isEmploymentType(v)) return v;
  throw new Error(`Please choose an employment type: ${EMPLOYMENT_TYPES.map(t => EMPLOYMENT_TYPE_LABELS[t]).join(', ')}.`);
}
