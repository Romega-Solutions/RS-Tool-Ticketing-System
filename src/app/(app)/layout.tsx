import { ReactNode } from "react";
import { AppSidebar, MobileNav } from "@/components/app-sidebar";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { normalizeRole, roleLabel } from "@/lib/rbac";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  const payload = token ? await verifyToken(token) : null;
  const role = normalizeRole(payload?.role);
  const username = typeof payload?.username === 'string' ? payload.username : '';
  const initials = username ? username.slice(0, 2).toUpperCase() : 'RS';

  return (
    <div className="flex h-screen bg-(--rs-primary-50) overflow-hidden text-(--rs-neutral-grey-900)">
      <AppSidebar role={role} />
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full">
        <header className="bg-white border-b border-slate-200 h-16 flex items-center px-4 md:px-8 shadow-sm justify-between shrink-0">
          <div className="flex items-center gap-4">
            <MobileNav role={role} />
            <h2 className="font-serif text-xl font-bold text-(--rs-neutral-grey-900) hidden md:block">Romega Solutions</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline-flex rounded-full bg-(--rs-primary-100) px-2.5 py-1 text-xs font-semibold text-(--rs-primary-700)">
              {roleLabel(role)}
            </span>
            <div className="w-8 h-8 rounded-full bg-(--rs-primary-500) text-white flex items-center justify-center font-bold text-sm" aria-label="User Profile" role="button" tabIndex={0}>
              {initials}
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
