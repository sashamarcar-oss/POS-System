"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3, CheckCircle2, Clock, DollarSign, Download, FileText, Package,
  Boxes, Users, RefreshCw, Search, TrendingUp, Receipt, Percent, Wallet,
  CreditCard, Banknote, Smartphone, AlertCircle,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import Sidebar from "@/components/Sidebar";
import { api, getActiveBusinessName, getActiveCurrency } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import styles from "./reports.module.css";

// ─── Types (mirror the backend serializers) ────────────────────────────────
type OrderItem = { id: string; product: string; variant: string | null; quantity: string; unit_price: string; tax_rate: string };
type Payment = { id: string; method: string; amount: string; status: string; provider: string };
type Order = {
  id: string; status: string; location: string | null; cashier: number | null;
  subtotal: string; tax_total: string; discount_total: string; total: string;
  created_at: string; paid_at: string | null; items: OrderItem[]; payments: Payment[];
};
type Product = { id: string; name: string; sku: string; base_price: string; tax_rate: string | null; category: string | null; product_type: string; is_active: boolean; variants: any[] };
type Category = { id: string; name: string; parent: string | null };
type StockItem = { id: string; product: string; variant: string | null; location: string; quantity_on_hand: string; is_low_stock: boolean };
type StockLocation = { id: string; name: string; is_default: boolean };
type Customer = { id: string; name: string; phone: string; email: string; loyalty_points: number; credit_balance: string; group: string; created_at: string };
type Expense = { id: string; category: string; amount: string; expense_date: string; payment_method: string; status: string; note: string };

// ─── Constants ─────────────────────────────────────────────────────────────
type MainTab = "Reports" | "Analytics";
type ReportModule = "Sales" | "Products" | "Inventory" | "Customers" | "Finance" | "Tax Summary";
type AnalyticsModule = "Sales" | "Products" | "Customers" | "Finance";

const REPORT_MODULES: ReportModule[] = ["Sales", "Products", "Inventory", "Customers", "Finance", "Tax Summary"];
const ANALYTICS_MODULES: AnalyticsModule[] = ["Sales", "Products", "Customers", "Finance"];

const CHART_COLORS = ["#7c3aed", "#10B981", "#F59E0B", "#3B82F6", "#EF4444", "#EC4899", "#0EA5E9", "#8B5CF6"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PAYMENT_LABELS: Record<string, string> = { cash: "Cash", card: "Card", mobile_money: "Mobile Money", other: "Other" };

// ─── Helpers ───────────────────────────────────────────────────────────────
function num(v: unknown): number {
  const n = typeof v === "string" || typeof v === "number" ? parseFloat(String(v)) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function dayKey(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function monthKey(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date(0);
  if (isNaN(d.getTime())) return "";
  return `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

function startOfRange(range: string): Date {
  const now = new Date();
  if (range === "1month") return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  if (range === "6months") return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
  if (range === "1year") return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  return new Date(0);
}

function safeStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function shortId(id: string): string {
  return id ? id.slice(0, 8) : "—";
}

// ─── Reusable UI bits ──────────────────────────────────────────────────────
function StatCard({ label, value, sub, tone = "primary", icon }: {
  label: string; value: string; sub?: string; tone?: "primary" | "green" | "amber" | "red" | "blue"; icon?: React.ReactNode;
}) {
  return (
    <div className={`${styles.statCard} ${styles[`tone-${tone}`]}`}>
      {icon && <div className={styles.statIcon}>{icon}</div>}
      <div>
        <p className={styles.statLabel}>{label}</p>
        <p className={styles.statValue}>{value}</p>
        {sub && <p className={styles.statSub}>{sub}</p>}
      </div>
    </div>
  );
}

function DataTable({ headers, rows, emptyMsg = "No data." }: {
  headers: string[]; rows: React.ReactNode[][]; emptyMsg?: string;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.reportTable}>
        <thead>
          <tr>
            {headers.map((h) => <th key={h}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length}><div className={styles.emptyState}>{emptyMsg}</div></td></tr>
          ) : rows.map((row, i) => (
            <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ message, icon }: { message: string; icon?: React.ReactNode }) {
  return (
    <div className={styles.emptyState} style={{ padding: "48px 16px" }}>
      {icon || <FileText className={styles.emptyIcon} />}
      <p>{message}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls = s === "paid" || s === "active"
    ? "paid" : s === "open" || s === "pending" || s === "settled"
    ? "open" : s === "void" || s === "refunded" || s === "failed"
    ? "danger" : "neutral";
  return <span className={`${styles.badge} ${styles[`badge-${cls}`]}`}>{status}</span>;
}

function SectionHeader({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className={styles.sectionHeader}>
      <div>
        <h3 className={styles.sectionTitle}>{title}</h3>
        {sub && <p className={styles.sectionSub}>{sub}</p>}
      </div>
      {actions && <div className={styles.sectionActions}>{actions}</div>}
    </div>
  );
}

function ExportBtn({ onClick, label = "Export CSV", primary = false }: { onClick: () => void; label?: string; primary?: boolean }) {
  return (
    <button className={`${styles.exportBtn} ${primary ? styles.exportBtnPrimary : ""}`} onClick={onClick}>
      <Download className={styles.exportIcon} /> {label}
    </button>
  );
}

function MainTabBar({ active, onChange }: { active: MainTab; onChange: (t: MainTab) => void }) {
  return (
    <div className={styles.mainTabBar}>
      {(["Reports", "Analytics"] as MainTab[]).map((t) => (
        <button key={t} className={`${styles.mainTabBtn} ${active === t ? styles.mainTabActive : ""}`} onClick={() => onChange(t)}>
          {t === "Reports" ? <FileText className={styles.tabIcon} /> : <BarChart3 className={styles.tabIcon} />}
          {t}
        </button>
      ))}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const router = useRouter();
  const [mainTab, setMainTab] = useState<MainTab>("Reports");
  const [reportModule, setReportModule] = useState<ReportModule>("Sales");
  const [analyticsModule, setAnalyticsModule] = useState<AnalyticsModule>("Sales");
  const [reportSubTab, setReportSubTab] = useState<string>("Sales Register");
  const [analyticsSubTab, setAnalyticsSubTab] = useState<string>("Overview");

  const [range, setRange] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [methodFilter, setMethodFilter] = useState("All");

  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const businessName = getActiveBusinessName();
  const currency = getActiveCurrency();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [o, p, c, s, cust, e] = await Promise.all([
        api.listOrders(),
        api.listProducts(),
        api.listCategories(),
        api.listStockItems(),
        api.listCustomers(),
        api.listExpenses(),
      ]);
      setOrders(o);
      setProducts(p);
      setCategories(c);
      setStockItems(s);
      setCustomers(cust);
      setExpenses(e);
      setLastFetched(new Date());
    } catch (err: any) {
      setError(err.message || "Could not load report data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }
    load();
    const refresh = window.setInterval(load, 30_000);
    return () => window.clearInterval(refresh);
  }, [router, load]);

  function csvDownload(filename: string, rows: string[]) {
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  // ── Derived data ────────────────────────────────────────────────────────
  const start = useMemo(() => startOfRange(range), [range]);
  const todayStr = new Date().toISOString().slice(0, 10);

  const paidOrders = useMemo(() => orders.filter((o) => o.status === "paid"), [orders]);
  const refundedOrders = useMemo(() => orders.filter((o) => o.status === "refunded"), [orders]);
  const todayOrders = useMemo(() => orders.filter((o) => o.created_at.startsWith(todayStr)), [orders, todayStr]);

  const revenue = useMemo(() => paidOrders.reduce((s, o) => s + num(o.total), 0), [paidOrders]);
  const todayRevenue = useMemo(() => todayOrders.reduce((s, o) => s + num(o.total), 0), [todayOrders]);
  const taxCollected = useMemo(() => paidOrders.reduce((s, o) => s + num(o.tax_total), 0), [paidOrders]);
  const discounts = useMemo(() => paidOrders.reduce((s, o) => s + num(o.discount_total), 0), [paidOrders]);
  const refunds = useMemo(() => refundedOrders.reduce((s, o) => s + num(o.total), 0), [refundedOrders]);
  const itemsSold = useMemo(
    () => paidOrders.reduce((s, o) => s + o.items.reduce((t, i) => t + num(i.quantity), 0), 0),
    [paidOrders],
  );
  const avgOrderValue = paidOrders.length ? revenue / paidOrders.length : 0;

  // payment method aggregates (from payments attached to paid orders)
  const paymentBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach((o) => o.payments.forEach((p) => {
      if (o.status === "paid") map[p.method] = (map[p.method] || 0) + num(p.amount);
    }));
    return Object.entries(map).map(([name, value]) => ({ name: PAYMENT_LABELS[name] || name, value })).sort((a, b) => b.value - a.value);
  }, [orders]);

  // product -> stock on hand (summed across all locations)
  const stockByProduct = useMemo(() => {
    const map: Record<string, { onHand: number; low: boolean }> = {};
    stockItems.forEach((si) => {
      const cur = map[si.product] || { onHand: 0, low: false };
      cur.onHand += num(si.quantity_on_hand);
      cur.low = cur.low || si.is_low_stock;
      map[si.product] = cur;
    });
    return map;
  }, [stockItems]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // ── Sales ────────────────────────────────────────────────────────────────
  const filteredOrders = useMemo(() => orders.filter((o) => {
    const paidAt = o.paid_at || o.created_at;
    if (range !== "all") {
      const d = new Date(paidAt);
      if (!isNaN(d.getTime()) && d < start) return false;
    }
    if (statusFilter !== "All" && o.status !== statusFilter.toLowerCase()) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const payLabel = o.payments.map((p) => PAYMENT_LABELS[p.method] || p.method).join(" ").toLowerCase();
      if (!o.id.toLowerCase().includes(q) && !payLabel.includes(q)) return false;
    }
    if (methodFilter !== "All" && !o.payments.some((p) => p.method === methodFilter.toLowerCase())) return false;
    return true;
  }), [orders, range, start, statusFilter, searchQuery, methodFilter]);

  const revenueByDay = useMemo(() => {
    const map: Record<string, number> = {};
    paidOrders.forEach((o) => {
      const k = dayKey(o.paid_at || o.created_at);
      if (k) map[k] = (map[k] || 0) + num(o.total);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([name, value]) => ({ name, value }));
  }, [paidOrders]);

  const revenueByMonth = useMemo(() => {
    const map: Record<string, number> = {};
    paidOrders.forEach((o) => {
      const k = monthKey(o.paid_at || o.created_at);
      if (k) map[k] = (map[k] || 0) + num(o.total);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([name, value]) => ({ name, value }));
  }, [paidOrders]);

  const ordersByStatus = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach((o) => { map[o.status] = (map[o.status] || 0) + 1 });
    return Object.entries(map).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));
  }, [orders]);

  const exportSalesCSV = () => csvDownload("sales-register", [
    "Sales Register",
    "Order ID,Status,Cashier,Items,Subtotal,Tax,Total,Payment,Created",
    ...filteredOrders.map((o) =>
      [shortId(o.id), o.status, o.cashier || "", o.items.reduce((s, i) => s + num(i.quantity), 0),
        num(o.subtotal).toFixed(2), num(o.tax_total).toFixed(2), num(o.total).toFixed(2),
        o.payments.map((p) => PAYMENT_LABELS[p.method] || p.method).join("; "), o.created_at].join(","),
    ),
  ]);

  const exportPaymentsCSV = () => csvDownload("payments-breakdown", [
    "Payments Breakdown",
    "Method,Amount",
    ...paymentBreakdown.map((p) => [p.name, p.value.toFixed(2)].join(",")),
  ]);

  // ── Products & Inventory ────────────────────────────────────────────────
  const filteredProducts = useMemo(() => products.filter((p) => {
    if (statusFilter === "Available" && !p.is_active) return false;
    if (statusFilter === "Inactive" && p.is_active) return false;
    if (categoryFilter !== "All" && p.category !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [products, statusFilter, categoryFilter, searchQuery]);

  const lowStockItems = useMemo(() => stockItems.filter((si) => si.is_low_stock), [stockItems]);
  const outOfStockCount = useMemo(() => stockItems.filter((si) => num(si.quantity_on_hand) <= 0).length, [stockItems]);
  const onHandTotal = useMemo(() => stockItems.reduce((s, si) => s + num(si.quantity_on_hand), 0), [stockItems]);
  const inventoryValue = useMemo(() => {
    let total = 0;
    stockItems.forEach((si) => {
      const p = productById.get(si.product);
      if (p) total += num(si.quantity_on_hand) * num(p.base_price);
    });
    return total;
  }, [stockItems, productById]);

  const productsByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    products.forEach((p) => {
      const c = p.category ? categoryById.get(p.category)?.name || p.category : "Uncategorised";
      map[c] = (map[c] || 0) + 1;
    });
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [products, categoryById]);

  const categoryOptions = useMemo(() =>
    categories.filter((c) => !c.parent).map((c) => ({ id: c.id, name: c.name })),
  [categories]);

  const exportProductsCSV = () => csvDownload("product-register", [
    "Product Register",
    "Name,SKU,Category,Base Price,Tax Rate,Stock On Hand,Active",
    ...filteredProducts.map((p) => {
      const st = stockByProduct[p.id];
      return [p.name, p.sku, categoryById.get(p.category || "")?.name || "Uncategorised",
        num(p.base_price).toFixed(2), num(p.tax_rate).toFixed(2), st ? st.onHand : 0, p.is_active ? "Yes" : "No"].join(",");
    }),
  ]);

  const exportStockCSV = () => csvDownload("stock-status", [
    "Stock Status",
    "Product,Stock On Hand,Low Stock Threshold,Status",
    ...stockItems.map((si) => {
      const p = productById.get(si.product);
      return [p?.name || si.product, num(si.quantity_on_hand), "", si.is_low_stock ? "Low" : "OK"].join(",");
    }),
  ]);

  // ── Customers ────────────────────────────────────────────────────────────
  const filteredCustomers = useMemo(() => customers.filter((c) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!c.name.toLowerCase().includes(q) && !c.email.toLowerCase().includes(q) && !c.phone.includes(q)) return false;
    }
    return true;
  }), [customers, searchQuery]);

  const customersByGroup = useMemo(() => {
    const map: Record<string, number> = {};
    customers.forEach((c) => { map[c.group] = (map[c.group] || 0) + 1 });
    return Object.entries(map).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));
  }, [customers]);

  const topCustomers = useMemo(() =>
    [...customers].sort((a, b) => num(b.credit_balance) - num(a.credit_balance) || b.loyalty_points - a.loyalty_points).slice(0, 8),
  [customers]);

  const exportCustomersCSV = () => csvDownload("customer-register", [
    "Customer Register",
    "Name,Phone,Email,Group,Loyalty Points,Credit Balance,Created",
    ...filteredCustomers.map((c) =>
      [c.name, c.phone, c.email, c.group, c.loyalty_points, num(c.credit_balance).toFixed(2), c.created_at].join(","),
    ),
  ]);

  // ── Finance ──────────────────────────────────────────────────────────────
  const filteredExpenses = useMemo(() => expenses.filter((e) => {
    const d = new Date(e.expense_date);
    if (isNaN(d.getTime())) return false;
    if (range !== "all" && d < start) return false;
    if (searchQuery && !e.category.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }), [expenses, range, start, searchQuery]);

  const expenseTotal = useMemo(() => filteredExpenses.reduce((s, e) => s + num(e.amount), 0), [filteredExpenses]);
  const netProfit = revenue - expenseTotal;

  const expensesByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filteredExpenses.forEach((e) => { map[e.category] = (map[e.category] || 0) + num(e.amount) });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [filteredExpenses]);

  const financeTrend = useMemo(() => {
    const map: Record<string, { name: string; revenue: number; expenses: number }> = {};
    paidOrders.forEach((o) => {
      const k = monthKey(o.paid_at || o.created_at);
      if (!k) return;
      map[k] = map[k] || { name: k, revenue: 0, expenses: 0 };
      map[k].revenue += num(o.total);
    });
    filteredExpenses.forEach((e) => {
      const k = monthKey(e.expense_date);
      if (!k) return;
      map[k] = map[k] || { name: k, revenue: 0, expenses: 0 };
      map[k].expenses += num(e.amount);
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [paidOrders, filteredExpenses]);

  const exportRevenueCSV = () => csvDownload("revenue-register", [
    "Revenue Register",
    "Order ID,Date,Items,Subtotal,Tax,Total,Payment",
    ...paidOrders.map((o) =>
      [shortId(o.id), dayKey(o.paid_at || o.created_at), o.items.reduce((s, i) => s + num(i.quantity), 0),
        num(o.subtotal).toFixed(2), num(o.tax_total).toFixed(2), num(o.total).toFixed(2),
        o.payments.map((p) => PAYMENT_LABELS[p.method] || p.method).join("; ")].join(","),
    ),
  ]);

  const exportExpensesCSV = () => csvDownload("expense-report", [
    "Expense Report",
    "ID,Category,Amount,Date,Status,Note",
    ...filteredExpenses.map((e) =>
      [shortId(e.id), e.category, num(e.amount).toFixed(2), e.expense_date, e.status, `"${e.note || ""}"`].join(","),
    ),
  ]);

  const exportProfitLossCSV = () => csvDownload("profit-loss", [
    "Profit & Loss",
    "Metric,Amount",
    `Revenue (Paid Orders),${revenue.toFixed(2)}`,
    `Refunds,${refunds.toFixed(2)}`,
    `Expenses,${expenseTotal.toFixed(2)}`,
    `Net Profit / Loss,${netProfit.toFixed(2)}`,
  ]);

  const exportTaxCSV = () => csvDownload("tax-summary", [
    "Tax Summary",
    "Metric,Amount",
    `Tax Collected,${taxCollected.toFixed(2)}`,
    `Gross Revenue,${revenue.toFixed(2)}`,
    `Effective Tax Rate,${revenue ? ((taxCollected / revenue) * 100).toFixed(2) : 0}%`,
  ]);

  // ── Sales analytics derivations ─────────────────────────────────────────
  const salesByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    paidOrders.forEach((o) => o.items.forEach((it) => {
      const p = productById.get(it.product);
      if (!p) return;
      const cat = p.category ? categoryById.get(p.category)?.name || p.category : "Uncategorised";
      map[cat] = (map[cat] || 0) + num(it.unit_price) * num(it.quantity);
    }));
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [paidOrders, productById, categoryById]);

  const topProducts = useMemo(() => {
    const map: Record<string, { name: string; value: number; qty: number }> = {};
    paidOrders.forEach((o) => o.items.forEach((it) => {
      const p = productById.get(it.product);
      const name = p?.name || it.product;
      const cur = map[name] || { name, value: 0, qty: 0 };
      cur.value += num(it.unit_price) * num(it.quantity);
      cur.qty += num(it.quantity);
      map[name] = cur;
    }));
    return Object.values(map).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [paidOrders, productById]);

  // ── RENDERERS ────────────────────────────────────────────────────────────
  const m = (v: number) => formatMoney(v, currency);

  const renderReports = () => {
    switch (reportModule) {
      case "Sales":
        return (
          <section className={styles.section}>
            <div className={styles.subTabBar}>
              {["Sales Register", "Today's Sales", "Payments"].map((t) => (
                <button key={t} className={`${styles.subTabBtn} ${reportSubTab === t ? styles.subTabActive : ""}`} onClick={() => setReportSubTab(t)}>{t}</button>
              ))}
            </div>

            {reportSubTab === "Sales Register" && (
              <div className={styles.contentStack}>
                <div className={styles.filterBar}>
                  <div className={styles.searchBox}>
                    <Search className={styles.searchIcon} />
                    <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by order # or payment..." />
                  </div>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="All">All Status</option>
                    <option value="Open">Open</option>
                    <option value="Paid">Paid</option>
                    <option value="Void">Cancelled</option>
                    <option value="Refunded">Refunded</option>
                  </select>
                  <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
                    <option value="All">All Payments</option>
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="Mobile Money">Mobile Money</option>
                    <option value="Other">Other</option>
                  </select>
                  <div className={styles.filterActions}><ExportBtn onClick={exportSalesCSV} label="Export" primary /></div>
                </div>

                <div className={styles.statGrid}>
                  <StatCard label="Total Revenue" value={m(revenue)} sub={`${paidOrders.length} paid orders`} icon={<DollarSign className={styles.statSvg} />} />
                  <StatCard label="Today's Sales" value={m(todayRevenue)} sub={`${todayOrders.filter((o) => o.status === "paid").length} paid today`} tone="green" icon={<TrendingUp className={styles.statSvg} />} />
                  <StatCard label="Avg Order Value" value={m(avgOrderValue)} tone="blue" icon={<Wallet className={styles.statSvg} />} />
                  <StatCard label="Items Sold" value={String(Math.round(itemsSold))} tone="amber" icon={<Package className={styles.statSvg} />} />
                </div>

                <DataTable
                  headers={["ORDER", "STATUS", "CASHIER", "ITEMS", "SUBTOTAL", "TAX", "TOTAL", "PAYMENT", "CREATED"]}
                  emptyMsg="No orders match the current filters."
                  rows={filteredOrders.slice(0, 40).map((o) => [
                    <span className={styles.mono} key="id">{shortId(o.id)}</span>,
                    <StatusBadge key="st" status={o.status} />,
                    <span key="ca">{o.cashier || "—"}</span>,
                    <span key="it">{o.items.reduce((s, i) => s + num(i.quantity), 0)}</span>,
                    <span key="su">{m(num(o.subtotal))}</span>,
                    <span key="tx">{m(num(o.tax_total))}</span>,
                    <span className={styles.strong} key="to">{m(num(o.total))}</span>,
                    <span key="pm">{o.payments.map((p) => PAYMENT_LABELS[p.method] || p.method).join(", ") || "—"}</span>,
                    <span className={styles.muted} key="cr">{new Date(o.created_at).toLocaleString()}</span>,
                  ])}
                />
              </div>
            )}

            {reportSubTab === "Today's Sales" && (
              <div className={styles.contentStack}>
                <div className={styles.infoBanner}>
                  <Clock className={styles.infoIcon} /> Today's performance, updated live.
                </div>
                <div className={styles.statGrid}>
                  <StatCard label="Orders Today" value={String(todayOrders.length)} icon={<Receipt className={styles.statSvg} />} />
                  <StatCard label="Revenue Today" value={m(todayRevenue)} tone="green" icon={<DollarSign className={styles.statSvg} />} />
                  <StatCard label="Avg Order Value" value={m(todayOrders.length ? todayRevenue / todayOrders.length : 0)} tone="blue" icon={<Wallet className={styles.statSvg} />} />
                  <StatCard label="Items Today" value={String(Math.round(todayOrders.reduce((s, o) => s + o.items.reduce((t, i) => t + num(i.quantity), 0), 0)))} tone="amber" icon={<Package className={styles.statSvg} />} />
                </div>
                <DataTable
                  headers={["ORDER", "STATUS", "ITEMS", "SUBTOTAL", "TAX", "TOTAL", "PAYMENT", "TIME"]}
                  emptyMsg="No sales recorded today yet."
                  rows={todayOrders.map((o) => [
                    <span className={styles.mono} key="id">{shortId(o.id)}</span>,
                    <StatusBadge key="st" status={o.status} />,
                    <span key="it">{o.items.reduce((s, i) => s + num(i.quantity), 0)}</span>,
                    <span key="su">{m(num(o.subtotal))}</span>,
                    <span key="tx">{m(num(o.tax_total))}</span>,
                    <span className={styles.strong} key="to">{m(num(o.total))}</span>,
                    <span key="pm">{o.payments.map((p) => PAYMENT_LABELS[p.method] || p.method).join(", ") || "—"}</span>,
                    <span className={styles.muted} key="tm">{new Date(o.created_at).toLocaleTimeString()}</span>,
                  ])}
                />
              </div>
            )}

            {reportSubTab === "Payments" && (
              <div className={styles.contentStack}>
                <SectionHeader title="Payments Breakdown" sub="Collected amounts by payment method" actions={<ExportBtn onClick={exportPaymentsCSV} />} />
                <div className={styles.statGrid}>
                  <StatCard label="Card" value={m(paymentBreakdown.find((p) => p.name === "Card")?.value || 0)} tone="blue" icon={<CreditCard className={styles.statSvg} />} />
                  <StatCard label="Cash" value={m(paymentBreakdown.find((p) => p.name === "Cash")?.value || 0)} tone="green" icon={<Banknote className={styles.statSvg} />} />
                  <StatCard label="Mobile Money" value={m(paymentBreakdown.find((p) => p.name === "Mobile Money")?.value || 0)} tone="amber" icon={<Smartphone className={styles.statSvg} />} />
                  <StatCard label="Other" value={m(paymentBreakdown.find((p) => p.name === "Other")?.value || 0)} tone="red" icon={<Wallet className={styles.statSvg} />} />
                </div>
                <div className={styles.chartGrid}>
                  <div className={styles.chartCard}>
                    <h4 className={styles.chartTitle}>Revenue by Payment Method</h4>
                    <div className={styles.chartBody}>
                      {paymentBreakdown.length === 0 ? <EmptyState message="No payment data yet." /> : (
                        <ResponsiveContainer width="100%" height={260}>
                          <PieChart>
                            <Pie data={paymentBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                              label={({ name, percent }) => `${name} ${Math.round((percent || 0) * 100)}%`} labelLine={false}>
                              {paymentBreakdown.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(v: any) => m(Number(v))} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                  <div className={styles.chartCard}>
                    <h4 className={styles.chartTitle}>Method Summary</h4>
                    <div className={styles.chartBody}>
                      <DataTable
                        headers={["METHOD", "AMOUNT", "SHARE"]}
                        emptyMsg="No payments recorded."
                        rows={paymentBreakdown.map((p) => [
                          <span key="n">{p.name}</span>,
                          <span className={styles.strong} key="v">{m(p.value)}</span>,
                          <span key="s">{revenue ? Math.round((p.value / revenue) * 100) : 0}%</span>,
                        ])}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        );

      case "Products":
        return (
          <section className={styles.section}>
            <div className={styles.subTabBar}>
              {["Product Register", "By Category"].map((t) => (
                <button key={t} className={`${styles.subTabBtn} ${reportSubTab === t ? styles.subTabActive : ""}`} onClick={() => setReportSubTab(t)}>{t}</button>
              ))}
            </div>

            {reportSubTab === "Product Register" && (
              <div className={styles.contentStack}>
                <div className={styles.filterBar}>
                  <div className={styles.searchBox}>
                    <Search className={styles.searchIcon} />
                    <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search products by name or SKU..." />
                  </div>
                  <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                    <option value="All">All Categories</option>
                    {categoryOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="All">All Status</option>
                    <option value="Available">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                  <div className={styles.filterActions}><ExportBtn onClick={exportProductsCSV} label="Export" primary /></div>
                </div>

                <div className={styles.statGrid}>
                  <StatCard label="Total Products" value={String(products.length)} icon={<Package className={styles.statSvg} />} />
                  <StatCard label="Active Products" value={String(products.filter((p) => p.is_active).length)} tone="green" icon={<CheckCircle2 className={styles.statSvg} />} />
                  <StatCard label="With Variants" value={String(products.filter((p) => p.variants.length > 0).length)} tone="blue" icon={<LayersIcon />} />
                  <StatCard label="Categories" value={String(categories.length)} tone="amber" icon={<Boxes className={styles.statSvg} />} />
                </div>

                <DataTable
                  headers={["NAME", "SKU", "CATEGORY", "BASE PRICE", "TAX RATE", "ON HAND", "STATUS"]}
                  emptyMsg="No products match the current filters."
                  rows={filteredProducts.slice(0, 40).map((p) => {
                    const st = stockByProduct[p.id];
                    return [
                      <span className={styles.strong} key="n">{p.name}</span>,
                      <span className={styles.mono} key="s">{p.sku || "—"}</span>,
                      <span key="c">{categoryById.get(p.category || "")?.name || "Uncategorised"}</span>,
                      <span key="pr">{m(num(p.base_price))}</span>,
                      <span key="tx">{num(p.tax_rate)}%</span>,
                      <span className={st && st.low ? styles.warn : ""} key="oh">{st ? st.onHand : 0}</span>,
                      <StatusBadge key="st" status={p.is_active ? "Active" : "Inactive"} />,
                    ];
                  })}
                />
              </div>
            )}

            {reportSubTab === "By Category" && (
              <div className={styles.contentStack}>
                <SectionHeader title="Products by Category" sub="Count of products per category" actions={<ExportBtn onClick={exportProductsCSV} />} />
                <div className={styles.chartGrid}>
                  <div className={styles.chartCard}>
                    <div className={styles.chartBody}>
                      {productsByCategory.length === 0 ? <EmptyState message="No products yet." /> : (
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={productsByCategory}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                            <Tooltip />
                            <Bar dataKey="count" fill="#7c3aed" radius={[6, 6, 0, 0]} name="Products" />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                  <div className={styles.chartCard}>
                    <div className={styles.chartBody}>
                      <DataTable
                        headers={["CATEGORY", "PRODUCTS"]}
                        emptyMsg="No products yet."
                        rows={productsByCategory.map((c) => [
                          <span key="n">{c.name}</span>,
                          <span className={styles.strong} key="v">{c.count}</span>,
                        ])}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        );

      case "Inventory":
        return (
          <section className={styles.section}>
            <div className={styles.subTabBar}>
              {["Stock Status", "Low Stock", "Inventory Valuation"].map((t) => (
                <button key={t} className={`${styles.subTabBtn} ${reportSubTab === t ? styles.subTabActive : ""}`} onClick={() => setReportSubTab(t)}>{t}</button>
              ))}
            </div>

            <div className={styles.contentStack}>
              <div className={styles.statGrid}>
                <StatCard label="Units On Hand" value={String(Math.round(onHandTotal))} icon={<Boxes className={styles.statSvg} />} />
                <StatCard label="Low Stock Items" value={String(lowStockItems.length)} tone="amber" icon={<AlertCircle className={styles.statSvg} />} />
                <StatCard label="Out of Stock" value={String(outOfStockCount)} tone="red" icon={<AlertCircle className={styles.statSvg} />} />
                <StatCard label="Inventory Value" value={m(inventoryValue)} tone="green" icon={<DollarSign className={styles.statSvg} />} />
              </div>

              {reportSubTab === "Stock Status" && (
                <>
                  <SectionHeader title="Stock Status" sub="On-hand quantities across all locations" actions={<ExportBtn onClick={exportStockCSV} />} />
                  <DataTable
                    headers={["PRODUCT", "LOCATION", "ON HAND", "STATUS"]}
                    emptyMsg="No stock items found."
                    rows={stockItems.slice(0, 40).map((si) => {
                      const p = productById.get(si.product);
                      return [
                        <span className={styles.strong} key="n">{p?.name || si.product}</span>,
                        <span className={styles.muted} key="l">{shortId(si.location)}</span>,
                        <span key="q">{num(si.quantity_on_hand)}</span>,
                        <StatusBadge key="s" status={num(si.quantity_on_hand) <= 0 ? "Out of Stock" : si.is_low_stock ? "Low Stock" : "In Stock"} />,
                      ];
                    })}
                  />
                </>
              )}

              {reportSubTab === "Low Stock" && (
                <>
                  <SectionHeader title="Low Stock" sub="Items at or below their low-stock threshold" actions={<ExportBtn onClick={exportStockCSV} />} />
                  {lowStockItems.length === 0 ? (
                    <EmptyState message="No low stock items — everything looks healthy." icon={<CheckCircle2 className={styles.emptyIcon} />} />
                  ) : (
                    <DataTable
                      headers={["PRODUCT", "ON HAND", "STATUS"]}
                      rows={lowStockItems.map((si) => {
                        const p = productById.get(si.product);
                        return [
                          <span className={styles.strong} key="n">{p?.name || si.product}</span>,
                          <span key="q">{num(si.quantity_on_hand)}</span>,
                          <StatusBadge key="s" status="Low Stock" />,
                        ];
                      })}
                    />
                  )}
                </>
              )}

              {reportSubTab === "Inventory Valuation" && (
                <>
                  <SectionHeader title="Inventory Valuation" sub="On-hand value at current base price" actions={<ExportBtn onClick={exportStockCSV} />} />
                  <DataTable
                    headers={["PRODUCT", "BASE PRICE", "ON HAND", "VALUE"]}
                    emptyMsg="No stock to value."
                    rows={stockItems.slice(0, 40).map((si) => {
                      const p = productById.get(si.product);
                      const val = p ? num(si.quantity_on_hand) * num(p.base_price) : 0;
                      return [
                        <span className={styles.strong} key="n">{p?.name || si.product}</span>,
                        <span key="pr">{m(num(p?.base_price))}</span>,
                        <span key="q">{num(si.quantity_on_hand)}</span>,
                        <span className={styles.strong} key="v">{m(val)}</span>,
                      ];
                    })}
                  />
                </>
              )}
            </div>
          </section>
        );

      case "Customers":
        return (
          <section className={styles.section}>
            <div className={styles.subTabBar}>
              {["Customer Register", "Customer Groups"].map((t) => (
                <button key={t} className={`${styles.subTabBtn} ${reportSubTab === t ? styles.subTabActive : ""}`} onClick={() => setReportSubTab(t)}>{t}</button>
              ))}
            </div>

            <div className={styles.contentStack}>
              <div className={styles.filterBar}>
                <div className={styles.searchBox}>
                  <Search className={styles.searchIcon} />
                  <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by name, phone or email..." />
                </div>
                <div className={styles.filterActions}><ExportBtn onClick={exportCustomersCSV} label="Export" primary /></div>
              </div>

              <div className={styles.statGrid}>
                <StatCard label="Total Customers" value={String(customers.length)} icon={<Users className={styles.statSvg} />} />
                <StatCard label="VIP" value={String(customers.filter((c) => c.group === "vip").length)} tone="amber" icon={<Percent className={styles.statSvg} />} />
                <StatCard label="Loyalty" value={String(customers.filter((c) => c.group === "loyalty").length)} tone="green" icon={<TrendingUp className={styles.statSvg} />} />
                <StatCard label="Loyalty Points" value={String(customers.reduce((s, c) => s + c.loyalty_points, 0))} tone="blue" icon={<Users className={styles.statSvg} />} />
              </div>

              {reportSubTab === "Customer Register" && (
                <>
                  <SectionHeader title="Customer Register" sub="All customers in this business" />
                  <DataTable
                    headers={["NAME", "PHONE", "EMAIL", "GROUP", "LOYALTY POINTS", "CREDIT BALANCE", "CREATED"]}
                    emptyMsg="No customers match the current filters."
                    rows={filteredCustomers.slice(0, 40).map((c) => [
                      <span className={styles.strong} key="n">{c.name}</span>,
                      <span key="p">{c.phone || "—"}</span>,
                      <span className={styles.muted} key="e">{c.email || "—"}</span>,
                      <StatusBadge key="g" status={c.group.charAt(0).toUpperCase() + c.group.slice(1)} />,
                      <span key="l">{c.loyalty_points}</span>,
                      <span key="cr">{m(num(c.credit_balance))}</span>,
                      <span className={styles.muted} key="d">{dayKey(c.created_at)}</span>,
                    ])}
                  />
                </>
              )}

              {reportSubTab === "Customer Groups" && (
                <div className={styles.chartGrid}>
                  <div className={styles.chartCard}>
                    <h4 className={styles.chartTitle}>Customers by Group</h4>
                    <div className={styles.chartBody}>
                      {customersByGroup.length === 0 ? <EmptyState message="No customer data yet." /> : (
                        <ResponsiveContainer width="100%" height={280}>
                          <PieChart>
                            <Pie data={customersByGroup} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                              label={({ name, percent }) => `${name} ${Math.round((percent || 0) * 100)}%`} labelLine={false}>
                              {customersByGroup.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Pie>
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                  <div className={styles.chartCard}>
                    <h4 className={styles.chartTitle}>Top Customers by Credit</h4>
                    <div className={styles.chartBody}>
                      {topCustomers.length === 0 ? <EmptyState message="No customers yet." /> : (
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={topCustomers.map((c) => ({ name: c.name, credit: num(c.credit_balance) }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} height={50} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                            <Tooltip formatter={(v: any) => m(Number(v))} />
                            <Bar dataKey="credit" fill="#7c3aed" radius={[6, 6, 0, 0]} name="Credit Balance" />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        );

      case "Finance":
        return (
          <section className={styles.section}>
            <div className={styles.subTabBar}>
              {["Revenue Register", "Expense Register", "Profit & Loss"].map((t) => (
                <button key={t} className={`${styles.subTabBtn} ${reportSubTab === t ? styles.subTabActive : ""}`} onClick={() => setReportSubTab(t)}>{t}</button>
              ))}
            </div>

            <div className={styles.filterBar}>
              <select value={range} onChange={(e) => setRange(e.target.value)}>
                <option value="all">All Time</option>
                <option value="1month">Past 1 Month</option>
                <option value="6months">Past 6 Months</option>
                <option value="1year">Past 1 Year</option>
              </select>
              <div className={styles.filterActions}>
                {reportSubTab === "Revenue Register" && <ExportBtn onClick={exportRevenueCSV} />}
                {reportSubTab === "Expense Register" && <ExportBtn onClick={exportExpensesCSV} />}
                {reportSubTab === "Profit & Loss" && <ExportBtn onClick={exportProfitLossCSV} />}
              </div>
            </div>

            {reportSubTab === "Revenue Register" && (
              <div className={styles.contentStack}>
                <div className={styles.statGrid}>
                  <StatCard label="Revenue" value={m(revenue)} sub="from paid orders" icon={<DollarSign className={styles.statSvg} />} />
                  <StatCard label="Refunds" value={m(refunds)} tone="red" icon={<Receipt className={styles.statSvg} />} />
                  <StatCard label="Discounts Given" value={m(discounts)} tone="amber" icon={<Percent className={styles.statSvg} />} />
                  <StatCard label="Tax Collected" value={m(taxCollected)} tone="blue" icon={<BarChart3 className={styles.statSvg} />} />
                </div>
                <DataTable
                  headers={["ORDER", "DATE", "ITEMS", "SUBTOTAL", "TAX", "TOTAL", "PAYMENT"]}
                  emptyMsg="No paid orders in this period."
                  rows={paidOrders.slice(0, 40).map((o) => [
                    <span className={styles.mono} key="id">{shortId(o.id)}</span>,
                    <span key="d">{dayKey(o.paid_at || o.created_at)}</span>,
                    <span key="it">{o.items.reduce((s, i) => s + num(i.quantity), 0)}</span>,
                    <span key="su">{m(num(o.subtotal))}</span>,
                    <span key="tx">{m(num(o.tax_total))}</span>,
                    <span className={styles.strong} key="to">{m(num(o.total))}</span>,
                    <span key="pm">{o.payments.map((p) => PAYMENT_LABELS[p.method] || p.method).join(", ") || "—"}</span>,
                  ])}
                />
              </div>
            )}

            {reportSubTab === "Expense Register" && (
              <div className={styles.contentStack}>
                <div className={styles.statGrid}>
                  <StatCard label="Total Expenses" value={m(expenseTotal)} tone="red" icon={<Receipt className={styles.statSvg} />} />
                  <StatCard label="Expense Records" value={String(filteredExpenses.length)} tone="blue" icon={<FileText className={styles.statSvg} />} />
                  <StatCard label="Avg Expense" value={m(filteredExpenses.length ? expenseTotal / filteredExpenses.length : 0)} tone="amber" icon={<BarChart3 className={styles.statSvg} />} />
                </div>
                <div className={styles.chartGrid}>
                  <div className={styles.chartCard}>
                    <h4 className={styles.chartTitle}>Expenses by Category</h4>
                    <div className={styles.chartBody}>
                      {expensesByCategory.length === 0 ? <EmptyState message="No expenses in this period." /> : (
                        <ResponsiveContainer width="100%" height={260}>
                          <PieChart>
                            <Pie data={expensesByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                              label={({ name, percent }) => `${name} ${Math.round((percent || 0) * 100)}%`} labelLine={false}>
                              {expensesByCategory.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(v: any) => m(Number(v))} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                  <div className={styles.chartCard}>
                    <div className={styles.chartBody}>
                      <DataTable
                        headers={["CATEGORY", "AMOUNT", "SHARE"]}
                        emptyMsg="No expenses yet."
                        rows={expensesByCategory.map((e) => [
                          <span key="n">{e.name}</span>,
                          <span className={styles.strong} key="v">{m(e.value)}</span>,
                          <span key="s">{expenseTotal ? Math.round((e.value / expenseTotal) * 100) : 0}%</span>,
                        ])}
                      />
                    </div>
                  </div>
                </div>
                <DataTable
                  headers={["EXPENSE", "CATEGORY", "AMOUNT", "DATE", "STATUS", "NOTE"]}
                  emptyMsg="No expenses match the current filters."
                  rows={filteredExpenses.slice(0, 40).map((e) => [
                    <span className={styles.mono} key="id">{shortId(e.id)}</span>,
                    <span key="c">{e.category}</span>,
                    <span className={styles.strong} key="a">{m(num(e.amount))}</span>,
                    <span className={styles.muted} key="d">{dayKey(e.expense_date)}</span>,
                    <StatusBadge key="s" status={e.status} />,
                    <span className={styles.muted} key="n">{e.note || "—"}</span>,
                  ])}
                />
              </div>
            )}

            {reportSubTab === "Profit & Loss" && (
              <div className={styles.contentStack}>
                <div className={styles.infoBanner}>
                  Net Profit = Revenue (paid orders) − Refunds − Expenses
                </div>
                <div className={styles.chartGrid}>
                  <div className={styles.chartCard}>
                    <h4 className={styles.chartTitle}>Profit &amp; Loss</h4>
                    <div className={styles.chartBody}>
                      <div className={styles.plRow}><span>Revenue</span><span>{m(revenue)}</span></div>
                      <div className={styles.plRow}><span>Refunds</span><span className={styles.neg}>{m(refunds)}</span></div>
                      <div className={styles.plRow}><span>Expenses</span><span className={styles.neg}>{m(expenseTotal)}</span></div>
                      <div className={`${styles.plRow} ${styles.plTotal}`}>
                        <span>Net Profit / Loss</span>
                        <span className={netProfit >= 0 ? styles.pos : styles.neg}>{m(netProfit)}</span>
                      </div>
                    </div>
                  </div>
                  <div className={styles.chartCard}>
                    <h4 className={styles.chartTitle}>Revenue vs Expenses (monthly)</h4>
                    <div className={styles.chartBody}>
                      {financeTrend.length === 0 ? <EmptyState message="No financial data yet." /> : (
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={financeTrend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                            <Tooltip formatter={(v: any) => m(Number(v))} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar dataKey="revenue" fill="#7c3aed" radius={[6, 6, 0, 0]} name="Revenue" />
                            <Bar dataKey="expenses" fill="#EF4444" radius={[6, 6, 0, 0]} name="Expenses" />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        );

      case "Tax Summary":
        return (
          <section className={styles.section}>
            <SectionHeader title="Tax Summary" sub="Tax collected on paid orders" actions={<ExportBtn onClick={exportTaxCSV} label="Export CSV" primary />} />
            <div className={styles.statGrid}>
              <StatCard label="Tax Collected" value={m(taxCollected)} icon={<BarChart3 className={styles.statSvg} />} />
              <StatCard label="Gross Revenue" value={m(revenue)} tone="green" icon={<DollarSign className={styles.statSvg} />} />
              <StatCard label="Effective Tax Rate" value={`${revenue ? ((taxCollected / revenue) * 100).toFixed(2) : 0}%`} tone="amber" icon={<Percent className={styles.statSvg} />} />
              <StatCard label="Net of Tax" value={m(revenue - taxCollected)} tone="blue" icon={<Wallet className={styles.statSvg} />} />
            </div>
            <DataTable
              headers={["ORDER", "DATE", "SUBTOTAL", "TAX RATE(S)", "TAX AMOUNT", "TOTAL"]}
              emptyMsg="No tax collected yet."
              rows={paidOrders.slice(0, 40).map((o) => {
                const rates = Array.from(new Set(o.items.map((i) => num(i.tax_rate))));
                return [
                  <span className={styles.mono} key="id">{shortId(o.id)}</span>,
                  <span key="d">{dayKey(o.paid_at || o.created_at)}</span>,
                  <span key="su">{m(num(o.subtotal))}</span>,
                  <span key="r">{rates.join(", ") || "0"}%</span>,
                  <span className={styles.strong} key="tx">{m(num(o.tax_total))}</span>,
                  <span className={styles.strong} key="to">{m(num(o.total))}</span>,
                ];
              })}
            />
          </section>
        );

      default:
        return null;
    }
  };

  const renderAnalytics = () => {
    switch (analyticsModule) {
      case "Sales":
        return (
          <section className={styles.section}>
            <div className={styles.subTabBar}>
              {["Overview", "Trends"].map((t) => (
                <button key={t} className={`${styles.subTabBtn} ${analyticsSubTab === t ? styles.subTabActive : ""}`} onClick={() => setAnalyticsSubTab(t)}>{t}</button>
              ))}
            </div>

            {analyticsSubTab === "Overview" && (
              <div className={styles.contentStack}>
                <div className={styles.statGrid}>
                  <StatCard label="Total Revenue" value={m(revenue)} sub={`${paidOrders.length} paid orders`} icon={<DollarSign className={styles.statSvg} />} />
                  <StatCard label="Orders" value={String(orders.length)} icon={<Receipt className={styles.statSvg} />} />
                  <StatCard label="Avg Order Value" value={m(avgOrderValue)} tone="blue" icon={<Wallet className={styles.statSvg} />} />
                  <StatCard label="Refunds" value={m(refunds)} tone="red" icon={<Receipt className={styles.statSvg} />} />
                </div>
                <div className={styles.chartGrid}>
                  <div className={styles.chartCard}>
                    <h4 className={styles.chartTitle}>Revenue by Day</h4>
                    <div className={styles.chartBody}>
                      {revenueByDay.length === 0 ? <EmptyState message="No sales yet." /> : (
                        <ResponsiveContainer width="100%" height={260}>
                          <AreaChart data={revenueByDay.slice(-30)}>
                            <defs>
                              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                            <Tooltip formatter={(v: any) => m(Number(v))} />
                            <Area type="monotone" dataKey="value" stroke="#7c3aed" fill="url(#revGrad)" strokeWidth={2} name="Revenue" />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                  <div className={styles.chartCard}>
                    <h4 className={styles.chartTitle}>Orders by Status</h4>
                    <div className={styles.chartBody}>
                      {ordersByStatus.length === 0 ? <EmptyState message="No orders yet." /> : (
                        <ResponsiveContainer width="100%" height={260}>
                          <PieChart>
                            <Pie data={ordersByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                              label={({ name, percent }) => `${name} ${Math.round((percent || 0) * 100)}%`} labelLine={false}>
                              {ordersByStatus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Pie>
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {analyticsSubTab === "Trends" && (
              <div className={styles.contentStack}>
                <div className={styles.chartCard} style={{ width: "100%" }}>
                  <h4 className={styles.chartTitle}>Revenue Trend</h4>
                  <div className={styles.chartBody}>
                    {revenueByMonth.length === 0 ? <EmptyState message="No sales data yet." /> : (
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={revenueByMonth}>
                          <defs>
                            <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                          <Tooltip formatter={(v: any) => m(Number(v))} />
                          <Area type="monotone" dataKey="value" stroke="#7c3aed" fill="url(#trendGrad)" strokeWidth={2} name="Revenue" />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        );

      case "Products":
        return (
          <section className={styles.section}>
            <div className={styles.subTabBar}>
              {["Overview", "Top Products"].map((t) => (
                <button key={t} className={`${styles.subTabBtn} ${analyticsSubTab === t ? styles.subTabActive : ""}`} onClick={() => setAnalyticsSubTab(t)}>{t}</button>
              ))}
            </div>

            {analyticsSubTab === "Overview" && (
              <div className={styles.contentStack}>
                <div className={styles.statGrid}>
                  <StatCard label="Total Products" value={String(products.length)} icon={<Package className={styles.statSvg} />} />
                  <StatCard label="Categories" value={String(categories.length)} tone="amber" icon={<Boxes className={styles.statSvg} />} />
                  <StatCard label="Units On Hand" value={String(Math.round(onHandTotal))} tone="blue" icon={<Boxes className={styles.statSvg} />} />
                  <StatCard label="Inventory Value" value={m(inventoryValue)} tone="green" icon={<DollarSign className={styles.statSvg} />} />
                </div>
                <div className={styles.chartGrid}>
                  <div className={styles.chartCard}>
                    <h4 className={styles.chartTitle}>Revenue by Category</h4>
                    <div className={styles.chartBody}>
                      {salesByCategory.length === 0 ? <EmptyState message="No sales yet." /> : (
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={salesByCategory}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} height={55} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                            <Tooltip formatter={(v: any) => m(Number(v))} />
                            <Bar dataKey="value" radius={[6, 6, 0, 0]} name="Revenue">
                              {salesByCategory.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                  <div className={styles.chartCard}>
                    <h4 className={styles.chartTitle}>Category Performance</h4>
                    <div className={styles.chartBody}>
                      <DataTable
                        headers={["CATEGORY", "REVENUE", "SHARE"]}
                        emptyMsg="No sales yet."
                        rows={salesByCategory.map((c) => [
                          <span key="n">{c.name}</span>,
                          <span className={styles.strong} key="v">{m(c.value)}</span>,
                          <span key="s">{revenue ? Math.round((c.value / revenue) * 100) : 0}%</span>,
                        ])}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {analyticsSubTab === "Top Products" && (
              <div className={styles.contentStack}>
                <div className={styles.chartCard} style={{ width: "100%" }}>
                  <h4 className={styles.chartTitle}>Top Products by Revenue</h4>
                  <div className={styles.chartBody}>
                    {topProducts.length === 0 ? <EmptyState message="No sales yet." /> : (
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={topProducts} layout="vertical" margin={{ left: 30 }}>
                          <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border-soft)" />
                          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                          <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={130} />
                          <Tooltip formatter={(v: any) => m(Number(v))} />
                          <Bar dataKey="value" radius={[0, 6, 6, 0]} name="Revenue">
                            {topProducts.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
                <DataTable
                  headers={["PRODUCT", "QTY SOLD", "REVENUE", "SHARE"]}
                  emptyMsg="No sales yet."
                  rows={topProducts.map((p) => [
                    <span className={styles.strong} key="n">{p.name}</span>,
                    <span key="q">{p.qty}</span>,
                    <span className={styles.strong} key="v">{m(p.value)}</span>,
                    <span key="s">{revenue ? Math.round((p.value / revenue) * 100) : 0}%</span>,
                  ])}
                />
              </div>
            )}
          </section>
        );

      case "Customers":
        return (
          <section className={styles.section}>
            <div className={styles.subTabBar}>
              {["Overview", "Top Customers"].map((t) => (
                <button key={t} className={`${styles.subTabBtn} ${analyticsSubTab === t ? styles.subTabActive : ""}`} onClick={() => setAnalyticsSubTab(t)}>{t}</button>
              ))}
            </div>

            {analyticsSubTab === "Overview" && (
              <div className={styles.contentStack}>
                <div className={styles.statGrid}>
                  <StatCard label="Total Customers" value={String(customers.length)} icon={<Users className={styles.statSvg} />} />
                  <StatCard label="Loyalty Points Issued" value={String(customers.reduce((s, c) => s + c.loyalty_points, 0))} tone="green" icon={<TrendingUp className={styles.statSvg} />} />
                  <StatCard label="Credit Outstanding" value={m(customers.reduce((s, c) => s + num(c.credit_balance), 0))} tone="red" icon={<Wallet className={styles.statSvg} />} />
                </div>
                <div className={styles.chartGrid}>
                  <div className={styles.chartCard}>
                    <h4 className={styles.chartTitle}>Customers by Group</h4>
                    <div className={styles.chartBody}>
                      {customersByGroup.length === 0 ? <EmptyState message="No customer data yet." /> : (
                        <ResponsiveContainer width="100%" height={260}>
                          <PieChart>
                            <Pie data={customersByGroup} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                              label={({ name, percent }) => `${name} ${Math.round((percent || 0) * 100)}%`} labelLine={false}>
                              {customersByGroup.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Pie>
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                  <div className={styles.chartCard}>
                    <div className={styles.chartBody}>
                      <DataTable
                        headers={["GROUP", "CUSTOMERS", "SHARE"]}
                        emptyMsg="No customers yet."
                        rows={customersByGroup.map((g) => [
                          <span key="n">{g.name}</span>,
                          <span className={styles.strong} key="v">{g.value}</span>,
                          <span key="s">{customers.length ? Math.round((g.value / customers.length) * 100) : 0}%</span>,
                        ])}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {analyticsSubTab === "Top Customers" && (
              <div className={styles.contentStack}>
                <SectionHeader title="Top Customers" sub="Ranked by credit balance, then loyalty points" />
                <DataTable
                  headers={["CUSTOMER", "GROUP", "LOYALTY POINTS", "CREDIT BALANCE"]}
                  emptyMsg="No customers yet."
                  rows={topCustomers.map((c) => [
                    <span className={styles.strong} key="n">{c.name}</span>,
                    <StatusBadge key="g" status={c.group.charAt(0).toUpperCase() + c.group.slice(1)} />,
                    <span key="l">{c.loyalty_points}</span>,
                    <span key="cr">{m(num(c.credit_balance))}</span>,
                  ])}
                />
              </div>
            )}
          </section>
        );

      case "Finance":
        return (
          <section className={styles.section}>
            <div className={styles.subTabBar}>
              {["Overview", "Trends"].map((t) => (
                <button key={t} className={`${styles.subTabBtn} ${analyticsSubTab === t ? styles.subTabActive : ""}`} onClick={() => setAnalyticsSubTab(t)}>{t}</button>
              ))}
            </div>

            <div className={styles.filterBar}>
              <select value={range} onChange={(e) => setRange(e.target.value)}>
                <option value="all">All Time</option>
                <option value="1month">Past 1 Month</option>
                <option value="6months">Past 6 Months</option>
                <option value="1year">Past 1 Year</option>
              </select>
            </div>

            {analyticsSubTab === "Overview" && (
              <div className={styles.contentStack}>
                <div className={styles.statGrid}>
                  <StatCard label="Revenue" value={m(revenue)} icon={<DollarSign className={styles.statSvg} />} />
                  <StatCard label="Tax Collected" value={m(taxCollected)} tone="blue" icon={<BarChart3 className={styles.statSvg} />} />
                  <StatCard label="Expenses" value={m(expenseTotal)} tone="red" icon={<Receipt className={styles.statSvg} />} />
                  <StatCard label="Net Profit" value={m(netProfit)} tone={netProfit >= 0 ? "green" : "red"} icon={<TrendingUp className={styles.statSvg} />} />
                </div>
                <div className={styles.chartGrid}>
                  <div className={styles.chartCard}>
                    <h4 className={styles.chartTitle}>Revenue vs Expenses</h4>
                    <div className={styles.chartBody}>
                      {financeTrend.length === 0 ? <EmptyState message="No financial data yet." /> : (
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={financeTrend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                            <Tooltip formatter={(v: any) => m(Number(v))} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar dataKey="revenue" fill="#7c3aed" radius={[6, 6, 0, 0]} name="Revenue" />
                            <Bar dataKey="expenses" fill="#EF4444" radius={[6, 6, 0, 0]} name="Expenses" />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                  <div className={styles.chartCard}>
                    <h4 className={styles.chartTitle}>Expense Mix</h4>
                    <div className={styles.chartBody}>
                      {expensesByCategory.length === 0 ? <EmptyState message="No expenses yet." /> : (
                        <ResponsiveContainer width="100%" height={280}>
                          <PieChart>
                            <Pie data={expensesByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                              label={({ name, percent }) => `${name} ${Math.round((percent || 0) * 100)}%`} labelLine={false}>
                              {expensesByCategory.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(v: any) => m(Number(v))} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {analyticsSubTab === "Trends" && (
              <div className={styles.contentStack}>
                <div className={styles.chartCard} style={{ width: "100%" }}>
                  <h4 className={styles.chartTitle}>Revenue vs Expenses Over Time</h4>
                  <div className={styles.chartBody}>
                    {financeTrend.length === 0 ? <EmptyState message="No financial data yet." /> : (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={financeTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                          <Tooltip formatter={(v: any) => m(Number(v))} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="revenue" fill="#7c3aed" radius={[6, 6, 0, 0]} name="Revenue" />
                          <Bar dataKey="expenses" fill="#EF4444" radius={[6, 6, 0, 0]} name="Expenses" />
                        </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>
            )}
          </section>
        );

      default:
        return null;
    }
  };

  return (
    <div className={styles.shell}>
      <Sidebar collapsed={false} branchSub={businessName} />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <div>
            <p className={styles.subtitle}>Probably the biggest module</p>
            <h1 className={styles.title}>Reports &amp; Analytics</h1>
            <p className={styles.topbarSub}>Sales, products, inventory, customers and finance reporting</p>
          </div>
          <div className={styles.topbarActions}>
            <button className={styles.refreshBtn} onClick={load}>
              <RefreshCw className={styles.tabIcon} /> Refresh
            </button>
            {lastFetched && <span className={styles.updated}>Updated {lastFetched.toLocaleTimeString()}</span>}
          </div>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <MainTabBar active={mainTab} onChange={setMainTab} />

        {mainTab === "Reports" ? (
          <div className={styles.moduleNav}>
            {REPORT_MODULES.map((mName) => (
              <button key={mName} className={`${styles.moduleNavItem} ${reportModule === mName ? styles.moduleNavActive : ""}`}
                onClick={() => { setReportModule(mName); setReportSubTab("Sales Register"); }}>
                {mName === "Sales" && <Receipt className={styles.tabIcon} />}
                {mName === "Products" && <Package className={styles.tabIcon} />}
                {mName === "Inventory" && <Boxes className={styles.tabIcon} />}
                {mName === "Customers" && <Users className={styles.tabIcon} />}
                {mName === "Finance" && <DollarSign className={styles.tabIcon} />}
                {mName === "Tax Summary" && <Percent className={styles.tabIcon} />}
                {mName}
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.moduleNav}>
            {ANALYTICS_MODULES.map((mName) => (
              <button key={mName} className={`${styles.moduleNavItem} ${analyticsModule === mName ? styles.moduleNavActive : ""}`}
                onClick={() => { setAnalyticsModule(mName); setAnalyticsSubTab("Overview"); }}>
                {mName === "Sales" && <TrendingUp className={styles.tabIcon} />}
                {mName === "Products" && <Package className={styles.tabIcon} />}
                {mName === "Customers" && <Users className={styles.tabIcon} />}
                {mName === "Finance" && <DollarSign className={styles.tabIcon} />}
                {mName}
              </button>
            ))}
          </div>
        )}

        <div className={styles.body}>
          {loading ? (
            <div className={styles.emptyState} style={{ padding: "64px 16px" }}>
              <RefreshCw className={`${styles.emptyIcon} ${styles.spin}`} />
              <p>Loading reports...</p>
            </div>
          ) : mainTab === "Reports" ? renderReports() : renderAnalytics()}
        </div>
      </main>
    </div>
  );
}

function LayersIcon() {
  return <span className={styles.statSvg} style={{ display: "inline-grid", placeItems: "center" }}><Package size={18} /></span>;
}
