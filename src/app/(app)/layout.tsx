import { ReactNode } from "react";
import { AppSidebar, MobileNav } from "@/components/app-sidebar";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { canAccessPath, defaultLandingPath } from "@/lib/rbac";
import { ClockWidget } from "@/components/clock-widget";
import { LiveClock } from "@/components/live-clock";
import { WhoIsInPanel } from "@/components/who-is-in-panel";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (!session) {
    // They may have a valid Supabase auth session but no public.users row yet
    // (e.g. email confirmed but callback failed to write DB row)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect('/onboarding');
    else redirect('/login');
  }

  const headersList = await headers();
  const pathname = headersList.get('x-invoke-path') ?? '';
  if (pathname && !canAccessPath(pathname, session.role)) {
    redirect(defaultLandingPath(session.role));
  }

  const firstName = session.name.trim().split(" ")[0] ?? "User";

  return (
    <div className="flex h-screen bg-(--rs-primary-50) overflow-hidden text-(--rs-neutral-grey-900)">
      <AppSidebar role={session.role} userName={session.name} team={session.team} />
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full">
        <header className="shrink-0 border-b border-[rgba(15,23,42,0.08)] bg-white px-4 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.06)] md:px-8">
          <div className="flex items-center justify-between gap-4">
            <MobileNav role={session.role} />
            <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900) md:text-xl">
              Welcome back, {firstName}
            </h2>

            <div className="flex items-center gap-2 md:gap-3 ml-auto">
              <div className="hidden rounded-2xl border border-(--rs-neutral-grey-200) bg-white/80 px-3 py-2 text-(--rs-neutral-grey-500) shadow-sm md:flex">
                <LiveClock />
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-(--rs-neutral-grey-200) bg-white/92 px-2 py-2 shadow-sm">
                <WhoIsInPanel />
                <ClockWidget variant="topbar" />
              </div>
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
