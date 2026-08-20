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

function mockPresenceHydration() {
  const from = vi.fn((table: string) => {
    if (table === 'timesheets') {
      return {
        select: vi.fn(() => ({
          is: vi.fn(() => Promise.resolve({
            data: [{ user_id: 2, clocked_in_at: '2026-06-10T01:00:00.000Z' }],
          })),
        })),
      };
    }

    if (table === 'users') {
      return {
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({
              data: [{
                id: 2,
                name: 'Receiver',
                email: 'receiver@romega-solutions.com',
                role: 'ic',
                team: 'Engineering',
              }],
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
  vi.doMock('@/lib/orgchart', () => ({
    getPhotoResolver: vi.fn().mockResolvedValue(() => null),
  }));
  vi.doMock('@/lib/overtime-server', () => ({
    weeklySecondsForUsers: vi.fn().mockResolvedValue(new Map([[2, 0]])),
  }));
}

describe('POST /api/presence/ping', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('hydrates open clock-in sessions from the DB before allowing a ping to a not-yet-seen user', async () => {
    mockSession(sender);
    mockPresenceHydration();

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
});
