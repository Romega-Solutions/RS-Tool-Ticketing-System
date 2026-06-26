'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Send, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { resolvePlaceholders } from '@/lib/email-templates';

export type SetupEmailTarget = {
  id: number;
  name: string;
  email: string;
  role: string;
  team: string | null;
};

const inputCls =
  'w-full rounded-lg border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm outline-none focus:border-(--rs-primary-400) focus:ring-2 focus:ring-(--rs-primary-100)';

// Per-user "Send account-setup email" dialog. Loads the saved default template,
// lets the admin tweak it for this one send (optionally saving the tweak back as
// the new default), shows a live preview rendered by the SAME resolver the server
// uses, and POSTs to the send route.
export function SendSetupEmailDialog({
  user,
  open,
  onOpenChange,
  onSent,
}: {
  user: SetupEmailTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: (userId: number, sentAt: string) => void;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // Reload the saved default each time the dialog opens, so a previous
  // "save as default" tweak is reflected. The reset block is deferred to a
  // microtask so we never call setState synchronously inside the effect body
  // (avoids the cascading-render lint and the extra synchronous render).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError('');
      setSaveAsDefault(false);
    });
    fetch('/api/admin/email-templates/account-setup')
      .then((r) => r.json())
      .then((d: { subject?: string; body?: string }) => {
        if (cancelled) return;
        setSubject(d.subject ?? '');
        setBody(d.body ?? '');
      })
      .catch(() => { if (!cancelled) setError('Could not load the email template.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  const preview = useMemo(() => {
    if (!user) return null;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return resolvePlaceholders(
      { subject, body },
      {
        name: user.name,
        email: user.email,
        role: user.role,
        team: user.team,
        loginLink: `${origin}/login`,
        guideLink: `${origin}/guide`,
      },
    );
  }, [user, subject, body]);

  const send = async () => {
    if (!user) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/users/${user.id}/send-setup-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body, saveAsDefault }),
      });
      const data = (await res.json()) as { ok?: boolean; sentAt?: string; error?: string };
      if (!res.ok || !data.ok || !data.sentAt) {
        setError(data.error ?? 'Failed to send the email.');
        return;
      }
      onSent(user.id, data.sentAt);
      onOpenChange(false);
    } catch {
      setError('Request failed. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!sending) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-(--rs-primary-600)" />
            Send account-setup email
          </DialogTitle>
          {user && (
            <p className="text-sm text-(--rs-neutral-grey-500)">
              To <span className="font-medium text-(--rs-neutral-grey-700)">{user.name}</span> · {user.email}
            </p>
          )}
        </DialogHeader>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-lg text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-(--rs-neutral-grey-500) py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading template…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-(--rs-neutral-grey-700)">Subject</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-(--rs-neutral-grey-700)">Body</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                className={`${inputCls} font-mono text-xs leading-relaxed resize-y`}
              />
              <p className="text-[11px] text-(--rs-neutral-grey-400)">
                Placeholders: <code>{'{{first_name}}'}</code> <code>{'{{name}}'}</code> <code>{'{{email}}'}</code>{' '}
                <code>{'{{role}}'}</code> <code>{'{{team}}'}</code> <code>{'{{login_link}}'}</code>{' '}
                <code>{'{{guide_link}}'}</code>
              </p>
            </div>

            {/* Live preview — same resolver the server sends with */}
            {preview && (
              <div className="rounded-lg border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) p-3 space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-(--rs-neutral-grey-400)">Preview</p>
                <p className="text-sm font-medium text-(--rs-neutral-grey-800)">{preview.subject}</p>
                <pre className="whitespace-pre-wrap text-xs text-(--rs-neutral-grey-700) font-sans">{preview.text}</pre>
              </div>
            )}

            <label className="flex items-center gap-2.5 text-sm text-(--rs-neutral-grey-700) cursor-pointer">
              <input
                type="checkbox"
                checked={saveAsDefault}
                onChange={(e) => setSaveAsDefault(e.target.checked)}
                className="w-4 h-4 rounded accent-(--rs-primary-500)"
              />
              Save these edits as the default template
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={sending || loading || !subject.trim() || !body.trim()} className="gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Sending…' : 'Send email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
