'use client';

import { useState } from 'react';
import { CheckCircle2, Circle, Loader2, RotateCcw } from 'lucide-react';
import type { TaskWithProject } from '@/app/(app)/my-tasks/page';

const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-red-50 text-red-700 border-red-200',
  high:   'bg-orange-50 text-orange-700 border-orange-200',
  medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  low:    'bg-green-50 text-green-700 border-green-200',
  none:   'bg-(--rs-neutral-grey-50) text-(--rs-neutral-grey-500) border-(--rs-neutral-grey-200)',
};

const PRIORITY_LABEL: Record<string, string> = {
  urgent: 'Urgent', high: 'High', medium: 'Med', low: 'Low', none: '—',
};

export function TaskCard({
  task,
  currentTab,
}: {
  task: TaskWithProject;
  currentTab: string;
}) {
  const [isDone, setIsDone] = useState(
    (task.state_detail?.group ?? '').toLowerCase() === 'completed',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const group        = (task.state_detail?.group ?? '').toLowerCase();
  const isOverdue    = task.target_date && !isDone && new Date(task.target_date + 'T00:00:00') < new Date();
  const canMarkDone  = !isDone && task._completedStateId;
  const canReopen    = isDone && task._startedStateId;

  const handleToggle = async () => {
    const targetStateId = isDone ? task._startedStateId : task._completedStateId;
    if (!targetStateId) return;

    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/plane/work-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: task._projectId,
          itemId:    task.id,
          state:     targetStateId,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Failed to update task');
        return;
      }
      setIsDone(prev => !prev);
    } catch {
      setError('Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`flex items-start justify-between p-3 rounded-lg border gap-3 transition-colors ${
        isDone
          ? 'bg-(--rs-neutral-grey-50) border-(--rs-neutral-grey-100)'
          : 'bg-white border-(--rs-neutral-grey-100) hover:bg-(--rs-neutral-grey-50) hover:border-(--rs-neutral-grey-200)'
      }`}
    >
      {/* Toggle button */}
      <button
        onClick={handleToggle}
        disabled={loading || (!canMarkDone && !canReopen)}
        className="mt-0.5 shrink-0 text-(--rs-neutral-grey-300) hover:text-(--rs-primary-500) disabled:opacity-40 transition-colors"
        title={isDone ? 'Reopen task' : 'Mark as done'}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-(--rs-primary-400)" />
        ) : isDone ? (
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        ) : (
          <Circle className="w-4 h-4" />
        )}
      </button>

      {/* Content */}
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className="min-w-0 flex-1">
          <div
            className={`text-sm font-medium break-words ${
              isDone
                ? 'line-through text-(--rs-neutral-grey-400)'
                : 'text-(--rs-neutral-grey-900)'
            }`}
          >
            {task.name}
          </div>
          <div className="text-xs text-(--rs-neutral-grey-400) mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
            <span>{task._projectIdentifier} · {task._projectName}</span>
            {task.target_date && (
              <span className={isOverdue ? 'text-red-500 font-medium' : ''}>
                {isOverdue ? '⚠ Overdue · ' : ''}
                {new Date(task.target_date + 'T00:00:00').toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric',
                })}
              </span>
            )}
            {task.completed_at && isDone && (
              <span className="text-green-600">
                Done {new Date(task.completed_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric',
                })}
              </span>
            )}
          </div>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
        <span
          className={`text-xs px-2 py-0.5 rounded border font-medium ${
            PRIORITY_BADGE[task.priority] ?? PRIORITY_BADGE.none
          }`}
        >
          {PRIORITY_LABEL[task.priority] ?? task.priority}
        </span>
        {task.state_detail?.name && (
          <span className="text-xs bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-600) px-2 py-0.5 rounded border border-(--rs-neutral-grey-200)">
            {task.state_detail.name}
          </span>
        )}
        {isDone && !task.completed_at && currentTab !== 'completed' && (
          <button
            onClick={handleToggle}
            disabled={loading}
            className="text-xs text-(--rs-neutral-grey-400) hover:text-(--rs-neutral-grey-700) flex items-center gap-1"
            title="Reopen"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
