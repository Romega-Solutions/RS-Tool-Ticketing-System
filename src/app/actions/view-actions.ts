'use server'

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { canViewAs, fetchUserRowById, getSession, VIEW_AS_COOKIE } from "@/lib/session";

export async function changeView(targetUserId: number) {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  // Already viewing as someone: the session is the viewed (non-admin) user.
  // Exit first so the admin check runs against the real admin.
  if (session.impersonatedBy) throw new Error('Exit the current view first')

  const target = await fetchUserRowById(targetUserId)
  if (!target || !canViewAs(session, target)) throw new Error('Not allowed to view as this user')

  ;(await cookies()).set(VIEW_AS_COOKIE, String(target.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })
  redirect("/dashboard")
}

export async function exitView() {
  (await cookies()).delete(VIEW_AS_COOKIE)
  redirect("/admin/users")
}
