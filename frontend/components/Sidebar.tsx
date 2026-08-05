"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Wallet, LayoutGrid, LayoutDashboard, ClipboardList, Package, Users,
  BarChart3, UserSquare2, Boxes, Receipt, Settings, Store, LogOut, ChevronLeft, ChevronRight,
} from "lucide-react";
import styles from "./Sidebar.module.css";
import { clearSession, getActiveRole } from "@/lib/api";

type NavItem = {
  label: string;
  href?: string;
  icon: React.ReactNode;
  minRole?: "owner" | "manager";
};

const ROLE_RANK: Record<string, number> = { cashier: 1, manager: 2, owner: 3 };

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard size={18} /> },
  { label: "POS", href: "/pos", icon: <LayoutGrid size={18} /> },
  { label: "Orders", href: "/orders", icon: <ClipboardList size={18} /> },
  { label: "Products", href: "/products", icon: <Package size={18} /> },
  { label: "Customers", href: "/customers", icon: <Users size={18} /> },
  { label: "Reports", href: "/reports", icon: <BarChart3 size={18} /> },
  { label: "Employees", href: "/employees", icon: <UserSquare2 size={18} />, minRole: "manager" },
  { label: "Stock", href: "/stock", icon: <Boxes size={18} /> },
  { label: "Branches", href: "/branches", icon: <Store size={18} /> },
  { label: "Expenses", href: "/expenses", icon: <Receipt size={18} /> },
  { label: "Settings", href: "/settings", icon: <Settings size={18} /> },
];

type LocationOption = { id: string; name: string };

export default function Sidebar({
  collapsed = false,
  branchSub,
  locations,
  selectedLocationId,
  onLocationChange,
}: {
  collapsed?: boolean;
  branchSub?: string | null;
  locations?: LocationOption[];
  selectedLocationId?: string;
  onLocationChange?: (id: string) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const role = getActiveRole() || "cashier";

  function handleLogout() {
    clearSession();
    router.push("/login");
  }

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`}>
      <div className={styles.brand}>
        <div className={styles.brandMark}>
          <Wallet size={18} />
        </div>
        {!collapsed && <span>SmartPOS</span>}
      </div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const allowed = !item.minRole || ROLE_RANK[role] >= ROLE_RANK[item.minRole];
          const active = !!item.href && pathname === item.href;
          const enabled = !!item.href && allowed;

          if (enabled) {
            return (
              <Link
                key={item.label}
                href={item.href!}
                className={`${styles.navItem} ${active ? styles.active : ""}`}
              >
                {item.icon}
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          }
          return (
            <button key={item.label} className={`${styles.navItem} ${styles.disabled}`} disabled title="Not built yet">
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && <span className={styles.soonBadge}>Soon</span>}
            </button>
          );
        })}
      </nav>

      <div className={styles.spacer} />

      {locations && locations.length > 0 && (
        <div className={styles.branchCard}>
          <Store size={16} />
          {!collapsed && (
            <div style={{ minWidth: 0, flex: 1 }}>
              {locations.length > 1 ? (
                <select
                  className={styles.branchSelect}
                  value={selectedLocationId}
                  onChange={(e) => onLocationChange && onLocationChange(e.target.value)}
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              ) : (
                <div className={styles.branchName}>{locations[0].name}</div>
              )}
              {branchSub && <div className={styles.branchSub}>{branchSub}</div>}
            </div>
          )}
        </div>
      )}

      <button className={`${styles.navItem} ${styles.logout}`} onClick={handleLogout}>
        <LogOut size={18} />
        {!collapsed && <span>Log out</span>}
      </button>
    </aside>
  );
}
