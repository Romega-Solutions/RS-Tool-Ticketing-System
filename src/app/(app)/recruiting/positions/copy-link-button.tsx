'use client';

import { useState } from 'react';
import { Link2, Check } from 'lucide-react';

export function CopyApplicationLinkButton({ positionId }: { positionId: number }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/apply/${positionId}`;
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      () => {
        // Clipboard blocked — fall back to a prompt the user can copy from.
        window.prompt('Application link', url);
      },
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy public application URL"
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
        copied
          ? 'border-green-300 bg-green-50 text-green-700'
          : 'border-(--rs-neutral-grey-200) bg-white text-(--rs-neutral-grey-700) hover:bg-(--rs-neutral-grey-50)'
      }`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Link2 className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}
