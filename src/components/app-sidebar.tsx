"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, CheckSquare, Briefcase, FileText, Calendar, LogOut, User, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { AppRole } from "@/lib/rbac";
import { canAccessReports, roleLabel } from "@/lib/rbac";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, category: "main", access: "all" },
  { href: "/my-tasks", label: "My Tasks", icon: CheckSquare, category: "main", access: "all" },
  { href: "/projects/c1", label: "C1 - Romega Digital", icon: Briefcase, category: "projects", access: "all" },
  { href: "/projects/c2", label: "C2 - PinayMate", icon: Briefcase, category: "projects", access: "all" },
  { href: "/projects/c3", label: "C3 - Internal Tools", icon: Briefcase, category: "projects", access: "all" },
  { href: "/projects/c4", label: "C4 - Upskilling", icon: Briefcase, category: "projects", access: "all" },
  { href: "/reports", label: "Weekly Reports", icon: FileText, category: "reports", access: "reports" },
  { href: "/attendance", label: "Attendance", icon: Calendar, category: "reports", access: "reports" },
];

function NavLinks({ collapsed = false, role }: { collapsed?: boolean; role: AppRole }) {
  const pathname = usePathname();
  const visibleItems = navItems.filter((item) => {
    if (item.access === "all") return true;
    return canAccessReports(role);
  });

  const renderLinks = (category: string) => {
    return visibleItems
      .filter((item) => item.category === category)
      .map((item) => {
        const isActive = pathname.startsWith(item.href);
        const Icon = item.icon;
        
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} px-3 py-2 rounded-md transition-colors font-medium ${
              isActive
                ? "bg-white/10 text-white"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
            title={collapsed ? item.label : undefined}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className={`w-5 h-5 ${isActive ? "text-(--rs-accent-500)" : ""}`} aria-hidden="true" />
            {!collapsed && item.label}
          </Link>
        );
      });
  };

  return (
    <nav className="flex-1 overflow-y-auto w-full" aria-label="Main Navigation">
      <div className="space-y-1">{renderLinks("main")}</div>
      {!collapsed && <div className="pt-6 pb-2 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Projects</div>}
      <div className="space-y-1">{renderLinks("projects")}</div>
      {canAccessReports(role) ? (
        <>
          {!collapsed && <div className="pt-6 pb-2 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Reports</div>}
          <div className="space-y-1">{renderLinks("reports")}</div>
        </>
      ) : null}
    </nav>
  );
}

function LogoutButton({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        router.push('/login');
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to logout', err);
    }
  };

  return (
    <button 
      onClick={handleLogout}
      className={`w-full flex items-center ${collapsed ? "justify-center" : "gap-3"} px-3 py-2 hover:bg-white/5 rounded-md text-red-400 hover:text-red-300 transition-colors text-left font-medium`}
      title={collapsed ? "Logout" : undefined}
    >
      <LogOut className="w-5 h-5" />
      {!collapsed && "Logout"}
    </button>
  );
}

export function AppSidebar({ role }: { role: AppRole }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`${collapsed ? "w-20" : "w-64"} bg-(--rs-neutral-grey-900) text-white flex flex-col hidden md:flex shrink-0 border-r border-slate-200/10 transition-all duration-200`}>
      <div className={`relative p-4 border-b border-white/10 flex items-center ${collapsed ? "justify-center" : "justify-between gap-3"}`}>
        <div className={`font-serif font-bold text-2xl flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
          <div className="w-8 h-8 rounded bg-(--rs-accent-500) flex items-center justify-center text-(--rs-neutral-grey-900) text-sm" aria-hidden="true">RS</div>
          {!collapsed && "Ticketing"}
        </div>
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-300 hover:text-white hover:bg-white/10"
            aria-label="Minimize sidebar"
            onClick={() => setCollapsed(true)}
          >
            <PanelLeftClose className="w-5 h-5" />
          </Button>
        )}
        {collapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-2 text-slate-300 hover:text-white hover:bg-white/10"
            aria-label="Expand sidebar"
            onClick={() => setCollapsed(false)}
          >
            <PanelLeftOpen className="w-5 h-5" />
          </Button>
        )}
      </div>
      <div className={`flex-1 ${collapsed ? "px-2 py-4" : "p-4"} flex flex-col overflow-hidden`}>
         <NavLinks collapsed={collapsed} role={role} />
      </div>
      <div className={`${collapsed ? "px-2 py-4" : "p-4"} border-t border-white/10 space-y-1`}>
        {!collapsed && (
          <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Role: {roleLabel(role)}
          </div>
        )}
        <Link
          href="/profile"
          className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} px-3 py-2 hover:bg-white/5 rounded-md text-slate-300 hover:text-white transition-colors`}
          title={collapsed ? "Profile" : undefined}
        >
          <User className="w-5 h-5" />
          {!collapsed && "Profile"}
        </Link>
        <LogoutButton collapsed={collapsed} />
      </div>
    </aside>
  );
}

export function MobileNav({ role }: { role: AppRole }) {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation menu" />}>
        <Menu className="w-6 h-6" />
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 bg-(--rs-neutral-grey-900) text-white border-r-0">
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
        <SheetDescription className="sr-only">Access the internal ticketing system sections.</SheetDescription>
        
        <div className="flex flex-col h-full">
          <div className="p-6 font-serif font-bold text-2xl border-b border-white/10 flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-(--rs-accent-500) flex items-center justify-center text-(--rs-neutral-grey-900) text-sm" aria-hidden="true">RS</div>
            Ticketing
          </div>
          <div className="flex-1 p-4 overflow-y-auto">
            <NavLinks role={role} />
            <div className="mt-8 border-t border-white/10 pt-4 space-y-1">
              <Link href="/profile" className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 rounded-md text-slate-300 hover:text-white transition-colors">
                <User className="w-5 h-5" /> Profile
              </Link>
              <LogoutButton />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
