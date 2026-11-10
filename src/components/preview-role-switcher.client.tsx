'use client';

import { useRef, useState } from 'react';
import {
  PREVIEW_ROLES,
  PREVIEW_ROLE_LABELS,
  type PreviewRole,
} from '@/lib/preview-roles';

// Only rendered when the server has already confirmed every preview guard.
// The form posts to /api/preview/switch-role, which re-checks them all.
export function PreviewRoleSwitcher({
  variant,
  currentRole = null,
}: {
  variant: 'login' | 'app';
  currentRole?: PreviewRole | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState(false);

  if (variant === 'app') {
    return (
      <form
        ref={formRef}
        method="post"
        action="/api/preview/switch-role"
        onSubmit={() => setSubmitting(true)}
        className="fixed bottom-3 left-3 z-50 flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 shadow-md"
      >
        <span className="font-semibold">Preview</span>
        <label htmlFor="preview-role-app" className="sr-only">View as</label>
        <select
          id="preview-role-app"
          name="role"
          defaultValue={currentRole ?? ''}
          disabled={submitting}
          onChange={() => { setSubmitting(true); formRef.current?.requestSubmit(); }}
          className="rounded-md border border-amber-300 bg-white px-1.5 py-0.5 text-xs cursor-pointer"
        >
          {currentRole === null && <option value="" disabled>View as…</option>}
          {PREVIEW_ROLES.map((role) => (
            <option key={role} value={role}>{PREVIEW_ROLE_LABELS[role]}</option>
          ))}
        </select>
      </form>
    );
  }

  return (
    <form
      method="post"
      action="/api/preview/switch-role"
      onSubmit={() => setSubmitting(true)}
      className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4"
    >
      <p className="mb-1 text-xs font-semibold text-amber-900">Preview only: view as a test account</p>
      <p className="mb-3 text-xs text-amber-800">
        Signs you in as a fake account on the preview database. Not available on the live portal.
      </p>
      <div className="flex gap-2">
        <label htmlFor="preview-role-login" className="sr-only">Role</label>
        <select
          id="preview-role-login"
          name="role"
          defaultValue="admin"
          className="flex-1 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
        >
          {PREVIEW_ROLES.map((role) => (
            <option key={role} value={role}>{PREVIEW_ROLE_LABELS[role]}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-(--rs-neutral-grey-900) px-4 py-2 text-sm font-medium text-white disabled:opacity-60 cursor-pointer"
        >
          {submitting ? 'Signing in…' : 'View as'}
        </button>
      </div>
    </form>
  );
}
