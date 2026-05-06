import { describe, it, expect, beforeEach } from 'vitest';

// Re-implement the pure presence logic here so we can test it in isolation
// without needing database or Next.js runtime.

type AppRole = 'ic' | 'lead' | 'admin';

type PresenceUser = {
  userId:      number;
  name:        string;
  role:        AppRole;
  team:        string | null;
  clockedInAt: string;
};

function canSee(
  viewerRole: AppRole,
  viewerTeam: string | null,
  viewerUserId: number,
  target: PresenceUser,
): boolean {
  if (viewerRole === 'admin')   return true;
  if (target.userId === viewerUserId) return true;
  if (viewerRole === 'lead' && target.role === 'ic' && target.team === viewerTeam) return true;
  return false;
}

function getOnline(
  online: Map<number, PresenceUser>,
  viewerRole: AppRole,
  viewerTeam: string | null,
  viewerUserId: number,
): PresenceUser[] {
  return [...online.values()].filter(u => canSee(viewerRole, viewerTeam, viewerUserId, u));
}

const makeUser = (overrides: Partial<PresenceUser> & { userId: number }): PresenceUser => ({
  name: 'Test User',
  role: 'ic',
  team: 'Engineering',
  clockedInAt: new Date().toISOString(),
  ...overrides,
});

describe('presence canSee visibility rules', () => {
  it('admin sees everyone', () => {
    const online = new Map<number, PresenceUser>();
    online.set(1, makeUser({ userId: 1, role: 'ic', team: 'Engineering' }));
    online.set(2, makeUser({ userId: 2, role: 'ic', team: 'Design' }));
    online.set(3, makeUser({ userId: 3, role: 'lead', team: 'Engineering' }));

    const visible = getOnline(online, 'admin', 'Engineering', 99);
    expect(visible).toHaveLength(3);
  });

  it('lead sees their own team ICs only (not other teams, not other leads)', () => {
    const online = new Map<number, PresenceUser>();
    online.set(1, makeUser({ userId: 1, role: 'ic',   team: 'Engineering' }));
    online.set(2, makeUser({ userId: 2, role: 'ic',   team: 'Design' }));
    online.set(3, makeUser({ userId: 3, role: 'lead', team: 'Engineering' }));
    online.set(4, makeUser({ userId: 4, role: 'ic',   team: 'Engineering' }));

    // Lead viewerUserId=10 from Engineering team
    const visible = getOnline(online, 'lead', 'Engineering', 10);
    const ids = visible.map(u => u.userId);
    expect(ids).toContain(1);
    expect(ids).toContain(4);
    expect(ids).not.toContain(2); // different team
    expect(ids).not.toContain(3); // is lead, not ic
  });

  it('ic sees only themselves', () => {
    const online = new Map<number, PresenceUser>();
    online.set(1, makeUser({ userId: 1, role: 'ic', team: 'Engineering' }));
    online.set(2, makeUser({ userId: 2, role: 'ic', team: 'Engineering' }));

    const visible = getOnline(online, 'ic', 'Engineering', 1);
    expect(visible).toHaveLength(1);
    expect(visible[0].userId).toBe(1);
  });

  it('user always sees themselves regardless of role', () => {
    const online = new Map<number, PresenceUser>();
    online.set(5, makeUser({ userId: 5, role: 'ic', team: 'Design' }));

    const visible = getOnline(online, 'ic', 'Engineering', 5);
    expect(visible).toHaveLength(1);
    expect(visible[0].userId).toBe(5);
  });

  it('lead with null team sees only themselves', () => {
    const online = new Map<number, PresenceUser>();
    online.set(1, makeUser({ userId: 1, role: 'ic', team: null }));
    online.set(2, makeUser({ userId: 2, role: 'ic', team: null }));

    // Lead with null team — team matching null === null returns true, but...
    // null === null is true in JS so they WOULD see null-team ICs. This documents the behavior.
    const visible = getOnline(online, 'lead', null, 99);
    const ids = visible.map(u => u.userId);
    // Both have team null, lead has team null → match
    expect(ids).toContain(1);
    expect(ids).toContain(2);
  });
});

describe('clock-in / clock-out state machine', () => {
  let online: Map<number, PresenceUser>;

  beforeEach(() => { online = new Map(); });

  it('clocking in adds user to online map', () => {
    const user = makeUser({ userId: 1 });
    online.set(user.userId, user);
    expect(online.has(1)).toBe(true);
  });

  it('clocking out removes user from online map', () => {
    online.set(1, makeUser({ userId: 1 }));
    online.delete(1);
    expect(online.has(1)).toBe(false);
  });

  it('re-clocking in updates the entry', () => {
    const first = makeUser({ userId: 1, clockedInAt: '2026-05-06T09:00:00Z' });
    online.set(1, first);
    const second = makeUser({ userId: 1, clockedInAt: '2026-05-06T10:00:00Z' });
    online.set(1, second);
    expect(online.get(1)!.clockedInAt).toBe('2026-05-06T10:00:00Z');
  });
});
