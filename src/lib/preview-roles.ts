// Client-safe constants for the preview-only role switcher (roles and labels
// only). The test account emails and every server-side guard live in
// ./preview-role-switcher.ts.

export const PREVIEW_ROLES = ['founder', 'admin', 'lead', 'ic', 'intern'] as const;
export type PreviewRole = (typeof PREVIEW_ROLES)[number];

export const PREVIEW_ROLE_LABELS: Record<PreviewRole, string> = {
  founder: 'Founder',
  admin: 'Admin',
  lead: 'Lead',
  ic: 'IC',
  intern: 'Intern',
};
