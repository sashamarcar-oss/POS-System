"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Users, ShieldCheck, Clock, CheckCircle2, Briefcase, X, UserPlus,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { api, getActiveBusinessName } from "@/lib/api";
import styles from "./employees.module.css";

type Employee = {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  branch: string;
  status: "active" | "inactive" | "on_leave";
  permissions: string[];
  clockedIn: boolean;
  lastClockIn: string;
  lastClockOut: string;
  hoursToday: string;
};

const PERMISSIONS = [
  "Can Sell", "Can Refund", "Can Edit Products", "Can Manage Employees",
  "Can View Reports", "Can Approve Discounts",
];

export default function EmployeesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [notice, setNotice] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [teamError, setTeamError] = useState("");

  // create employee form state
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState("Cashier");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formBranch, setFormBranch] = useState("");
  const [formStatus, setFormStatus] = useState<"active" | "inactive" | "on_leave">("active");
  const [formPermissions, setFormPermissions] = useState<string[]>([]);
  const businessName = getActiveBusinessName();

  async function loadTeam() {
    setLoadingTeam(true);
    setTeamError("");
    try {
      const members = await api.listTeam();
      setEmployees(
        members.map((member: any) => ({
          id: String(member.id),
          name: member.username,
          role: member.role,
          phone: "",
          email: member.email || "",
          branch: "",
          status: "active",
          permissions: [],
          clockedIn: false,
          lastClockIn: "",
          lastClockOut: "",
          hoursToday: "0h 00m",
        }))
      );
    } catch (err: any) {
      setTeamError(err.message || "Could not load team members.");
    } finally {
      setLoadingTeam(false);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }
    loadTeam();
  }, [router]);

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    return employees.filter((employee) => {
      const matchesQuery =
        !query ||
        employee.name.toLowerCase().includes(query) ||
        employee.email.toLowerCase().includes(query) ||
        employee.phone.toLowerCase().includes(query) ||
        employee.branch.toLowerCase().includes(query);
      const matchesRole = roleFilter === "all" || employee.role === roleFilter;
      const matchesStatus = statusFilter === "all" || employee.status === statusFilter;
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [employees, search, roleFilter, statusFilter]);

  const totals = useMemo(() => ({
    total: employees.length,
    owners: employees.filter((e) => e.role === "Owner").length,
    managers: employees.filter((e) => e.role === "Manager").length,
    cashiers: employees.filter((e) => e.role === "Cashier").length,
    present: employees.filter((e) => e.clockedIn).length,
  }), [employees]);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  }

  function resetForm() {
    setFormName("");
    setFormRole("Cashier");
    setFormPhone("");
    setFormEmail("");
    setFormBranch("");
    setFormStatus("active");
    setFormPermissions([]);
  }

  function togglePermission(p: string) {
    setFormPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function createEmployee(e?: React.FormEvent) {
    e?.preventDefault();
    if (!formName.trim()) {
      flash("Please provide a name.");
      return;
    }
    const newEmp: Employee = {
      id: `e-${Date.now()}`,
      name: formName.trim(),
      role: formRole,
      phone: formPhone,
      email: formEmail,
      branch: formBranch || "Main Store",
      status: formStatus,
      permissions: formPermissions,
      clockedIn: false,
      lastClockIn: "",
      lastClockOut: "",
      hoursToday: "0h 00m",
    };
    setEmployees((prev) => [newEmp, ...prev]);
    resetForm();
    setShowModal(false);
    flash(`Employee ${newEmp.name} created.`);
  }

  function closeModal() {
    setShowModal(false);
  }

  const initials = formName.trim()
    ? formName.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")
    : "—";

  return (
    <div className={styles.shell}>
      <Sidebar collapsed={false} branchSub={businessName} />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <div>
            <p className={styles.subtitle}>Manage staff</p>
            <h1 className={styles.title}>Employees</h1>
          </div>
          <button className="btn-primary" onClick={() => { setShowModal(true); setNotice(""); }}>
            Add employee
          </button>
        </div>

        {notice && <div className={styles.notice}>{notice}</div>}

        <div className={styles.summaryGrid}>
          {teamError && <div className={styles.errorBanner}>{teamError}</div>}
          <div className={styles.summaryCard}>
            <div className={styles.summaryAccent}><Users size={18} /></div>
            <div>
              <p className={styles.summaryLabel}>Team size</p>
              <p className={styles.summaryValue}>{totals.total}</p>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryAccent}><CheckCircle2 size={18} /></div>
            <div>
              <p className={styles.summaryLabel}>Present now</p>
              <p className={styles.summaryValue}>{totals.present}</p>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryAccent}><Briefcase size={18} /></div>
            <div>
              <p className={styles.summaryLabel}>Managers</p>
              <p className={styles.summaryValue}>{totals.managers}</p>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryAccent}><ShieldCheck size={18} /></div>
            <div>
              <p className={styles.summaryLabel}>Owner / accountant</p>
              <p className={styles.summaryValue}>{totals.owners + 1}</p>
            </div>
          </div>
        </div>

        <div className={styles.controlsRow}>
          <div className={styles.searchBox}>
            <Search size={18} />
            <input
              type="search"
              placeholder="Search employees"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={styles.filterSelect}>
            <option value="all">All roles</option>
            <option value="Owner">Owner</option>
            <option value="Manager">Manager</option>
            <option value="Cashier">Cashier</option>
            <option value="Stock Manager">Stock Manager</option>
            <option value="Accountant">Accountant</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={styles.filterSelect}>
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="on_leave">On leave</option>
          </select>
        </div>

        <section className={styles.sectionCard}>
          {loadingTeam && <div className={styles.emptyState}>Loading employees…</div>}
          <div className={styles.sectionHeader}>
            <div>
              <h2>Attendance</h2>
              <p>Track clock in / clock out and working hours.</p>
            </div>
            <button className="btn-secondary" onClick={() => flash("Attendance sync coming soon")}>Sync attendance</button>
          </div>
          <div className={styles.attendanceGrid}>
            {employees.map((employee) => (
              <div key={employee.id} className={styles.attendanceCard}>
                <div>
                  <strong>{employee.name}</strong>
                  <p>{employee.role} • {employee.branch}</p>
                </div>
                <div className={styles.timeRow}>
                  <span><Clock size={14} /> In: {employee.lastClockIn || "—"}</span>
                  <span><Clock size={14} /> Out: {employee.lastClockOut || "—"}</span>
                </div>
                <div className={styles.hours}>{employee.hoursToday}</div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.tableSection}>
          <div className={styles.tableHeader}>
            <div>
              <h2>Employee roster</h2>
              <p>Manage roles, branches, permissions, and status.</p>
            </div>
            <button className="btn-secondary" onClick={() => flash("Bulk permission update coming soon")}>Update permissions</button>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.employeeTable}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Branch</th>
                  <th>Status</th>
                  <th>Permissions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => (
                  <tr key={employee.id}>
                    <td>{employee.name}</td>
                    <td>{employee.role}</td>
                    <td>{employee.phone}</td>
                    <td>{employee.email}</td>
                    <td>{employee.branch}</td>
                    <td>{employee.status === "active" ? "Active" : employee.status === "inactive" ? "Inactive" : "On leave"}</td>
                    <td className={styles.permissionCell}>
                      {employee.permissions.slice(0, 3).join(", ")}
                      {employee.permissions.length > 3 ? ` +${employee.permissions.length - 3} more` : ""}
                    </td>
                  </tr>
                ))}
                {filteredEmployees.length === 0 && (
                  <tr>
                    <td colSpan={7} className={styles.emptyState}>No employees match the filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {showModal && (
          <div className={styles.modalOverlay} onClick={closeModal}>
            <div className={styles.modal} onClick={(ev) => ev.stopPropagation()}>
              <div className={styles.modalHeader}>
                <div className={styles.modalHeaderLeft}>
                  <div className={styles.modalHeaderIcon}><UserPlus size={18} /></div>
                  <div>
                    <h3>Create employee</h3>
                    <p>Add a new team member and set what they can do.</p>
                  </div>
                </div>
                <button type="button" className={styles.closeBtn} onClick={closeModal}><X size={18} /></button>
              </div>

              <form className={styles.modalForm} onSubmit={createEmployee}>
                <div className={styles.modalScroll}>
                  <div className={styles.modalGrid}>
                    <div className={styles.leftCol}>
                      <div className={styles.fieldCard}>
                        <span className={styles.fieldCardLabel}>Basic details</span>

                        <div className={styles.formRow}>
                          <label>Full name</label>
                          <input className={styles.input} value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Caren Maru" />
                        </div>

                        <div className={styles.formRowTwo}>
                          <div>
                            <label>Role</label>
                            <select className={styles.input} value={formRole} onChange={(e) => setFormRole(e.target.value)}>
                              <option>Owner</option>
                              <option>Manager</option>
                              <option>Cashier</option>
                              <option>Stock Manager</option>
                              <option>Accountant</option>
                            </select>
                          </div>
                          <div>
                            <label>Status</label>
                            <select className={styles.input} value={formStatus} onChange={(e) => setFormStatus(e.target.value as any)}>
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                              <option value="on_leave">On leave</option>
                            </select>
                          </div>
                        </div>

                        <div className={styles.formRowTwo}>
                          <div>
                            <label>Phone</label>
                            <input className={styles.input} value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="+254 700 000000" />
                          </div>
                          <div>
                            <label>Email</label>
                            <input className={styles.input} value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="name@example.com" />
                          </div>
                        </div>

                        <div className={styles.formRow}>
                          <label>Branch</label>
                          <input className={styles.input} value={formBranch} onChange={(e) => setFormBranch(e.target.value)} placeholder="Main Store" />
                        </div>
                      </div>
                    </div>

                    <aside className={styles.rightCol}>
                      <div className={styles.fieldCard}>
                        <span className={styles.fieldCardLabel}>Permissions</span>
                        <p className={styles.sideDesc}>Choose what this employee is allowed to do.</p>
                        <div className={styles.checkboxGridLarge}>
                          {PERMISSIONS.map((p) => {
                            const checked = formPermissions.includes(p);
                            return (
                              <label key={p} className={`${styles.checkboxLabelLarge} ${checked ? styles.checkboxChecked : ""}`}>
                                <input type="checkbox" checked={checked} onChange={() => togglePermission(p)} />
                                <span>{p}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div className={styles.previewCard}>
                        <div className={styles.previewAvatar}>{initials}</div>
                        <div>
                          <div className={styles.previewName}>{formName || "New employee"}</div>
                          <div className={styles.previewMeta}>{formRole} • {formBranch || "Main Store"}</div>
                          {formEmail && <div className={styles.previewLine}>{formEmail}</div>}
                          {formPhone && <div className={styles.previewLine}>{formPhone}</div>}
                        </div>
                      </div>
                    </aside>
                  </div>
                </div>

                <div className={styles.modalActions}>
                  <button type="button" className="btn-secondary" onClick={() => { closeModal(); resetForm(); }}>Cancel</button>
                  <button type="submit" className="btn-primary">Create employee</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
