import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

// Minimal chainable stand-in for the Supabase query builder: every filter
// returns the same builder, and awaiting it resolves to { data, error }.
function query(data: Row[]) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit']) builder[m] = () => builder;
  builder.then = (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data, error: null });
  return builder;
}

function adminWith(tables: Record<string, Row[]>) {
  return { from: (table: string) => query(tables[table] ?? []) } as never;
}

describe('loadOnlineUsers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('@/lib/orgchart', () => ({
      getPhotoResolver: vi.fn().mockResolvedValue(() => null),
    }));
    vi.doMock('@/lib/overtime-server', () => ({
      weeklySecondsForUsers: vi.fn().mockResolvedValue(new Map([[1, 3600]])),
    }));
  });

  it('lists exactly the users with an open timesheet row', async () => {
    const { loadOnlineUsers } = await import('@/lib/presence-online');
    const online = await loadOnlineUsers(adminWith({
      timesheets: [{ user_id: 1, clocked_in_at: '2026-10-05T01:00:00.000Z' }],
      users: [{ id: 1, name: 'Rowan', email: 'rowan@example.com', role: 'ic', team: 'Engineering' }],
    }), new Date('2026-10-05T02:00:00.000Z'));

    expect(online).toEqual([{
      userId: 1,
      name: 'Rowan',
      role: 'ic',
      team: 'Engineering',
      clockedInAt: '2026-10-05T01:00:00.000Z',
      weekSecondsBefore: 3600,
      photoUrl: null,
    }]);
  });

  it('returns nobody when there are no open rows', async () => {
    const { loadOnlineUsers } = await import('@/lib/presence-online');
    const online = await loadOnlineUsers(adminWith({ timesheets: [], users: [] }), new Date());
    expect(online).toEqual([]);
  });

  it('collapses duplicate open rows to the earliest clock-in', async () => {
    const { loadOnlineUsers } = await import('@/lib/presence-online');
    const online = await loadOnlineUsers(adminWith({
      // Already ordered by clocked_in_at ascending, as the query requests.
      timesheets: [
        { user_id: 1, clocked_in_at: '2026-10-05T01:00:00.000Z' },
        { user_id: 1, clocked_in_at: '2026-10-05T01:30:00.000Z' },
      ],
      users: [{ id: 1, name: 'Rowan', email: null, role: 'ic', team: null }],
    }), new Date('2026-10-05T02:00:00.000Z'));

    expect(online).toHaveLength(1);
    expect(online[0].clockedInAt).toBe('2026-10-05T01:00:00.000Z');
  });
});
