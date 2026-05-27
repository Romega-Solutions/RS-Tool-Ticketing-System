import { normalizeRole } from './rbac';
import { OVERTIME_THRESHOLD_SECONDS } from './utils';

// Grace window after the overtime prompt before we close the session.
// Mirrors OVERTIME_RESPONSE_WINDOW_SECONDS in the browser widget.
export const RESPONSE_WINDOW_SECONDS = 5 * 60;

export type AutoClockOutInput = {
  clockedInAt:          string;
  role:                 string | null | undefined;
  overtimeConsentUntil: string | null;
  now:                  Date;
};

export type AutoClockOutDecision =
  | { action: 'skip';  reason: string }
  | { action: 'close'; elapsedSec: number };

// Pure decision: should this open timesheet row be auto-closed right now?
//
// Closes when ALL of these are true:
//   - clocked_in_at parses to a finite timestamp
//   - elapsed time >= 3h + 5min response window
//   - user role does NOT normalize to "admin" (admin/ceo/owner/superadmin are exempt)
//   - there is no live consent extension (none, or expired > 5min ago)
export function decideAutoClockOut(input: AutoClockOutInput): AutoClockOutDecision {
  const clockedInMs = new Date(input.clockedInAt).getTime();
  if (!Number.isFinite(clockedInMs)) {
    return { action: 'skip', reason: 'invalid clocked_in_at' };
  }

  const elapsedSec = Math.round((input.now.getTime() - clockedInMs) / 1000);
  if (elapsedSec < OVERTIME_THRESHOLD_SECONDS + RESPONSE_WINDOW_SECONDS) {
    return { action: 'skip', reason: 'within response window' };
  }

  if (normalizeRole(input.role ?? '') === 'admin') {
    return { action: 'skip', reason: 'admin/ceo exempt' };
  }

  if (input.overtimeConsentUntil) {
    const consentMs = new Date(input.overtimeConsentUntil).getTime();
    if (Number.isFinite(consentMs) && input.now.getTime() < consentMs + RESPONSE_WINDOW_SECONDS * 1000) {
      return { action: 'skip', reason: 'consent active' };
    }
  }

  return { action: 'close', elapsedSec };
}
