import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import { useAuth } from "../api/auth";
import { Modal } from "../components/Modal";

type ServiceLine = "diagnostic" | "psychological" | "gym";

type Branch = {
  id: string; code: string; name: string;
  service_line: ServiceLine; address: string | null; phone: string | null;
  is_active: boolean;
};

type FormState = {
  code: string;
  name: string;
  service_line: ServiceLine;
  address: string;
  phone: string;
};

const emptyForm: FormState = {
  code: "",
  name: "",
  service_line: "gym",
  address: "",
  phone: "",
};

function fromBranch(b: Branch): FormState {
  return {
    code: b.code,
    name: b.name,
    service_line: b.service_line,
    address: b.address ?? "",
    phone: b.phone ?? "",
  };
}

export function Branches() {
  const { token, user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState<Branch[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(false);

  // create / edit modal
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // deactivate confirm
  const [deactivating, setDeactivating] = useState<Branch | null>(null);
  const [deactBusy, setDeactBusy] = useState(false);
  const [deactErr, setDeactErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await apiFetch<{ items: Branch[] }>(
        `/branches${showInactive ? "?all=1" : ""}`,
        { token }
      );
      setItems(r.items);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [showInactive]);

  function openNew() {
    setForm(emptyForm);
    setErr(null);
    setEditing("new");
  }
  function openEdit(b: Branch) {
    setForm(fromBranch(b));
    setErr(null);
    setEditing(b);
  }
  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!form.code.trim() || form.code.trim().length < 2) { setErr("Code must be at least 2 characters"); return; }
    if (!form.name.trim()) { setErr("Name is required"); return; }
    setBusy(true);
    try {
      const payload: Record<string, any> = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        service_line: form.service_line,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
      };
      if (editing === "new") {
        // POST schema doesn't accept null for optional address/phone — strip them
        const createPayload: Record<string, any> = { ...payload };
        if (createPayload.address === null) delete createPayload.address;
        if (createPayload.phone === null)   delete createPayload.phone;
        await apiFetch("/branches", { method: "POST", token, body: JSON.stringify(createPayload) });
      } else if (editing) {
        await apiFetch(`/branches/${editing.id}`, { method: "PATCH", token, body: JSON.stringify(payload) });
      }
      setEditing(null);
      await load();
    } catch (e: any) {
      setErr(e.message || "Failed to save branch");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeactivate() {
    if (!deactivating) return;
    setDeactErr(null);
    setDeactBusy(true);
    try {
      await apiFetch(`/branches/${deactivating.id}`, { method: "DELETE", token });
      setDeactivating(null);
      await load();
    } catch (e: any) {
      setDeactErr(e.message || "Failed to deactivate");
    } finally {
      setDeactBusy(false);
    }
  }

  async function reactivate(b: Branch) {
    try {
      await apiFetch(`/branches/${b.id}`, {
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
          <h1>Branches</h1>
          <p className="muted">Service locations available in the network.</p>
        </div>
        <div className="actions">
          {isAdmin && (
            <label className="checkbox">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              <span>Show inactive</span>
            </label>
          )}
          {isAdmin && <button className="btn-primary" onClick={openNew}>+ New Branch</button>}
        </div>
      </div>

      <div className="data-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Code</th><th>Name</th><th>Service Line</th>
              <th>Address</th><th>Phone</th><th>Status</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {items.map(b => (
              <tr key={b.id} className={b.is_active ? undefined : "row-voided"}>
                <td className="mono">{b.code}</td>
                <td>{b.name}</td>
                <td><span className="badge badge-active">{b.service_line}</span></td>
                <td>{b.address || <span className="muted">—</span>}</td>
                <td>{b.phone || <span className="muted">—</span>}</td>
                <td>
                  <span className={`badge badge-${b.is_active ? "active" : "inactive"}`}>
                    {b.is_active ? "active" : "inactive"}
                  </span>
                </td>
                {isAdmin && (
                  <td className="row-actions">
                    <button className="btn-ghost btn-sm" onClick={() => openEdit(b)}>Edit</button>
                    {b.is_active
                      ? <button className="btn-ghost btn-sm" onClick={() => setDeactivating(b)}>Deactivate</button>
                      : <button className="btn-ghost btn-sm" onClick={() => reactivate(b)}>Reactivate</button>}
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="muted center">
                  No branches yet.
                  {isAdmin && <> Click <b>+ New Branch</b> to add one.</>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---------- create / edit ---------- */}
      <Modal
        open={editing !== null}
        title={editing === "new" ? "New branch" : "Edit branch"}
        onClose={() => !busy && setEditing(null)}
        width={520}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
            <button className="btn-primary" form="branch-form" type="submit" disabled={busy}>
              {busy ? "Saving…" : editing === "new" ? "Create branch" : "Save changes"}
            </button>
          </>
        }
      >
        <form id="branch-form" onSubmit={submit} className="form-grid">
          <label className="field">
            <span>Code *</span>
            <input
              required
              className="mono"
              value={form.code}
              onChange={(e) => setField("code", e.target.value.toUpperCase())}
              placeholder="DG-MNL-01"
            />
          </label>
          <label className="field">
            <span>Service line *</span>
            <select value={form.service_line} onChange={(e) => setField("service_line", e.target.value as ServiceLine)}>
              <option value="diagnostic">Diagnostic</option>
              <option value="psychological">Psychological</option>
              <option value="gym">Gym</option>
            </select>
          </label>
          <label className="field span-2">
            <span>Name *</span>
            <input
              required
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Diagnostic — Manila"
            />
          </label>
          <label className="field span-2">
            <span>Address</span>
            <input
              value={form.address}
              onChange={(e) => setField("address", e.target.value)}
              placeholder="Street, city"
            />
          </label>
          <label className="field span-2">
            <span>Phone</span>
            <input
              value={form.phone}
              onChange={(e) => setField("phone", e.target.value)}
              placeholder="+63 …"
            />
          </label>
          {err && <div className="err span-2">{err}</div>}
        </form>
      </Modal>

      {/* ---------- deactivate ---------- */}
      <Modal
        open={!!deactivating}
        title="Deactivate branch"
        onClose={() => !deactBusy && setDeactivating(null)}
        width={440}
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
            Deactivate <b>{deactivating.name}</b> (<span className="mono">{deactivating.code}</span>)?
            <br/>
            <span className="muted small">
              Existing visits, cards, and stamp rules referencing this branch are kept.
              Terminals signed in to this branch will stop receiving new check-ins until it's reactivated.
            </span>
          </p>
        )}
        {deactErr && <div className="err">{deactErr}</div>}
      </Modal>
    </div>
  );
}
