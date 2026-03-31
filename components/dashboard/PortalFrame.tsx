"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  FileSignature,
  ListChecks,
  Settings,
  LayoutDashboard,
  LogOut,
  User,
  type LucideIcon,
} from "lucide-react";
import { ReactNode } from "react";
import { PortalUser } from "@/lib/types";

type PortalFrameProps = {
  me: PortalUser;
  onLogout: () => void | Promise<void>;
  title: string;
  subtitle: string;
  children: ReactNode;
};

type NavItem = {
  href: string;
  label: string;
};

type IconNavItem = NavItem & { icon: LucideIcon };

const navItems: IconNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/orders", label: "Forms", icon: FileSignature },
  { href: "/dashboard/requests", label: "History", icon: ListChecks },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function isNavActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname.startsWith(href);
}

export function PortalFrame({ me, onLogout, title, subtitle, children }: PortalFrameProps) {
  const pathname = usePathname();

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar" aria-label="Portal navigation menu">
        <div className="sidebar-brand flex items-center justify-center p-4">
          <img src="/images/cluso-infolink-logo.png" alt="Cluso Candidate" className="h-10 w-auto object-contain" />
        </div>
        <nav className="portal-nav" aria-label="Portal sections">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`portal-nav-link ${isNavActive(pathname, item.href) ? "active" : ""}`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <h1 className="admin-topbar-title">Candidate Panel</h1>
          <div className="account-actions-wrap">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 500 }}>
              <User size={18} />
              {me.name}
            </div>
            <button onClick={onLogout} className="logout-btn">
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </header>
        <div className="portal-shell">
          {children}
        </div>
      </main>
    </div>
  );
}
