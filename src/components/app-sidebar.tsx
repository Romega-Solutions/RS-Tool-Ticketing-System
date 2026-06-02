"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, CheckSquare, Briefcase, FileText, Calendar, LogOut, User, Menu, PanelLeftClose, PanelLeftOpen, Shield, ClipboardList, Building2, Loader2, Users2, Sun, Wand2, UserPlus2, CircleDollarSign, BookOpen, GraduationCap, BookMarked, Timer, LifeBuoy } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/person-avatar";
import type { AppRole } from "@/lib/rbac";
import { canAccessReports, canAccessAdmin, canAccessLeadTool, roleLabel } from "@/lib/rbac";

const navItems = [
  { href: "/dashboard",         label: "Dashboard",           icon: LayoutDashboard, category: "main"      },
  { href: "/my-tasks",          label: "My Tasks",             icon: CheckSquare,     category: "main"      },
  { href: "/projects",          label: "Projects",             icon: Briefcase,       category: "main"      },
  { href: "/learning",          label: "My Learning",          icon: BookMarked,      category: "main"      },
  { href: "/learning/certificates", label: "My Certificates",  icon: GraduationCap,   category: "main"      },
  { href: "/weekly-report",     label: "Weekly Reports",       icon: FileText,        category: "main"      },
  { href: "/help",              label: "Help & Guide",         icon: LifeBuoy,        category: "main"      },
  { href: "/attendance",        label: "Attendance",           icon: Calendar,        category: "reports"   },
  { href: "/sales/leads",            label: "Sales / Leads",       icon: Users2,        category: "leadTools" },
  { href: "/recruiting/candidates",  label: "Applicant Tracking System", icon: UserPlus2, category: "leadTools" },
  { href: "/onboarders",             label: "Internal Onboarding",  icon: GraduationCap, category: "leadTools" },
  { href: "/pm/status-drafter",      label: "PM / Status Drafter", icon: ClipboardList, category: "leadTools" },
  { href: "/ceo/briefing",           label: "CEO / Briefing",      icon: Sun,           category: "leadTools" },
  { href: "/marketing/content",      label: "Marketing / Content", icon: Wand2,         category: "leadTools" },
  { href: "/admin/users",       label: "User Management",      icon: Shield,            category: "admin"     },
  { href: "/admin/overtime",    label: "Overtime Requests",    icon: Timer,             category: "admin"     },
  { href: "/admin/learning",    label: "Manage Learning",      icon: BookOpen,          category: "admin"     },
  { href: "/rates",             label: "Rates & Currency",     icon: CircleDollarSign,  category: "admin"     },
];

function NavPendingDot({ collapsed }: { collapsed: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`nav-pending-dot ${pending ? "is-pending" : ""} ${collapsed ? "is-collapsed" : ""}`}
    />
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch
      className={`relative flex items-center gap-3 px-3 py-2 rounded-md transition-colors font-medium text-sm ${
        collapsed ? "justify-center" : ""
      } ${
        active
          ? "bg-white/12 text-white"
          : "text-white/60 hover:bg-white/6 hover:text-white/90"
      }`}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
    >
      <Icon className={`w-4 h-4 shrink-0 ${active ? "text-(--rs-accent-400)" : ""}`} aria-hidden="true" />
      {!collapsed && <span className="truncate">{label}</span>}
      <NavPendingDot collapsed={collapsed} />
    </Link>
  );
}

function NavSection({
  label,
  items,
  collapsed,
  isActive,
}: {
  label: string;
  items: typeof navItems;
  collapsed: boolean;
  isActive: (href: string) => boolean;
}) {
  if (items.length === 0) return null;
  return (
    <>
      {!collapsed && (
        <div className="pt-5 pb-1.5 px-3 text-[10px] font-bold text-white/35 uppercase tracking-widest">
          {label}
        </div>
      )}
      {collapsed && <div className="my-3 border-t border-white/10" />}
      <div className="space-y-0.5">
        {items.map(item => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={isActive(item.href)}
            collapsed={collapsed}
          />
        ))}
      </div>
    </>
  );
}

function NavLinks({ collapsed = false, role, team }: { collapsed?: boolean; role: AppRole; team: string | null }) {
  const pathname = usePathname();

  const mainItems     = navItems.filter(i => i.category === "main");
  const reportItems   = navItems.filter(i => i.category === "reports" && canAccessReports(role));
  const leadToolItems = navItems.filter(i => {
    if (i.category !== "leadTools") return false;
    if (i.href.startsWith('/sales/')) return canAccessLeadTool('sales', role, team);
    if (i.href.startsWith('/recruiting/')) return canAccessLeadTool('recruiting', role, team);
    if (i.href.startsWith('/onboarders')) return canAccessLeadTool('onboarding', role, team);
    if (i.href.startsWith('/pm/')) return canAccessLeadTool('pm', role, team);
    if (i.href.startsWith('/ceo/')) return canAccessLeadTool('ceo', role, team);
    if (i.href.startsWith('/marketing/')) return canAccessLeadTool('marketing', role, team);
    return false;
  });
  const adminItems    = navItems.filter(i => i.category === "admin" && canAccessAdmin(role));

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="flex-1 overflow-y-auto w-full" aria-label="Main Navigation">
      <div className="space-y-0.5">
        {mainItems.map(item => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={isActive(item.href)}
            collapsed={collapsed}
          />
        ))}
      </div>

      <NavSection label="Reports"    items={reportItems}   collapsed={collapsed} isActive={isActive} />
      <NavSection label="Lead Tools" items={leadToolItems} collapsed={collapsed} isActive={isActive} />
      <NavSection label="Admin"      items={adminItems}    collapsed={collapsed} isActive={isActive} />
    </nav>
  );
}

function LogoutButton({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut]         = useState(false);
  const [clockedInSince, setClockedInSince] = useState<string | null>(null);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      // Check clock-in status before attempting logout
      const presenceRes = await fetch('/api/presence');
      if (presenceRes.ok) {
        const presence = await presenceRes.json() as { openSession?: { clockedInAt: string } | null };
        if (presence.openSession?.clockedInAt) {
          setClockedInSince(presence.openSession.clockedInAt);
          setLoggingOut(false);
          return;
        }
      }

      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        router.push('/login');
        router.refresh();
      } else {
        setLoggingOut(false);
      }
    } catch (err) {
      console.error('Failed to logout', err);
      setLoggingOut(false);
    }
  };

  const clockedInTime = clockedInSince
    ? new Date(clockedInSince).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <>
      {loggingOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white animate-fade-in">
          <div className="flex flex-col items-center gap-5">
            <Image
              src="/images/rs-logo.svg"
              alt="Romega Solutions"
              width={148}
              height={44}
              className="object-contain"
              style={{ height: 'auto' }}
              priority
              unoptimized
            />
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-(--rs-primary-500)" />
              <p className="text-sm font-medium text-(--rs-neutral-grey-600)">Signing out…</p>
            </div>
          </div>
        </div>
      )}

      {clockedInSince && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6 space-y-4">
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-(--rs-neutral-grey-900)">Still clocked in</h2>
              <p className="text-sm text-(--rs-neutral-grey-600)">
                You&apos;ve been clocked in since <span className="font-semibold text-(--rs-neutral-grey-900)">{clockedInTime}</span>.
                Please clock out before logging out.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setClockedInSince(null)}
                className="px-4 py-2 text-sm font-medium rounded-md bg-(--rs-primary-500) text-white hover:bg-(--rs-primary-600) transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-white/6 rounded-md text-red-400/80 hover:text-red-300 transition-colors text-left text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
          collapsed ? "justify-center" : ""
        }`}
        title={collapsed ? "Logout" : undefined}
      >
        {loggingOut
          ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
          : <LogOut className="w-4 h-4 shrink-0" />
        }
        {!collapsed && (loggingOut ? "Signing out…" : "Log out")}
      </button>
    </>
  );
}

export function AppSidebar({ role, userName, team, photoUrl }: { role: AppRole; userName: string; team: string | null; photoUrl?: string | null }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`${
        collapsed ? "w-16" : "w-56"
      } bg-(--rs-neutral-grey-900) text-white flex flex-col hidden md:flex shrink-0 border-r border-slate-200/10 transition-all duration-200`}
    >
      {/* Header */}
      {collapsed ? (
        <div className="flex flex-col items-center gap-2 px-2 pt-3 pb-2 border-b border-white/10">
          <Image
            src="/images/rs-icon.png"
            alt="RS"
            width={32}
            height={32}
            className="object-contain brightness-0 invert"
            priority
            unoptimized
          />
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 text-slate-400 hover:text-white hover:bg-white/10"
            aria-label="Expand sidebar"
            onClick={() => setCollapsed(false)}
          >
            <PanelLeftOpen className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <Image
            src="/images/rs-logo.svg"
            alt="Romega Solutions"
            width={108}
            height={30}
            className="object-contain brightness-0 invert shrink-0"
            style={{ height: 'auto' }}
            priority
            unoptimized
          />
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 shrink-0 text-slate-400 hover:text-white hover:bg-white/10"
            aria-label="Minimize sidebar"
            onClick={() => setCollapsed(true)}
          >
            <PanelLeftClose className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Nav */}
      <div className={`flex-1 ${collapsed ? "px-2 py-3" : "px-3 py-3"} flex flex-col overflow-hidden`}>
        <NavLinks collapsed={collapsed} role={role} team={team} />
      </div>

      {/* Footer */}
      <div className={`${collapsed ? "px-2 py-3" : "px-3 py-3"} border-t border-white/10 space-y-0.5`}>
        {collapsed && (
          <div className="mb-2 flex justify-center">
            <PersonAvatar name={userName} photoUrl={photoUrl} size={32} className="ring-2 ring-white/15" />
          </div>
        )}
        {!collapsed && (
          <div className="mb-2 rounded-2xl border border-white/10 bg-white/6 px-3.5 py-3">
            <div className="flex items-center gap-3">
              <PersonAvatar name={userName} photoUrl={photoUrl} size={40} className="ring-2 ring-white/15" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{userName}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
                    <Shield className="w-3 h-3" />
                    {roleLabel(role)}
                  </span>
                  {team && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-medium text-white/60">
                      <Building2 className="w-3 h-3" />
                      {team}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        <Link
          href="/profile"
          prefetch
          className={`relative flex items-center gap-3 px-3 py-2 hover:bg-white/8 rounded-xl text-white/70 hover:text-white transition-colors text-sm font-medium ${
            collapsed ? "justify-center" : ""
          }`}
          title={collapsed ? "Profile" : undefined}
        >
          <User className="w-4 h-4 shrink-0" />
          {!collapsed && "My Profile"}
          <NavPendingDot collapsed={collapsed} />
        </Link>
        <LogoutButton collapsed={collapsed} />
      </div>
    </aside>
  );
}

export function MobileNav({ role, team }: { role: AppRole; team: string | null }) {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation menu" />}>
        <Menu className="w-6 h-6" />
      </SheetTrigger>
      <SheetContent side="left" className="w-56 p-0 bg-(--rs-neutral-grey-900) text-white border-r-0">
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
        <SheetDescription className="sr-only">Access the internal ticketing system sections.</SheetDescription>

        <div className="flex flex-col h-full">
          {/* Mobile header — logo only, no extra text */}
          <div className="px-4 py-3 border-b border-white/10">
            <Image
              src="/images/rs-logo.svg"
              alt="Romega Solutions"
              width={108}
              height={30}
              className="object-contain brightness-0 invert"
              style={{ height: 'auto' }}
              priority
              unoptimized
            />
          </div>

          <div className="flex-1 px-3 py-3 overflow-y-auto flex flex-col">
            <NavLinks role={role} team={team} />
            <div className="mt-auto pt-4 border-t border-white/10 space-y-0.5">
              <Link
                href="/profile"
                prefetch
                className="relative flex items-center gap-3 px-3 py-2 hover:bg-white/6 rounded-md text-white/60 hover:text-white/90 transition-colors text-sm font-medium"
              >
                <User className="w-4 h-4 shrink-0" /> Profile
                <NavPendingDot collapsed={false} />
              </Link>
              <LogoutButton />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
