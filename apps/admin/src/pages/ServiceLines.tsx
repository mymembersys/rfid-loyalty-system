import { FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth } from "../api/auth";
import { Modal } from "../components/Modal";

type ServiceLine = {
  code: string;
  name: string;
  description: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type FormState = {
  code: string;
  name: string;
  description: string;
  color: string;
  sort_order: string;
};

const empty: FormState = {
  code: "",
  name: "",
  description: "",
  color: "#3b5bdb",
  sort_order: "0",
};

function fromRow(r: ServiceLine): FormState {
  return {
    code: r.code,
    name: r.name,
    description: r.description ?? "",
    color: r.color,
    sort_order: String(r.sort_order),
  };
}

const CODE_RE = /^[a-z][a-z0-9_]{1,29}$/;
const HEX     = /^#[0-9a-fA-F]{6}$/;

export function ServiceLines() {
  const { token, user } = useAuth();
  if (user && user.role !== "admin") return <Navigate to="/" replace />;

  const [items, setItems] = useState<ServiceLine[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(false);

  const [editing, setEditing] = useState<ServiceLine | "new" | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [deactivating, setDeactivating] = useState<ServiceLine | null>(null);
  const [deactBusy, setDeactBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await apiFetch<{ items: ServiceLine[] }>(
        `/service-lines${showInactive ? "?all=1" : ""}`,
        { token }
      );
      setItems(r.items);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [showInactive]);

  function openNew() {
    setForm(empty);
    setErr(null);
    setEditing("new");
  }
  function openEdit(r: ServiceLine) {
    setForm(fromRow(r));
    setErr(null);
    setEditing(r);
  }
  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);

    if (editing === "new" && !CODE_RE.test(form.code.trim())) {
      setErr("Code must be lowercase letters/digits/underscores, 2–30 chars, starting with a letter");
      return;
    }
    if (!form.name.trim()) { setErr("Name is required"); return; }
    if (!HEX.test(form.color)) { setErr("Color must be a #RRGGBB hex value"); return; }
    const sortNum = Number(form.sort_order);
    if (!Number.isInteger(sortNum)) { setErr("Sort order must be an integer"); return; }

    setBusy(true);
    try {
      const payload: Record<string, any> = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        color: form.color,
        sort_order: sortNum,
      };
      if (editing === "new") {
        payload.code = form.code.trim();
        await apiFetch("/service-lines", { method: "POST", token, body: JSON.stringify(payload) });
      } else if (editing) {
        await apiFetch(`/service-lines/${editing.code}`, { method: "PATCH", token, body: JSON.stringify(payload) });
      }
      setEditing(null);
      await load();
    } catch (e: any) {
      setErr(e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeactivate() {
    if (!deactivating) return;
    setDeactBusy(true);
    try {
      await apiFetch(`/service-lines/${deactivating.code}`, { method: "DELETE", token });
      setDeactivating(null);
      await load();
    } catch (e: any) {
      alert(e.message || "Failed");
    } finally {
      setDeactBusy(false);
    }
  }

  async function reactivate(r: ServiceLine) {
    try {
      await apiFetch(`/service-lines/${r.code}`, {
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
          <h1>Service Lines</h1>
          <p className="muted">
            Categories of service used across branches, rewards, and stamp rules.
            Adding a new code is permanent in the database — pick the slug carefully.
          </p>
        </div>
        <div className="actions">
          <label className="checkbox">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            <span>Show inactive</span>
          </label>
          <button className="btn-primary" onClick={openNew}>+ New Service Line</button>
        </div>
      </div>

      <div className="data-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Order</th><th>Color</th><th>Code</th><th>Display name</th>
              <th>Description</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.map(r => (
              <tr key={r.code} className={r.is_active ? undefined : "row-voided"}>
                <td>{r.sort_order}</td>
                <td>
                  <span className="sl-swatch" style={{ background: r.color }} title={r.color} />
                </td>
                <td className="mono">{r.code}</td>
                <td><b>{r.name}</b></td>
                <td className="muted small">{r.description || "—"}</td>
                <td>
                  <span className={`badge badge-${r.is_active ? "active" : "inactive"}`}>
                    {r.is_active ? "active" : "inactive"}
                  </span>
                </td>
                <td className="row-actions">
                  <button className="btn-ghost btn-sm" onClick={() => openEdit(r)}>Edit</button>
                  {r.is_active
                    ? <button className="btn-ghost btn-sm" onClick={() => setDeactivating(r)}>Deactivate</button>
                    : <button className="btn-ghost btn-sm" onClick={() => reactivate(r)}>Reactivate</button>}
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr><td colSpan={7} className="muted center">No service lines yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---------- create / edit ---------- */}
      <Modal
        open={editing !== null}
        title={editing === "new" ? "New service line" : `Edit "${(editing as ServiceLine | null)?.name ?? ""}"`}
        onClose={() => !busy && setEditing(null)}
        width={520}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
            <button className="btn-primary" form="sl-form" type="submit" disabled={busy}>
              {busy ? "Saving…" : editing === "new" ? "Create" : "Save changes"}
            </button>
          </>
        }
      >
        <form id="sl-form" onSubmit={submit} className="form-grid">
          <label className="field">
            <span>Code *</span>
            <input
              required
              className="mono"
              value={form.code}
              onChange={(e) => setField("code", e.target.value.toLowerCase())}
              placeholder="yoga"
              disabled={editing !== "new"}
              title={editing !== "new" ? "Code can't be renamed once created — it's used as a foreign key" : ""}
            />
          </label>
          <label className="field">
            <span>Sort order</span>
            <input
              type="number" step={1}
              value={form.sort_order}
              onChange={(e) => setField("sort_order", e.target.value)}
            />
          </label>
          <label className="field span-2">
            <span>Display name *</span>
            <input
              required
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Yoga"
            />
          </label>
          <label className="field span-2">
            <span>Description</span>
            <input
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="Short label for staff and customers"
            />
          </label>
          <label className="field span-2">
            <span>Color</span>
            <div className="color-row">
              <input
                type="color"
                className="color-swatch"
                value={form.color}
                onChange={(e) => setField("color", e.target.value)}
              />
              <input
                className="mono"
                value={form.color}
                onChange={(e) => setField("color", e.target.value)}
                maxLength={7}
              />
            </div>
          </label>
          {editing === "new" && (
            <p className="muted small span-2">
              <b>Note:</b> the code becomes a permanent value of the <span className="mono">service_line</span> enum.
              You can deactivate it later, but it can't be removed from the database.
            </p>
          )}
          {err && <div className="err span-2">{err}</div>}
        </form>
      </Modal>

      {/* ---------- deactivate ---------- */}
      <Modal
        open={!!deactivating}
        title="Deactivate service line"
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
            Deactivate <b>{deactivating.name}</b> (<span className="mono">{deactivating.code}</span>)?
            <br/>
            <span className="muted small">
              Existing branches, visits, and rewards keep their reference — this only hides the
              code from new dropdowns until reactivated.
            </span>
          </p>
        )}
      </Modal>
    </div>
  );
}
