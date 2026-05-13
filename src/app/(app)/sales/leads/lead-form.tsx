'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';

export function LeadForm() {
  return (
    <Link
      href="/sales/leads/new"
      className="inline-flex h-8 items-center justify-center gap-2 rounded-lg bg-(--rs-primary-500) px-2.5 text-sm font-medium text-white transition-colors hover:bg-(--rs-primary-600)"
    >
      <Plus className="w-4 h-4" /> New Lead
    </Link>
  );
}
