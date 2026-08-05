"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, Receipt, TrendingUp, ArrowDownCircle, FileText, CalendarDays, Plus, X } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { api, getActiveBusinessName, getActiveCurrency } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import styles from "./expenses.module.css";

type Expense = {
  id: string;
  category: string;
  amount: number;
  date: string;
  paymentMethod: string;
  status: string;
};

type FormState = {
  category: string;
  amount: string;
  expense_date: string;
  payment_method: string;
  status: string;
  note: string;
};

const EMPTY_FORM: FormState = {
  category: "",
  amount: "",
  expense_date: "",
  payment_method: "Cash",
  status: "pending",
  note: "",
};

const PAYMENT_METHODS = ["Cash", "Credit Card", "Bank Transfer", "Check", "Other"];
const CATEGORIES = ["Supplies", "Utilities", "Repairs", "Marketing", "Rent", "Salaries", "Other"];

export default function ExpensesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  
  const businessName = getActiveBusinessName();
  const currency = getActiveCurrency();

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }
    loadExpenses();
  }, [router]);

  async function loadExpenses() {
    setLoading(true);
    setError("");
    try {
      const data = await api.listExpenses();
      setExpenses(
        data.map((item: any) => ({
          id: String(item.id),
          category: item.category || "",
          amount: Number(item.amount || 0),
          date: item.expense_date || item.date || "",
          paymentMethod: item.payment_method || "",
          status: item.status === "settled" ? "Settled" : "Pending",
        }))
      );
    } catch (err: any) {
      setError(err.message || "Could not load expenses.");
    } finally {
      setLoading(false);
    }
  }

  function flashNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError("");
    setShowModal(true);
  }

  function closeModal() {
    if (saving) return;
    setShowModal(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.category.trim()) {
      setFormError("Category is required.");
      return;
    }
    if (!form.amount || isNaN(parseFloat(form.amount))) {
      setFormError("Enter a valid amount.");
      return;
    }
    if (!form.expense_date) {
      setFormError("Date is required.");
      return;
    }
    
    setSaving(true);
    try {
      const payload = {
        category: form.category.trim(),
        amount: form.amount,
        expense_date: form.expense_date,
        payment_method: form.payment_method,
        status: form.status,
        note: form.note.trim(),
      };
      
      await api.createExpense(payload);
      flashNotice("Expense added.");
      setShowModal(false);
      loadExpenses();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const filteredExpenses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return expenses.filter((expense) => {
      return (
        !query ||
        expense.category.toLowerCase().includes(query) ||
        expense.paymentMethod.toLowerCase().includes(query) ||
        expense.status.toLowerCase().includes(query)
      );
    });
  }, [search, expenses]);

  const totals = useMemo(() => ({
    total: expenses.reduce((sum, item) => sum + item.amount, 0),
    settled: expenses.filter((item) => item.status === "Settled").length,
    pending: expenses.filter((item) => item.status === "Pending").length,
  }), [expenses]);

  return (
    <div className={styles.shell}>
      <Sidebar collapsed={false} branchSub={businessName} />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <div>
            <p className={styles.subtitle}>Track spending and vendor payouts</p>
            <h1 className={styles.title}>Expenses</h1>
          </div>
          <button className="btn-primary" onClick={openCreate}><Plus size={16} /> Add expense</button>
        </div>

        {notice && <div className={styles.notice}>{notice}</div>}
        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryIcon}><DollarSign size={18} /></div>
            <div>
              <p className={styles.summaryLabel}>Total expenses</p>
              <p className={styles.summaryValue}>{formatMoney(totals.total, currency)}</p>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryIcon}><Receipt size={18} /></div>
            <div>
              <p className={styles.summaryLabel}>Settled</p>
              <p className={styles.summaryValue}>{totals.settled}</p>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryIcon}><ArrowDownCircle size={18} /></div>
            <div>
              <p className={styles.summaryLabel}>Pending</p>
              <p className={styles.summaryValue}>{totals.pending}</p>
            </div>
          </div>
        </div>

        <div className={styles.controlsRow}>
          <input
            type="search"
            placeholder="Search expenses"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
          <button className="btn-secondary" onClick={() => flashNotice("Expense report export is coming soon")}>Export report</button>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.expenseTable}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Payment</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className={styles.emptyState}>Loading expenses...</td>
                </tr>
              ) : filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.emptyState}>No expenses found.</td>
                </tr>
              ) : (
                filteredExpenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>{expense.id}</td>
                    <td>{expense.category}</td>
                    <td>{formatMoney(expense.amount, currency)}</td>
                    <td>{new Date(expense.date).toLocaleDateString()}</td>
                    <td>{expense.paymentMethod}</td>
                    <td>{expense.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {showModal && (
          <div className={styles.overlay} onClick={closeModal}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>Add expense</h2>
                <button className={styles.closeBtn} onClick={closeModal}><X size={18} /></button>
              </div>

              {formError && <div className={styles.fieldError} style={{ marginTop: 10 }}>{formError}</div>}

              <form onSubmit={handleSave}>
                <div className={styles.formGrid}>
                  <div className={styles.field}>
                    <label>Category *</label>
                    <select 
                      value={form.category}
                      onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    >
                      <option value="">Select a category</option>
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.field}>
                    <label>Amount *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.amount}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>

                  <div className={styles.field}>
                    <label>Date *</label>
                    <input
                      type="date"
                      value={form.expense_date}
                      onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
                    />
                  </div>

                  <div className={styles.field}>
                    <label>Payment method</label>
                    <select
                      value={form.payment_method}
                      onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
                    >
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.field}>
                    <label>Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    >
                      <option value="pending">Pending</option>
                      <option value="settled">Settled</option>
                    </select>
                  </div>

                  <div className={`${styles.field} ${styles.fullSpan}`}>
                    <label>Note</label>
                    <textarea
                      rows={2}
                      value={form.note}
                      onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                      placeholder="Optional notes about this expense"
                    />
                  </div>
                </div>

                <div className={styles.modalFooter}>
                  <button type="button" className="btn-secondary" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? "Saving..." : "Add expense"}
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
