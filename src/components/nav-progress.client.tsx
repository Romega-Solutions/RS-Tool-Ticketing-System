'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Global navigation progress bar — shows a slim top bar + a small % label on
 * every tab/route switch so the user gets clear feedback that a page is loading.
 *
 * Client-side navigation has no real byte-progress signal, so the percentage is
 * a smooth simulated climb (decelerating toward ~92%) that SNAPS to 100% the
 * instant the new route is actually ready (pathname change), then fades out.
 * Same approach as GitHub/YouTube's top loader. Respects prefers-reduced-motion.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [value, setValue] = useState(0);
  const [active, setActive] = useState(false);

  const activeRef = useRef(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPath = useRef(pathname);

  const finish = useCallback(() => {
    if (!activeRef.current) return;
    if (tick.current) { clearInterval(tick.current); tick.current = null; }
    if (safety.current) { clearTimeout(safety.current); safety.current = null; }
    activeRef.current = false;
    setValue(100);
    hideT.current = setTimeout(() => { setActive(false); setValue(0); }, 360);
  }, []);

  const start = useCallback(() => {
    if (activeRef.current) return;            // already running
    if (hideT.current) clearTimeout(hideT.current);
    activeRef.current = true;
    setActive(true);
    setValue(8);
    if (tick.current) clearInterval(tick.current);
    // Climb toward ~92%, decelerating so it never visibly "finishes" early.
    tick.current = setInterval(() => {
      setValue((v) => {
        if (v >= 92) return v;
        const inc = v < 40 ? 9 : v < 70 ? 4 : v < 86 ? 1.5 : 0.4;
        return Math.min(92, v + inc);
      });
    }, 240);
    // Safety net: never let the bar hang if a navigation stalls or is cancelled.
    if (safety.current) clearTimeout(safety.current);
    safety.current = setTimeout(finish, 8000);
  }, [finish]);

  // Start the bar on any internal link click (capture phase → runs before nav).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || !href.startsWith('/')) return;                      // internal paths only
      if (anchor.getAttribute('target') === '_blank' || anchor.hasAttribute('download')) return;
      let dest: URL;
      try { dest = new URL(href, window.location.origin); } catch { return; }
      if (dest.pathname === window.location.pathname && dest.search === window.location.search) return; // same page
      start();
    };
    const onPop = () => start();                                        // back / forward
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPop);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPop);
    };
  }, [start]);

  // The route actually changed → the new page is ready. Snap to 100%.
  useEffect(() => {
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      finish();
    }
  }, [pathname, finish]);

  useEffect(() => () => {
    if (tick.current) clearInterval(tick.current);
    if (safety.current) clearTimeout(safety.current);
    if (hideT.current) clearTimeout(hideT.current);
  }, []);

  if (!active && value === 0) return null;

  const pct = Math.round(value);
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[60]" aria-hidden={!active}>
        <div
          role="progressbar"
          aria-label="Page loading"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-[3px] origin-left bg-(--rs-primary-500) shadow-[0_0_10px_1px_rgba(0,115,229,0.55)] transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none"
          style={{ width: `${value}%`, opacity: active ? 1 : 0 }}
        />
      </div>
      {active && (
        <span
          aria-hidden
          className="pointer-events-none fixed right-3 top-2 z-[60] rounded-full border border-(--rs-primary-200) bg-white/95 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-(--rs-primary-700) shadow-sm"
        >
          {pct}%
        </span>
      )}
    </>
  );
}
