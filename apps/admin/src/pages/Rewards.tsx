import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import { useAuth } from "../api/auth";
import { useServiceLines } from "../hooks/useServiceLines";
import { Modal } from "../components/Modal";

type Reward = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  service_line: string | null;
  stamps_cost: number;
  validity_days: number;
  per_member_limit: number | null;
  is_active: boolean;
};

type FormState = {
  code: string;
  name: string;
  description: string;
  service_line: string;       // "" = any
  stamps_cost: string;
  validity_days: string;
  per_member_limit: string;   // "" = unlimited
};

const emptyForm: FormState = {
  code: "",
  name: "",
  description: "",
  service_line: "",
  stamps_cost: "",
  validity_days: "30",
  per_member_limit: "",
};

function fromReward(r: Reward): FormState {
  return {
    code: r.code,
    name: r.name,
    description: r.description ?? "",
    service_line: r.service_line ?? "",
    stamps_cost: String(r.stamps_cost),
    validity_days: String(r.validity_days),
    per_member_limit: r.per_member_limit == null ? "" : String(r.per_member_limit),
  };
}

export function Rewards() {
  const { token, user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "manager";
  const serviceLines = useServiceLines(token);
  const [items, setItems] = useState<Reward[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(false);

  const [editing, setEditing] = useState<Reward | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await apiFetch<{ items: Reward[] }>(`/rewards${showInactive ? "?all=1" : ""}`, { token });
      setItems(r.items);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [showInactive]);

  function openNew() {
    setForm(emptyForm);
    setErr(null);
    setEditing("new");
  }
  function openEdit(r: Reward) {
    setForm(fromReward(r));
    setErr(null);
    setEditing(r);
  }
  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function buildPayload(): Record<string, any> | { error: string } {
    const cost = Number(form.stamps_cost);
    const days = Number(form.validity_days);
    if (!form.code.trim() || form.code.trim().length < 2) return { error: "Code must be at least 2 characters" };
    if (!form.name.trim()) return { error: "Name is required" };
    if (!Number.isInteger(cost) || cost <= 0) return { error: "Stamps cost must be a positive integer" };
    if (!Number.isInteger(days) || days <= 0) return { error: "Validity days must be a positive integer" };

    const payload: Record<string, any> = {
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      service_line: form.service_line || null,
      stamps_cost: cost,
      validity_days: days,
    };
    if (form.per_member_limit) {
      const limit = Number(form.per_member_limit);
      if (!Number.isInteger(limit) || limit <= 0) return { error: "Per-member limit must be a positive integer or empty" };
      payload.per_member_limit = limit;
    } else {
      payload.per_member_limit = null;
    }
    return payload;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const payload = buildPayload();
    if ("error" in payload) { setErr(payload.error); return; }
    setBusy(true);
    try {
      if (editing === "new") {
        await apiFetch("/rewards", { method: "POST", token, body: JSON.stringify(payload) });
      } else if (editing) {
        await apiFetch(`/rewards/${editing.id}`, { method: "PATCH", token, body: JSON.stringify(payload) });
      }
      setEditing(null);
      await load();
    } catch (e: any) {
      setErr(e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(r: Reward) {
    if (!confirm(`Deactivate reward "${r.name}"? It will no longer be redeemable.`)) return;
    try {
      await apiFetch(`/rewards/${r.id}`, { method: "DELETE", token });
      await load();
    } catch (e: any) { alert(e.message || "Failed"); }
  }

  async function reactivate(r: Reward) {
    try {
      await apiFetch(`/rewards/${r.id}`, {
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
          <h1>Rewards Catalog</h1>
          <p className="muted">Items members can redeem with their stamps.</p>
        </div>
        <div className="actions">
          <label className="checkbox">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            <span>Show inactive</span>
          </label>
          {canEdit && <button className="btn-primary" onClick={openNew}>+ New Reward</button>}
        </div>
      </div>

      <div className="data-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Code</th><th>Name</th><th>Service Line</th>
              <th>Stamps</th><th>Validity</th><th>Per-member</th>
              <th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.map(r => (
              <tr key={r.id} className={r.is_active ? undefined : "row-voided"}>
                <td className="mono">{r.code}</td>
                <td>
                  {r.name}
                  {r.description && <div className="muted small">{r.description}</div>}
                </td>
                <td>{
                  r.service_line
                    ? (serviceLines.find(s => s.code === r.service_line)?.name || r.service_line)
                    : <span className="muted">any</span>
                }</td>
                <td><b>{r.stamps_cost}</b></td>
                <td>{r.validity_days} days</td>
                <td>{r.per_member_limit ?? <span className="muted">—</span>}</td>
                <td>
                  <span className={`badge badge-${r.is_active ? "active" : "inactive"}`}>
                    {r.is_active ? "active" : "inactive"}
                  </span>
                </td>
                <td className="row-actions">
                  {canEdit && <>
                    <button className="btn-ghost btn-sm" onClick={() => openEdit(r)}>Edit</button>
                    {r.is_active
                      ? <button className="btn-ghost btn-sm" onClick={() => deactivate(r)}>Deactivate</button>
                      : <button className="btn-ghost btn-sm" onClick={() => reactivate(r)}>Reactivate</button>}
                  </>}
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr><td colSpan={8} className="muted center">No rewards yet. Click <b>+ New Reward</b> to create one.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={editing !== null}
        title={editing === "new" ? "New reward" : "Edit reward"}
        onClose={() => !busy && setEditing(null)}
        width={560}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
            <button className="btn-primary" form="reward-form" type="submit" disabled={busy}>
              {busy ? "Saving…" : editing === "new" ? "Create reward" : "Save changes"}
            </button>
          </>
        }
      >
        <form id="reward-form" onSubmit={submit} className="form-grid">
          <label className="field">
            <span>Code *</span>
            <input
              required
              className="mono"
              value={form.code}
              onChange={(e) => setField("code", e.target.value.toUpperCase())}
              placeholder="GYM-DAY"
            />
          </label>
          <label className="field">
            <span>Service line</span>
            <select value={form.service_line} onChange={(e) => setField("service_line", e.target.value)}>
              <option value="">Any service</option>
              {serviceLines.map(s => (
                <option key={s.code} value={s.code}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="field span-2">
            <span>Name *</span>
            <input required value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Free gym day pass" />
          </label>
          <label className="field span-2">
            <span>Description</span>
            <input value={form.description} onChange={(e) => setField("description", e.target.value)} placeholder="What does the member get?" />
          </label>
          <label className="field">
            <span>Stamps cost *</span>
            <input
              required
              type="number" min={1} step={1}
              value={form.stamps_cost}
              onChange={(e) => setField("stamps_cost", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Validity (days) *</span>
            <input
              required
              type="number" min={1} step={1}
              value={form.validity_days}
              onChange={(e) => setField("validity_days", e.target.value)}
            />
          </label>
          <label className="field span-2">
            <span>Per-member limit <small className="muted">(blank = unlimited)</small></span>
            <input
              type="number" min={1} step={1}
              value={form.per_member_limit}
              onChange={(e) => setField("per_member_limit", e.target.value)}
              placeholder="e.g. 1"
            />
          </label>
          {err && <div className="err span-2">{err}</div>}
        </form>
      </Modal>
    </div>
  );
}
