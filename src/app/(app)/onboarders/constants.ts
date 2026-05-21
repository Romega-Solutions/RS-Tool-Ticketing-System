// Shared constants for the Internal Onboarding module. Lives outside actions.ts
// so client components can import them — a `'use server'` file is only allowed
// to export async functions.

export const ALLOWED_STATUSES = [
  'offer_signed',
  'background_check',
  'pre_onboarding',
  'day_one',
  'thirty_day',
  'ninety_day',
  'regularized',
  'failed_probation',
  'withdrew',
] as const;
export type OnboarderStatus = typeof ALLOWED_STATUSES[number];

export const ALLOWED_TYPES = ['contractor', 'intern'] as const;
export type OnboarderType = typeof ALLOWED_TYPES[number];

// Onboarding Lead is always Erich until HR confirms otherwise.
// Override at runtime by setting ONBOARDING_LEAD_NAME in env.
export const DEFAULT_ONBOARDING_LEAD = (
  process.env.ONBOARDING_LEAD_NAME?.trim() || 'Erich'
);
