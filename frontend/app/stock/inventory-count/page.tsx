"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getActiveBusinessName } from "@/lib/api";
import styles from "../stock.module.css";

type InventoryCount = {
  id: string;
  location: string;
  counted: number;
  expected: number;
  variance: number;
  status: string;
};

const COUNTS: InventoryCount[] = [];

export default function InventoryCountPage() {
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
            <p className={styles.subtitle}>Physical stock counts and variance tracking</p>
            <h1 className={styles.title}>Inventory Count</h1>
          </div>
          <button className="btn-primary" onClick={() => flash("Start new count coming soon")}>New count</button>
        </div>

        {notice && <div className={styles.notice}>{notice}</div>}

        <div className={styles.tableWrap}>
          <table className={styles.stockTable}>
            <thead>
              <tr>
                <th>Location</th>
                <th>Counted</th>
                <th>Expected</th>
                <th>Variance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {COUNTS.map((count) => (
                <tr key={count.id}>
                  <td>{count.location}</td>
                  <td>{count.counted}</td>
                  <td>{count.expected}</td>
                  <td>{count.variance}</td>
                  <td>{count.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
