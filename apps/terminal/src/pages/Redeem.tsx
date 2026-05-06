import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { TerminalConfig } from "../types";
import { useBranding } from "../useBranding";
import { useServiceLines } from "../useServiceLines";
import { PrintableVoucher } from "../components/PrintableVoucher";

type CardLookup = {
  id: string; uid: string; status: string; member_id: string;
  first_name: string; last_name: string; member_no: string; member_status: string;
};

type Balance = { service_line: string; stamps_balance: number; stamps_earned: number; stamps_spent: number; };

type Reward = {
  id: string; code: string; name: string; description: string | null;
  service_line: string | null; stamps_cost: number; validity_days: number;
};

type Voucher = {
  id: string; voucher_code: string; status: string; stamps_used: number;
  expires_at: string;
};

type Step = "tap" | "select" | "issued";

export function Redeem({ config }: { config: TerminalConfig }) {
  const brand = useBranding();
  const serviceLines = useServiceLines(config.staff_token);
  const slName = (code: string | null) => code ? (serviceLines.find(s => s.code === code)?.name ?? code) : null;
  const [step, setStep] = useState<Step>("tap");
  const [uid, setUid] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [card, setCard] = useState<CardLookup | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [issuedReward, setIssuedReward] = useState<Reward | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (step !== "tap") return;
    const i = inputRef.current;
    if (!i) return;
    const refocus = () => i.focus();
    refocus();
    document.addEventListener("click", refocus);
    return () => document.removeEventListener("click", refocus);
  }, [step]);

  function reset() {
    setStep("tap");
    setUid("");
    setErr(null);
    setCard(null);
    setBalances([]);
    setRewards([]);
    setVoucher(null);
    setIssuedReward(null);
  }

  async function lookup(e: FormEvent) {
    e.preventDefault();
    const value = uid.trim();
    if (!value) return;
    setBusy(true);
    setErr(null);
    try {
      const c = await api<CardLookup>(`/cards/by-uid/${encodeURIComponent(value)}`, { token: config.staff_token });
      if (c.status !== "active") throw new Error(`Card is ${c.status}`);
      if (c.member_status !== "active") throw new Error(`Member is ${c.member_status}`);

      const [bal, rw] = await Promise.all([
        api<{ items: Balance[] }>(`/members/${c.member_id}/balance`, { token: config.staff_token }),
        api<{ items: Reward[] }>(`/rewards`, { token: config.staff_token }),
      ]);
      setCard(c);
      setBalances(bal.items);
      setRewards(rw.items);
      setStep("select");
    } catch (e: any) {
      setErr(e.message || "Lookup failed");
      setUid("");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  function balanceFor(serviceLine: string | null): number {
    if (!serviceLine) {
      return balances.reduce((s, b) => s + Number(b.stamps_balance), 0);
    }
    return Number(balances.find(b => b.service_line === serviceLine)?.stamps_balance ?? 0);
  }

  async function issueVoucher(reward: Reward) {
    if (!card) return;
    setBusy(true);
    setErr(null);
    try {
      const v = await api<Voucher>("/redemptions", {
        method: "POST",
        token: config.staff_token,
        body: JSON.stringify({
          member_id: card.member_id,
          reward_id: reward.id,
          branch_id: config.branch_id,
        }),
      });
      setVoucher(v);
      setIssuedReward(reward);
      setStep("issued");
    } catch (e: any) {
      setErr(e.message || "Failed to issue voucher");
    } finally {
      setBusy(false);
    }
  }

  async function markRedeemed() {
    if (!voucher) return;
    setBusy(true);
    try {
      const r = await api<Voucher>(`/redemptions/${voucher.id}/redeem`, {
        method: "POST",
        token: config.staff_token,
      });
      setVoucher(r);
    } catch (e: any) {
      setErr(e.message || "Failed to mark redeemed");
    } finally {
      setBusy(false);
    }
  }

  if (step === "tap") {
    return (
      <div className="hero">
        <h1>Redeem rewards</h1>
        <p className="muted">Tap a member's card to see their available rewards.</p>

        <form onSubmit={lookup} className="tap-form">
          <input
            ref={inputRef}
            value={uid}
            onChange={(e) => { setUid(e.target.value); if (err) setErr(null); }}
            autoFocus
            className="uid-input"
            placeholder="Card UID"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit" disabled={busy}>{busy ? "Looking up…" : "Look up"}</button>
        </form>

        {err && <div className="err big">{err}</div>}
      </div>
    );
  }

  if (step === "select" && card) {
    return (
      <div className="redeem">
        <div className="redeem-head">
          <div>
            <h1>{card.first_name} {card.last_name}</h1>
            <p className="muted">Member <span className="mono">{card.member_no}</span></p>
          </div>
          <button className="ghost" onClick={reset}>Cancel</button>
        </div>

        <div className="balance-strip">
          {balances.length === 0 ? (
            <span className="muted">No stamps yet.</span>
          ) : balances.map(b => (
            <div key={b.service_line} className="bal-pill">
              <span className="muted small">{slName(b.service_line)}</span>
              <b>{b.stamps_balance}</b>
            </div>
          ))}
        </div>

        {err && <div className="err">{err}</div>}

        <h2 className="section-title">Available rewards</h2>
        {rewards.length === 0 ? (
          <p className="muted">No rewards configured.</p>
        ) : (
          <div className="reward-grid">
            {rewards.map(r => {
              const have = balanceFor(r.service_line);
              const eligible = have >= r.stamps_cost;
              return (
                <div key={r.id} className={`reward-card ${eligible ? "" : "locked"}`}>
                  <div className="reward-head">
                    <div className="reward-name">{r.name}</div>
                    <span className="cost">{r.stamps_cost} stamps</span>
                  </div>
                  <div className="muted small">
                    {slName(r.service_line) ?? "any service"} · valid {r.validity_days} days
                  </div>
                  {r.description && <p className="reward-desc">{r.description}</p>}
                  <div className="reward-foot">
                    <span className={`muted small ${eligible ? "" : "low"}`}>
                      {eligible ? `Has ${have}` : `Needs ${r.stamps_cost - have} more`}
                    </span>
                    <button
                      className="reward-btn"
                      disabled={!eligible || busy}
                      onClick={() => issueVoucher(r)}
                    >
                      {busy ? "…" : "Issue voucher"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (step === "issued" && voucher && issuedReward && card) {
    const redeemed = voucher.status === "redeemed";
    return (
      <div className="hero">
        <div className="voucher">
          <h2 className="muted small">{redeemed ? "REDEEMED" : "VOUCHER ISSUED"}</h2>
          <h1 className="voucher-code mono">{voucher.voucher_code}</h1>
          <p className="reward-line">
            <b>{issuedReward.name}</b>
            <span className="muted"> · {issuedReward.stamps_cost} stamps</span>
          </p>
          <p className="muted small">
            For {card.first_name} {card.last_name} · expires {new Date(voucher.expires_at).toLocaleDateString()}
          </p>
          <div className="voucher-actions">
            <button className="ghost" onClick={() => window.print()}>Print voucher</button>
            {!redeemed && (
              <button onClick={markRedeemed} disabled={busy}>
                {busy ? "…" : "Mark redeemed now"}
              </button>
            )}
            <button className="ghost" onClick={reset}>Done</button>
          </div>
          {err && <div className="err">{err}</div>}
        </div>

        <PrintableVoucher
          brand={brand}
          variant={redeemed ? "redeemed" : "issued"}
          voucherCode={voucher.voucher_code}
          rewardName={issuedReward.name}
          rewardCode={issuedReward.code}
          rewardDescription={issuedReward.description}
          serviceLine={issuedReward.service_line}
          stampsUsed={voucher.stamps_used}
          memberName={`${card.first_name} ${card.last_name}`}
          memberNo={card.member_no}
          branchName={config.branch_name}
          expiresAt={voucher.expires_at}
        />
      </div>
    );
  }

  return null;
}
