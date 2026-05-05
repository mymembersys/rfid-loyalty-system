import { FormEvent, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth } from "../api/auth";
import { Modal } from "../components/Modal";

type Role = "admin" | "manager" | "frontdesk" | "auditor";

type User = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  branch_id: string | null;
  branch_name: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
};

type Branch = { id: string; name: string; service_line: string; };

type CreateForm = {
  email: string;
  password: string;
  full_name: string;
  role: Role;
  branch_id: string;
};

type EditForm = {
  full_name: string;
  role: Role;
  branch_id: string;
  is_active: boolean;
};

const emptyCreate: CreateForm = {
  email: "",
  password: "",
  full_name: "",
  role: "frontdesk",
  branch_id: "",
};

function fromUser(u: User): EditForm {
  return {
    full_name: u.full_name,
    role: u.role,
    branch_id: u.branch_id ?? "",
    is_active: u.is_active,
  };
}

const ROLE_DESC: Record<Role, string> = {
  admin: "Full access; manages branches, stamp rules, and users.",
  manager: "Operations: edit members, void visits, manage rewards.",
  frontdesk: "Daily desk: enroll members, issue cards, check in, redeem.",
  auditor: "Read-only across the network.",
};

export function Users() {
  const { token, user } = useAuth();
  if (user && user.role !== "admin") return <Navigate to="/" replace />;

  const [items, setItems] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(false);

  // create modal
  const [showNew, setShowNew] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreate);
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  // edit modal
  const [editing, setEditing] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);

  // reset password modal
  const [resetting, setResetting] = useState<User | null>(null);
  const [resetPwd, setResetPwd] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetErr, setResetErr] = useState<string | null>(null);

  // deactivate modal
  const [deactivating, setDeactivating] = useState<User | null>(null);
  const [deactBusy, setDeactBusy] = useState(false);
  const [deactErr, setDeactErr] = useState<string | null>(null);

  const branchById = useMemo(() => Object.fromEntries(branches.map(b => [b.id, b])), [branches]);

  async function load() {
    setLoading(true);
    try {
      const [u, b] = await Promise.all([
        apiFetch<{ items: User[] }>(`/users${showInactive ? "?all=1" : ""}`, { token }),
        apiFetch<{ items: Branch[] }>(`/branches`, { token }),
      ]);
      setItems(u.items);
      setBranches(b.items);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [showInactive]);

  // ---- create ----
  function openNew() {
    setCreateForm(emptyCreate);
    setCreateErr(null);
    setShowNew(true);
  }
  function setCreateField<K extends keyof CreateForm>(k: K, v: CreateForm[K]) {
    setCreateForm(f => ({ ...f, [k]: v }));
  }
  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    setCreateErr(null);
    if (createForm.password.length < 8) { setCreateErr("Password must be at least 8 characters"); return; }
    setCreateBusy(true);
    try {
      await apiFetch("/users", {
        method: "POST",
        token,
        body: JSON.stringify({
          email: createForm.email.trim(),
          password: createForm.password,
          full_name: createForm.full_name.trim(),
          role: createForm.role,
          branch_id: createForm.branch_id || null,
        }),
      });
      setShowNew(false);
      await load();
    } catch (e: any) {
      setCreateErr(e.message || "Failed to create user");
    } finally {
      setCreateBusy(false);
    }
  }

  // ---- edit ----
  function openEdit(u: User) {
    setEditing(u);
    setEditForm(fromUser(u));
    setEditErr(null);
  }
  function setEditField<K extends keyof EditForm>(k: K, v: EditForm[K]) {
    setEditForm(f => (f ? { ...f, [k]: v } : f));
  }
  async function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing || !editForm) return;
    setEditErr(null);
    setEditBusy(true);
    try {
      await apiFetch(`/users/${editing.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          full_name: editForm.full_name.trim(),
          role: editForm.role,
          branch_id: editForm.branch_id || null,
          is_active: editForm.is_active,
        }),
      });
      setEditing(null);
      await load();
    } catch (e: any) {
      setEditErr(e.message || "Failed to update user");
    } finally {
      setEditBusy(false);
    }
  }

  // ---- reset password ----
  function openReset(u: User) {
    setResetting(u);
    setResetPwd("");
    setResetErr(null);
  }
  async function submitReset(e: FormEvent) {
    e.preventDefault();
    if (!resetting) return;
    setResetErr(null);
    if (resetPwd.length < 8) { setResetErr("Password must be at least 8 characters"); return; }
    setResetBusy(true);
    try {
      await apiFetch(`/users/${resetting.id}/reset-password`, {
        method: "POST",
        token,
        body: JSON.stringify({ password: resetPwd }),
      });
      setResetting(null);
    } catch (e: any) {
      setResetErr(e.message || "Failed to reset password");
    } finally {
      setResetBusy(false);
    }
  }

  // ---- deactivate / reactivate ----
  function openDeactivate(u: User) {
    setDeactivating(u);
    setDeactErr(null);
  }
  async function confirmDeactivate() {
    if (!deactivating) return;
    setDeactErr(null);
    setDeactBusy(true);
    try {
      await apiFetch(`/users/${deactivating.id}`, { method: "DELETE", token });
      setDeactivating(null);
      await load();
    } catch (e: any) {
      setDeactErr(e.message || "Failed to deactivate");
    } finally {
      setDeactBusy(false);
    }
  }
  async function reactivate(u: User) {
    try {
      await apiFetch(`/users/${u.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ is_active: true }),
      });
      await load();
    } catch (e: any) { alert(e.message || "Failed"); }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p className="muted">Staff accounts that can sign in to the portal or terminal.</p>
        </div>
        <div className="actions">
          <label className="checkbox">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            <span>Show inactive</span>
          </label>
          <button className="btn-primary" onClick={openNew}>+ New User</button>
        </div>
      </div>

      <div className="data-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Role</th><th>Branch</th>
              <th>Last login</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.map(u => {
              const isSelf = u.id === user?.id;
              return (
                <tr key={u.id} className={u.is_active ? undefined : "row-voided"}>
                  <td>
                    {u.full_name}
                    {isSelf && <small className="muted"> (you)</small>}
                  </td>
                  <td className="mono small">{u.email}</td>
                  <td><span className={`badge badge-role-${u.role}`}>{u.role}</span></td>
                  <td>{u.branch_name || (u.branch_id ? branchById[u.branch_id]?.name : <span className="muted">—</span>)}</td>
                  <td>{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : <span className="muted">never</span>}</td>
                  <td>
                    <span className={`badge badge-${u.is_active ? "active" : "inactive"}`}>
                      {u.is_active ? "active" : "inactive"}
                    </span>
                  </td>
                  <td className="row-actions">
                    <button className="btn-ghost btn-sm" onClick={() => openEdit(u)}>Edit</button>
                    <button className="btn-ghost btn-sm" onClick={() => openReset(u)}>Reset password</button>
                    {u.is_active
                      ? <button className="btn-ghost btn-sm" onClick={() => openDeactivate(u)} disabled={isSelf}>Deactivate</button>
                      : <button className="btn-ghost btn-sm" onClick={() => reactivate(u)}>Reactivate</button>}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && !loading && (
              <tr><td colSpan={7} className="muted center">No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---------- create ---------- */}
      <Modal
        open={showNew}
        title="New user"
        onClose={() => !createBusy && setShowNew(false)}
        width={520}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setShowNew(false)} disabled={createBusy}>Cancel</button>
            <button className="btn-primary" form="user-create-form" type="submit" disabled={createBusy}>
              {createBusy ? "Creating…" : "Create user"}
            </button>
          </>
        }
      >
        <form id="user-create-form" onSubmit={submitCreate} className="form-grid">
          <label className="field span-2">
            <span>Full name *</span>
            <input required value={createForm.full_name} onChange={(e) => setCreateField("full_name", e.target.value)} />
          </label>
          <label className="field span-2">
            <span>Email *</span>
            <input
              required type="email"
              value={createForm.email}
              onChange={(e) => setCreateField("email", e.target.value)}
              placeholder="user@example.com"
            />
          </label>
          <label className="field span-2">
            <span>Password * <small className="muted">(min 8 characters)</small></span>
            <input
              required type="password" minLength={8}
              value={createForm.password}
              onChange={(e) => setCreateField("password", e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="field">
            <span>Role *</span>
            <select value={createForm.role} onChange={(e) => setCreateField("role", e.target.value as Role)}>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="frontdesk">Front desk</option>
              <option value="auditor">Auditor</option>
            </select>
          </label>
          <label className="field">
            <span>Branch</span>
            <select value={createForm.branch_id} onChange={(e) => setCreateField("branch_id", e.target.value)}>
              <option value="">— None —</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <p className="muted small span-2">{ROLE_DESC[createForm.role]}</p>
          {createErr && <div className="err span-2">{createErr}</div>}
        </form>
      </Modal>

      {/* ---------- edit ---------- */}
      <Modal
        open={!!editing}
        title="Edit user"
        onClose={() => !editBusy && setEditing(null)}
        width={520}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)} disabled={editBusy}>Cancel</button>
            <button className="btn-primary" form="user-edit-form" type="submit" disabled={editBusy}>
              {editBusy ? "Saving…" : "Save changes"}
            </button>
          </>
        }
      >
        {editing && editForm && (
          <form id="user-edit-form" onSubmit={submitEdit} className="form-grid">
            <p className="muted small span-2 mono">{editing.email}</p>
            <label className="field span-2">
              <span>Full name *</span>
              <input required value={editForm.full_name} onChange={(e) => setEditField("full_name", e.target.value)} />
            </label>
            <label className="field">
              <span>Role *</span>
              <select
                value={editForm.role}
                onChange={(e) => setEditField("role", e.target.value as Role)}
                disabled={editing.id === user?.id}
                title={editing.id === user?.id ? "Cannot change your own role" : ""}
              >
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="frontdesk">Front desk</option>
                <option value="auditor">Auditor</option>
              </select>
            </label>
            <label className="field">
              <span>Branch</span>
              <select value={editForm.branch_id} onChange={(e) => setEditField("branch_id", e.target.value)}>
                <option value="">— None —</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="checkbox span-2">
              <input
                type="checkbox"
                checked={editForm.is_active}
                onChange={(e) => setEditField("is_active", e.target.checked)}
                disabled={editing.id === user?.id}
              />
              <span>Account active</span>
            </label>
            <p className="muted small span-2">{ROLE_DESC[editForm.role]}</p>
            {editErr && <div className="err span-2">{editErr}</div>}
          </form>
        )}
      </Modal>

      {/* ---------- reset password ---------- */}
      <Modal
        open={!!resetting}
        title="Reset password"
        onClose={() => !resetBusy && setResetting(null)}
        width={440}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setResetting(null)} disabled={resetBusy}>Cancel</button>
            <button className="btn-primary" form="user-reset-form" type="submit" disabled={resetBusy}>
              {resetBusy ? "Saving…" : "Set password"}
            </button>
          </>
        }
      >
        <form id="user-reset-form" onSubmit={submitReset} className="form-grid">
          {resetting && (
            <p className="muted span-2">
              Set a new password for <b>{resetting.full_name}</b> (<span className="mono">{resetting.email}</span>).
              The user will need to use the new password on next sign-in.
            </p>
          )}
          <label className="field span-2">
            <span>New password * <small className="muted">(min 8 characters)</small></span>
            <input
              autoFocus required type="password" minLength={8}
              value={resetPwd}
              onChange={(e) => setResetPwd(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          {resetErr && <div className="err span-2">{resetErr}</div>}
        </form>
      </Modal>

      {/* ---------- deactivate ---------- */}
      <Modal
        open={!!deactivating}
        title="Deactivate user"
        onClose={() => !deactBusy && setDeactivating(null)}
        width={420}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setDeactivating(null)} disabled={deactBusy}>Cancel</button>
            <button className="btn-primary" onClick={confirmDeactivate} disabled={deactBusy}>
              {deactBusy ? "Deactivating…" : "Deactivate"}
            </button>
          </>
        }
      >
        {deactivating && (
          <p>
            Deactivate <b>{deactivating.full_name}</b>?<br/>
            <span className="muted small">They will no longer be able to sign in. Their history and audit entries are preserved.</span>
          </p>
        )}
        {deactErr && <div className="err">{deactErr}</div>}
      </Modal>
    </div>
  );
}
