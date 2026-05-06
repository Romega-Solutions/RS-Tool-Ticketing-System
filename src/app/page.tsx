import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { defaultLandingPath } from "@/lib/rbac";

export default async function Home() {
  const session = await getSession();
  redirect(defaultLandingPath(session?.role ?? 'ic'));
}
