// Central registry of Next.js `unstable_cache` tag strings, so the read side
// (unstable_cache's `tags` option) and write side (`revalidateTag` calls in
// actions/routes) can't drift into mismatched strings.

export const LMS_COURSES_TAG = 'lms-courses';
export const ATS_POSITIONS_TAG = 'ats-positions';
export const USERS_LIST_TAG = 'users-list';

export function atsPositionTag(positionId: number | string): string {
  return `ats-position-${positionId}`;
}

export function projectStatesTag(projectId: number | string): string {
  return `project-${projectId}-states`;
}

export function projectLabelsTag(projectId: number | string): string {
  return `project-${projectId}-labels`;
}

export function projectCyclesTag(projectId: number | string): string {
  return `project-${projectId}-cycles`;
}
