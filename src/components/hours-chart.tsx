'use client';

import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface HoursChartProps {
  weeklyData:  { day: string;  hours: number }[];
  monthlyData: { week: string; hours: number }[];
  totalWeekHours: number;
  totalMonthHours: number;
}

const BAR_COLOR         = 'var(--rs-primary-400)';
const BAR_COLOR_TODAY   = 'var(--rs-accent-500)';
const BAR_COLOR_EMPTY   = 'var(--rs-neutral-grey-100)';

function todayDayIndex(): number {
  const d = new Date().getDay(); // 0=Sun
  return d === 0 ? 6 : d - 1;   // Mon=0 … Sun=6
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-(--rs-neutral-grey-100) bg-white px-3 py-2 shadow-lg text-xs">
      <p className="font-bold text-(--rs-neutral-grey-700)">{label}</p>
      <p className="text-(--rs-primary-600) font-semibold mt-0.5">{payload[0].value} hrs</p>
    </div>
  );
}

export function HoursChart({ weeklyData, monthlyData, totalWeekHours, totalMonthHours }: HoursChartProps) {
  const [tab, setTab] = useState<'week' | 'month'>('week');
  const todayIdx = todayDayIndex();

  const rawData = tab === 'week' ? weeklyData  : monthlyData;
  const data    = rawData.map(d => ({
    label: 'day' in d ? d.day : d.week,
    hours: d.hours,
  }));
  const total      = tab === 'week' ? totalWeekHours : totalMonthHours;
  const totalLabel = tab === 'week' ? 'this week' : 'past 4 weeks';

  return (
    <div>
      {/* Tab row + total */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 rounded-lg border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) p-0.5">
          {(['week', 'month'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                tab === t
                  ? 'bg-white text-(--rs-primary-600) shadow-sm'
                  : 'text-(--rs-neutral-grey-400) hover:text-(--rs-neutral-grey-700)'
              }`}
            >
              {t === 'week' ? 'This Week' : 'Past Month'}
            </button>
          ))}
        </div>
        <div className="text-right">
          <span className="text-xl font-bold tabular-nums text-(--rs-neutral-grey-900)">{total.toFixed(1)}</span>
          <span className="text-xs text-(--rs-neutral-grey-400) ml-1">hrs {totalLabel}</span>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} barCategoryGap="25%" margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--rs-neutral-grey-400)', fontFamily: 'var(--font-sans)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--rs-neutral-grey-400)', fontFamily: 'var(--font-sans)' }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,105,217,0.05)', radius: 4 }} />
          <Bar dataKey="hours" radius={[4, 4, 0, 0]} minPointSize={2}>
            {data.map((entry, index) => {
              const isEmpty = entry.hours === 0;
              const isToday = tab === 'week' && index === todayIdx;
              return (
                <Cell
                  key={`cell-${index}`}
                  fill={isEmpty ? BAR_COLOR_EMPTY : isToday ? BAR_COLOR_TODAY : BAR_COLOR}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {tab === 'week' && (
        <p className="mt-2 text-[10px] text-(--rs-neutral-grey-400) text-right">
          <span className="inline-block w-2 h-2 rounded-sm bg-(--rs-accent-500) mr-1" />
          Today highlighted
        </p>
      )}
    </div>
  );
}
