"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, X } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { api, getActiveBusinessName, getActiveRole, getActiveCurrency } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import styles from "./customers.module.css";

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  creditBalance: number;
  birthday: string;
  notes: string;
};

const EMPTY_FORM = {
  name: "",
  phone: "",
  email: "",
  address: "",
  birthday: "",
  notes: "",
};

export default function CustomersPage() {
  const router = useRouter();
  const [searchText, setSearchText] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const businessName = getActiveBusinessName();
  const currency = getActiveCurrency();
  const role = getActiveRole() || "cashier";
  const canManage = role === "manager" || role === "owner";

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }
    loadCustomers();
  }, [router]);

  async function loadCustomers() {
    setLoading(true);
    setError("");
    try {
      const data = await api.listCustomers();
      setCustomers(
        data.map((item: any) => ({
          id: String(item.id),
          name: item.name || "",
          phone: item.phone || "",
          email: item.email || "",
          address: item.address || "",
          creditBalance: Number(item.credit_balance || 0),
          birthday: item.birthday || "",
          notes: item.notes || "",
        }))
      );
    } catch (err: any) {
      setError(err.message || "Could not load customers.");
    } finally {
      setLoading(false);
    }
  }

  function flashNotice(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 2400);
  }

  const filteredCustomers = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return customers.filter((customer) => {
      return (
        !query ||
        customer.name.toLowerCase().includes(query) ||
        customer.phone.toLowerCase().includes(query) ||
        customer.email.toLowerCase().includes(query) ||
        customer.address.toLowerCase().includes(query)
      );
    });
  }, [customers, searchText]);

  const totalCredit = customers.reduce((sum, customer) => sum + customer.creditBalance, 0);
  const customersWithCredit = customers.filter((c) => c.creditBalance > 0).length;

  function openAdd() {
    setForm(EMPTY_FORM);
    setFormError("");
    setShowModal(true);
  }

  function closeModal() {
    if (saving) return;
    setShowModal(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim()) {
      setFormError("Customer name is required.");
      return;
    }
    setSaving(true);
    try {
      await api.createCustomer({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        birthday: form.birthday || null,
        notes: form.notes.trim(),
      });
      setShowModal(false);
      flashNotice("Customer added.");
      loadCustomers();
    } catch (err: any) {
      setFormError(err.message || "Could not add customer.");
    } finally {
      setSaving(false);
    }
  }

  function showStatement(customer: Customer) {
    flashNotice(`Statement ready for ${customer.name}.`);
  }

  return (
    <div className={styles.shell}>
      <Sidebar collapsed={false} branchSub={businessName} />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <div>
            <p className={styles.subtitle}>CRM inside the POS</p>
            <h1 className={styles.title}>Customers</h1>
          </div>
          <button
            className="btn-primary"
            onClick={openAdd}
            disabled={!canManage}
            title={!canManage ? "Manager role required" : "Add a customer"}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={16} /> Add Customer</span>
          </button>
        </div>

        {notice && <div className={styles.notice}>{notice}</div>}
        {error && <div className={styles.errorBanner}>{error}</div>}
        {!canManage && (
          <div className={styles.errorBanner}>You're viewing as {role}. Only managers and owners can add customers.</div>
        )}

        <div className={styles.metricGrid}>
          <div className={styles.metricCard}>
            <p className={styles.metricLabel}>Total customers</p>
            <p className={styles.metricValue}>{loading ? "—" : customers.length}</p>
          </div>
          <div className={styles.metricCard}>
            <p className={styles.metricLabel}>Customers with store credit</p>
            <p className={styles.metricValue}>{loading ? "—" : customersWithCredit}</p>
          </div>
          <div className={styles.metricCard}>
            <p className={styles.metricLabel}>Total store credit</p>
            <p className={styles.metricValue}>{formatMoney(totalCredit, currency)}</p>
          </div>
        </div>

        <div className={styles.controlsRow}>
          <div className={styles.searchBox}>
            <Search size={18} />
            <input
              type="search"
              placeholder="Search customers by name, phone, email, address"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.tableHeader}>
          <div>
            <h2>Customer list</h2>
            <p>Search the customer CRM.</p>
          </div>
          <button className="btn-secondary" onClick={() => flashNotice("Download customer statements is not implemented yet")}>Export statements</button>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.customerTable}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Address</th>
                <th>Store credit</th>
                <th>Birthday</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.name}</td>
                  <td>{customer.phone || "—"}</td>
                  <td>{customer.email || "—"}</td>
                  <td>{customer.address || "—"}</td>
                  <td>{formatMoney(customer.creditBalance, currency)}</td>
                  <td>{customer.birthday || "—"}</td>
                  <td>
                    <button className={styles.smallBtn} onClick={() => showStatement(customer)}>
                      Statement
                    </button>
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={7} className={styles.emptyState}>
                    No customers match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {showModal && (
          <div className={styles.overlay} onClick={closeModal}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>Add customer</h2>
                <button className={styles.closeBtn} onClick={closeModal}><X size={18} /></button>
              </div>

              {formError && <div className={styles.fieldError}>{formError}</div>}

              <form onSubmit={handleAdd} className={styles.formGrid}>
                <div className={`${styles.field} ${styles.fullSpan}`}>
                  <label>Full name *</label>
                  <input
                    autoFocus
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Jane Wanjiru"
                  />
                </div>

                <div className={styles.field}>
                  <label>Phone</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="e.g. +254 700 000000"
                  />
                </div>

                <div className={styles.field}>
                  <label>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="e.g. jane@example.com"
                  />
                </div>

                <div className={styles.field}>
                  <label>Address</label>
                  <input
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    placeholder="e.g. Waiyaki Way, Nairobi"
                  />
                </div>

                <div className={styles.field}>
                  <label>Birthday</label>
                  <input
                    type="date"
                    value={form.birthday}
                    onChange={(e) => setForm((f) => ({ ...f, birthday: e.target.value }))}
                  />
                </div>

                <div className={`${styles.field} ${styles.fullSpan}`}>
                  <label>Notes</label>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Any extra details about this customer…"
                  />
                </div>

                <div className={`${styles.modalFooter} ${styles.fullSpan}`}>
                  <button type="button" className="btn-secondary" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {saving ? "Saving..." : "Add customer"}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
