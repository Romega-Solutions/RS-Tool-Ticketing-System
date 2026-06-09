export type KanbanTaskDescriptor = {
  id: string;
  sequenceId: number;
  name: string;
};

export type KanbanDragAnnouncement =
  | {
      type: 'start' | 'cancel';
      task: KanbanTaskDescriptor | null;
    }
  | {
      type: 'over' | 'end';
      task: KanbanTaskDescriptor | null;
      targetStateName?: string | null;
    };

function taskName(task: KanbanTaskDescriptor): string {
  return `task #${task.sequenceId}, ${task.name}`;
}

export function getKanbanTaskAriaLabel(task: KanbanTaskDescriptor): string {
  return `Open task #${task.sequenceId}: ${task.name}`;
}

export function getKanbanDragHandleLabel(task: KanbanTaskDescriptor): string {
  return `Move task #${task.sequenceId}: ${task.name}`;
}

export function getKanbanDragAnnouncement(args: KanbanDragAnnouncement): string | undefined {
  if (!args.task) return undefined;

  switch (args.type) {
    case 'start':
      return `Picked up ${taskName(args.task)}.`;
    case 'over':
      return args.targetStateName
        ? `Moving ${taskName(args.task)}, over ${args.targetStateName}.`
        : `${taskName(args.task)} is not over a column.`;
    case 'end':
      return args.targetStateName
        ? `Moved ${taskName(args.task)} to ${args.targetStateName}.`
        : `Dropped ${taskName(args.task)}.`;
    case 'cancel':
      return `Cancelled moving ${taskName(args.task)}.`;
  }
}
