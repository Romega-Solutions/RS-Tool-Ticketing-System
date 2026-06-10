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
};

const decoder = new TextDecoder();

function jsonReq(body: unknown) {
  return new Request('http://localhost/api/presence/ping', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeController() {
  const chunks: string[] = [];
  const ctrl = {
    enqueue(chunk: Uint8Array) {
      chunks.push(decoder.decode(chunk));
    },
  } as unknown as ReadableStreamDefaultController;
  return { ctrl, chunks };
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

  it('hydrates open clock-in sessions before rejecting a live ping as not clocked in', async () => {
    mockSession(sender);
    mockPresenceHydration();

    const presence = await import('@/lib/presence');
    presence.__resetPresenceForTests();
    const targetStream = makeController();
    presence.subscribeToLive(2, targetStream.ctrl);

    const { POST } = await import('@/app/api/presence/ping/route');
    const res = await POST(jsonReq({ toUserId: 2, message: 'Are you online?' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(targetStream.chunks).toHaveLength(1);
    expect(targetStream.chunks[0]).toContain('"type":"user_ping"');
    expect(targetStream.chunks[0]).toContain('"message":"Are you online?"');
  });
});
