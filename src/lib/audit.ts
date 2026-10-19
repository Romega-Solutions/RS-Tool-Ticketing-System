import { createAdminClient } from '@/lib/supabase/admin';
import { roleDisplayLabel } from '@/lib/rbac';
import type { ActivityChange } from '@/lib/activity';

export type AuditAction =
  | 'user.created'
  | 'user.role_changed'
  | 'user.deactivated'
  | 'user.reactivated'
  | 'user.tool_access_changed'
  | 'user.setup_email_sent'
  | 'user.identity_changed'
  | 'user.reporting_changed'
  | 'user.photo_changed'
  | 'user.updated';

export type FieldChange = { from: unknown; to: unknown };
export type FieldChanges = Record<string, FieldChange>;

// Best-effort audit write: logs failures but NEVER throws — an audit insert must
// not break the admin action it records.
export async function recordAudit(entry: {
  actorId: number;
  action: AuditAction;
  targetUserId?: number | null;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('audit_log').insert({
      actor_id:       entry.actorId,
      action:         entry.action,
      target_user_id: entry.targetUserId ?? null,
      details:        entry.details ?? null,
      created_at:     new Date().toISOString(),
    });
    if (error) console.error('[audit] insert failed:', error.message);
  } catch (err) {
    console.error('[audit] insert threw:', err);
  }
}

// Display labels for the fields an audit entry can record a change to.
export const AUDIT_FIELD_LABELS: Record<string, string> = {
  role:                 'Role',
  isActive:             'Status',
  name:                 'Full name',
  username:             'Username',
  email:                'Email',
  jobTitle:             'Job title',
  team:                 'Team',
  memberCode:           'Member code',
  hourlyRateUsd:        'Hourly rate',
  dateOfBirth:          'Birth date',
  startDate:            'Start date',
  endDate:              'End date',
  driveUrl:             'Drive folder',
  approvedHoursPerWeek: 'Approved hours per week',
  schedulePhtStart:     'Schedule start (PHT)',
  schedulePhtEnd:       'Schedule end (PHT)',
  reportsTo:            'Main lead',
  alsoReportsTo:        'Also reports to',
  orgChartHidden:       'Hidden on org chart',
  photo:                'Photo',
  toolsAdded:           'Tool access added',
  toolsRemoved:         'Tool access removed',
};

// Private fields: the log records that they changed, but their values are
// stripped on the server before anything reaches the browser.
const PRIVATE_FIELDS = new Set(['email', 'hourlyRateUsd', 'dateOfBirth', 'hourly_rate_usd', 'date_of_birth']);

export function isPrivateAuditField(field: string): boolean {
  return PRIVATE_FIELDS.has(field);
}

// users-table columns (beyond role / is_active / identity / tool access) that
// a user edit can change, keyed by the name the audit details use.
export const USER_PATCH_FIELD_COLUMNS = {
  team:                 'team',
  memberCode:           'member_code',
  hourlyRateUsd:        'hourly_rate_usd',
  dateOfBirth:          'date_of_birth',
  startDate:            'start_date',
  endDate:              'end_date',
  driveUrl:             'drive_url',
  approvedHoursPerWeek: 'approved_hours_per_week',
  schedulePhtStart:     'schedule_pht_start',
  schedulePhtEnd:       'schedule_pht_end',
} as const;

// Comparable form of a stored value: null/undefined/'' are all "empty",
// booleans compare like 0/1, and arrays compare as sets.
function comparable(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (Array.isArray(v)) return JSON.stringify(v.map(comparable).sort());
  if (typeof v === 'number' || typeof v === 'boolean') return String(Number(v));
  return String(v);
}

function plainValue(v: unknown): unknown {
  return v === undefined || v === '' ? null : v;
}

// Pure: per-field before/after for every key whose value actually changed.
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: readonly string[],
): FieldChanges {
  const out: FieldChanges = {};
  for (const k of keys) {
    if (comparable(before[k]) !== comparable(after[k])) out[k] = { from: plainValue(before[k]), to: plainValue(after[k]) };
  }
  return out;
}

type UserPatchSnapshot = { role: string; is_active: number } & Record<string, unknown>;

// Pure: derive the audit action for a user PATCH from before/after snapshots.
// (De)activation wins over a simultaneous role change.
export function deriveUserPatchAction(
  before: { role: string; is_active: number },
  after: { role: string; is_active: number },
): { action: AuditAction; details: Record<string, unknown> } {
  if (before.is_active === 1 && after.is_active === 0) return { action: 'user.deactivated', details: {} };
  if (before.is_active === 0 && after.is_active === 1) return { action: 'user.reactivated', details: {} };
  if (before.role !== after.role) return { action: 'user.role_changed', details: { from: before.role, to: after.role } };
  return { action: 'user.updated', details: {} };
}

// Pure: the audit entry for a user PATCH (role, status and the other profile
// fields; identity and tool access are logged separately), with a per-field
// before/after under `changes`. Null when nothing actually changed.
export function buildUserPatchAudit(
  before: UserPatchSnapshot,
  after: UserPatchSnapshot,
): { action: AuditAction; details: Record<string, unknown> } | null {
  const pick = (row: UserPatchSnapshot) => {
    const out: Record<string, unknown> = { role: row.role, isActive: Number(row.is_active) };
    for (const [key, col] of Object.entries(USER_PATCH_FIELD_COLUMNS)) out[key] = row[col];
    return out;
  };
  const changes = diffFields(pick(before), pick(after), ['role', 'isActive', ...Object.keys(USER_PATCH_FIELD_COLUMNS)]);
  if (Object.keys(changes).length === 0) return null;
  const { action, details } = deriveUserPatchAction(
    { role: String(before.role), is_active: Number(before.is_active) },
    { role: String(after.role), is_active: Number(after.is_active) },
  );
  return { action, details: { ...details, changes } };
}

export interface ReportingSnapshot {
  reportsToUserId: number | null;
  alsoReportsToUserIds: number[];
  isHidden?: boolean;
}

// Pure: what changed in a user's reporting line (main lead, "also reports
// to", org-chart visibility). Null when nothing changed. User ids are stored;
// names are resolved when the log is read.
export function diffReporting(before: ReportingSnapshot, after: ReportingSnapshot): FieldChanges | null {
  const changes = diffFields(
    { reportsTo: before.reportsToUserId, alsoReportsTo: [...before.alsoReportsToUserIds].sort((a, b) => a - b) },
    { reportsTo: after.reportsToUserId, alsoReportsTo: [...after.alsoReportsToUserIds].sort((a, b) => a - b) },
    ['reportsTo', 'alsoReportsTo'],
  );
  // Empty "also reports to" lists read as [] rather than null in the details.
  for (const side of ['from', 'to'] as const) {
    if (changes.alsoReportsTo && changes.alsoReportsTo[side] === null) changes.alsoReportsTo[side] = [];
  }
  if (after.isHidden !== undefined && Boolean(before.isHidden) !== after.isHidden) {
    changes.orgChartHidden = { from: Boolean(before.isHidden), to: after.isHidden };
  }
  return Object.keys(changes).length ? changes : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asChange(v: unknown): FieldChange | null {
  return isRecord(v) && ('from' in v || 'to' in v) ? { from: v.from, to: v.to } : null;
}

// Pure: the field-level changes an audit entry recorded, across every
// details shape the log has used (legacy role from/to, identity fields at
// the top level, created role/team, tool access added/removed, `changes`).
export function auditFieldChanges(action: string, details: Record<string, unknown> | null): FieldChanges {
  const d = isRecord(details) ? details : {};
  const out: FieldChanges = {};
  if (isRecord(d.changes)) {
    for (const [k, v] of Object.entries(d.changes)) {
      const c = asChange(v);
      if (c) out[k] = c;
    }
  }
  switch (action) {
    case 'user.role_changed':
      if (!out.role && (d.from !== undefined || d.to !== undefined)) out.role = { from: d.from, to: d.to };
      break;
    case 'user.identity_changed':
      for (const k of ['name', 'username', 'email', 'jobTitle']) {
        const c = asChange(d[k]);
        if (c) out[k] = c;
      }
      break;
    case 'user.created':
      if (d.role != null) out.role = { from: null, to: d.role };
      if (d.team != null) out.team = { from: null, to: d.team };
      break;
    case 'user.tool_access_changed': {
      const added = Array.isArray(d.added) ? d.added : [];
      const removed = Array.isArray(d.removed) ? d.removed : [];
      if (added.length) out.toolsAdded = { from: null, to: added };
      if (removed.length) out.toolsRemoved = { from: removed, to: null };
      break;
    }
    case 'user.photo_changed':
      out.photo = { from: null, to: null };
      break;
  }
  return out;
}

function displayValue(field: string, v: unknown, nameOf: (id: number) => string | null): string | null {
  if (field === 'reportsTo') {
    if (v === null || v === undefined) return 'Founder (default)';
    const id = Number(v);
    return nameOf(id) ?? `User #${id}`;
  }
  if (field === 'alsoReportsTo') {
    const ids = Array.isArray(v) ? v.map(Number) : [];
    return ids.length ? ids.map((id) => nameOf(id) ?? `User #${id}`).join(', ') : 'None';
  }
  if (v === null || v === undefined || v === '') return null;
  if (field === 'role') return roleDisplayLabel(String(v));
  if (field === 'isActive') return Number(v) === 1 || v === true ? 'Active' : 'Inactive';
  if (field === 'orgChartHidden') return v === true || Number(v) === 1 ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.map(String).join(', ');
  if (isRecord(v)) return JSON.stringify(v);
  return String(v);
}

// Pure, server-side: turn an audit entry's stored details into the list the
// browser renders. Private fields keep only their label (values dropped
// here, so they are never serialized); a photo change is only named.
export function presentAuditChanges(
  action: string,
  details: Record<string, unknown> | null,
  nameOf: (id: number) => string | null = () => null,
): ActivityChange[] {
  return Object.entries(auditFieldChanges(action, details)).map(([field, c]) => {
    const label = AUDIT_FIELD_LABELS[field] ?? field;
    if (isPrivateAuditField(field)) return { field, label, from: null, to: null, hidden: 'private' as const };
    if (field === 'photo') return { field, label, from: null, to: null, hidden: 'value' as const };
    return { field, label, from: displayValue(field, c.from, nameOf), to: displayValue(field, c.to, nameOf) };
  });
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// Pure: human-readable description for the activity feed.
export function describeAudit(action: string, details: Record<string, unknown> | null): string {
  const from = details?.from;
  const to = details?.to;
  switch (action) {
    case 'user.created':      return 'Created a user account';
    case 'user.role_changed': return from && to
      ? `Changed a user's role (${roleDisplayLabel(String(from))} → ${roleDisplayLabel(String(to))})`
      : "Changed a user's role";
    case 'user.deactivated':  return 'Deactivated a user';
    case 'user.reactivated':  return 'Reactivated a user';
    case 'user.tool_access_changed': {
      const added = Array.isArray(details?.added) ? (details.added as unknown[]) : [];
      const removed = Array.isArray(details?.removed) ? (details.removed as unknown[]) : [];
      const parts: string[] = [];
      if (added.length) parts.push(`+${added.join(', ')}`);
      if (removed.length) parts.push(`−${removed.join(', ')}`);
      return parts.length ? `Changed a user's tool access (${parts.join('; ')})` : "Changed a user's tool access";
    }
    case 'user.setup_email_sent': return 'Sent an account-setup email';
    case 'user.identity_changed': {
      const labels: Record<string, string> = { name: 'name', username: 'username', email: 'email', jobTitle: 'job title' };
      const changed = Object.keys(labels).filter((k) => details && k in details).map((k) => labels[k]);
      return changed.length ? `Changed a user's ${changed.join(', ')}` : "Changed a user's identity details";
    }
    case 'user.reporting_changed': return "Changed a user's reporting line";
    case 'user.photo_changed':     return "Changed a user's photo";
    case 'user.updated': {
      const fields = Object.keys(auditFieldChanges(action, details))
        .map((k) => lowerFirst(AUDIT_FIELD_LABELS[k] ?? k));
      return fields.length ? `Updated a user's ${fields.join(', ')}` : 'Updated a user account';
    }
    default:                  return `Admin action: ${action}`;
  }
}
