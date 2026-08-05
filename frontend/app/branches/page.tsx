"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Store, MapPin, Phone, UserRound, Star, Pencil, Trash2, X, Plus, Search } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import styles from "./branches.module.css";
import { api, getActiveBusinessName, getActiveRole } from "@/lib/api";
import { tileStyleFor, initialsFor } from "@/lib/format";

type Branch = {
  id: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
  address: string;
  city: string;
  phone: string;
  manager_name: string;
};

type FormState = {
  id?: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  manager_name: string;
  is_default: boolean;
  is_active: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  address: "",
  city: "",
  phone: "",
  manager_name: "",
  is_default: false,
  is_active: true,
};

export default function BranchesPage() {
  const router = useRouter();
  const businessName = getActiveBusinessName();
  const role = getActiveRole() || "cashier";
  const canManage = role === "manager" || role === "owner";

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [confirmDelete, setConfirmDelete] = useState<Branch | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }
    loadBranches();
  }, []);

  async function loadBranches() {
    setLoading(true);
    setError("");
    try {
      const data = await api.listStockLocations();
      setBranches(data);
    } catch (err: any) {
      setError(err.message || "Could not load branches.");
    } finally {
      setLoading(false);
    }
  }

  function flashNotice(text: string) {
    setNotice(text);
    setTimeout(() => setNotice(""), 2500);
  }

  const filtered = useMemo(() => {
    let list = [...branches];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.city.toLowerCase().includes(q) ||
          b.address.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name));
  }, [branches, search]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError("");
    setShowModal(true);
  }

  function openEdit(b: Branch) {
    setForm({
      id: b.id,
      name: b.name,
      address: b.address,
      city: b.city,
      phone: b.phone,
      manager_name: b.manager_name,
      is_default: b.is_default,
      is_active: b.is_active,
    });
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
    if (!form.name.trim()) {
      setFormError("Branch name is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        phone: form.phone.trim(),
        manager_name: form.manager_name.trim(),
        is_default: form.is_default,
        is_active: form.is_active,
      };
      if (form.id) {
        const updated = await api.updateStockLocation(form.id, payload);
        setBranches((prev) => prev.map((b) => (b.id === updated.id ? updated : (payload.is_default ? { ...b, is_default: false } : b))));
        flashNotice("Branch updated.");
      } else {
        const created = await api.createStockLocation(payload);
        setBranches((prev) => (payload.is_default ? prev.map((b) => ({ ...b, is_default: false })) : prev).concat(created));
        flashNotice("Branch added.");
      }
      setShowModal(false);
      loadBranches();
    } catch (err: any) {
      setFormError(err.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.deleteStockLocation(confirmDelete.id);
      flashNotice("Branch deleted.");
      setConfirmDelete(null);
      loadBranches();
    } catch (err: any) {
      setError(err.message || "Could not delete branch.");
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={styles.shell}>
      <Sidebar
        collapsed={false}
        branchSub={businessName}
        locations={branches.map((b) => ({ id: b.id, name: b.name }))}
        selectedLocationId={branches[0]?.id}
      />

      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <p className={styles.subtitle}>Manage</p>
            <h1 className={styles.title}>Branches</h1>
            <p className={styles.count}>
              {branches.length} branch{branches.length === 1 ? "" : "es"} across your business
            </p>
          </div>
          <button className={styles.addBtn} onClick={openCreate} disabled={!canManage} title={!canManage ? "Manager role required" : ""}>
            <Plus size={16} /> Add branch
          </button>
        </div>

        {!canManage && (
          <div className={styles.bannerWarn}>
            You're viewing as {role}. Only managers and owners can add, edit, or delete branches.
          </div>
        )}
        {error && <div className={styles.bannerError}>{error}</div>}
        {notice && <div className={styles.bannerSuccess}>{notice}</div>}

        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={16} />
            <input placeholder="Search by name, city, or address..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <div className={styles.emptyState}>Loading branches…</div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}>
            {branches.length === 0 ? (
              <>
                <div className={styles.emptyIcon}><Store size={28} /></div>
                <p>No branches yet. Add your first one to get started.</p>
              </>
            ) : (
              "No branches match your search."
            )}
          </div>
        ) : (
          <section className={styles.grid}>
            {filtered.map((b) => {
              const tile = tileStyleFor(b.name);
              return (
                <div key={b.id} className={`${styles.card} ${!b.is_active ? styles.cardInactive : ""}`}>
                  <div className={styles.cardTop}>
                    <div className={styles.tile} style={{ background: tile.bg, color: tile.fg }}>
                      {initialsFor(b.name)}
                    </div>
                    <div className={styles.cardTitleWrap}>
                      <h3>{b.name}</h3>
                      <div className={styles.badgeRow}>
                        {b.is_default && (
                          <span className={styles.badgeDefault}>
                            <Star size={11} /> Default
                          </span>
                        )}
                        <span className={b.is_active ? styles.badgeActive : styles.badgeInactive}>
                          {b.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.cardBody}>
                    <div className={styles.metaRow}>
                      <MapPin size={14} />
                      <span>{[b.address, b.city].filter(Boolean).join(", ") || "No address on file"}</span>
                    </div>
                    <div className={styles.metaRow}>
                      <Phone size={14} />
                      <span>{b.phone || "No phone on file"}</span>
                    </div>
                    <div className={styles.metaRow}>
                      <UserRound size={14} />
                      <span>{b.manager_name || "No manager assigned"}</span>
                    </div>
                  </div>

                  <div className={styles.actions}>
                    <button className={styles.actionBtn} onClick={() => openEdit(b)} disabled={!canManage}>
                      <Pencil size={13} /> Edit
                    </button>
                    <button
                      className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                      onClick={() => setConfirmDelete(b)}
                      disabled={!canManage}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {showModal && (
          <div className={styles.overlay} onClick={closeModal}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>{form.id ? "Edit branch" : "Add branch"}</h2>
                <button className={styles.closeBtn} onClick={closeModal}><X size={18} /></button>
              </div>

              {formError && <div className={styles.fieldError}>{formError}</div>}

              <form onSubmit={handleSave} className={styles.formGrid}>
                <div className={`${styles.field} ${styles.fullSpan}`}>
                  <label>Branch name *</label>
                  <input
                    autoFocus
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Westlands Branch"
                  />
                </div>

                <div className={`${styles.field} ${styles.fullSpan}`}>
                  <label>Address</label>
                  <input
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    placeholder="e.g. Waiyaki Way, Sarit Centre"
                  />
                </div>

                <div className={styles.field}>
                  <label>City</label>
                  <input
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder="e.g. Nairobi"
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

                <div className={`${styles.field} ${styles.fullSpan}`}>
                  <label>Branch manager</label>
                  <input
                    value={form.manager_name}
                    onChange={(e) => setForm((f) => ({ ...f, manager_name: e.target.value }))}
                    placeholder="e.g. Jane Wanjiru"
                  />
                </div>

                <div className={`${styles.checkboxRow} ${styles.fullSpan}`}>
                  <label>
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                    />
                    Active branch
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={form.is_default}
                      onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
                    />
                    Set as default branch
                  </label>
                </div>

                <div className={`${styles.modalFooter} ${styles.fullSpan}`}>
                  <button type="button" className="btn-secondary" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? "Saving..." : form.id ? "Save changes" : "Create branch"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {confirmDelete && (
          <div className={styles.overlay} onClick={() => !deleting && setConfirmDelete(null)}>
            <div className={`${styles.modal} ${styles.modalSmall}`} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>Delete branch?</h2>
                <button className={styles.closeBtn} onClick={() => setConfirmDelete(null)}><X size={18} /></button>
              </div>
              <p className={styles.confirmText}>
                This will permanently remove "{confirmDelete.name}". Stock records tied to it may be affected. This can't be undone.
              </p>
              <div className={styles.modalFooter}>
                <button className="btn-secondary" onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</button>
                <button className={styles.dangerBtn} onClick={handleDelete} disabled={deleting}>
                  {deleting ? "Deleting..." : "Delete branch"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
