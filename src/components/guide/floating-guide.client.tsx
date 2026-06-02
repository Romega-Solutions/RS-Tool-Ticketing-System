'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { LifeBuoy, X, ArrowRight } from 'lucide-react';
import { GuideWizard } from '@/components/guide/guide-wizard.client';

// App-wide floating help launcher: a bottom-right button that opens a right-hand
// slide-over drawer with the same page-by-page guide as /help (single source of
// truth in guide-content). Admin section shows only for admins.
export function FloatingGuide({ isAdmin = false }: { isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {/* Floating launcher (z-30) */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Open help guide"
        aria-expanded={open}
        className="fixed bottom-6 right-6 z-30 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-(--rs-primary-500) text-white shadow-lg transition-colors hover:bg-(--rs-primary-600) focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-(--rs-primary-200)"
      >
        <LifeBuoy className="h-5 w-5" />
      </button>

      {/* Backdrop (z-40) */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer (z-50) */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Help & Guide"
        className={`fixed top-0 right-0 z-50 flex h-full w-[min(94vw,30rem)] flex-col bg-white shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-(--rs-neutral-grey-100) px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--rs-primary-50) text-(--rs-primary-600)">
              <LifeBuoy className="h-4 w-4" />
            </div>
            <h2 className="font-serif text-base font-semibold text-(--rs-neutral-grey-900)">Help &amp; Guide</h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close help guide"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-(--rs-neutral-grey-400) transition-colors hover:bg-(--rs-neutral-grey-100) hover:text-(--rs-neutral-grey-700) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — only mounted while open */}
        {open && (
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <GuideWizard isAdmin={isAdmin} />
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-(--rs-neutral-grey-100) px-5 py-3">
          <Link
            href="/help"
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--rs-primary-600) transition-colors hover:text-(--rs-primary-700) hover:underline"
          >
            Open the full guide page
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </aside>
    </>
  );
}
