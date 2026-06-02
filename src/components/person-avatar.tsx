'use client';

import { useState } from 'react';

// Single source of truth for person avatars across the app. Renders the org
// chart photo when present; on load error (or when there's no URL) it falls
// back to deterministic colored initials — the same palette the attendance
// view has always used, so the fallback looks consistent everywhere.

const AVATAR_PALETTE = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-indigo-100 text-indigo-700',
  'bg-orange-100 text-orange-700',
];

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export function PersonAvatar({
  name,
  photoUrl,
  size = 36,
  className = '',
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (photoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-full object-cover ${className}`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className={`shrink-0 rounded-full flex items-center justify-center font-semibold ${avatarColor(name)} ${className}`}
    >
      {getInitials(name)}
    </div>
  );
}
