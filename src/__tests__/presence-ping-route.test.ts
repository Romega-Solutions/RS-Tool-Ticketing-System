import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/session';

const sender: SessionUser = {
  id: 1,
  email: 'admin@romega-solutions.com',
  name: 'Admin User',
  username: 'admin',
  role: 'admin',
  team: null,
  jobTitle: null,
  isOnboarding: false,
  toolAccess: [],
};

function jsonReq(body: unknown) {
  return new Request('http://localhost/api/presence/ping', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockSession(session: SessionUser | null) {
  vi.doMock('@/lib/session', () => ({
    getSession: vi.fn().mockResolvedValue(session),
  }));
}

function mockClockedIn(clockedInUserIds: number[]) {
  const from = vi.fn((table: string) => {
    if (table === 'timesheets') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn((_col: string, userId: number) => ({
            is: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({
                data: clockedInUserIds.includes(userId) ? [{ id: 10 }] : [],
                error: null,
              })),
            })),
          })),
        })),
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });

  vi.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: vi.fn(() => ({ from })),
  }));
}

describe('POST /api/presence/ping', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('allows a ping when the target has an open timesheet row', async () => {
    mockSession(sender);
    mockClockedIn([2]);

    const presence = await import('@/lib/presence');
    presence.__resetPresenceForTests();

    const { POST } = await import('@/app/api/presence/ping/route');
    const res = await POST(jsonReq({ toUserId: 2, message: 'Are you online?' }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({
      ok: true,
      ping: {
        type: 'user_ping',
        deadlineAt: expect.any(String),
      },
      record: {
        status: 'pending',
        deadlineAt: expect.any(String),
      },
      snapshot: {
        byUserId: {
          2: {
            awaitingReplyCount: 1,
            missedReplyCount: 0,
          },
        },
      },
    });
  });

  it('rejects a ping when the target has no open timesheet row', async () => {
    mockSession(sender);
    mockClockedIn([]);

    const { POST } = await import('@/app/api/presence/ping/route');
    const res = await POST(jsonReq({ toUserId: 2 }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'User is not clocked in right now' });
  });
});
