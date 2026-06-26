import { createAdminClient } from '@/lib/supabase/admin';

export type AuditAction =
  | 'user.created'
  | 'user.role_changed'
  | 'user.deactivated'
  | 'user.reactivated'
  | 'user.tool_access_changed'
  | 'user.setup_email_sent'
  | 'user.updated';

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

// Pure: human-readable description for the activity feed.
export function describeAudit(action: string, details: Record<string, unknown> | null): string {
  const from = details?.from;
  const to = details?.to;
  switch (action) {
    case 'user.created':      return 'Created a user account';
    case 'user.role_changed': return from && to
      ? `Changed a user's role (${String(from)} → ${String(to)})`
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
    case 'user.updated':      return 'Updated a user account';
    default:                  return `Admin action: ${action}`;
  }
}
