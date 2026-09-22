import { describe, expect, it } from 'vitest';
import { availabilityForAssignedSession, classifyCohortMember } from '@/lib/onboarding-sessions';

describe('classifyCohortMember', () => {
  it('keeps a completed yes response in the current cohort', () => {
    expect(classifyCohortMember({
      availability: 'yes',
      formSubmittedAt: '2026-09-04T01:00:00.000Z',
    })).toBe('confirmed');
  });

  it('auto-enrolls a completed no response in the next cohort', () => {
    expect(classifyCohortMember({
      availability: 'no',
      formSubmittedAt: '2026-09-04T01:00:00.000Z',
    })).toBe('auto_enroll_next');
  });

  it('keeps a missing response pending for the next cohort', () => {
    expect(classifyCohortMember({
      availability: 'pending',
      formSubmittedAt: null,
    })).toBe('pending_next');
  });

  it('does not confirm an availability value without a completed form', () => {
    expect(classifyCohortMember({
      availability: 'yes',
      formSubmittedAt: null,
    })).toBe('pending_next');
  });
});

describe('availabilityForAssignedSession', () => {
  it('marks a late no response as attending the newly assigned Friday', () => {
    expect(availabilityForAssignedSession('no', true)).toBe('yes');
  });

  it('preserves an on-time no response until the cohort finalizer runs', () => {
    expect(availabilityForAssignedSession('no', false)).toBe('no');
  });

  it('preserves a yes response', () => {
    expect(availabilityForAssignedSession('yes', true)).toBe('yes');
  });
});
