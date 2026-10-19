import type { ActivityChange } from '@/lib/activity';
import { decodeLinkActivity } from '@/lib/work-item-links';

// Pure: turns a work_item_activity row into a specific, plain-text entry for
// the admin Activity feed ("Moved "Fix login" to Done in Website"), using
// names resolved in batches by the caller. Values only ever render as text.

export interface ActivityWorkItem {
  id: number;
  sequenceId: number | null;
  name: string;
  projectName: string | null;
  projectIdentifier: string | null;
}

export interface WorkItemActivityRow {
  action: string;
  from_value: string | null;
  to_value: string | null;
}

export interface WorkItemActivityLookups {
  item: ActivityWorkItem | null;
  stateName: (id: number) => string | null;
  userName: (id: number) => string | null;
  cycleName: (id: number) => string | null;
  itemName: (id: number) => string | null; // parent tasks
}

export interface DescribedWorkItemActivity {
  description: string;
  workItem: string | null; // "WEB-12 Fix login"
  project: string | null;
  changes: ActivityChange[];
}

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low', none: 'None',
};

// Label edits are stored as from_value 'label', to_value '+<id>' / '-<id>',
// and since this change '+<id>:<name>' / '-<id>:<name>'.
export function encodeLabelActivity(sign: '+' | '-', labelId: number, name: string | null | undefined): string {
  const n = (name ?? '').trim();
  return n ? `${sign}${labelId}:${n}` : `${sign}${labelId}`;
}

export function decodeLabelActivity(raw: string | null): { added: boolean; labelId: number; name: string | null } | null {
  const m = /^([+-])(\d+)(?::([\s\S]*))?$/.exec(raw ?? '');
  if (!m) return null;
  const name = m[3]?.trim();
  return { added: m[1] === '+', labelId: Number(m[2]), name: name ? name : null };
}

function idOf(v: string | null | undefined): number | null {
  return v != null && /^\d+$/.test(v) ? Number(v) : null;
}

// Splits an `edited` value "field:value" (value may itself contain colons).
function splitEdit(raw: string | null): { field: string; value: string } {
  const s = raw ?? '';
  const sep = s.indexOf(':');
  return sep === -1 ? { field: s, value: '' } : { field: s.slice(0, sep), value: s.slice(sep + 1) };
}

/** YYYY-MM-DD → "Oct 1, 2026" as a calendar day (no timezone shift). */
export function formatDay(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const orNull = (s: string | null | undefined) => (s == null || s === '' ? null : s);

/** Ids hiding in a row's values, so the caller can resolve names in one query per kind. */
export function collectActivityRefs(rows: Array<WorkItemActivityRow>): { stateIds: number[]; cycleIds: number[]; itemIds: number[] } {
  const stateIds = new Set<number>();
  const cycleIds = new Set<number>();
  const itemIds = new Set<number>();
  for (const r of rows) {
    if (r.action === 'state_changed') {
      for (const v of [r.from_value, r.to_value]) { const id = idOf(v); if (id != null) stateIds.add(id); }
    } else if (r.action === 'edited') {
      for (const v of [r.from_value, r.to_value]) {
        const { field, value } = splitEdit(v);
        const id = idOf(value);
        if (id == null) continue;
        if (field === 'cycle') cycleIds.add(id);
        if (field === 'parent') itemIds.add(id);
      }
    }
  }
  return { stateIds: [...stateIds], cycleIds: [...cycleIds], itemIds: [...itemIds] };
}

export function describeWorkItemActivity(row: WorkItemActivityRow, look: WorkItemActivityLookups): DescribedWorkItemActivity {
  const item = look.item;
  const title = item ? `"${item.name}"` : 'a work item';
  const inProject = item?.projectName ? ` in ${item.projectName}` : '';
  const workItem = item
    ? `${item.projectIdentifier && item.sequenceId ? `${item.projectIdentifier}-${item.sequenceId} ` : ''}${item.name}`
    : null;
  const base = { workItem, project: item?.projectName ?? null };
  const userLabel = (v: string | null) => {
    const id = idOf(v);
    return id == null ? null : (look.userName(id) ?? 'a former member');
  };
  const out = (description: string, changes: ActivityChange[] = []): DescribedWorkItemActivity => ({ description, ...base, changes });

  switch (row.action) {
    case 'created': {
      const createdAs = orNull(row.to_value);
      return out(`Created ${item ? title : createdAs ? `"${createdAs}"` : 'a work item'}${inProject}`);
    }
    case 'state_changed': {
      const fromId = idOf(row.from_value);
      const toId = idOf(row.to_value);
      const from = fromId == null ? null : look.stateName(fromId);
      const to = toId == null ? null : look.stateName(toId);
      return out(
        to ? `Moved ${title} to ${to}${inProject}` : `Moved ${title} to a new state${inProject}`,
        [{ field: 'state', label: 'State', from, to }],
      );
    }
    case 'assigned': {
      const who = userLabel(row.to_value);
      return out(
        who ? `Assigned ${who} to ${title}${inProject}` : `Assigned ${title}${inProject}`,
        [{ field: 'assignee', label: 'Assignee added', from: null, to: null, value: who }],
      );
    }
    case 'unassigned': {
      const who = userLabel(row.from_value);
      return out(
        who ? `Unassigned ${who} from ${title}${inProject}` : `Unassigned ${title}${inProject}`,
        [{ field: 'assignee', label: 'Assignee removed', from: null, to: null, value: who }],
      );
    }
    case 'commented': {
      const snippet = (row.to_value ?? '').slice(0, 80);
      return out(`Commented on ${title}${inProject}`, snippet ? [{ field: 'comment', label: 'Comment', from: null, to: null, value: snippet }] : []);
    }
    case 'archived': return out(`Archived ${title}${inProject}`);
    case 'restored': return out(`Restored ${title}${inProject}`);
    case 'link_added':
    case 'link_removed': {
      const added = row.action === 'link_added';
      const link = decodeLinkActivity(added ? row.to_value : row.from_value);
      const verb = added ? 'Added' : 'Removed';
      const prep = added ? 'to' : 'from';
      if (!link) return out(`${verb} a link ${prep} ${title}${inProject}`);
      const name = link.title.trim();
      return out(
        `${verb} ${name ? `the link "${name}"` : 'a link'} ${prep} ${title}${inProject}`,
        [
          ...(name ? [{ field: 'linkTitle', label: 'Link title', from: null, to: null, value: name }] : []),
          { field: 'linkUrl', label: 'Link URL', from: null, to: null, value: link.url },
        ],
      );
    }
    case 'edited': return describeEdit(row, look, title, inProject, out);
    default: return out(`Updated ${title}${inProject} (${row.action})`);
  }
}

function describeEdit(
  row: WorkItemActivityRow,
  look: WorkItemActivityLookups,
  title: string,
  inProject: string,
  out: (description: string, changes?: ActivityChange[]) => DescribedWorkItemActivity,
): DescribedWorkItemActivity {
  if (row.from_value === 'label') {
    const label = decodeLabelActivity(row.to_value);
    if (!label) return out(`Changed a label on ${title}${inProject}`);
    const verb = label.added ? 'Added' : 'Removed';
    const prep = label.added ? 'to' : 'from';
    // Older rows stored only the label id (and those labels are gone), so they stay generic.
    if (!label.name) return out(`${verb} a label ${prep} ${title}${inProject}`);
    return out(
      `${verb} the label "${label.name}" ${prep} ${title}${inProject}`,
      [{ field: 'label', label: label.added ? 'Label added' : 'Label removed', from: null, to: null, value: label.name }],
    );
  }

  const from = splitEdit(row.from_value);
  const to = splitEdit(row.to_value);
  const field = to.field || from.field;
  switch (field) {
    case 'priority': {
      const f = PRIORITY_LABELS[from.value] ?? orNull(from.value);
      const t = PRIORITY_LABELS[to.value] ?? orNull(to.value);
      return out(`Changed the priority of ${title}${t ? ` to ${t}` : ''}${inProject}`, [{ field: 'priority', label: 'Priority', from: f, to: t }]);
    }
    case 'name': {
      const f = orNull(from.value);
      const t = orNull(to.value);
      return out(`Renamed ${f ? `"${f}"` : title} to "${t ?? ''}"${inProject}`, [{ field: 'name', label: 'Name', from: f, to: t }]);
    }
    case 'target_date': {
      const f = orNull(from.value);
      const t = orNull(to.value);
      return out(
        t ? `Set the due date of ${title} to ${formatDay(t)}${inProject}` : `Cleared the due date of ${title}${inProject}`,
        [{ field: 'dueDate', label: 'Due date', from: f && formatDay(f), to: t && formatDay(t) }],
      );
    }
    case 'description':
      return out(`Changed the description of ${title}${inProject}`, [{ field: 'description', label: 'Description', from: null, to: null, hidden: 'value' }]);
    case 'cycle': {
      const name = (v: string) => { const id = idOf(v); return id == null ? null : (look.cycleName(id) ?? `Cycle #${id}`); };
      return out(`Changed the cycle of ${title}${inProject}`, [{ field: 'cycle', label: 'Cycle', from: name(from.value), to: name(to.value) }]);
    }
    case 'parent': {
      const name = (v: string) => { const id = idOf(v); return id == null ? null : (look.itemName(id) ?? `Work item #${id}`); };
      const t = name(to.value);
      return out(
        t ? `Set the parent of ${title} to "${t}"${inProject}` : `Removed the parent of ${title}${inProject}`,
        [{ field: 'parent', label: 'Parent', from: name(from.value), to: t }],
      );
    }
    default:
      return out(`Edited ${title}${inProject}`);
  }
}
