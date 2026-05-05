'use client';

import { useState } from 'react';
import { Pencil, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type UserRow = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  team: string | null;
  jobTitle: string | null;
  planeMemberId: string | null;
  isActive: number;
};

const ROLE_OPTIONS = ['ic', 'lead', 'admin', 'ceo', 'tl', 'manager'];

const ROLE_BADGE: Record<string, string> = {
  admin:   'bg-purple-100 text-purple-700 border-purple-200',
  ceo:     'bg-purple-100 text-purple-700 border-purple-200',
  lead:    'bg-blue-100 text-blue-700 border-blue-200',
  tl:      'bg-blue-100 text-blue-700 border-blue-200',
  manager: 'bg-blue-100 text-blue-700 border-blue-200',
  ic:      'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-600) border-(--rs-neutral-grey-200)',
};

type EditState = {
  role: string;
  planeMemberId: string;
  isActive: number;
};

export function UserManagementTable({ initialUsers }: { initialUsers: UserRow[] }) {
  const [userList, setUserList] = useState<UserRow[]>(initialUsers);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditState>({ role: '', planeMemberId: '', isActive: 1 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const startEdit = (user: UserRow) => {
    setEditingId(user.id);
    setEditForm({
      role:          user.role,
      planeMemberId: user.planeMemberId ?? '',
      isActive:      user.isActive,
    });
    setError('');
  };

  const cancelEdit = () => { setEditingId(null); setError(''); };

  const saveEdit = async (userId: number) => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:            userId,
          role:          editForm.role,
          planeMemberId: editForm.planeMemberId.trim() || null,
          isActive:      editForm.isActive,
        }),
      });
      const data = (await res.json()) as { user?: UserRow; error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed to save'); return; }
      if (data.user) {
        setUserList(prev => prev.map(u => u.id === userId ? data.user! : u));
      }
      setEditingId(null);
    } catch {
      setError('Request failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50)">
                <th className="text-left px-4 py-3 font-semibold text-(--rs-neutral-grey-600) w-48">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-(--rs-neutral-grey-600) w-28">Role</th>
                <th className="text-left px-4 py-3 font-semibold text-(--rs-neutral-grey-600)">Plane Member ID</th>
                <th className="text-center px-4 py-3 font-semibold text-(--rs-neutral-grey-600) w-20">Active</th>
                <th className="text-right px-4 py-3 font-semibold text-(--rs-neutral-grey-600) w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--rs-neutral-grey-100)">
              {userList.map(user => {
                const isEditing = editingId === user.id;
                const badge = ROLE_BADGE[user.role.toLowerCase()] ?? ROLE_BADGE.ic;
                return (
                  <tr
                    key={user.id}
                    className={`hover:bg-(--rs-neutral-grey-50) transition-colors ${!user.isActive ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-(--rs-neutral-grey-900)">{user.name}</div>
                      <div className="text-xs text-(--rs-neutral-grey-400)">{user.username} · {user.email}</div>
                      {user.team && (
                        <div className="text-xs text-(--rs-neutral-grey-400)">{user.team}</div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          value={editForm.role}
                          onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                          className="text-xs border border-(--rs-neutral-grey-300) rounded px-2 py-1 bg-white w-full"
                        >
                          {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      ) : (
                        <span className={`inline-block text-xs px-2 py-0.5 rounded border font-medium ${badge}`}>
                          {user.role}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          value={editForm.planeMemberId}
                          onChange={e => setEditForm(f => ({ ...f, planeMemberId: e.target.value }))}
                          placeholder="Paste Plane member UUID…"
                          className="text-xs w-full border border-(--rs-neutral-grey-300) rounded px-2 py-1 font-mono"
                        />
                      ) : user.planeMemberId ? (
                        <code className="text-[11px] font-mono text-(--rs-neutral-grey-600) break-all">
                          {user.planeMemberId}
                        </code>
                      ) : (
                        <span className="text-xs text-(--rs-neutral-grey-300) italic">Not set</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-center">
                      {isEditing ? (
                        <input
                          type="checkbox"
                          checked={editForm.isActive === 1}
                          onChange={e => setEditForm(f => ({ ...f, isActive: e.target.checked ? 1 : 0 }))}
                          className="w-4 h-4 rounded accent-(--rs-primary-500)"
                        />
                      ) : (
                        <span
                          className={`inline-block w-2.5 h-2.5 rounded-full ${user.isActive ? 'bg-green-500' : 'bg-(--rs-neutral-grey-300)'}`}
                          title={user.isActive ? 'Active' : 'Inactive'}
                        />
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-7 h-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => saveEdit(user.id)}
                            disabled={saving}
                            title="Save changes"
                          >
                            {saving
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Check className="w-3.5 h-3.5" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-7 h-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                            onClick={cancelEdit}
                            disabled={saving}
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2.5 text-(--rs-neutral-grey-500) hover:text-(--rs-neutral-grey-900)"
                          onClick={() => startEdit(user)}
                        >
                          <Pencil className="w-3.5 h-3.5 mr-1" />
                          Edit
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {userList.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-(--rs-neutral-grey-400) italic text-sm">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
