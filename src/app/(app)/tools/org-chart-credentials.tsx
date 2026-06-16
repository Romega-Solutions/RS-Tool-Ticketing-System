'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

function CredentialRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable (insecure context) — value is still visible */
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-(--rs-neutral-grey-50) px-2.5 py-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wide text-(--rs-neutral-grey-400) w-16 shrink-0">
        {label}
      </span>
      <code className="flex-1 truncate font-mono text-xs text-(--rs-neutral-grey-800)">{value}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label.toLowerCase()}`}
        className="shrink-0 rounded p-1 text-(--rs-neutral-grey-400) hover:bg-(--rs-neutral-grey-200) hover:text-(--rs-neutral-grey-700) transition-colors"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

/**
 * Read-only login credentials for the Org Chart, shown on its Tools-hub card so
 * the signed-in user can open the chart at their access tier. The tier is
 * decided server-side; only that tier's credentials are passed in.
 */
export function OrgChartCredentials({ username, password }: { username: string; password: string }) {
  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-(--rs-neutral-grey-400)">
        Your login
      </p>
      <CredentialRow label="User" value={username} />
      <CredentialRow label="Pass" value={password} />
    </div>
  );
}
