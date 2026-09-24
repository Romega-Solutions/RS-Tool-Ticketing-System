import { describe, expect, it } from 'vitest';
import { isActiveRecruitmentRequest, recruitmentActions, recruitmentWaitingLabel, type RecruitmentProgressInput } from '@/lib/recruitment-progress';

const sent = '2026-09-01T00:00:00Z';
const response = '2026-09-02T00:00:00Z';
const now = Date.parse('2026-09-03T00:00:00Z');
const unsent = { request_sent_at: null, responded_at: null };
const pending = { request_sent_at: sent, responded_at: null };
const received = { request_sent_at: sent, responded_at: response };
const base: RecruitmentProgressInput = {
  status: 'offered', request: null, submittedAt: null, references: [], verifications: [], documents: [],
};
const activeRequest = { sent_at: sent, submitted_at: null, invalidated_at: null, expires_at: '2026-10-01T00:00:00Z' };
const submitted = { ...base, submittedAt: response, references: [unsent], verifications: [unsent] };
const complete = { ...submitted, references: [received], verifications: [received] };
const documents = ['sow', 'job_description', 'ai_policy', 'nda'].map(kind => ({ kind, sent_at: '2026-09-03T00:00:00Z', signed_at: null }));

describe('recruitment action / reminder cycle', () => {
  it('recognizes only unexpired, open requests as active', () => {
    expect(isActiveRecruitmentRequest(activeRequest, now)).toBe(true);
    expect(isActiveRecruitmentRequest({ ...activeRequest, expires_at: sent }, now)).toBe(false);
  });
  it('starts with send, then remind while the form is unanswered', () => {
    expect(recruitmentActions(base, now)[0].kind).toBe('send_background');
    expect(recruitmentActions({ ...base, request: activeRequest }, now)[0].reminderKind).toBe('background_check');
  });
  it('offers a new request for expired or invalidated form links', () => {
    expect(recruitmentActions({ ...base, request: { ...activeRequest, expires_at: sent } }, now)[0].kind).toBe('send_background');
    expect(recruitmentActions({ ...base, request: { ...activeRequest, invalidated_at: sent } }, now)[0].kind).toBe('send_background');
  });
  it('replaces the candidate reminder with contact-send actions after submission', () => {
    expect(recruitmentActions(submitted).map(row => row.kind)).toEqual(['send_references', 'send_verifications']);
  });
  it('switches each group to reminder after requests are sent', () => {
    const result = recruitmentActions({ ...submitted, references: [pending] });
    expect(result[0].reminderKind).toBe('reference_check');
    expect(result[1].kind).toBe('send_verifications');
  });
  it('provides compact waiting labels for dashboard reminder states', () => {
    const candidate = recruitmentActions({ ...base, request: activeRequest }, now)[0];
    expect(recruitmentWaitingLabel(candidate)).toBe('Awaiting candidate response');
    const mixed = recruitmentActions({ ...submitted, references: [pending, pending], verifications: [unsent] });
    expect(recruitmentWaitingLabel(mixed[0])).toBe('Awaiting 2 reference responses');
    expect(recruitmentWaitingLabel(mixed[1])).toBeNull();
  });
  it('keeps reminders for unanswered contacts after a partial response', () => {
    const result = recruitmentActions({ ...submitted, references: [received, pending, pending] });
    expect(result[0].kind).toBe('remind');
    expect(result[0].count).toBe(2);
  });
  it('advances the completed group without hiding another group reminder', () => {
    const result = recruitmentActions({ ...submitted, references: [received], verifications: [pending] });
    expect(result[0].kind).toBe('review');
    expect(result[1].reminderKind).toBe('employment_verification');
  });
  it('does not count empty groups as complete', () => {
    const result = recruitmentActions({ ...submitted, references: [] });
    expect(result[0].label).toBe('Review contacts');
    expect(result.every(row => row.tab !== 'documents')).toBe(true);
  });
  it('opens review and documents after all responses arrive', () => {
    expect(recruitmentActions(complete).map(row => row.tab)).toEqual(['background-check', 'documents']);
  });
  it('switches the sent package to the shared SOW reminder', () => {
    const result = recruitmentActions({ ...complete, documents });
    expect(result[0].kind).toBe('remind');
    expect(result[0].reminderKind).toBe('sow');
    expect(result[1].label).toContain('confirm signed SOW');
  });
  it('shows the most recent SOW package or reminder timestamp', () => {
    const reminderAt = '2026-09-05T00:00:00Z';
    const result = recruitmentActions({
      ...complete,
      documents: documents.map(document => ({
        ...document,
        last_reminder_sent_at: document.kind === 'sow' ? reminderAt : null,
      })),
    });
    expect(result[0].lastSentAt).toBe(reminderAt);
  });
  it('does not offer a SOW reminder before every package document is sent', () => {
    expect(recruitmentActions({ ...complete, documents: documents.slice(1) }).some(row => row.reminderKind === 'sow')).toBe(false);
  });
  it('returns to review for responses received after sending the package', () => {
    const result = recruitmentActions({ ...complete, documents, references: [{ ...received, responded_at: '2026-09-04T00:00:00Z' }] });
    expect(result[0].label).toBe('Review responses');
  });
  it('uses the latest reminder timestamp for pending contacts only', () => {
    const result = recruitmentActions({ ...submitted, references: [{ ...pending, last_reminder_sent_at: response }, { ...received, last_reminder_sent_at: '2026-09-05T00:00:00Z' }] });
    expect(result[0].lastSentAt).toBe(response);
  });
  it('does not remind after SOW is manually signed', () => {
    const result = recruitmentActions({ ...complete, documents: documents.map(doc => ({ ...doc, signed_at: doc.kind === 'sow' ? response : null })) });
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Review for onboarding');
  });
  it.each(['hired', 'failed', 'withdrew', 'pending_response'])('hides pre-employment actions for %s', status => {
    expect(recruitmentActions({ ...complete, status })).toEqual([]);
  });
});
