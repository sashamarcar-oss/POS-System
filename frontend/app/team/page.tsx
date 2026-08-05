"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { api, getActiveRole, getActiveBusinessName } from "@/lib/api";
import styles from "./team.module.css";

type Member = {
  id: number;
  username: string;
  email: string;
  role: "owner" | "manager" | "cashier";
};

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export default function TeamPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("cashier");
  const [error, setError] = useState("");
  const businessName = getActiveBusinessName();
  const myRole = getActiveRole();

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      const data = await api.listTeam();
      setMembers(data.results || data);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.addTeamMember(username, role);
      setUsername("");
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleRoleChange(id: number, newRole: string) {
    try {
      await api.updateTeamMemberRole(id, newRole);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleRemove(id: number) {
    try {
      await api.removeTeamMember(id);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className={styles.shell}>
      <Sidebar collapsed={false} branchSub={businessName} />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <p className={styles.subtitle}>Team access</p>
          <h1 className={styles.title}>Team</h1>
          <p className={styles.description}>Manage who has access to this business and their role.</p>
        </div>

        {myRole !== "owner" && (
          <div className={styles.notice}>
            Only owners can manage the team. You can view this page, but changes will be rejected by the server.
          </div>
        )}

        {error && <div className={styles.errorBanner}>{error}</div>}

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Members</h2>
          <p className={styles.cardHint}>{members.length} {members.length === 1 ? "person has" : "people have"} access</p>

          {members.length === 0 ? (
            <div className={styles.emptyState}>No team members yet.</div>
          ) : (
            members.map((m) => (
              <div key={m.id} className={styles.memberRow}>
                <div className={styles.memberInfo}>
                  <div className={styles.avatar}>{initials(m.username)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className={styles.memberName}>{m.username}</div>
                    <div className={styles.memberEmail}>{m.email}</div>
                  </div>
                </div>
                <div className={styles.memberActions}>
                  <select
                    className={styles.roleSelect}
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.id, e.target.value)}
                  >
                    <option value="cashier">Cashier</option>
                    <option value="manager">Manager</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button className={styles.removeBtn} onClick={() => handleRemove(m.id)} title="Remove member">
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Add a team member</h2>
          <p className={styles.cardHint}>They must already have an account (self-serve invites are a future improvement).</p>
          <form onSubmit={handleAdd} className={styles.addForm}>
            <input
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="cashier">Cashier</option>
              <option value="manager">Manager</option>
              <option value="owner">Owner</option>
            </select>
            <button className="btn-primary" type="submit">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <UserPlus size={16} /> Add
              </span>
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
