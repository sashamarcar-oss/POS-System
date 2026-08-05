"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet, AlertCircle } from "lucide-react";
import { api, setSession, setActiveBusiness } from "@/lib/api";
import styles from "./login.module.css";

type Membership = {
  business_id: string;
  business_name: string;
  business_slug: string;
  currency: string;
  default_tax_rate: string;
  role: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [businesses, setBusinesses] = useState<Membership[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const tokens = await api.login(username, password);
      setSession(tokens.access, tokens.refresh, username);
      const response = await api.myBusinesses();
      const memberships: Membership[] = response.results || response;
      if (memberships.length === 0) {
        setError("This account isn't linked to any business yet. Ask an owner to add you.");
      } else if (memberships.length === 1) {
        chooseBusiness(memberships[0]);
        return;
      } else {
        setBusinesses(memberships);
      }
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  function chooseBusiness(membership: Membership) {
    setActiveBusiness(membership.business_id, membership.role, {
      name: membership.business_name,
      currency: membership.currency,
      defaultTaxRate: membership.default_tax_rate,
    });
    router.push("/pos");
  }

  return (
    <div className={styles.page}>
      <aside className={styles.panel}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <Wallet size={22} />
          </span>
          SmartPOS
        </div>
        <div className={styles.panelBody}>
          <h1 className={styles.panelTitle}>Run your whole business from one clean dashboard.</h1>
          <p className={styles.panelText}>
            Sales, inventory, staff and reports — all in one fast, focused workspace built
            for busy counters and growing teams.
          </p>
        </div>
        <div className={styles.panelFooter}>&copy; {new Date().getFullYear()} SmartPOS. All rights reserved.</div>
      </aside>

      <div className={styles.formSide}>
        <div className={styles.mobileBrand}>
          <span className={styles.mobileBrandMark}>
            <Wallet size={18} />
          </span>
          SmartPOS
        </div>

        <div className={styles.formCard}>
          {!businesses ? (
            <>
              <h1 className={styles.heading}>Welcome back</h1>
              <p className={styles.subheading}>Sign in to access your POS dashboard</p>

              <form onSubmit={handleLogin} className={styles.form}>
                <div className={styles.field}>
                  <label className={styles.label}>Username</label>
                  <input
                    className={styles.input}
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Password</label>
                  <input
                    className={styles.input}
                    placeholder="Enter your password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                {error && (
                  <div className={styles.error}>
                    <AlertCircle size={16} />
                    {error}
                  </div>
                )}

                <button className={`btn-primary ${styles.submit}`} disabled={loading} type="submit">
                  {loading ? "Signing in..." : "Sign in"}
                </button>
              </form>

              <p className={styles.footerNote}>Contact your business owner if you need access.</p>
            </>
          ) : (
            <>
              <h1 className={styles.heading}>Choose a business</h1>
              <p className={styles.subheading}>You have access to multiple businesses</p>

              <div className={styles.businessList}>
                {businesses.map((b) => (
                  <button key={b.business_id} className={styles.businessOption} onClick={() => chooseBusiness(b)}>
                    <span>{b.business_name}</span>
                    <span className={styles.businessRole}>{b.role}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
