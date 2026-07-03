'use client';

import { useMemo, useState, useTransition } from 'react';
import { Mail, Search, Send, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { sendBroadcastAction, type BroadcastActionState } from './actions';
import type { BroadcastRecipient, BroadcastTarget } from '@/lib/broadcasts';

type Props = {
  users: BroadcastRecipient[];
};

type StatusFilter = 'all' | 'active' | 'inactive';

function normalize(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

function roleLabel(role: string): string {
  const value = role.trim().toLowerCase();
  if (value === 'admin') return 'Admin';
  if (value === 'lead') return 'Lead';
  if (value === 'intern') return 'Intern';
  return 'IC';
}

export function BroadcastCenter({ users }: Props) {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [team, setTeam] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [target, setTarget] = useState<BroadcastTarget>('active');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [inApp, setInApp] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [result, setResult] = useState<BroadcastActionState | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const teams = useMemo(() => {
    return [...new Set(users.map(user => normalize(user.team)).filter(Boolean))].sort();
  }, [users]);

  const roles = useMemo(() => {
    return [...new Set(users.map(user => normalize(user.role)).filter(Boolean))].sort();
  }, [users]);

  const visibleUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((user) => {
      if (status === 'active' && !user.isActive) return false;
      if (status === 'inactive' && user.isActive) return false;
      if (role !== 'all' && user.role !== role) return false;
      if (team !== 'all' && normalize(user.team) !== team) return false;
      if (!q) return true;
      return [user.name, user.email, user.role, user.team].some(value => normalize(value).toLowerCase().includes(q));
    });
  }, [query, role, status, team, users]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const targetCount = target === 'selected'
    ? selectedIds.length
    : users.filter(user => target === 'all' || user.isActive).length;
  const emailTargetCount = target === 'selected'
    ? users.filter(user => selectedSet.has(user.id) && user.email).length
    : users.filter(user => (target === 'all' || user.isActive) && user.email).length;
  const selectedPreviewUsers = users.filter(user => selectedSet.has(user.id)).slice(0, 6);
  const targetLabel = target === 'selected'
    ? 'Selected users'
    : target === 'all'
      ? 'All users'
      : 'Active users';
  const deliveryLabel = [
    inApp ? 'In-app notification' : null,
    sendEmail ? 'Email through n8n' : null,
  ].filter(Boolean).join(' + ');

  const toggleUser = (id: number) => {
    setSelectedIds((current) => (
      current.includes(id) ? current.filter(value => value !== id) : [...current, id]
    ));
  };

  const selectVisible = () => {
    setSelectedIds((current) => [...new Set([...current, ...visibleUsers.map(user => user.id)])]);
    setTarget('selected');
  };

  const clearSelected = () => {
    setSelectedIds([]);
    if (target === 'selected') setTarget('active');
  };

  const openPreview = () => {
    setResult(null);
    setPreviewOpen(true);
  };

  const submit = () => {
    const formData = new FormData();
    formData.set('target', target);
    formData.set('selectedUserIds', JSON.stringify(selectedIds));
    formData.set('subject', subject);
    formData.set('message', message);
    if (inApp) formData.set('inApp', 'on');
    if (sendEmail) formData.set('sendEmail', 'on');

    setResult(null);
    startTransition(async () => {
      const next = await sendBroadcastAction(formData);
      setResult(next);
      if (next.ok) {
        setSubject('');
        setMessage('');
        setPreviewOpen(false);
      }
    });
  };

  return (
    <>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="rounded-lg">
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_180px_140px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--rs-neutral-grey-400)" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, email, role, team"
                className="pl-9"
              />
            </label>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="h-9 rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 text-sm text-(--rs-neutral-grey-800)"
            >
              <option value="all">All roles</option>
              {roles.map(value => <option key={value} value={value}>{roleLabel(value)}</option>)}
            </select>
            <select
              value={team}
              onChange={(event) => setTeam(event.target.value)}
              className="h-9 rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 text-sm text-(--rs-neutral-grey-800)"
            >
              <option value="all">All teams</option>
              {teams.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
              className="h-9 rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 text-sm text-(--rs-neutral-grey-800)"
            >
              <option value="active">Active</option>
              <option value="all">All status</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-(--rs-neutral-grey-500)">
              Showing <span className="font-semibold text-(--rs-neutral-grey-900)">{visibleUsers.length}</span> people.
              <span className="ml-2 font-semibold text-(--rs-neutral-grey-900)">{selectedIds.length}</span> selected.
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={selectVisible}>
                <Users className="h-4 w-4" /> Select visible
              </Button>
              <Button type="button" variant="ghost" onClick={clearSelected} disabled={selectedIds.length === 0}>
                <X className="h-4 w-4" /> Clear
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-(--rs-neutral-grey-200) bg-white">
            <div className="max-h-[560px] overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) text-xs uppercase text-(--rs-neutral-grey-500)">
                  <tr>
                    <th className="w-12 px-4 py-3 font-semibold">Pick</th>
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Team</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--rs-neutral-grey-100)">
                  {visibleUsers.map(user => (
                    <tr key={user.id} className="align-middle">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedSet.has(user.id)}
                          onChange={() => toggleUser(user.id)}
                          className="h-4 w-4 rounded border-(--rs-neutral-grey-300)"
                          aria-label={`Select ${user.name}`}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-(--rs-neutral-grey-900)">{user.name}</td>
                      <td className="px-4 py-3 text-(--rs-neutral-grey-600)">{user.email ?? '-'}</td>
                      <td className="px-4 py-3 text-(--rs-neutral-grey-600)">{user.team ?? '-'}</td>
                      <td className="px-4 py-3 text-(--rs-neutral-grey-600)">{roleLabel(user.role)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          user.isActive
                            ? 'border-green-200 bg-green-50 text-green-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                        }`}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardContent className="space-y-5">
          <div>
            <h2 className="text-base font-semibold text-(--rs-neutral-grey-900)">Compose</h2>
            <p className="mt-1 text-sm text-(--rs-neutral-grey-500)">Delivery uses the notification bell and the configured n8n email webhook.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-(--rs-neutral-grey-800)" htmlFor="broadcast-subject">Subject</label>
            <Input
              id="broadcast-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={120}
              placeholder="Portal migration update"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-(--rs-neutral-grey-800)" htmlFor="broadcast-message">Message</label>
            <textarea
              id="broadcast-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={4000}
              rows={9}
              placeholder="Write the announcement here..."
              className="w-full resize-y rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm text-(--rs-neutral-grey-900) outline-none focus:border-(--rs-primary-400) focus:ring-2 focus:ring-(--rs-primary-100)"
            />
            <div className="text-right text-xs text-(--rs-neutral-grey-400)">{message.length}/4000</div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-(--rs-neutral-grey-800)">Recipients</legend>
            <label className="flex items-center gap-2 rounded-lg border border-(--rs-neutral-grey-200) px-3 py-2 text-sm">
              <input type="radio" checked={target === 'active'} onChange={() => setTarget('active')} />
              Active users
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-(--rs-neutral-grey-200) px-3 py-2 text-sm">
              <input type="radio" checked={target === 'selected'} onChange={() => setTarget('selected')} />
              Selected users
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-(--rs-neutral-grey-200) px-3 py-2 text-sm">
              <input type="radio" checked={target === 'all'} onChange={() => setTarget('all')} />
              All users
            </label>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-(--rs-neutral-grey-800)">Delivery</legend>
            <label className="flex items-center gap-2 text-sm text-(--rs-neutral-grey-700)">
              <input type="checkbox" checked={inApp} onChange={(event) => setInApp(event.target.checked)} />
              In-app notification
            </label>
            <label className="flex items-center gap-2 text-sm text-(--rs-neutral-grey-700)">
              <input type="checkbox" checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)} />
              Email through n8n
            </label>
          </fieldset>

          <div className="rounded-lg border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) px-3 py-2 text-sm text-(--rs-neutral-grey-600)">
            Targeting <span className="font-semibold text-(--rs-neutral-grey-900)">{targetCount}</span> recipients
            {sendEmail && (
              <span> with <span className="font-semibold text-(--rs-neutral-grey-900)">{emailTargetCount}</span> email addresses</span>
            )}.
          </div>

          {result && (
            <div className={`rounded-lg border px-3 py-2 text-sm ${
              result.ok
                ? 'border-green-200 bg-green-50 text-green-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}>
              {result.ok
                ? `Sent to ${result.recipientCount} users. Bell: ${result.notificationCount}. Email: ${result.emailCount}.`
                : result.error}
            </div>
          )}

          <Button
            type="button"
            className="w-full"
            onClick={openPreview}
            disabled={isPending || !subject.trim() || !message.trim() || (!inApp && !sendEmail)}
          >
            <Send className="h-4 w-4" />
            Preview broadcast
          </Button>
        </CardContent>
      </Card>
    </div>

    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-xl">
        <DialogHeader>
          <DialogTitle>Preview broadcast</DialogTitle>
          <DialogDescription>
            Review the announcement before sending it to the selected recipients.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) px-3 py-2">
              <div className="text-xs font-semibold uppercase text-(--rs-neutral-grey-500)">Recipients</div>
              <div className="mt-1 text-lg font-semibold text-(--rs-neutral-grey-900)">{targetCount}</div>
              <div className="text-xs text-(--rs-neutral-grey-500)">{targetLabel}</div>
            </div>
            <div className="rounded-lg border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) px-3 py-2">
              <div className="text-xs font-semibold uppercase text-(--rs-neutral-grey-500)">Email</div>
              <div className="mt-1 text-lg font-semibold text-(--rs-neutral-grey-900)">{sendEmail ? emailTargetCount : 0}</div>
              <div className="text-xs text-(--rs-neutral-grey-500)">Addresses available</div>
            </div>
            <div className="rounded-lg border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) px-3 py-2">
              <div className="text-xs font-semibold uppercase text-(--rs-neutral-grey-500)">Delivery</div>
              <div className="mt-1 text-sm font-semibold text-(--rs-neutral-grey-900)">{deliveryLabel}</div>
            </div>
          </div>

          {target === 'selected' && (
            <div className="rounded-lg border border-(--rs-neutral-grey-200) px-3 py-2">
              <div className="text-xs font-semibold uppercase text-(--rs-neutral-grey-500)">Selected sample</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedPreviewUsers.map(user => (
                  <span key={user.id} className="rounded-full border border-(--rs-neutral-grey-200) bg-white px-2 py-1 text-xs text-(--rs-neutral-grey-700)">
                    {user.name}
                  </span>
                ))}
                {selectedIds.length > selectedPreviewUsers.length && (
                  <span className="rounded-full border border-(--rs-neutral-grey-200) bg-white px-2 py-1 text-xs text-(--rs-neutral-grey-500)">
                    +{selectedIds.length - selectedPreviewUsers.length} more
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-(--rs-neutral-grey-200) bg-white p-4">
            <div className="text-xs font-semibold uppercase text-(--rs-neutral-grey-500)">Subject</div>
            <h3 className="mt-1 text-base font-semibold text-(--rs-neutral-grey-900)">{subject}</h3>
            <div className="mt-4 text-xs font-semibold uppercase text-(--rs-neutral-grey-500)">Message</div>
            <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-(--rs-neutral-grey-50) p-3 text-sm leading-6 text-(--rs-neutral-grey-700)">
              {message}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => setPreviewOpen(false)}>Edit</Button>
          <Button type="button" onClick={submit} disabled={isPending}>
            {isPending ? <Mail className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
            {isPending ? 'Sending...' : 'Send now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
