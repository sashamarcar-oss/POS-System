"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, Gift, Lock, CreditCard, UserCog, Receipt, CheckCircle2, AlertCircle,
  Save, ArrowLeft, Users, KeyRound,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import {
  api, getActiveBusinessName, getActiveRole, getActiveUsername,
  refreshActiveBusinessMeta, setActivePaymentMethods,
} from "@/lib/api";
import styles from "./settings.module.css";

type SectionId = "business" | "payment" | "tax" | "permissions" | "receipt" | "security";

const SETTINGS: { id: SectionId; label: string; description: string; icon: React.ReactNode }[] = [
  { id: "business", label: "Business settings", description: "Manage store details, branding, and location info.", icon: <ShieldCheck size={18} /> },
  { id: "payment", label: "Payment methods", description: "Configure accepted payment modes and terminals.", icon: <CreditCard size={18} /> },
  { id: "tax", label: "Tax rates", description: "Edit tax rules and rate assignments.", icon: <Gift size={18} /> },
  { id: "permissions", label: "User permissions", description: "Control access for roles like cashier, manager, accountant.", icon: <UserCog size={18} /> },
  { id: "receipt", label: "Receipt settings", description: "Customize invoice layouts and print options.", icon: <Receipt size={18} /> },
  { id: "security", label: "Security", description: "Set password and authentication policies.", icon: <Lock size={18} /> },
];

type SettingsData = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_active: boolean;
  currency: string;
  timezone: string;
  default_tax_rate: string;
  tax_inclusive_pricing: boolean;
  receipt_header: string;
  receipt_footer: string;
  low_stock_threshold_default: number;
  accepted_payment_methods: string[];
};

const ALL_PAYMENT_METHODS: { key: string; label: string; hint: string }[] = [
  { key: "cash", label: "Cash", hint: "Physical banknotes and coins tendered at the register." },
  { key: "card", label: "Card", hint: "Visa / Mastercard collected through the Paystack checkout." },
  { key: "mobile_money", label: "Mobile Money", hint: "M-Pesa, Airtel Money and other mobile wallets." },
  { key: "other", label: "Other", hint: "Bank transfer, cheque, store credit and anything else." },
];

const CURRENCIES = ["USD", "KES", "NGN", "GHS", "ZAR", "UGX", "TZS", "RWF", "ETB", "EGP", "MAD", "GBP", "EUR", "CAD", "AUD", "INR", "PKR", "BDT", "AED", "SGD"];

const TIMEZONES = [
  "UTC", "Africa/Nairobi", "Africa/Lagos", "Africa/Accra", "Africa/Johannesburg",
  "Africa/Cairo", "Africa/Casablanca", "Africa/Addis_Ababa", "Africa/Kampala",
  "Africa/Dar_es_Salaam", "Africa/Kigali", "Africa/Addis_Ababa",
  "America/New_York", "America/Chicago", "America/Los_Angeles", "America/Toronto",
  "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Karachi", "Asia/Dhaka", "Asia/Singapore",
  "Australia/Sydney", "Pacific/Auckland",
];

const PERMISSION_MATRIX: { permission: string; roles: string[] }[] = [
  { permission: "Can Sell", roles: ["cashier", "manager", "owner"] },
  { permission: "Can Refund", roles: ["manager", "owner"] },
  { permission: "Can Edit Products", roles: ["manager", "owner"] },
  { permission: "Can Manage Employees", roles: ["manager", "owner"] },
  { permission: "Can View Reports", roles: ["manager", "owner"] },
  { permission: "Can Approve Discounts", roles: ["manager", "owner"] },
  { permission: "Can Manage Settings", roles: ["manager", "owner"] },
];

function normalizeAccepted(list: string[]) {
  return list && list.length > 0 ? list : ALL_PAYMENT_METHODS.map((m) => m.key);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <label>{label}</label>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`${styles.toggle} ${checked ? styles.toggleOn : ""}`}
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span className={styles.toggleKnob} />
    </button>
  );
}

function PanelShell({ title, description, children, onBack }: { title: string; description: string; children: React.ReactNode; onBack: () => void }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <button className={styles.backBtn} onClick={onBack} title="Back to settings"><ArrowLeft size={16} /></button>
        <div>
          <h2 className={styles.panelTitle}>{title}</h2>
          <p className={styles.panelDesc}>{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [active, setActive] = useState<SectionId | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const businessName = getActiveBusinessName();
  const role = getActiveRole() || "cashier";
  const username = getActiveUsername() || "User";
  const canManage = role === "manager" || role === "owner";

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api.getSettings();
      setSettings(data);
      if (data.accepted_payment_methods?.length) setActivePaymentMethods(data.accepted_payment_methods);
    } catch (err: any) {
      setError(err.message || "Could not load settings.");
    } finally {
      setLoading(false);
    }
  }

  function flashNotice(text: string) {
    setNotice(text);
    setTimeout(() => setNotice(""), 2600);
  }

  async function save(patch: Record<string, any>, message: string, meta?: { name?: string; currency?: string; defaultTaxRate?: string | number; paymentMethods?: string[] }) {
    setError("");
    try {
      const updated = await api.updateSettings(patch);
      setSettings(updated);
      if (meta) {
        refreshActiveBusinessMeta({ name: meta.name, currency: meta.currency, defaultTaxRate: meta.defaultTaxRate });
        if (meta.paymentMethods) setActivePaymentMethods(meta.paymentMethods);
      }
      flashNotice(message);
    } catch (err: any) {
      setError(err.message || "Could not save settings.");
    }
  }

  function openSection(id: SectionId) {
    if (id === "permissions") {
      router.push("/team");
      return;
    }
    setError("");
    setActive(id);
  }

  return (
    <div className={styles.shell}>
      <Sidebar collapsed={false} branchSub={businessName} />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <div>
            <p className={styles.subtitle}>Configure your business</p>
            <h1 className={styles.title}>Settings</h1>
          </div>
        </div>

        {error && <div className={styles.errorBanner}><AlertCircle size={16} /> {error}</div>}
        {notice && <div className={styles.notice}><CheckCircle2 size={16} /> {notice}</div>}
        {!canManage && active && (
          <div className={styles.warnBanner}>
            You're viewing as {role}. Only managers and owners can edit settings — changes below won't be saved.
          </div>
        )}

        <div className={styles.settingsGrid}>
          {SETTINGS.map((item) => (
            <button
              key={item.id}
              className={`${styles.settingCard} ${active === item.id ? styles.settingCardActive : ""}`}
              onClick={() => openSection(item.id)}
            >
              <div className={styles.settingIcon}>
                {item.icon}
              </div>
              <div>
                <h2>{item.label}</h2>
                <p>{item.description}</p>
              </div>
            </button>
          ))}
        </div>

        {loading && <div className={styles.emptyState}>Loading settings…</div>}
        {!loading && !settings && !error && <div className={styles.emptyState}>No settings found for this business.</div>}

        {!loading && settings && active === "business" && (
          <BusinessPanel settings={settings} canManage={canManage} onSave={save} onBack={() => setActive(null)} />
        )}
        {!loading && settings && active === "payment" && (
          <PaymentPanel settings={settings} canManage={canManage} onSave={save} onBack={() => setActive(null)} />
        )}
        {!loading && settings && active === "tax" && (
          <TaxPanel settings={settings} canManage={canManage} onSave={save} onBack={() => setActive(null)} />
        )}
        {!loading && settings && active === "receipt" && (
          <ReceiptPanel settings={settings} canManage={canManage} onSave={save} onBack={() => setActive(null)} />
        )}
        {!loading && settings && active === "security" && (
          <SecurityPanel onBack={() => setActive(null)} />
        )}

        
      </main>
    </div>
  );
}

function BusinessPanel({ settings, canManage, onSave, onBack }: { settings: SettingsData; canManage: boolean; onSave: (patch: Record<string, any>, message: string, meta?: { name?: string; currency?: string }) => void; onBack: () => void }) {
  const [name, setName] = useState(settings.name);
  const [currency, setCurrency] = useState(settings.currency);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [isActive, setIsActive] = useState(settings.is_active);
  const [saving, setSaving] = useState(false);

  const tzOptions = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave({ name: name.trim(), currency, timezone, is_active: isActive }, "Business details updated.", { name: name.trim(), currency });
    setSaving(false);
  }

  return (
    <PanelShell title="Business settings" description="Store name, currency, and timezone shown across the register." onBack={onBack}>
      <form className={styles.formGrid} onSubmit={submit}>
        <Field label="Business name">
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} placeholder="e.g. Sanity Co Ltd" />
        </Field>

        <Field label="Currency">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={!canManage}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>

        <Field label="Timezone">
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!canManage}>
            {tzOptions.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </Field>

        <Field label="Business slug (read only)">
          <input value={settings.slug} disabled />
        </Field>

        <Field label="Plan (read only)">
          <input value={settings.plan} disabled />
        </Field>

        <div className={`${styles.field} ${styles.fullSpan}`}>
          <div className={styles.toggleRow}>
            <div>
              <div className={styles.toggleLabel}>Business active</div>
              <div className={styles.toggleHint}>Inactive businesses are hidden from the tenant switcher and POS.</div>
            </div>
            <Toggle checked={isActive} onChange={setIsActive} disabled={!canManage} />
          </div>
        </div>

        <div className={`${styles.panelFooter} ${styles.fullSpan}`}>
          <button type="submit" className="btn-primary" disabled={saving || !canManage}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Save size={15} /> {saving ? "Saving..." : "Save changes"}</span>
          </button>
        </div>
      </form>
    </PanelShell>
  );
}

function PaymentPanel({ settings, canManage, onSave, onBack }: { settings: SettingsData; canManage: boolean; onSave: (patch: Record<string, any>, message: string, meta?: { paymentMethods?: string[] }) => void; onBack: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(normalizeAccepted(settings.accepted_payment_methods)));
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");

  function toggle(key: string) {
    setLocalError("");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const methods = [...selected];
    if (methods.length === 0) {
      setLocalError("At least one payment method must be enabled.");
      return;
    }
    setSaving(true);
    await onSave({ accepted_payment_methods: methods }, "Payment methods updated.", { paymentMethods: methods });
    setSaving(false);
  }

  return (
    <PanelShell title="Payment methods" description="Choose which payment modes cashiers can accept at checkout." onBack={onBack}>
      {localError && <div className={styles.errorBanner}><AlertCircle size={16} /> {localError}</div>}
      <div className={styles.paymentList}>
        {ALL_PAYMENT_METHODS.map((m) => {
          const checked = selected.has(m.key);
          return (
            <div key={m.key} className={`${styles.paymentRow} ${checked ? styles.paymentRowOn : ""}`}>
              <div>
                <div className={styles.toggleLabel}>{m.label}</div>
                <div className={styles.toggleHint}>{m.hint}</div>
              </div>
              <Toggle checked={checked} onChange={() => toggle(m.key)} disabled={!canManage} />
            </div>
          );
        })}
      </div>
      <div className={styles.panelFooter}>
        <button className="btn-primary" onClick={submit} disabled={saving || !canManage}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Save size={15} /> {saving ? "Saving..." : "Save changes"}</span>
        </button>
      </div>
    </PanelShell>
  );
}

function TaxPanel({ settings, canManage, onSave, onBack }: { settings: SettingsData; canManage: boolean; onSave: (patch: Record<string, any>, message: string, meta?: { defaultTaxRate?: string | number }) => void; onBack: () => void }) {
  const [rate, setRate] = useState(settings.default_tax_rate);
  const [inclusive, setInclusive] = useState(settings.tax_inclusive_pricing);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(rate);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
      setLocalError("Tax rate must be a number between 0 and 100.");
      return;
    }
    setSaving(true);
    await onSave({ default_tax_rate: rate, tax_inclusive_pricing: inclusive }, "Tax settings updated.", { defaultTaxRate: rate });
    setSaving(false);
  }

  return (
    <PanelShell title="Tax rates" description="Default sales tax applied to items that don't have their own rate." onBack={onBack}>
      {localError && <div className={styles.errorBanner}><AlertCircle size={16} /> {localError}</div>}
      <form className={styles.formGrid} onSubmit={submit}>
        <Field label="Default tax rate (%)">
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            disabled={!canManage}
          />
        </Field>

        <div className={`${styles.field} ${styles.fullSpan}`}>
          <div className={styles.toggleRow}>
            <div>
              <div className={styles.toggleLabel}>Tax-inclusive pricing</div>
              <div className={styles.toggleHint}>When on, displayed prices already include tax. The register shows it as a breakdown line.</div>
            </div>
            <Toggle checked={inclusive} onChange={setInclusive} disabled={!canManage} />
          </div>
        </div>

        <div className={`${styles.panelFooter} ${styles.fullSpan}`}>
          <button type="submit" className="btn-primary" disabled={saving || !canManage}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Save size={15} /> {saving ? "Saving..." : "Save changes"}</span>
          </button>
        </div>
      </form>
    </PanelShell>
  );
}

function ReceiptPanel({ settings, canManage, onSave, onBack }: { settings: SettingsData; canManage: boolean; onSave: (patch: Record<string, any>, message: string) => void; onBack: () => void }) {
  const [header, setHeader] = useState(settings.receipt_header);
  const [footer, setFooter] = useState(settings.receipt_footer);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave({ receipt_header: header.trim(), receipt_footer: footer.trim() }, "Receipt settings updated.");
    setSaving(false);
  }

  return (
    <PanelShell title="Receipt settings" description="Customize the header and footer printed on every receipt." onBack={onBack}>
      <form className={styles.formGrid} onSubmit={submit}>
        <Field label="Receipt header">
          <input value={header} onChange={(e) => setHeader(e.target.value)} disabled={!canManage} placeholder="e.g. Thank you for shopping with us!" maxLength={255} />
        </Field>

        <Field label="Receipt footer">
          <input value={footer} onChange={(e) => setFooter(e.target.value)} disabled={!canManage} placeholder="e.g. Returns accepted within 7 days" maxLength={255} />
        </Field>

        <div className={styles.receiptPreview}>
          <div className={styles.receiptPreviewTop}>{header || "Your receipt header appears here"}</div>
          <div className={styles.receiptPreviewLines}>
            <div><span>Item</span><span>Qty</span><span>Amount</span></div>
            <div><span>Sample product</span><span>1</span><span>KES 100.00</span></div>
            <div className={styles.receiptPreviewTotal}><span>Total</span><span>KES 100.00</span></div>
          </div>
          <div className={styles.receiptPreviewBottom}>{footer || "Your receipt footer appears here"}</div>
        </div>

        <div className={`${styles.panelFooter} ${styles.fullSpan}`}>
          <button type="submit" className="btn-primary" disabled={saving || !canManage}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Save size={15} /> {saving ? "Saving..." : "Save changes"}</span>
          </button>
        </div>
      </form>
    </PanelShell>
  );
}

function SecurityPanel({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const username = getActiveUsername() || "User";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      await api.changePassword(current, next);
      setSuccess("Password updated successfully. Use it next time you sign in.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err: any) {
      setError(err.message || "Could not update password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PanelShell title="Security" description="Change the password for your account." onBack={onBack}>
      <div className={styles.securityAccount}>
        <div className={styles.securityAvatar}><KeyRound size={18} /></div>
        <div>
          <div className={styles.securityName}>Signed in as {username}</div>
          <div className={styles.securityHint}>Password changes take effect immediately on your next sign-in.</div>
        </div>
      </div>

      {error && <div className={styles.errorBanner}><AlertCircle size={16} /> {error}</div>}
      {success && <div className={styles.notice}><CheckCircle2 size={16} /> {success}</div>}

      <form className={styles.formGrid} onSubmit={submit}>
        <Field label="Current password">
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </Field>
        <Field label="New password">
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
        </Field>
        <Field label="Confirm new password">
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </Field>

        <div className={`${styles.panelFooter} ${styles.fullSpan}`}>
          <button type="submit" className="btn-primary" disabled={saving}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Save size={15} /> {saving ? "Updating..." : "Update password"}</span>
          </button>
        </div>
      </form>

      <div className={styles.roleMatrixNote}>
        <Users size={16} />
        <span>Team roles are managed from the Team page.</span>
        <button className="btn-secondary" style={{ marginLeft: "auto" }} onClick={() => router.push("/team")}>Manage team</button>
      </div>
    </PanelShell>
  );
}
