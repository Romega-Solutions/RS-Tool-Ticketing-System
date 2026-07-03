import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { defaultLandingPath } from "@/lib/rbac";
import { hasSupabaseConfig, hasSupabaseAdminConfig } from "@/lib/supabase/config";

export default async function Home() {
  if (!hasSupabaseConfig() || !hasSupabaseAdminConfig()) {
    redirect('/login');
  }

  const session = await getSession();
  redirect(defaultLandingPath(session?.role ?? 'ic'));
}
