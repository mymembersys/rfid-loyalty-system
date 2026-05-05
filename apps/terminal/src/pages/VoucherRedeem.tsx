import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { TerminalConfig } from "../types";
import { useBranding } from "../useBranding";
import { PrintableVoucher } from "../components/PrintableVoucher";

type VoucherStatus = "pending" | "redeemed" | "expired" | "voided";

type VoucherDetail = {
  id: string;
  voucher_code: string;
  status: VoucherStatus;
  stamps_used: number;
  created_at: string;
  expires_at: string;
  redeemed_at: string | null;
  member_id: string;
  first_name: string;
  last_name: string;
  member_no: string;
  member_status: string;
  reward_id: string;
  reward_code: string;
  reward_name: string;
  reward_description: string | null;
  reward_service_line: string | null;
  issued_branch_id: string | null;
  issued_branch_name: string | null;
};

type Step = "lookup" | "review" | "confirmed";

const STATUS_LABEL: Record<VoucherStatus, string> = {
  pending: "Ready to redeem",
  redeemed: "Already redeemed",
  expired: "Expired",
  voided: "Voided",
};

export function VoucherRedeem({ config }: { config: TerminalConfig }) {
  const brand = useBranding();
  const [step, setStep] = useState<Step>("lookup");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [voucher, setVoucher] = useState<VoucherDetail | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (step !== "lookup") return;
    const i = inputRef.current;
    if (!i) return;
    const refocus = () => i.focus();
    refocus();
    document.addEventListener("click", refocus);
    return () => document.removeEventListener("click", refocus);
  }, [step]);

  function reset() {
    setStep("lookup");
    setCode("");
    setErr(null);
    setVoucher(null);
  }

  async function lookup(e: FormEvent) {
    e.preventDefault();
    const value = code.trim().toUpperCase();
    if (!value) return;
    setBusy(true);
    setErr(null);
    try {
      const v = await api<VoucherDetail>(
        `/redemptions/by-voucher/${encodeURIComponent(value)}`,
        { token: config.staff_token }
      );
      setVoucher(v);
      setStep("review");
    } catch (e: any) {
      setErr(e.message || "Lookup failed");
      setCode("");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function confirmRedemption() {
    if (!voucher) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<VoucherDetail>(
        `/redemptions/${voucher.id}/redeem`,
        { method: "POST", token: config.staff_token }
      );
      setVoucher({ ...voucher, ...r, status: "redeemed", redeemed_at: r.redeemed_at });
      setStep("confirmed");
    } catch (e: any) {
      setErr(e.message || "Failed to confirm redemption");
    } finally {
      setBusy(false);
    }
  }

  if (step === "lookup") {
    return (
      <div className="hero">
        <h1>Redeem voucher</h1>
        <p className="muted">Type or scan the voucher code printed on the receipt.</p>

        <form onSubmit={lookup} className="tap-form">
          <input
            ref={inputRef}
            value={code}
            onChange={(e) => { setCode(e.target.value); if (err) setErr(null); }}
            autoFocus
            className="uid-input"
            placeholder="V-XXXXXXXX"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit" disabled={busy}>{busy ? "Looking up…" : "Look up"}</button>
        </form>

        {err && <div className="err big">{err}</div>}
      </div>
    );
  }

  if (step === "review" && voucher) {
    const isPending = voucher.status === "pending";
    const expired = new Date(voucher.expires_at).getTime() < Date.now();
    const blocked = !isPending || expired;
    const blockReason =
      voucher.status === "redeemed" ? `Already redeemed${voucher.redeemed_at ? ` on ${new Date(voucher.redeemed_at).toLocaleString()}` : ""}.` :
      voucher.status === "voided"   ? "This voucher was voided." :
      voucher.status === "expired"  ? "This voucher has expired." :
      expired                        ? `Expired on ${new Date(voucher.expires_at).toLocaleString()}.` :
      null;

    return (
      <div className="voucher-review">
        <div className="vr-card">
          <div className="vr-head">
            <span className={`vr-status status-${expired && isPending ? "expired" : voucher.status}`}>
              {expired && isPending ? "Expired" : STATUS_LABEL[voucher.status]}
            </span>
            <code className="vr-code mono">{voucher.voucher_code}</code>
          </div>

          <div className="vr-reward">
            <div className="muted small">Reward</div>
            <h1>{voucher.reward_name}</h1>
            <div className="muted">
              <span className="mono">{voucher.reward_code}</span>
              {" · "}{voucher.reward_service_line ?? "any service"}
              {" · "}<b>{voucher.stamps_used}</b> stamps
            </div>
            {voucher.reward_description && <p className="vr-desc">{voucher.reward_description}</p>}
          </div>

          <div className="vr-divider" />

          <div className="vr-member">
            <div className="muted small">Member</div>
            <h2>{voucher.first_name} {voucher.last_name}</h2>
            <div className="muted">
              <span className="mono">{voucher.member_no}</span>
              {" · status "}<b>{voucher.member_status}</b>
            </div>
          </div>

          <div className="vr-meta">
            <div>
              <div className="muted small">Issued</div>
              <div>{new Date(voucher.created_at).toLocaleString()}</div>
              {voucher.issued_branch_name && (
                <div className="muted small">at {voucher.issued_branch_name}</div>
              )}
            </div>
            <div>
              <div className="muted small">Expires</div>
              <div className={expired ? "danger" : ""}>{new Date(voucher.expires_at).toLocaleString()}</div>
            </div>
          </div>

          {blockReason && (
            <div className={`vr-blocked ${voucher.status === "redeemed" ? "ok" : "err"}`}>{blockReason}</div>
          )}
          {err && <div className="err">{err}</div>}

          <div className="vr-actions">
            <button className="ghost" onClick={reset} disabled={busy}>Cancel</button>
            <button
              className="confirm-btn"
              onClick={confirmRedemption}
              disabled={blocked || busy}
            >
              {busy ? "Confirming…" : "Confirm redemption"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "confirmed" && voucher) {
    return (
      <div className="hero">
        <div className="voucher">
          <h2 className="muted small">REDEEMED</h2>
          <h1 className="voucher-code mono">{voucher.voucher_code}</h1>
          <p className="reward-line">
            <b>{voucher.reward_name}</b>
            <span className="muted"> · {voucher.stamps_used} stamps</span>
          </p>
          <p className="muted small">
            For {voucher.first_name} {voucher.last_name}
            {voucher.redeemed_at && <> · redeemed {new Date(voucher.redeemed_at).toLocaleString()}</>}
          </p>
          <div className="voucher-actions">
            <button className="ghost" onClick={() => window.print()}>Print receipt</button>
            <button onClick={reset}>Done</button>
          </div>
        </div>

        <PrintableVoucher
          brand={brand}
          variant="redeemed"
          voucherCode={voucher.voucher_code}
          rewardName={voucher.reward_name}
          rewardCode={voucher.reward_code}
          rewardDescription={voucher.reward_description}
          serviceLine={voucher.reward_service_line}
          stampsUsed={voucher.stamps_used}
          memberName={`${voucher.first_name} ${voucher.last_name}`}
          memberNo={voucher.member_no}
          branchName={config.branch_name}
          expiresAt={voucher.expires_at}
          redeemedAt={voucher.redeemed_at}
        />
      </div>
    );
  }

  return null;
}
