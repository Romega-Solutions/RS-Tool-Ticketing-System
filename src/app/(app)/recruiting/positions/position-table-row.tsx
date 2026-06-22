'use client';

import Link from 'next/link';
import { Pencil, MapPin } from 'lucide-react';
import { PositionStatusToggle, PositionDelete } from './position-row';
import { CopyApplicationLinkButton } from './copy-link-button';

export type Position = {
  id:              number;
  job_title:       string;
  placement_type:  string | null;  // 'internal' | 'external'
  location:        string | null;
  compensation:    string | null;
  employment_type: string | null;  // 'full_time' | 'part_time'
  openings:        number | null;
  job_description: string | null;  // sanitized HTML
  is_open:         boolean;
  created_at:      string;
  created_by:      number | null;
  created_by_name?: string | null;
};

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

function employmentLabel(v: string | null) {
  return v === 'part_time' ? 'Part time' : 'Full time';
}

function descriptionPreview(html: string | null) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export function PositionTableRow({ position }: { position: Position }) {
  const isExternal = (position.placement_type ?? 'internal') === 'external';
  const preview = descriptionPreview(position.job_description);
  const editHref = `/recruiting/positions/${position.id}/edit`;

  return (
    <tr className="hover:bg-(--rs-neutral-grey-50) transition-colors">
      <td className="px-6 py-3.5">
        {/* Clicking the title opens the full-page editor. */}
        <Link
          href={editHref}
          className="text-left font-medium text-(--rs-neutral-grey-900) hover:text-(--rs-primary-600) hover:underline underline-offset-2"
        >
          {position.job_title}
        </Link>
        {preview && (
          <div className="text-xs text-(--rs-neutral-grey-500) mt-0.5 line-clamp-1 max-w-md">
            {preview}
          </div>
        )}
      </td>
      <td className="px-4 py-3.5">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
          isExternal
            ? 'bg-(--rs-accent-50) text-(--rs-accent-700)'
            : 'bg-(--rs-primary-50) text-(--rs-primary-700)'
        }`}>
          {isExternal ? 'External' : 'Internal'}
        </span>
      </td>
      <td className="px-4 py-3.5 text-(--rs-neutral-grey-700)">
        {position.location ? (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="w-3 h-3 text-(--rs-neutral-grey-400)" />
            {position.location}
          </span>
        ) : '—'}
      </td>
      <td className="px-4 py-3.5 text-(--rs-neutral-grey-700) whitespace-nowrap">{employmentLabel(position.employment_type)}</td>
      <td className="px-4 py-3.5 text-(--rs-neutral-grey-700)">{position.openings ?? 1}</td>
      <td className="px-4 py-3.5 text-(--rs-neutral-grey-700)">{position.created_by_name || '—'}</td>
      <td className="px-4 py-3.5 text-(--rs-neutral-grey-500) whitespace-nowrap">{formatDate(position.created_at)}</td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <PositionStatusToggle id={position.id} isOpen={position.is_open} />
          {position.is_open && <CopyApplicationLinkButton positionId={position.id} />}
        </div>
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-0.5">
          <Link
            href={editHref}
            aria-label="Edit position"
            className="rounded-md p-1.5 text-(--rs-neutral-grey-400) hover:bg-(--rs-primary-50) hover:text-(--rs-primary-600) transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Link>
          <PositionDelete id={position.id} />
        </div>
      </td>
    </tr>
  );
}
