import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { TerminalConfig } from "../types";
import { BalanceQR } from "../components/BalanceQR";

type CheckInResult = {
  member: { id: string; member_no: string; first_name: string; last_name: string };
  balance: number;
  balance_token: string;
};

/**
 * USB RFID readers behave as a HID keyboard: they "type" the card UID
 * followed by Enter into the focused field. We keep the UID input
 * always focused so taps trigger submit automatically.
 */
export function CheckIn({
  config,
  onReset,
  embedded = false,
}: { config: TerminalConfig; onReset?: () => void; embedded?: boolean }) {
  const [uid, setUid] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<CheckInResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const i = inputRef.current;
    if (!i) return;
    const refocus = () => i.focus();
    refocus();
    document.addEventListener("click", refocus);
    return () => document.removeEventListener("click", refocus);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = uid.trim();
    if (!value) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<CheckInResult>("/visits/check-in", {
        method: "POST",
        token: config.staff_token,
        body: JSON.stringify({
          card_uid: value,
          branch_id: config.branch_id,
          service_line: config.service_line,
        }),
      });
      setLast(r);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setUid("");
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const hero = (
    <div className="hero">
      <h1>Tap your card</h1>
      <p className="muted">Place the card on the reader to record your visit.</p>

      <form onSubmit={submit} className="tap-form">
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
        <button type="submit" disabled={busy}>{busy ? "Recording…" : "Record visit"}</button>
      </form>

      {err && <div className="err big">{err}</div>}

      {last && !err && (
        <div className="ok">
          <div className="big">Welcome, {last.member.first_name} {last.member.last_name}!</div>
          <div className="muted">Member #{last.member.member_no}</div>
          <div className="balance">Stamps: <b>{last.balance}</b></div>

          {last.balance_token && (
            <div className="balance-qr">
              <BalanceQR token={last.balance_token} size={150} />
              <div className="qr-caption muted small">
                Scan with your phone to see your full balance
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (embedded) return hero;

  return (
    <div className="terminal">
      <header>
        <div className="brand">
          <span className="logo" />
          <strong>{config.branch_name}</strong>
          <span className="tag">{config.service_line}</span>
        </div>
        <div className="staff">
          <span className="muted small">{config.staff_name}</span>
          {onReset && <button className="ghost" onClick={onReset}>Sign out terminal</button>}
        </div>
      </header>
      {hero}
      <footer className="tfoot muted small">
        Tip: USB RFID readers type the UID and press Enter automatically.
      </footer>
    </div>
  );
}
