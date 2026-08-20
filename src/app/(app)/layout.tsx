import { ReactNode } from "react";
import { AppSidebar, MobileNav } from "@/components/app-sidebar";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminConfig, hasSupabaseConfig } from "@/lib/supabase/config";
import { canAccessPath, defaultLandingPath, canAccessAdmin } from "@/lib/rbac";
import { getPhotoResolver } from "@/lib/orgchart";
import { hasIncompleteHardCourse, isPathExemptFromHardEnforcement } from "@/lib/lms-enforcement";
import { ClockWidget } from "@/components/clock-widget";
import { LiveClock } from "@/components/live-clock";
import { EnvBadge } from "@/components/env-badge";
import { WhoIsInPanel } from "@/components/who-is-in-panel";
import { NotificationBell } from "@/components/notification-bell.client";
import { FloatingGuide } from "@/components/guide/floating-guide.client";
import { NavProgress } from "@/components/nav-progress.client";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import ViewTab from "@/components/view-tab";

const MEDITATION_NOTES = [
  "Pause for one full breath before your next task. A calmer start usually creates a clearer outcome.",
  "You do not need to solve the whole week at once. Finish the next right thing with steady attention.",
  "Let your shoulders drop, unclench your jaw, and return to the work in front of you.",
  "Progress feels lighter when your mind is not arguing with the present moment.",
  "Even on a busy day, a quiet minute can reset your thinking more than rushing can.",
  "Your pace does not need to be frantic to be effective. Consistency is stronger than strain.",
];

async function getDailyQuote(seed: number) {
  try {
    const res = await fetch('https://zenquotes.io/api/random', { next: { revalidate: 21600 } });
    if (res.ok) {
      const data = await res.json() as Array<{ q?: string; a?: string }>;
      const q = data[0];
      if (q?.q && q?.a) return { text: q.q, author: q.a };
    }
  } catch { /* fall back */ }
  return { text: MEDITATION_NOTES[seed % MEDITATION_NOTES.length], author: null };
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  const isView = session?.isImpersonating

  if (!session) {
    if (!hasSupabaseConfig()) redirect('/login');

    // Disambiguate: stale cookie vs. missing DB row vs. deactivated account.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      redirect('/login');
    }
    if (!hasSupabaseAdminConfig()) {
      redirect('/login');
    }
    const admin = createAdminClient();
    const { data: dbUser } = await admin
      .from('users')
      .select('is_active')
      .eq('email', user.email)
      .maybeSingle();
    if (!dbUser) {
      // Supabase auth OK but no public.users row — recovery via onboarding.
      redirect('/onboarding');
    }
    // Row exists but is_active=0 → deactivated. Clear cookies on /login.
    redirect('/login?stale=1&reason=inactive');
  }

  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '';
  if (pathname && !canAccessPath(pathname, session.role, session.toolAccess)) {
    redirect(defaultLandingPath(session.role));
  }

  // Hard enforcement: an onboarding user with an incomplete hard course gets
  // redirected to that course's page until done. Admins and regularized
  // staff (is_onboarding=0) are unaffected. /learning, /login, /logout,
  // /profile, and /api/* are always allowed.
  if (!isPathExemptFromHardEnforcement(pathname)) {
    const block = await hasIncompleteHardCourse({
      userId:       session.id,
      role:         session.role,
      team:         session.team,
      isOnboarding: session.isOnboarding,
    });
    if (block) {
      redirect(`/learning/${block.courseId}`);
    }
  }

  const firstName = session.name.trim().split(" ")[0] ?? "User";
  const quoteSeed = new Date().getDate() + (session.id ?? 0);
  const quote = await getDailyQuote(quoteSeed);
  const myPhotoUrl = (await getPhotoResolver())({ name: session.name, email: session.email });

  return (
    <div>
        {isView && (
            <ViewTab userName={session.name} />
        )}
      
      <div className="flex h-screen bg-(--rs-primary-50) overflow-hidden text-(--rs-neutral-grey-900)">
        <NavProgress />
        <AppSidebar role={session.role} userName={session.name} team={session.team} toolAccess={session.toolAccess} photoUrl={myPhotoUrl} />
        <main className="flex-1 flex flex-col h-full overflow-hidden w-full">
          <header className="shrink-0 border-b border-[rgba(15,23,42,0.08)] bg-white px-4 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.06)] md:px-8">
            <div className="flex items-center justify-between gap-4">
              <MobileNav role={session.role} toolAccess={session.toolAccess} />

              <div className="min-w-0 flex-1">
                <h2 className="font-serif text-base font-bold text-(--rs-neutral-grey-900) md:text-lg leading-tight">
                  Welcome back, {firstName}
                </h2>
                <p className="mt-0.5 hidden md:block text-xs text-(--rs-neutral-grey-400) italic truncate max-w-xl">
                  &ldquo;{quote.text}&rdquo;{quote.author ? ` — ${quote.author}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-2 md:gap-3 shrink-0">
                <div className="hidden rounded-2xl border border-(--rs-neutral-grey-200) bg-white/80 px-3 py-2 text-(--rs-neutral-grey-500) shadow-sm md:flex">
                  <LiveClock />
                </div>
                <div className="flex items-center gap-1 rounded-2xl border border-(--rs-neutral-grey-200) bg-white/92 px-2 py-2 shadow-sm">
                  <NotificationBell />
                  <WhoIsInPanel currentUserId={session.id} isAdmin={session.role === 'admin'} />
                  <ClockWidget variant="topbar" />
                </div>
              </div>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            {/* Full-width content: fills large monitors (no centered max-width cap).
                Individual pages keep their own max-w-* for forms/prose readability. */}
            <div className="w-full">
              {children}
            </div>
          </div>
        </main>
        <FloatingGuide isAdmin={canAccessAdmin(session.role)} />
      </div>
    </div>
  );
}
