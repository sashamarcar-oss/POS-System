"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DollarSign, CalendarDays, ShoppingBag, AlertTriangle, TrendingUp, TrendingDown,
  Minus, PlusCircle, BarChart3, Wallet, RefreshCw,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { api, getActiveBusinessName, getActiveCurrency, getActiveUsername } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import styles from "./dashboard.module.css";

type Order = {
  id: string;
  status: string;
  total: string;
  paid_at: string | null;
  created_at: string;
  items: { product: string; quantity: string; unit_price: string }[];
  payments: { method: string; amount: string }[];
};

type StockItem = {
  id: string;
  product: string;
  variant: string | null;
  location: string;
  quantity_on_hand: string;
  is_low_stock: boolean;
};

type Product = {
  id: string;
  name: string;
  category: string | null;
};

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateShort(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfMonth(date: Date) {
  const copy = new Date(date);
  copy.setDate(1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? null : 0;
  return ((current - previous) / previous) * 100;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  mobile_money: "Mobile Money",
  other: "Other",
};

export default function DashboardPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const businessName = getActiveBusinessName();
  const currency = getActiveCurrency();
  const username = getActiveUsername() || "there";

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }
    loadData();
  }, [router]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [ordersRes, stockRes, productsRes] = await Promise.all([
        api.listOrders(),
        api.listStockItems(),
        api.listProducts(),
      ]);
      setOrders(ordersRes);
      setStockItems(stockRes);
      setProducts(productsRes.map((p: any) => ({ id: p.id, name: p.name, category: p.category })));
    } catch (err: any) {
      setError(err.message || "Could not load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  const today = new Date();
  const monthStart = startOfMonth(today);

  const paidOrders = useMemo(
    () => orders.filter((order) => order.status === "paid"),
    [orders]
  );

  function sumBetween(range: { start: Date; end?: Date }) {
    return paidOrders.reduce((sum, order) => {
      const paidAt = parseDate(order.paid_at || order.created_at);
      if (!paidAt) return sum;
      if (paidAt < range.start) return sum;
      if (range.end && paidAt > range.end) return sum;
      return sum + parseFloat(order.total);
    }, 0);
  }

  const todaySales = useMemo(() => {
    return paidOrders.reduce((sum, order) => {
      const paidAt = parseDate(order.paid_at || order.created_at);
      return paidAt && isSameDay(paidAt, today) ? sum + parseFloat(order.total) : sum;
    }, 0);
  }, [paidOrders, today]);

  const monthRevenue = useMemo(() => sumBetween({ start: monthStart }), [paidOrders, monthStart]);

  const yesterday = useMemo(() => {
    const copy = new Date(today);
    copy.setDate(today.getDate() - 1);
    return copy;
  }, [today]);

  const yesterdaySales = useMemo(() => {
    return paidOrders.reduce((sum, order) => {
      const paidAt = parseDate(order.paid_at || order.created_at);
      return paidAt && isSameDay(paidAt, yesterday) ? sum + parseFloat(order.total) : sum;
    }, 0);
  }, [paidOrders, yesterday]);

  const prevMonthSales = useMemo(() => {
    const daysInPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth() - 1, Math.min(today.getDate(), daysInPrevMonth), 23, 59, 59, 999);
    return sumBetween({ start, end });
  }, [paidOrders, today]);

  const todayOrders = useMemo(
    () => paidOrders.filter((order) => {
      const paidAt = parseDate(order.paid_at || order.created_at);
      return paidAt ? isSameDay(paidAt, today) : false;
    }).length,
    [paidOrders, today]
  );

  const yesterdayOrders = useMemo(
    () => paidOrders.filter((order) => {
      const paidAt = parseDate(order.paid_at || order.created_at);
      return paidAt ? isSameDay(paidAt, yesterday) : false;
    }).length,
    [paidOrders, yesterday]
  );

  const lowStockItems = useMemo(
    () => stockItems.filter((item) => item.is_low_stock && parseFloat(item.quantity_on_hand) > 0).length,
    [stockItems]
  );

  const outOfStockItems = useMemo(
    () => stockItems.filter((item) => parseFloat(item.quantity_on_hand) <= 0).length,
    [stockItems]
  );

  const salesByDay = useMemo(() => {
    const days = Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - index));
      return { label: formatDateShort(date), value: 0 };
    });
    paidOrders.forEach((order) => {
      const paidAt = parseDate(order.paid_at || order.created_at);
      if (!paidAt) return;
      const dateLabel = formatDateShort(paidAt);
      const found = days.find((day) => day.label === dateLabel);
      if (found) found.value += parseFloat(order.total);
    });
    return days;
  }, [paidOrders, today]);

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const bestProducts = useMemo(() => {
    const totals = new Map<string, number>();
    paidOrders.forEach((order) => {
      order.items.forEach((item) => {
        totals.set(item.product, (totals.get(item.product) || 0) + parseFloat(item.quantity));
      });
    });
    return Array.from(totals.entries())
      .map(([id, quantity]) => ({ name: productMap.get(id)?.name || "Deleted product", quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }, [paidOrders, productMap]);

  const paymentByMethod = useMemo(() => {
    const totals = new Map<string, number>();
    paidOrders.forEach((order) => {
      order.payments.forEach((payment) => {
        totals.set(payment.method, (totals.get(payment.method) || 0) + parseFloat(payment.amount));
      });
    });
    return Array.from(totals.entries()).map(([method, amount]) => ({ method, amount }));
  }, [paidOrders]);

  const maxSales = Math.max(...salesByDay.map((item) => item.value), 1);
  const maxQuantity = Math.max(...bestProducts.map((p) => p.quantity), 1);
  const totalPayments = paymentByMethod.reduce((sum, p) => sum + p.amount, 0);

  const todayDelta = pctChange(todaySales, yesterdaySales);
  const monthDelta = pctChange(monthRevenue, prevMonthSales);
  const dateStr = today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const stockAlerts = lowStockItems + outOfStockItems;

  function Delta({ value, previousText }: { value: number | null; previousText: string }) {
    if (value === null) {
      return <span className={`${styles.delta} ${styles.deltaNeutral}`}><Minus size={13} /> No {previousText}</span>;
    }
    if (value === 0) {
      return <span className={`${styles.delta} ${styles.deltaNeutral}`}><Minus size={13} /> Flat vs {previousText}</span>;
    }
    const up = value > 0;
    return (
      <span className={`${styles.delta} ${up ? styles.deltaUp : styles.deltaDown}`}>
        {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
        {Math.round(Math.abs(value))}% vs {previousText}
      </span>
    );
  }

  const kpis = [
    {
      label: "Today's Sales",
      value: formatMoney(todaySales, currency),
      icon: <DollarSign size={18} />,
      sub: <Delta value={todayDelta} previousText="yesterday" />,
    },
    {
      label: "This Month",
      value: formatMoney(monthRevenue, currency),
      icon: <CalendarDays size={18} />,
      sub: <Delta value={monthDelta} previousText="last month" />,
    },
    {
      label: "Orders Today",
      value: String(todayOrders),
      icon: <ShoppingBag size={18} />,
      sub: <span className={styles.deltaNeutral}>yesterday: {yesterdayOrders}</span>,
    },
    {
      label: "Stock Alerts",
      value: String(stockAlerts),
      icon: <AlertTriangle size={18} />,
      tone: stockAlerts > 0 ? ("warning" as const) : undefined,
      sub: (
        <span className={styles.deltaNeutral}>
          {lowStockItems} low · {outOfStockItems} out of stock
        </span>
      ),
    },
  ];

  return (
    <div className={styles.shell}>
      <Sidebar collapsed={false} branchSub={businessName} />
      <main className={styles.main}>
        <div className={styles.hero}>
          <div>
            <p className={styles.heroEyebrow}>{businessName || "Your business"} · {dateStr}</p>
            <h1 className={styles.heroTitle}>{greetingFor(today)}, {username}</h1>
            <p className={styles.heroSub}>Here's what's happening at the register today.</p>
          </div>
          <div className={styles.heroActions}>
            <button className="btn-secondary" onClick={() => router.push("/reports")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BarChart3 size={16} /> Reports</span>
            </button>
            <button className={styles.newSaleBtn} onClick={() => router.push("/pos")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><PlusCircle size={16} /> New Sale</span>
            </button>
            <button className={styles.refreshBtn} onClick={loadData} disabled={loading} title="Refresh data">
              <RefreshCw size={16} className={loading ? styles.spin : ""} />
            </button>
          </div>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.kpiGrid}>
          {kpis.map((kpi) => (
            <div key={kpi.label} className={styles.metricCard}>
              <div className={styles.cardHeader}>
                <span className={`${styles.cardIcon} ${kpi.tone === "warning" ? styles.cardIconWarning : ""}`}>
                  {kpi.icon}
                </span>
                <span className={styles.cardLabel}>{kpi.label}</span>
              </div>
              <div className={styles.cardValue}>{loading && kpi.label !== "Stock Alerts" ? "—" : kpi.value}</div>
              <div className={styles.cardSub}>{kpi.sub}</div>
            </div>
          ))}
        </div>

        <div className={styles.mainGrid}>
          <section className={`${styles.chartCard} ${styles.trendCard}`}>
            <div className={styles.chartHeader}>
              <h2>Sales — last 7 days</h2>
              <span>{formatMoney(maxSales, currency)} peak</span>
            </div>
            <div className={styles.barList}>
              {salesByDay.map((item) => (
                <div key={item.label} className={styles.barRow}>
                  <span className={styles.barLabel}>{item.label}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(item.value / maxSales) * 100}%` }} />
                  </div>
                  <span className={styles.barValue}>{formatMoney(item.value, currency)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.chartCard}>
            <div className={styles.chartHeader}>
              <h2>Best Selling Products</h2>
            </div>
            <div className={styles.listStack}>
              {bestProducts.length === 0 ? (
                <div className={styles.emptyState}>No sales yet</div>
              ) : (
                bestProducts.map((product, index) => (
                  <div key={product.name} className={styles.listRow}>
                    <span className={styles.rankBadge}>{index + 1}</span>
                    <div className={styles.listMain}>
                      <span className={styles.listName}>{product.name}</span>
                      <div className={styles.listTrack}>
                        <div className={styles.listFill} style={{ width: `${(product.quantity / maxQuantity) * 100}%` }} />
                      </div>
                    </div>
                    <strong>{product.quantity}</strong>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className={styles.chartCard}>
            <div className={styles.chartHeader}>
              <h2>Payment Methods</h2>
            </div>
            <div className={styles.listStack}>
              {paymentByMethod.length === 0 ? (
                <div className={styles.emptyState}>No payments recorded</div>
              ) : (
                paymentByMethod
                  .slice()
                  .sort((a, b) => b.amount - a.amount)
                  .map((item) => {
                    const share = totalPayments > 0 ? (item.amount / totalPayments) * 100 : 0;
                    return (
                      <div key={item.method} className={styles.listRow}>
                        <div className={styles.listMain}>
                          <span className={styles.listName}>
                            <Wallet size={13} className={styles.listWalletIcon} /> {PAYMENT_LABELS[item.method] || item.method.replace("_", " ")}
                          </span>
                          <div className={styles.listTrack}>
                            <div className={`${styles.listFill} ${styles.paymentFill}`} style={{ width: `${share}%` }} />
                          </div>
                        </div>
                        <strong>{formatMoney(item.amount, currency)}</strong>
                      </div>
                    );
                  })
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
