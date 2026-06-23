import { describe, it, expect } from 'vitest';
import { canAccessLeadTool, canAccessPath } from '@/lib/rbac';

// Regression: the HR team does recruiting, but "Human Resources" was missing
// from the recruiting allowlist (so the HR lead was blocked) and ICs were
// blocked from all lead tools (so HR ICs were blocked even after the allowlist
// fix). Recruiting now allows HR leads AND ICs on core recruiting/HR teams.
// NOTE: canAccessLeadTool is now the SEED logic (computes day-one tool_access);
// runtime access is per-user via tool_access / hasToolAccess.
describe('canAccessLeadTool (seed logic) — recruiting access for the HR team', () => {
  it('lets an HR lead (Christine) see Recruiting', () => {
    expect(canAccessLeadTool('recruiting', 'lead', 'Human Resources')).toBe(true);
  });

  it('lets an HR ic (Erich) see Recruiting', () => {
    expect(canAccessLeadTool('recruiting', 'ic', 'Human Resources')).toBe(true);
  });

  it('lets ICs on core recruiting teams see Recruiting', () => {
    expect(canAccessLeadTool('recruiting', 'ic', 'Talent Acquisition')).toBe(true);
    expect(canAccessLeadTool('recruiting', 'ic', 'People Operations')).toBe(true);
  });

  it('still blocks ICs on unrelated teams', () => {
    expect(canAccessLeadTool('recruiting', 'ic', 'AI & Technology')).toBe(false);
    expect(canAccessLeadTool('recruiting', 'ic', 'Sales & Account Management')).toBe(false);
  });

  it('still blocks interns even on the HR team', () => {
    expect(canAccessLeadTool('recruiting', 'intern', 'Human Resources')).toBe(false);
  });

  it('does NOT leak other lead tools to HR ICs (recruiting is the only IC exception)', () => {
    expect(canAccessLeadTool('onboarding', 'ic', 'Human Resources')).toBe(false);
    expect(canAccessLeadTool('pm', 'ic', 'Human Resources')).toBe(false);
  });

  it('admins always see Recruiting regardless of team', () => {
    expect(canAccessLeadTool('recruiting', 'admin', null)).toBe(true);
  });

  it('gates the /recruiting/* path by the per-user tool_access set', () => {
    expect(canAccessPath('/recruiting/candidates', 'lead', ['recruiting'])).toBe(true);
    expect(canAccessPath('/recruiting/candidates', 'ic', ['recruiting'])).toBe(true);
    expect(canAccessPath('/recruiting/candidates', 'ic', [])).toBe(false);
    expect(canAccessPath('/recruiting/candidates', 'admin', [])).toBe(true);
  });
});
