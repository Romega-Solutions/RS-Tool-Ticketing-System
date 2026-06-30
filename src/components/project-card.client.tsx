'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MoreVertical, Archive, ArchiveRestore } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';

export interface ProjectCardData {
  id: string;
  identifier: string;
  name: string;
  description: string;
}

export interface ProjectCardProps {
  project: ProjectCardData;
  stats: { total: number; open: number; done: number };
  /** True when rendered in the Archived tab — flips the kebab action to Restore. */
  archived?: boolean;
  /** Leads/admins only. When false, no kebab is rendered at all. */
  canArchive?: boolean;
}

const MENU_WIDTH = 184;

export function ProjectCard({ project, stats, archived = false, canArchive = false }: ProjectCardProps) {
  const router = useRouter();
  const { id, identifier, name, description } = project;
  const pct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRef = useRef<HTMLButtonElement>(null);

  const positionMenu = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    setMenuPos({ top: rect.bottom + 6, left });
  }, []);

  const openMenu = useCallback(() => {
    positionMenu();
    setMenuOpen(true);
  }, [positionMenu]);

  const closeMenu = useCallback((restoreFocus = false) => {
    setMenuOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  // Focus the first menu item when the menu opens.
  useEffect(() => {
    if (menuOpen) itemRef.current?.focus();
  }, [menuOpen]);

  // Outside-click / Escape / scroll / resize dismissal.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
    };
    const onScroll = () => setMenuOpen(false);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [menuOpen, closeMenu]);

  const runAction = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = archived
        ? await fetch(`/api/tickets/projects/${id}/restore`, { method: 'POST' })
        : await fetch(`/api/tickets/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      setConfirmOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }, [archived, id, router]);

  const actionLabel = archived ? 'Restore' : 'Archive';
  const confirmDescription = archived
    ? 'It moves back to the Active tab.'
    : 'It moves to the Archived tab. You can restore it anytime.';

  return (
    <div className="group relative h-full min-w-0">
      {/* Stretched-link overlay: keeps the whole card clickable without nesting a
          button inside an anchor (invalid HTML). The kebab sits above it. */}
      <Link
        href={`/projects/${id}`}
        aria-label={`Open project ${name}`}
        className="absolute inset-0 z-[1] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-400) focus-visible:ring-offset-2"
      />

      <Card
        className={cn(
          'h-full border-t-4 transition-colors',
          archived
            ? 'border-t-(--rs-neutral-grey-300) opacity-90 group-hover:border-(--rs-neutral-grey-400)'
            : 'border-t-(--rs-primary-500) group-hover:border-(--rs-primary-300)',
        )}
      >
        <CardHeader className="pb-2">
          <div className="flex min-w-0 items-center gap-2 pr-8">
            <span
              className={cn(
                'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded text-xs font-bold',
                archived
                  ? 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-600)'
                  : 'bg-(--rs-primary-100) text-(--rs-primary-700)',
              )}
            >
              {identifier}
            </span>
            <CardTitle className="min-w-0 text-base font-bold leading-tight text-(--rs-neutral-grey-900)">
              {name}
            </CardTitle>
            {archived && (
              <span className="ml-auto shrink-0 rounded-full bg-(--rs-neutral-grey-100) px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-(--rs-neutral-grey-600)">
                Archived
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {description && (
            <p className="text-xs text-(--rs-neutral-grey-500) line-clamp-2">{description}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-(--rs-neutral-grey-500)">
              <span className="font-semibold text-(--rs-neutral-grey-900)">{stats.total}</span> tasks
            </span>
            <span className="font-medium text-green-600">{stats.done} done</span>
            <span className="text-(--rs-neutral-grey-500)">{stats.open} open</span>
          </div>
          {stats.total > 0 && (
            <div>
              <div className="h-1.5 overflow-hidden rounded-full bg-(--rs-neutral-grey-100)">
                <div
                  className={cn('h-full rounded-full', archived ? 'bg-(--rs-neutral-grey-400)' : 'bg-(--rs-primary-500)')}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1 text-right text-xs text-(--rs-neutral-grey-400)">{pct}% complete</div>
            </div>
          )}
        </CardContent>
      </Card>

      {canArchive && (
        <button
          ref={buttonRef}
          type="button"
          aria-label="Project actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => (menuOpen ? closeMenu() : openMenu())}
          className={cn(
            'absolute right-2 top-2 z-[2] inline-flex h-8 w-8 items-center justify-center rounded-md text-(--rs-neutral-grey-500) transition-opacity hover:bg-(--rs-neutral-grey-100) hover:text-(--rs-neutral-grey-800) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300)',
            menuOpen
              ? 'opacity-100'
              : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 sm:focus-visible:opacity-100',
          )}
        >
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      )}

      {menuOpen && menuPos && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Project actions"
            style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, width: MENU_WIDTH }}
            className="z-50 overflow-hidden rounded-md border border-(--rs-neutral-grey-200) bg-white py-1 shadow-lg"
          >
            <button
              ref={itemRef}
              role="menuitem"
              type="button"
              onClick={() => { closeMenu(); setError(null); setConfirmOpen(true); }}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); } }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-(--rs-neutral-grey-800) hover:bg-(--rs-neutral-grey-50) focus-visible:bg-(--rs-neutral-grey-50) focus-visible:outline-none"
            >
              {archived
                ? <ArchiveRestore className="h-4 w-4 text-(--rs-primary-600)" aria-hidden="true" />
                : <Archive className="h-4 w-4 text-(--rs-neutral-grey-500)" aria-hidden="true" />}
              {actionLabel}
            </button>
          </div>,
          document.body,
        )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => { if (!o) { setConfirmOpen(false); setError(null); } }}
        title={archived ? 'Restore this project?' : 'Archive this project?'}
        description={error ? `${confirmDescription}\n\n${error}` : confirmDescription}
        confirmLabel={actionLabel}
        loading={loading}
        onConfirm={runAction}
      />
    </div>
  );
}
