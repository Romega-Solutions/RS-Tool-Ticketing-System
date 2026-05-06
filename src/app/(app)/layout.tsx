import { ReactNode } from "react";
import { AppSidebar, MobileNav } from "@/components/app-sidebar";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { roleLabel, canAccessPath, defaultLandingPath } from "@/lib/rbac";
import { ClockWidget } from "@/components/clock-widget";
import { LiveClock } from "@/components/live-clock";
import { WhoIsInPanel } from "@/components/who-is-in-panel";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Building2, Hand, Shield } from "lucide-react";

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
        <header className="shrink-0 border-b border-[rgba(15,23,42,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,255,0.96))] px-4 py-3 shadow-[0_8px_30px_rgba(15,23,42,0.05)] md:px-8">
          <div className="flex items-center justify-between gap-4">
            <MobileNav role={session.role} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <div className="hidden md:flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--rs-primary-500),var(--rs-primary-600))] text-white shadow-[0_10px_20px_rgba(0,105,217,0.18)]">
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-(--rs-primary-600)">
                    <Hand className="w-3.5 h-3.5" />
                    Romega Solutions
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900) md:text-xl">
                      Welcome back, {firstName}
                    </h2>
                    <span className="inline-flex items-center gap-1 rounded-full bg-(--rs-primary-100) px-2.5 py-1 text-[11px] font-semibold text-(--rs-primary-700)">
                      <Shield className="w-3 h-3" />
                      {roleLabel(session.role)}
                    </span>
                    {session.team && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-(--rs-neutral-grey-500) ring-1 ring-(--rs-neutral-grey-200)">
                        <Building2 className="w-3 h-3" />
                        {session.team}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 hidden text-sm text-(--rs-neutral-grey-500) md:block">
                    Stay in sync with your team, your reports, and your workday at Romega.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
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
