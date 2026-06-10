export type TaskDetailCrumb = {
  id: string;
  sequenceId: number;
  name: string;
};

export function appendTaskDetailCrumb(
  trail: TaskDetailCrumb[],
  crumb: TaskDetailCrumb,
): TaskDetailCrumb[] {
  if (trail.some(item => item.id === crumb.id)) return trail;
  return [...trail, crumb];
}

export function popTaskDetailCrumb(trail: TaskDetailCrumb[]): {
  previous: TaskDetailCrumb | null;
  trail: TaskDetailCrumb[];
} {
  if (trail.length === 0) return { previous: null, trail };
  return {
    previous: trail[trail.length - 1],
    trail: trail.slice(0, -1),
  };
}

export function taskDetailCrumbLabel(crumb: TaskDetailCrumb): string {
  return `#${crumb.sequenceId} ${crumb.name}`;
}
