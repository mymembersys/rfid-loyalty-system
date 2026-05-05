import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/client";
import { useAuth } from "../api/auth";
import { Modal } from "../components/Modal";

type ServiceLine = "diagnostic" | "psychological" | "gym";

type StampRule = {
  id: string;
  service_line: ServiceLine;
  branch_id: string | null;
  branch_name: string | null;
  stamps_required: number;
  cooldown_minutes: number;
  cross_service_eligible: boolean;
  active_from: string;
  active_to: string | null;
  is_active: boolean;
};

type Branch = { id: string; name: string; service_line: ServiceLine; };

type FormState = {
  service_line: ServiceLine;
  branch_id: string;          // "" = network default
  stamps_required: string;
  cooldown_minutes: string;
  cross_service_eligible: boolean;
  active_from: string;        // datetime-local
  active_to: string;          // datetime-local
};

const emptyForm: FormState = {
  service_line: "gym",
  branch_id: "",
  stamps_required: "10",
  cooldown_minutes: "720",
  cross_service_eligible: false,
  active_from: "",
  active_to: "",
};

function toLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromRule(r: StampRule): FormState {
  return {
    service_line: r.service_line,
    branch_id: r.branch_id ?? "",
    stamps_required: String(r.stamps_required),
    cooldown_minutes: String(r.cooldown_minutes),
    cross_service_eligible: r.cross_service_eligible,
    active_from: toLocal(r.active_from),
    active_to: toLocal(r.active_to),
  };
}

function describeCooldown(min: number): string {
  if (min === 0) return "no cooldown";
  if (min < 60) return `${min} min`;
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? "" : "s"}`;
  if (min % 60 === 0) return `${min / 60} h`;
  return `${min} min`;
}

export function StampRules() {
  const { token, user } = useAuth();
  const canEdit = user?.role === "admin";
  const [items, setItems] = useState<StampRule[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(false);

  const [editing, setEditing] = useState<StampRule | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const branchById = useMemo(() => Object.fromEntries(branches.map(b => [b.id, b])), [branches]);

  async function load() {
    setLoading(true);
    try {
      const [r, b] = await Promise.all([
        apiFetch<{ items: StampRule[] }>(`/stamp-rules${showInactive ? "?all=1" : ""}`, { token }),
        apiFetch<{ items: Branch[] }>(`/branches`, { token }),
      ]);
      setItems(r.items);
      setBranches(b.items);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [showInactive]);

  function openNew() {
    setForm(emptyForm);
    setErr(null);
    setEditing("new");
  }
  function openEdit(r: StampRule) {
    setForm(fromRule(r));
    setErr(null);
    setEditing(r);
  }
  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function buildPayload(): Record<string, any> | { error: string } {
    const stamps = Number(form.stamps_required);
    const cooldown = Number(form.cooldown_minutes);
    if (!Number.isInteger(stamps) || stamps <= 0) return { error: "Stamps required must be a positive integer" };
    if (!Number.isInteger(cooldown) || cooldown < 0) return { error: "Cooldown must be 0 or more minutes" };
    if (form.active_from && form.active_to && new Date(form.active_from) >= new Date(form.active_to)) {
      return { error: "Active-from must be earlier than active-to" };
    }

    return {
      service_line: form.service_line,
      branch_id: form.branch_id || null,
      stamps_required: stamps,
      cooldown_minutes: cooldown,
      cross_service_eligible: form.cross_service_eligible,
      active_from: form.active_from ? new Date(form.active_from).toISOString() : undefined,
      active_to: form.active_to ? new Date(form.active_to).toISOString() : null,
    };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const payload = buildPayload();
    if ("error" in payload) { setErr(payload.error); return; }
    setBusy(true);
    try {
      if (editing === "new") {
        await apiFetch("/stamp-rules", { method: "POST", token, body: JSON.stringify(payload) });
      } else if (editing) {
        await apiFetch(`/stamp-rules/${editing.id}`, { method: "PATCH", token, body: JSON.stringify(payload) });
      }
      setEditing(null);
      await load();
    } catch (e: any) {
      setErr(e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(r: StampRule) {
    if (!confirm(`Deactivate this ${r.service_line} rule? Tap-to-stamp will fall back to other matching rules.`)) return;
    try {
      await apiFetch(`/stamp-rules/${r.id}`, { method: "DELETE", token });
      await load();
    } catch (e: any) { alert(e.message || "Failed"); }
  }

  async function reactivate(r: StampRule) {
    try {
      await apiFetch(`/stamp-rules/${r.id}`, {
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
          <h1>Stamp Rules</h1>
          <p className="muted">
            Cooldown windows and stamps required per service line. Branch-specific rules
            override the network default for that branch.
          </p>
        </div>
        <div className="actions">
          <label className="checkbox">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            <span>Show inactive</span>
          </label>
          {canEdit && <button className="btn-primary" onClick={openNew}>+ New Rule</button>}
        </div>
      </div>

      <div className="data-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Service line</th><th>Scope</th>
              <th>Stamps required</th><th>Cooldown</th>
              <th>Cross-service</th><th>Active window</th>
              <th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.map(r => (
              <tr key={r.id} className={r.is_active ? undefined : "row-voided"}>
                <td><b>{r.service_line}</b></td>
                <td>
                  {r.branch_id
                    ? (r.branch_name ?? branchById[r.branch_id]?.name ?? "—")
                    : <span className="badge badge-active">Network default</span>}
                </td>
                <td><b>{r.stamps_required}</b></td>
                <td>{describeCooldown(r.cooldown_minutes)}</td>
                <td>{r.cross_service_eligible ? "Yes" : <span className="muted">No</span>}</td>
                <td className="small">
                  {new Date(r.active_from).toLocaleDateString()}
                  {r.active_to ? ` → ${new Date(r.active_to).toLocaleDateString()}` : <span className="muted"> → ∞</span>}
                </td>
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
              <tr><td colSpan={8} className="muted center">No stamp rules yet. Click <b>+ New Rule</b> to create one.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={editing !== null}
        title={editing === "new" ? "New stamp rule" : "Edit stamp rule"}
        onClose={() => !busy && setEditing(null)}
        width={560}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
            <button className="btn-primary" form="rule-form" type="submit" disabled={busy}>
              {busy ? "Saving…" : editing === "new" ? "Create rule" : "Save changes"}
            </button>
          </>
        }
      >
        <form id="rule-form" onSubmit={submit} className="form-grid">
          <label className="field">
            <span>Service line *</span>
            <select value={form.service_line} onChange={(e) => setField("service_line", e.target.value as ServiceLine)}>
              <option value="diagnostic">Diagnostic</option>
              <option value="psychological">Psychological</option>
              <option value="gym">Gym</option>
            </select>
          </label>
          <label className="field">
            <span>Scope</span>
            <select value={form.branch_id} onChange={(e) => setField("branch_id", e.target.value)}>
              <option value="">Network default (all branches)</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Stamps required *</span>
            <input
              required
              type="number" min={1} step={1}
              value={form.stamps_required}
              onChange={(e) => setField("stamps_required", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Cooldown (minutes) *</span>
            <input
              required
              type="number" min={0} step={1}
              value={form.cooldown_minutes}
              onChange={(e) => setField("cooldown_minutes", e.target.value)}
            />
          </label>
          <label className="checkbox span-2">
            <input
              type="checkbox"
              checked={form.cross_service_eligible}
              onChange={(e) => setField("cross_service_eligible", e.target.checked)}
            />
            <span>Cross-service eligible (stamps from this rule count toward any service)</span>
          </label>
          <label className="field">
            <span>Active from</span>
            <input
              type="datetime-local"
              value={form.active_from}
              onChange={(e) => setField("active_from", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Active to <small className="muted">(blank = forever)</small></span>
            <input
              type="datetime-local"
              value={form.active_to}
              onChange={(e) => setField("active_to", e.target.value)}
            />
          </label>
          {err && <div className="err span-2">{err}</div>}
        </form>
      </Modal>
    </div>
  );
}
