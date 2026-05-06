import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { apiFetch, apiOrigin } from "../api/client";
import { useAuth } from "../api/auth";
import { Modal } from "../components/Modal";
import { BalanceQR } from "../components/BalanceQR";
import { NfcWriter } from "../components/NfcWriter";
import { useServiceLines } from "../hooks/useServiceLines";

type Member = {
  id: string; member_no: string; first_name: string; last_name: string;
  email: string | null; phone: string | null; status: string; created_at: string;
  date_of_birth: string | null; gender: string | null; emergency_contact: string | null;
  origin_branch_id: string | null; consent_marketing: boolean | null;
};

type Card = {
  id: string; uid: string; status: string; issued_at: string;
  issued_branch_id: string | null; replaced_by_card_id: string | null;
};

type Balance = { service_line: string; stamps_earned: number; stamps_spent: number; stamps_balance: number; };

type Visit = {
  id: string; visited_at: string; service_line: string; sub_service: string | null;
  branch_id: string; branch_name: string; stamps_awarded: number;
  is_voided: boolean; void_reason: string | null; voided_at: string | null;
};

type Redemption = {
  id: string; voucher_code: string; reward_id: string; reward_name: string; reward_code: string;
  stamps_used: number; status: string; branch_id: string;
  expires_at: string; redeemed_at: string | null; created_at: string;
};

type Branch = { id: string; name: string; service_line: string; };

type EditForm = {
  first_name: string; last_name: string;
  email: string; phone: string;
  date_of_birth: string; gender: string;
  emergency_contact: string; origin_branch_id: string;
  consent_marketing: boolean; status: string;
};

function emptyEditForm(m: Member): EditForm {
  return {
    first_name: m.first_name,
    last_name: m.last_name,
    email: m.email ?? "",
    phone: m.phone ?? "",
    date_of_birth: m.date_of_birth ? m.date_of_birth.slice(0, 10) : "",
    gender: m.gender ?? "",
    emergency_contact: m.emergency_contact ?? "",
    origin_branch_id: m.origin_branch_id ?? "",
    consent_marketing: !!m.consent_marketing,
    status: m.status,
  };
}

export function MemberDetail() {
  const { id = "" } = useParams();
  const { token, user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "manager";
  const serviceLines = useServiceLines(token);
  const slName = (code: string | null | undefined) =>
    code ? (serviceLines.find(s => s.code === code)?.name ?? code) : "";
  const [member, setMember] = useState<Member | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // issue card modal
  const [showIssue, setShowIssue] = useState(false);
  const [issueUid, setIssueUid] = useState("");
  const [issueBranch, setIssueBranch] = useState("");
  const [issueErr, setIssueErr] = useState<string | null>(null);
  const [issueBusy, setIssueBusy] = useState(false);

  // replace card modal
  const [replaceCard, setReplaceCard] = useState<Card | null>(null);
  const [replaceUid, setReplaceUid] = useState("");
  const [replaceErr, setReplaceErr] = useState<string | null>(null);
  const [replaceBusy, setReplaceBusy] = useState(false);

  // edit member modal
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  // void visit modal
  const [voidVisit, setVoidVisit] = useState<Visit | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidErr, setVoidErr] = useState<string | null>(null);
  const [voidBusy, setVoidBusy] = useState(false);

  // status-change modal
  const [statusTarget, setStatusTarget] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusErr, setStatusErr] = useState<string | null>(null);

  // balance QR modal
  const [showQR, setShowQR] = useState(false);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrErr, setQrErr] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState(false);

  // NFC write modal
  const [nfcOpen, setNfcOpen] = useState(false);
  const [nfcUrl, setNfcUrl] = useState<string | null>(null);
  const [nfcErr, setNfcErr] = useState<string | null>(null);
  const [nfcBusy, setNfcBusy] = useState(false);

  const branchById = useMemo(() => Object.fromEntries(branches.map(b => [b.id, b])), [branches]);

  async function loadAll() {
    setLoading(true);
    setLoadErr(null);
    try {
      const [m, c, b, v, r, br] = await Promise.all([
        apiFetch<Member>(`/members/${id}`, { token }),
        apiFetch<{ items: Card[] }>(`/members/${id}/cards`, { token }),
        apiFetch<{ items: Balance[] }>(`/members/${id}/balance`, { token }),
        apiFetch<{ items: Visit[] }>(`/visits/by-member/${id}`, { token }),
        apiFetch<{ items: Redemption[] }>(`/redemptions/by-member/${id}`, { token }),
        apiFetch<{ items: Branch[] }>(`/branches`, { token }),
      ]);
      setMember(m);
      setCards(c.items);
      setBalances(b.items);
      setVisits(v.items);
      setRedemptions(r.items);
      setBranches(br.items);
    } catch (err: any) {
      setLoadErr(err.message || "Failed to load member");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [id]);

  // ---------- Issue Card ----------
  function openIssue() {
    setIssueUid("");
    setIssueErr(null);
    setIssueBranch(member?.origin_branch_id || "");
    setShowIssue(true);
  }
  async function submitIssue(e: FormEvent) {
    e.preventDefault();
    setIssueErr(null);
    setIssueBusy(true);
    try {
      const payload: Record<string, any> = { uid: issueUid.trim(), member_id: id };
      if (issueBranch) payload.branch_id = issueBranch;
      await apiFetch("/cards", { method: "POST", token, body: JSON.stringify(payload) });
      setShowIssue(false);
      await loadAll();
      // Offer to write the customer-facing balance URL onto the new card
      openNfc();
    } catch (err: any) {
      setIssueErr(err.message || "Failed to issue card");
    } finally {
      setIssueBusy(false);
    }
  }

  // ---------- Replace Card ----------
  function openReplace(card: Card) {
    setReplaceCard(card);
    setReplaceUid("");
    setReplaceErr(null);
  }
  async function submitReplace(e: FormEvent) {
    e.preventDefault();
    if (!replaceCard) return;
    setReplaceErr(null);
    setReplaceBusy(true);
    try {
      await apiFetch(`/cards/${replaceCard.id}/replace`, {
        method: "POST",
        token,
        body: JSON.stringify({ new_uid: replaceUid.trim() }),
      });
      setReplaceCard(null);
      await loadAll();
      // Replacement card is a fresh blank physical card — also needs the NDEF URL written
      openNfc();
    } catch (err: any) {
      setReplaceErr(err.message || "Failed to replace card");
    } finally {
      setReplaceBusy(false);
    }
  }

  // ---------- Edit Member ----------
  function openEdit() {
    if (!member) return;
    setEditForm(emptyEditForm(member));
    setEditErr(null);
    setShowEdit(true);
  }
  function setEditField<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setEditForm(f => (f ? { ...f, [key]: value } : f));
  }
  async function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!editForm) return;
    setEditErr(null);
    setEditBusy(true);
    try {
      const payload: Record<string, any> = {
        first_name: editForm.first_name.trim(),
        last_name: editForm.last_name.trim(),
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
        date_of_birth: editForm.date_of_birth || null,
        gender: editForm.gender || null,
        emergency_contact: editForm.emergency_contact.trim() || null,
        origin_branch_id: editForm.origin_branch_id || null,
        consent_marketing: editForm.consent_marketing,
        status: editForm.status,
      };
      await apiFetch(`/members/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(payload),
      });
      setShowEdit(false);
      await loadAll();
    } catch (err: any) {
      setEditErr(err.message || "Failed to update member");
    } finally {
      setEditBusy(false);
    }
  }

  // ---------- NFC write ----------
  async function openNfc() {
    setNfcOpen(true);
    setNfcUrl(null);
    setNfcErr(null);
    setNfcBusy(true);
    try {
      const r = await apiFetch<{ token: string }>("/balance/issue-nfc", {
        method: "POST",
        token,
        body: JSON.stringify({ member_id: id }),
      });
      setNfcUrl(`${apiOrigin()}/balance/${r.token}`);
    } catch (e: any) {
      const msg: string = e?.message || "Failed to issue NFC token";
      // Hint users at the most common cause: schema not applied
      if (/nfc_links|relation .* does not exist/i.test(msg)) {
        setNfcErr(
          "The nfc_links table is missing. Restart the API (it auto-creates the table on boot), " +
          "or run `npm run db:init` in apps/api to apply the latest schema."
        );
      } else {
        setNfcErr(msg);
      }
    } finally {
      setNfcBusy(false);
    }
  }

  // ---------- Balance QR ----------
  async function openQR() {
    setQrErr(null);
    setQrToken(null);
    setShowQR(true);
    setQrBusy(true);
    try {
      const r = await apiFetch<{ token: string }>("/balance/issue", {
        method: "POST",
        token,
        body: JSON.stringify({ member_id: id }),
      });
      setQrToken(r.token);
    } catch (e: any) {
      setQrErr(e.message || "Failed to issue token");
    } finally {
      setQrBusy(false);
    }
  }

  // ---------- Status quick action ----------
  async function applyStatus() {
    if (!statusTarget) return;
    setStatusBusy(true);
    setStatusErr(null);
    try {
      await apiFetch(`/members/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ status: statusTarget }),
      });
      setStatusTarget(null);
      await loadAll();
    } catch (e: any) {
      setStatusErr(e.message || "Failed to update status");
    } finally {
      setStatusBusy(false);
    }
  }

  // ---------- Void Visit ----------
  function openVoid(v: Visit) {
    setVoidVisit(v);
    setVoidReason("");
    setVoidErr(null);
  }
  async function submitVoid(e: FormEvent) {
    e.preventDefault();
    if (!voidVisit) return;
    setVoidErr(null);
    setVoidBusy(true);
    try {
      await apiFetch(`/visits/${voidVisit.id}/void`, {
        method: "POST",
        token,
        body: JSON.stringify({ reason: voidReason.trim() }),
      });
      setVoidVisit(null);
      await loadAll();
    } catch (err: any) {
      setVoidErr(err.message || "Failed to void visit");
    } finally {
      setVoidBusy(false);
    }
  }

  if (loading) return <div className="page"><p className="muted">Loading…</p></div>;
  if (loadErr) return <div className="page"><div className="err">{loadErr}</div></div>;
  if (!member) return null;

  const activeCards = cards.filter(c => c.status === "active");
  const initials = `${member.first_name[0] ?? ""}${member.last_name[0] ?? ""}`.toUpperCase();
  const originBranch = member.origin_branch_id ? branchById[member.origin_branch_id]?.name : null;

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/members" className="link">← Members</Link>
      </div>

      <div className="page-head">
        <div className="member-head">
          <div className="avatar">{initials || "?"}</div>
          <div>
            <h1>{member.first_name} {member.last_name}</h1>
            <p className="muted">
              <span className="mono">{member.member_no}</span>
              {" · "}<span className={`badge badge-${member.status}`}>{member.status}</span>
              {" · joined "}{new Date(member.created_at).toLocaleDateString()}
              {originBranch && <> · origin <b>{originBranch}</b></>}
            </p>
          </div>
        </div>
        <div className="actions">
          {canManage && member.status === "active" && (
            <>
              <button className="btn-ghost" onClick={() => setStatusTarget("suspended")}>Suspend</button>
              <button className="btn-ghost" onClick={() => setStatusTarget("blacklisted")}>Blacklist</button>
            </>
          )}
          {canManage && member.status === "suspended" && (
            <>
              <button className="btn-ghost" onClick={() => setStatusTarget("active")}>Reactivate</button>
              <button className="btn-ghost" onClick={() => setStatusTarget("blacklisted")}>Blacklist</button>
            </>
          )}
          {canManage && (member.status === "blacklisted" || member.status === "inactive") && (
            <button className="btn-ghost" onClick={() => setStatusTarget("active")}>Reactivate</button>
          )}
          {canManage && <button className="btn-secondary" onClick={openEdit}>Edit member</button>}
          <button className="btn-secondary" onClick={openQR}>Balance QR</button>
          <button className="btn-secondary" onClick={openNfc}>Write NFC URL</button>
          <button className="btn-primary" onClick={openIssue}>+ Issue Card</button>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <h2>Profile</h2>
          <dl className="kv">
            <dt>Email</dt><dd>{member.email || <span className="muted">—</span>}</dd>
            <dt>Phone</dt><dd>{member.phone || <span className="muted">—</span>}</dd>
            <dt>Date of birth</dt><dd>{member.date_of_birth ? new Date(member.date_of_birth).toLocaleDateString() : <span className="muted">—</span>}</dd>
            <dt>Gender</dt><dd>{member.gender || <span className="muted">—</span>}</dd>
            <dt>Emergency contact</dt><dd>{member.emergency_contact || <span className="muted">—</span>}</dd>
            <dt>Marketing consent</dt><dd>{member.consent_marketing ? "Yes" : "No"}</dd>
          </dl>
        </section>

        <section className="panel">
          <h2>Stamp balances</h2>
          {balances.length === 0 ? (
            <p className="muted">No stamps yet.</p>
          ) : (
            <div className="balance-row">
              {balances.map(b => (
                <div key={b.service_line} className="balance-card">
                  <h4>{slName(b.service_line)}</h4>
                  <p className="big">{b.stamps_balance}</p>
                  <small className="muted">{b.stamps_earned} earned · {b.stamps_spent} spent</small>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Cards</h2>
          <small className="muted">{activeCards.length} active · {cards.length} total</small>
        </div>
        {cards.length === 0 ? (
          <div className="empty">
            <p>This member has no card yet.</p>
            <button className="btn-primary" onClick={openIssue}>Issue first card</button>
          </div>
        ) : (
          <table className="data">
            <thead><tr><th>UID</th><th>Status</th><th>Issued</th><th>Branch</th><th></th></tr></thead>
            <tbody>
              {cards.map(c => (
                <tr key={c.id}>
                  <td className="mono">{c.uid}</td>
                  <td><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                  <td>{new Date(c.issued_at).toLocaleString()}</td>
                  <td>{c.issued_branch_id ? branchById[c.issued_branch_id]?.name ?? "—" : <span className="muted">—</span>}</td>
                  <td className="row-actions">
                    {c.status === "active" && (
                      <>
                        <button className="btn-ghost btn-sm" onClick={() => openReplace(c)}>Replace</button>
                        <button className="btn-ghost btn-sm" onClick={openNfc}>Write NFC</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Visit history</h2>
          <small className="muted">{visits.length} total</small>
        </div>
        {visits.length === 0 ? (
          <p className="muted">No visits recorded.</p>
        ) : (
          <table className="data">
            <thead>
              <tr><th>When</th><th>Branch</th><th>Service</th><th>Sub-service</th><th>Stamps</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {visits.map(v => (
                <tr key={v.id} className={v.is_voided ? "row-voided" : undefined}>
                  <td>{new Date(v.visited_at).toLocaleString()}</td>
                  <td>{v.branch_name}</td>
                  <td>{slName(v.service_line)}</td>
                  <td>{v.sub_service || <span className="muted">—</span>}</td>
                  <td>{v.stamps_awarded}</td>
                  <td>
                    {v.is_voided
                      ? <span className="badge badge-replaced" title={v.void_reason ?? ""}>voided</span>
                      : <span className="badge badge-active">recorded</span>}
                  </td>
                  <td className="row-actions">
                    {!v.is_voided && canManage && (
                      <button className="btn-ghost btn-sm" onClick={() => openVoid(v)}>Void</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Redemptions</h2>
          <small className="muted">{redemptions.length} total</small>
        </div>
        {redemptions.length === 0 ? (
          <p className="muted">No redemptions yet.</p>
        ) : (
          <table className="data">
            <thead>
              <tr><th>Voucher</th><th>Reward</th><th>Stamps</th><th>Status</th><th>Created</th><th>Expires</th></tr>
            </thead>
            <tbody>
              {redemptions.map(r => (
                <tr key={r.id}>
                  <td className="mono">{r.voucher_code}</td>
                  <td>{r.reward_name} <small className="muted mono">({r.reward_code})</small></td>
                  <td>{r.stamps_used}</td>
                  <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                  <td>{new Date(r.created_at).toLocaleDateString()}</td>
                  <td>{new Date(r.expires_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ---------- Issue Card modal ---------- */}
      <Modal
        open={showIssue}
        title="Issue RFID Card"
        onClose={() => !issueBusy && setShowIssue(false)}
        width={460}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setShowIssue(false)} disabled={issueBusy}>Cancel</button>
            <button className="btn-primary" form="issue-card-form" type="submit" disabled={issueBusy || !issueUid.trim()}>
              {issueBusy ? "Binding…" : "Bind card"}
            </button>
          </>
        }
      >
        <form id="issue-card-form" onSubmit={submitIssue} className="form-grid">
          <p className="muted span-2">
            Tap a card on a USB reader (or type the UID) to bind it to <b>{member.first_name} {member.last_name}</b>.
          </p>
          <label className="field span-2">
            <span>Card UID *</span>
            <input
              autoFocus required
              value={issueUid}
              onChange={(e) => setIssueUid(e.target.value)}
              placeholder="e.g. 04A1B2C3D4"
              className="mono"
            />
          </label>
          <label className="field span-2">
            <span>Issuing branch</span>
            <select value={issueBranch} onChange={(e) => setIssueBranch(e.target.value)}>
              <option value="">— Select branch —</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name} ({b.service_line})</option>
              ))}
            </select>
          </label>
          {issueErr && <div className="err span-2">{issueErr}</div>}
        </form>
      </Modal>

      {/* ---------- Replace Card modal ---------- */}
      <Modal
        open={!!replaceCard}
        title="Replace card"
        onClose={() => !replaceBusy && setReplaceCard(null)}
        width={460}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setReplaceCard(null)} disabled={replaceBusy}>Cancel</button>
            <button className="btn-primary" form="replace-card-form" type="submit" disabled={replaceBusy || !replaceUid.trim()}>
              {replaceBusy ? "Replacing…" : "Replace card"}
            </button>
          </>
        }
      >
        <form id="replace-card-form" onSubmit={submitReplace} className="form-grid">
          {replaceCard && (
            <p className="muted span-2">
              Replacing card <b className="mono">{replaceCard.uid}</b>. The old card will be marked as <i>replaced</i>.
            </p>
          )}
          <label className="field span-2">
            <span>New card UID *</span>
            <input
              autoFocus required
              value={replaceUid}
              onChange={(e) => setReplaceUid(e.target.value)}
              placeholder="Tap or type new UID"
              className="mono"
            />
          </label>
          {replaceErr && <div className="err span-2">{replaceErr}</div>}
        </form>
      </Modal>

      {/* ---------- Edit Member modal ---------- */}
      <Modal
        open={showEdit}
        title="Edit member"
        onClose={() => !editBusy && setShowEdit(false)}
        width={560}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setShowEdit(false)} disabled={editBusy}>Cancel</button>
            <button className="btn-primary" form="edit-member-form" type="submit" disabled={editBusy}>
              {editBusy ? "Saving…" : "Save changes"}
            </button>
          </>
        }
      >
        {editForm && (
          <form id="edit-member-form" onSubmit={submitEdit} className="form-grid">
            <label className="field">
              <span>First name *</span>
              <input required value={editForm.first_name} onChange={(e) => setEditField("first_name", e.target.value)} />
            </label>
            <label className="field">
              <span>Last name *</span>
              <input required value={editForm.last_name} onChange={(e) => setEditField("last_name", e.target.value)} />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" value={editForm.email} onChange={(e) => setEditField("email", e.target.value)} />
            </label>
            <label className="field">
              <span>Phone</span>
              <input value={editForm.phone} onChange={(e) => setEditField("phone", e.target.value)} />
            </label>
            <label className="field">
              <span>Date of birth</span>
              <input type="date" value={editForm.date_of_birth} onChange={(e) => setEditField("date_of_birth", e.target.value)} />
            </label>
            <label className="field">
              <span>Gender</span>
              <select value={editForm.gender} onChange={(e) => setEditField("gender", e.target.value)}>
                <option value="">—</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
                <option value="undisclosed">Prefer not to say</option>
              </select>
            </label>
            <label className="field span-2">
              <span>Emergency contact</span>
              <input value={editForm.emergency_contact} onChange={(e) => setEditField("emergency_contact", e.target.value)} />
            </label>
            <label className="field">
              <span>Origin branch</span>
              <select value={editForm.origin_branch_id} onChange={(e) => setEditField("origin_branch_id", e.target.value)}>
                <option value="">— None —</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name} ({b.service_line})</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select value={editForm.status} onChange={(e) => setEditField("status", e.target.value)}>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="blacklisted">Blacklisted</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="checkbox span-2">
              <input
                type="checkbox"
                checked={editForm.consent_marketing}
                onChange={(e) => setEditField("consent_marketing", e.target.checked)}
              />
              <span>Member consents to marketing communications</span>
            </label>
            {editErr && <div className="err span-2">{editErr}</div>}
          </form>
        )}
      </Modal>

      {/* ---------- Void Visit modal ---------- */}
      <Modal
        open={!!voidVisit}
        title="Void visit"
        onClose={() => !voidBusy && setVoidVisit(null)}
        width={460}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setVoidVisit(null)} disabled={voidBusy}>Cancel</button>
            <button className="btn-primary" form="void-visit-form" type="submit" disabled={voidBusy || !voidReason.trim()}>
              {voidBusy ? "Voiding…" : "Void visit"}
            </button>
          </>
        }
      >
        <form id="void-visit-form" onSubmit={submitVoid} className="form-grid">
          {voidVisit && (
            <p className="muted span-2">
              Voiding visit on {new Date(voidVisit.visited_at).toLocaleString()} at <b>{voidVisit.branch_name}</b> ({voidVisit.service_line}).
              The visit will remain in history but be marked voided.
            </p>
          )}
          <label className="field span-2">
            <span>Reason *</span>
            <input
              autoFocus required
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g. duplicate scan, wrong service line"
            />
          </label>
          {voidErr && <div className="err span-2">{voidErr}</div>}
        </form>
      </Modal>

      {/* ---------- Status change confirm ---------- */}
      <Modal
        open={!!statusTarget}
        title={statusTarget === "active" ? "Reactivate member" :
               statusTarget === "suspended" ? "Suspend member" :
               statusTarget === "blacklisted" ? "Blacklist member" :
               "Change status"}
        onClose={() => !statusBusy && setStatusTarget(null)}
        width={440}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setStatusTarget(null)} disabled={statusBusy}>Cancel</button>
            <button className="btn-primary" onClick={applyStatus} disabled={statusBusy}>
              {statusBusy ? "Saving…" :
                statusTarget === "active" ? "Reactivate" :
                statusTarget === "suspended" ? "Suspend" :
                statusTarget === "blacklisted" ? "Blacklist" : "Confirm"}
            </button>
          </>
        }
      >
        <p>
          Change status from <span className={`badge badge-${member.status}`}>{member.status}</span>{" "}
          to <span className={`badge badge-${statusTarget ?? "active"}`}>{statusTarget}</span>?
        </p>
        {statusTarget === "blacklisted" && (
          <p className="muted">
            Blacklisted members cannot check in or redeem rewards. The change is recorded in the audit log.
          </p>
        )}
        {statusTarget === "suspended" && (
          <p className="muted">
            Suspended members can be reactivated later. The change is recorded in the audit log.
          </p>
        )}
        {statusErr && <div className="err">{statusErr}</div>}
      </Modal>

      {/* ---------- Balance QR modal ---------- */}
      <Modal
        open={showQR}
        title="Member balance QR"
        onClose={() => setShowQR(false)}
        width={420}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setShowQR(false)}>Close</button>
            <button
              className="btn-primary"
              onClick={() => window.print()}
              disabled={!qrToken}
            >
              Print poster
            </button>
          </>
        }
      >
        <p className="muted">
          Customers can scan this with their phone camera to see <b>{member.first_name} {member.last_name}</b>'s
          stamp balance. The link expires after 24 hours.
        </p>
        <div className="qr-center">
          {qrBusy && <div className="muted">Generating…</div>}
          {qrErr && <div className="err">{qrErr}</div>}
          {qrToken && <BalanceQR token={qrToken} size={220} />}
        </div>

        {qrToken && createPortal(
          <div className="print-only">
            <div className="qr-poster">
              <h2>{member.first_name} {member.last_name}</h2>
              <p className="mono">{member.member_no}</p>
              <BalanceQR token={qrToken} size={260} />
              <p>Scan to view your stamp balance</p>
            </div>
          </div>,
          document.body
        )}
      </Modal>

      {/* ---------- Write NFC modal ---------- */}
      <Modal
        open={nfcOpen}
        title="Write balance URL to NFC card"
        onClose={() => setNfcOpen(false)}
        width={520}
        footer={<button className="btn-ghost" onClick={() => setNfcOpen(false)}>Done</button>}
      >
        <p className="muted">
          A long-lived signed URL for <b>{member.first_name} {member.last_name}</b>. Burn it
          onto the card's NDEF URI record so a phone tap opens the balance page directly.
        </p>
        {nfcBusy && <div className="muted">Generating URL…</div>}
        {nfcErr && <div className="err">{nfcErr}</div>}
        {nfcUrl && <NfcWriter url={nfcUrl} />}
      </Modal>
    </div>
  );
}
