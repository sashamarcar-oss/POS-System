"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getActiveBusinessName } from "@/lib/api";
import styles from "../stock.module.css";

type Transfer = {
  id: string;
  route: string;
  items: number;
  eta: string;
  status: string;
};

const TRANSFERS: Transfer[] = [];

export default function StockTransfersPage() {
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
            <p className={styles.subtitle}>Warehouse → branch inventory flow</p>
            <h1 className={styles.title}>Stock Transfers</h1>
          </div>
          <button className="btn-primary" onClick={() => flash("New transfer creation coming soon")}>New transfer</button>
        </div>

        {notice && <div className={styles.notice}>{notice}</div>}

        <div className={styles.tableWrap}>
          <table className={styles.stockTable}>
            <thead>
              <tr>
                <th>Transfer</th>
                <th>Items</th>
                <th>ETA</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {TRANSFERS.map((transfer) => (
                <tr key={transfer.id}>
                  <td>{transfer.route}</td>
                  <td>{transfer.items}</td>
                  <td>{transfer.eta}</td>
                  <td>{transfer.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
