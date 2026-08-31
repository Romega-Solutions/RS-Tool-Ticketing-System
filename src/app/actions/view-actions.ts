'use server'

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const SESSION_DURATION_MS = 30 * 60 * 1000 // 30 min — adjust as needed

export async function changeView(targetUserId: number) {
  const supabase = await createClient()
  const { data: { user: admin } } = await supabase.auth.getUser()
  if (!admin) throw new Error('Not authenticated')

  // optional: your own authorization check before allowing this
  // const { data: allowed } = await supabase.rpc('can_impersonate', { admin_id: admin.id, target_id: targetUserId })
  // if (!allowed) throw new Error('Not authorized')

  const adminDb = createAdminClient()
  const { error } = await adminDb.from('impersonation_sessions').insert({
    actor_admin_id: admin.id,
    subject_user_id: String(targetUserId),
    expires_at: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
  })

  if (error) throw new Error('Could not start impersonation')

  await supabase.auth.refreshSession()
  redirect("/dashboard")
}

export async function exitView() {
  const supabase = await createClient()
  const { data: { user: admin } } = await supabase.auth.getUser()
  if (!admin) throw new Error('Not authenticated')

  const adminDb = createAdminClient()
  await adminDb
    .from('impersonation_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('actor_admin_id', admin.id)
    .is('ended_at', null)

  // same here — force refresh so the claim disappears immediately, not on next natural expiry
  await supabase.auth.refreshSession()
}