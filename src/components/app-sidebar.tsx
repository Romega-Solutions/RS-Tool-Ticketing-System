"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, CheckSquare, Briefcase, FileText, Calendar, LogOut, User, Menu, PanelLeftClose, PanelLeftOpen, Shield, ClipboardList } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { AppRole } from "@/lib/rbac";
import { canAccessReports, canAccessAdmin, roleLabel } from "@/lib/rbac";

const navItems = [
  { href: "/dashboard",   label: "Dashboard",      icon: LayoutDashboard, category: "main"    },
  { href: "/my-tasks",    label: "My Tasks",        icon: CheckSquare,     category: "main"    },
  { href: "/projects",    label: "Projects",        icon: Briefcase,       category: "main"    },
  { href: "/reports",         label: "Weekly Reports",  icon: FileText,        category: "main"    },
  { href: "/weekly-report",   label: "Status Report",   icon: ClipboardList,   category: "main"    },
  { href: "/attendance",  label: "Attendance",      icon: Calendar,        category: "reports" },
  { href: "/admin/users", label: "User Management", icon: Shield,          category: "admin"   },
];

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
      className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors font-medium text-sm ${
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

function NavLinks({ collapsed = false, role }: { collapsed?: boolean; role: AppRole }) {
  const pathname = usePathname();

  const mainItems    = navItems.filter(i => i.category === "main");
  const reportItems  = navItems.filter(i => i.category === "reports" && canAccessReports(role));
  const adminItems   = navItems.filter(i => i.category === "admin" && canAccessAdmin(role));

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

      <NavSection label="Reports" items={reportItems} collapsed={collapsed} isActive={isActive} />
      <NavSection label="Admin" items={adminItems} collapsed={collapsed} isActive={isActive} />
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
      className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-white/6 rounded-md text-red-400/80 hover:text-red-300 transition-colors text-left text-sm font-medium ${
        collapsed ? "justify-center" : ""
      }`}
      title={collapsed ? "Logout" : undefined}
    >
      <LogOut className="w-4 h-4 shrink-0" />
      {!collapsed && "Log out"}
    </button>
  );
}

export function AppSidebar({ role }: { role: AppRole }) {
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
        <NavLinks collapsed={collapsed} role={role} />
      </div>

      {/* Footer */}
      <div className={`${collapsed ? "px-2 py-3" : "px-3 py-3"} border-t border-white/10 space-y-0.5`}>
        {!collapsed && (
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-white/35">
            {roleLabel(role)}
          </div>
        )}
        <Link
          href="/profile"
          className={`flex items-center gap-3 px-3 py-2 hover:bg-white/6 rounded-md text-white/60 hover:text-white/90 transition-colors text-sm font-medium ${
            collapsed ? "justify-center" : ""
          }`}
          title={collapsed ? "Profile" : undefined}
        >
          <User className="w-4 h-4 shrink-0" />
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
              priority
              unoptimized
            />
          </div>

          <div className="flex-1 px-3 py-3 overflow-y-auto flex flex-col">
            <NavLinks role={role} />
            <div className="mt-auto pt-4 border-t border-white/10 space-y-0.5">
              <Link
                href="/profile"
                className="flex items-center gap-3 px-3 py-2 hover:bg-white/6 rounded-md text-white/60 hover:text-white/90 transition-colors text-sm font-medium"
              >
                <User className="w-4 h-4 shrink-0" /> Profile
              </Link>
              <LogoutButton />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
