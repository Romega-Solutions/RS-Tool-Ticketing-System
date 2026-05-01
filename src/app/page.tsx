import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { defaultLandingPath, normalizeRole } from "@/lib/rbac";

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  const payload = token ? await verifyToken(token) : null;
  const role = normalizeRole(payload?.role);

  redirect(defaultLandingPath(role));
}
