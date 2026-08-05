"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { api, getActiveBusinessName, getActiveCurrency } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import styles from "./orders.module.css";

const TABS = [
  { key: "current", label: "Current Orders" },
  { key: "completed", label: "Completed Orders" },
  { key: "cancelled", label: "Cancelled Orders" },
  { key: "refunded", label: "Refunded Orders" },
  { key: "held", label: "Held Orders" },
];

type OrderItem = { id: string; product: string; quantity: string; unit_price: string; };
type Payment = { id: string; method: string; amount: string; };
type Order = {
  id: string;
  status: string;
  location: string | null;
  cashier: string | null;
  subtotal: string;
  tax_total: string;
  discount_total: string;
  total: string;
  created_at: string;
  paid_at: string | null;
  items: OrderItem[];
  payments: Payment[];
};

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState("current");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const businessName = getActiveBusinessName();
  const currency = getActiveCurrency();

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }
    loadOrders();
  }, [router]);

  async function loadOrders() {
    setLoading(true);
    setError("");
    try {
      const data = await api.listOrders();
      setOrders(data);
    } catch (err: any) {
      setError(err.message || "Could not load orders.");
    } finally {
      setLoading(false);
    }
  }

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (activeTab === "current") return order.status === "open";
      if (activeTab === "completed") return order.status === "paid";
      if (activeTab === "cancelled") return order.status === "void";
      if (activeTab === "refunded") return order.status === "refunded";
      if (activeTab === "held") return order.status === "open" && order.items.length > 0;
      return true;
    });
  }, [orders, activeTab]);

  function statusLabel(status: string) {
    switch (status) {
      case "open": return "Open";
      case "paid": return "Paid";
      case "void": return "Cancelled";
      case "refunded": return "Refunded";
      default: return status;
    }
  }

  return (
    <div className={styles.shell}>
      <Sidebar collapsed={false} branchSub={businessName} />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <div>
            <p className={styles.subtitle}>Sales tracking</p>
            <h1 className={styles.title}>Orders</h1>
          </div>
          <button className="btn-primary" onClick={loadOrders} disabled={loading}>Refresh</button>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.tabBar}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`${styles.tabButton} ${activeTab === tab.key ? styles.activeTab : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={styles.orderTableWrap}>
          {loading ? (
            <div className={styles.emptyState}>Loading orders...</div>
          ) : filteredOrders.length === 0 ? (
            <div className={styles.emptyState}>No orders match this tab.</div>
          ) : (
            <table className={styles.orderTable}>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Status</th>
                  <th>Cashier</th>
                  <th>Location</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.id.slice(0, 8)}</td>
                    <td>{statusLabel(order.status)}</td>
                    <td>{order.cashier || "—"}</td>
                    <td>{order.location || "—"}</td>
                    <td>{formatMoney(parseFloat(order.total), currency)}</td>
                    <td>{order.payments.map((p) => p.method.replace("_", " ")).join(", ") || "—"}</td>
                    <td>{new Date(order.created_at).toLocaleString()}</td>
                    <td>
                      <button className={styles.smallBtn} onClick={() => alert("Receipt reprint not implemented yet.")}>Reprint</button>
                      <button className={styles.smallBtn} onClick={() => alert("Refund not implemented yet.")}>Refund</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
