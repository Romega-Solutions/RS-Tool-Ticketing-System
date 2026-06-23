'use client';

import { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { GATEABLE_TOOLS, normalizeRole } from '@/lib/rbac';
import type { UserRow } from '@/components/user-management-table';

// Admin > User Management > Tool Access tab.
// A grid of users (rows) × gateable tools (columns). Tick a cell to grant the
// tool to that user; it saves immediately via PATCH /api/admin/users. Admins
// always have every tool (their row is all-checked and locked).
export function ToolAccessMatrix({
  initialUsers,
  currentUserId,
}: {
  initialUsers: UserRow[];
  currentUserId: number;
}) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const rows = users.filter((u) => u.isActive);

  const cellKey = (userId: number, toolKey: string) => `${userId}:${toolKey}`;

  const toggle = async (user: UserRow, toolKey: string, next: boolean) => {
    const key = cellKey(user.id, toolKey);
    const prevAccess = user.toolAccess;
    const nextAccess = next
      ? [...new Set([...prevAccess, toolKey])]
      : prevAccess.filter((t) => t !== toolKey);

    setError('');
    setPending((p) => new Set(p).add(key));
    // Optimistic update.
    setUsers((list) => list.map((u) => (u.id === user.id ? { ...u, toolAccess: nextAccess } : u)));

    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, toolAccess: nextAccess }),
      });
      const data = (await res.json().catch(() => ({}))) as { user?: UserRow; error?: string };
      if (!res.ok || !data.user) {
        // Revert on failure.
        setUsers((list) => list.map((u) => (u.id === user.id ? { ...u, toolAccess: prevAccess } : u)));
        setError(data.error ?? `Failed to update ${user.name}'s access`);
      } else {
        // Reconcile from the server's authoritative array.
        setUsers((list) => list.map((u) => (u.id === user.id ? { ...u, toolAccess: data.user!.toolAccess } : u)));
      }
    } catch {
      setUsers((list) => list.map((u) => (u.id === user.id ? { ...u, toolAccess: prevAccess } : u)));
      setError('Request failed');
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(key);
        return n;
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-(--rs-primary-100) bg-(--rs-primary-50) px-4 py-3 text-sm text-(--rs-neutral-grey-700)">
        Tick a box to grant a tool to that person — it saves instantly, no code needed.
        <span className="font-medium"> Admins always have every tool.</span> Sensitive admin
        tools (User Management, Rates, Overtime) stay admin-only and aren&apos;t listed here.
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-x-auto rounded-lg border border-(--rs-neutral-grey-200)">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50)">
              <th className="sticky left-0 z-10 bg-(--rs-neutral-grey-50) px-4 py-3 text-left font-semibold text-(--rs-neutral-grey-600) min-w-56">
                Name
              </th>
              {GATEABLE_TOOLS.map((tool) => (
                <th
                  key={tool.key}
                  className="px-3 py-3 text-center font-semibold text-(--rs-neutral-grey-600) whitespace-nowrap"
                >
                  {tool.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((user) => {
              const isAdmin = normalizeRole(user.role) === 'admin';
              const isSelf = user.id === currentUserId;
              return (
                <tr key={user.id} className="border-b border-(--rs-neutral-grey-100) last:border-0 hover:bg-(--rs-neutral-grey-50)/50">
                  <td className="sticky left-0 z-10 bg-white px-4 py-2.5">
                    <div className="font-medium text-(--rs-neutral-grey-900) flex items-center gap-1.5">
                      {user.name}
                      {isAdmin && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">
                          <ShieldCheck className="h-3 w-3" /> Admin
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-(--rs-neutral-grey-500)">{user.email}</div>
                  </td>
                  {GATEABLE_TOOLS.map((tool) => {
                    const key = cellKey(user.id, tool.key);
                    const isPending = pending.has(key);
                    const checked = isAdmin || user.toolAccess.includes(tool.key);
                    // Admins always have all; you can't edit your own row here.
                    const disabled = isAdmin || isSelf || isPending;
                    return (
                      <td key={tool.key} className="px-3 py-2.5 text-center">
                        {isPending ? (
                          <Loader2 className="mx-auto h-4 w-4 animate-spin text-(--rs-primary-500)" />
                        ) : (
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer accent-(--rs-primary-500) disabled:cursor-not-allowed disabled:opacity-50"
                            checked={checked}
                            disabled={disabled}
                            aria-label={`${tool.label} access for ${user.name}`}
                            onChange={(e) => toggle(user, tool.key, e.target.checked)}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="text-sm italic text-(--rs-neutral-grey-500)">No active users.</p>
      )}
    </div>
  );
}
