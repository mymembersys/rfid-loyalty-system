import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth } from "../api/auth";
import { Modal } from "../components/Modal";

type Member = {
  id: string; member_no: string; first_name: string; last_name: string;
  email: string | null; phone: string | null; status: string; created_at: string;
};

type Branch = { id: string; name: string; service_line: string; };

const emptyForm = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  date_of_birth: "",
  gender: "",
  emergency_contact: "",
  origin_branch_id: "",
  consent_marketing: false,
};

export function Members() {
  const { token } = useAuth();
  const [items, setItems] = useState<Member[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await apiFetch<{ items: Member[] }>(`/members?q=${encodeURIComponent(q)}`, { token });
      setItems(r.items);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function openNew() {
    setForm(emptyForm);
    setFormErr(null);
    setShowNew(true);
    if (branches.length === 0) {
      try {
        const r = await apiFetch<{ items: Branch[] }>("/branches", { token });
        setBranches(r.items);
      } catch { /* ignore */ }
    }
  }

  function setField<K extends keyof typeof emptyForm>(key: K, value: typeof emptyForm[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function submitNew(e: FormEvent) {
    e.preventDefault();
    setFormErr(null);
    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        consent_marketing: form.consent_marketing,
      };
      if (form.email.trim()) payload.email = form.email.trim();
      if (form.phone.trim()) payload.phone = form.phone.trim();
      if (form.date_of_birth) payload.date_of_birth = form.date_of_birth;
      if (form.gender) payload.gender = form.gender;
      if (form.emergency_contact.trim()) payload.emergency_contact = form.emergency_contact.trim();
      if (form.origin_branch_id) payload.origin_branch_id = form.origin_branch_id;

      await apiFetch("/members", {
        method: "POST",
        token,
        body: JSON.stringify(payload),
      });
      setShowNew(false);
      await load();
    } catch (err: any) {
      setFormErr(err.message || "Failed to create member");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Members</h1>
          <p className="muted">Enroll customers and manage their loyalty profiles.</p>
        </div>
        <button className="btn-primary" onClick={openNew}>+ New Member</button>
      </div>

      <div className="toolbar">
        <input
          className="grow"
          placeholder="Search name, member #, phone, email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") load(); }}
        />
        <button className="btn-secondary" onClick={load} disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      <div className="data-wrap">
        <table className="data">
          <thead>
            <tr><th>Member #</th><th>Name</th><th>Email</th><th>Phone</th><th>Status</th><th>Joined</th><th></th></tr>
          </thead>
          <tbody>
            {items.map(m => (
              <tr key={m.id}>
                <td><Link to={`/members/${m.id}`} className="link-strong">{m.member_no}</Link></td>
                <td>{m.first_name} {m.last_name}</td>
                <td>{m.email || <span className="muted">—</span>}</td>
                <td>{m.phone || <span className="muted">—</span>}</td>
                <td><span className={`badge badge-${m.status}`}>{m.status}</span></td>
                <td>{new Date(m.created_at).toLocaleDateString()}</td>
                <td className="row-actions">
                  <Link to={`/members/${m.id}`} className="link">Open →</Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr><td colSpan={7} className="muted center">No members yet. Click <b>+ New Member</b> to enroll one.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={showNew}
        title="Enroll New Member"
        onClose={() => !submitting && setShowNew(false)}
        width={560}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setShowNew(false)} disabled={submitting}>Cancel</button>
            <button className="btn-primary" form="new-member-form" type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Create member"}
            </button>
          </>
        }
      >
        <form id="new-member-form" onSubmit={submitNew} className="form-grid">
          <label className="field">
            <span>First name *</span>
            <input required value={form.first_name} onChange={(e) => setField("first_name", e.target.value)} />
          </label>
          <label className="field">
            <span>Last name *</span>
            <input required value={form.last_name} onChange={(e) => setField("last_name", e.target.value)} />
          </label>
          <label className="field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} />
          </label>
          <label className="field">
            <span>Phone</span>
            <input value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
          </label>
          <label className="field">
            <span>Date of birth</span>
            <input type="date" value={form.date_of_birth} onChange={(e) => setField("date_of_birth", e.target.value)} />
          </label>
          <label className="field">
            <span>Gender</span>
            <select value={form.gender} onChange={(e) => setField("gender", e.target.value)}>
              <option value="">—</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
              <option value="undisclosed">Prefer not to say</option>
            </select>
          </label>
          <label className="field span-2">
            <span>Emergency contact</span>
            <input value={form.emergency_contact} onChange={(e) => setField("emergency_contact", e.target.value)} placeholder="Name &amp; phone" />
          </label>
          <label className="field span-2">
            <span>Origin branch</span>
            <select value={form.origin_branch_id} onChange={(e) => setField("origin_branch_id", e.target.value)}>
              <option value="">— Select branch —</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name} ({b.service_line})</option>
              ))}
            </select>
          </label>
          <label className="checkbox span-2">
            <input
              type="checkbox"
              checked={form.consent_marketing}
              onChange={(e) => setField("consent_marketing", e.target.checked)}
            />
            <span>Member consents to marketing communications</span>
          </label>
          {formErr && <div className="err span-2">{formErr}</div>}
        </form>
      </Modal>
    </div>
  );
}
