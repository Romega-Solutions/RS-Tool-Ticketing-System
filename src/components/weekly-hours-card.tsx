'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatDuration, weeklyBudget } from '@/lib/utils';

// Personal "My Hours This Week" card for the dashboard — the self-service view
// of the 15h Mon–Sun cap that every role can see (the Attendance page itself is
// lead/admin-only). Reuses /api/presence, which returns the user's completed
// week seconds plus any open session, and live-ticks while clocked in.
export function WeeklyHoursCard() {
  const [loading, setLoading] = useState(true);
  const [weekSecondsBefore, setWeekSecondsBefore] = useState(0);
  const [clockedInAt, setClockedInAt] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Poll presence on mount and every 60s so clock-ins/outs made elsewhere are
  // reflected without a full reload.
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await fetch('/api/presence', { cache: 'no-store' });
        const data = (await res.json()) as {
          weekSecondsBefore?: number;
          openSession?: { clockedInAt: string } | null;
        };
        if (cancelled) return;
        setWeekSecondsBefore(data.weekSecondsBefore ?? 0);
        setClockedInAt(data.openSession?.clockedInAt ?? null);
      } catch {
        /* leave prior values; card just stops updating */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void pull();
    const id = setInterval(pull, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Tick a clock every second while clocked in; `elapsed` is derived from it at
  // render time, so no setState happens synchronously in the effect body.
  useEffect(() => {
    if (!clockedInAt) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [clockedInAt]);

  const elapsed = clockedInAt
    ? Math.max(0, Math.round((nowMs - new Date(clockedInAt).getTime()) / 1000))
    : 0;

  const { usedSeconds, remainingSeconds, capSeconds, percentUsed, isOvertime } =
    weeklyBudget(weekSecondsBefore, elapsed);
  const usedH = (usedSeconds / 3600).toFixed(usedSeconds % 3600 === 0 ? 0 : 1);
  const capH = Math.round(capSeconds / 3600);
  const fillColor = isOvertime ? 'bg-amber-500' : percentUsed >= 80 ? 'bg-amber-400' : 'bg-(--rs-primary-500)';

  const note = loading
    ? 'Loading your week…'
    : isOvertime
    ? `${formatDuration(usedSeconds - capSeconds)} over the 15h cap`
    : clockedInAt
    ? `${formatDuration(remainingSeconds)} left · clocked in now`
    : `${formatDuration(remainingSeconds)} remaining this week`;

  return (
    <Card>
      <CardContent className="px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-(--rs-neutral-grey-500)">
              My Hours This Week
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-(--rs-neutral-grey-900)">
              {usedH}h
              <span className="text-sm font-normal text-(--rs-neutral-grey-400)"> / {capH}h</span>
            </p>
            <p className={`text-xs mt-0.5 ${isOvertime ? 'font-medium text-amber-600' : 'text-(--rs-neutral-grey-400)'}`}>
              {note}
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-(--rs-primary-50) flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-(--rs-primary-500)" />
          </div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-(--rs-neutral-grey-100)">
          <div
            className={`h-full rounded-full transition-all ${fillColor}`}
            style={{ width: `${isOvertime ? 100 : Math.max(percentUsed, 2)}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
