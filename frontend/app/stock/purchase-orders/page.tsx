"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getActiveBusinessName } from "@/lib/api";
import styles from "../stock.module.css";

type PurchaseOrder = {
  id: string;
  supplier: string;
  expected: string;
  items: number;
  status: string;
};

const ORDERS: PurchaseOrder[] = [];

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const businessName = getActiveBusinessName();

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("access_token")) {
      router.replace("/login");
    }
  }, [router]);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  }

  return (
    <div className={styles.shell}>
      <Sidebar collapsed={false} branchSub={businessName} />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <div>
            <p className={styles.subtitle}>Supplier purchase orders</p>
            <h1 className={styles.title}>Purchase Orders</h1>
          </div>
          <button className="btn-primary" onClick={() => flash("Purchase order creation coming soon")}>Create PO</button>
        </div>

        {notice && <div className={styles.notice}>{notice}</div>}

        <div className={styles.tableWrap}>
          <table className={styles.stockTable}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Supplier</th>
                <th>Expected</th>
                <th>Items</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ORDERS.map((order) => (
                <tr key={order.id}>
                  <td>{order.id}</td>
                  <td>{order.supplier}</td>
                  <td>{order.expected}</td>
                  <td>{order.items}</td>
                  <td>{order.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
