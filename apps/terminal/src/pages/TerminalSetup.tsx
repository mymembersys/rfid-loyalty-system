import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { ServiceLine, TerminalConfig } from "../types";
import { useBranding } from "../useBranding";

type Branch = { id: string; name: string; service_line: ServiceLine };

type ServiceLineRow = {
  code: string;
  name: string;
  is_active: boolean;
};

export function TerminalSetup({ onSave }: { onSave: (c: TerminalConfig) => void }) {
  const [email, setEmail] = useState("frontdesk@example.com");
  const [password, setPassword] = useState("front123");
  const [token, setToken] = useState<string>("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [serviceLines, setServiceLines] = useState<ServiceLineRow[]>([]);
  const [branchId, setBranchId] = useState("");
  const [serviceLine, setServiceLine] = useState<ServiceLine>("");
  const [err, setErr] = useState<string | null>(null);
  const [staffName, setStaffName] = useState("");
  const [busy, setBusy] = useState(false);
  const brand = useBranding();

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api<{ items: Branch[] }>("/branches", { token }),
      api<{ items: ServiceLineRow[] }>("/service-lines", { token }),
    ])
      .then(([b, s]) => {
        setBranches(b.items);
        setServiceLines(s.items);
        if (b.items[0]) {
          setBranchId(b.items[0].id);
          // default to the branch's own service line if it's still active
          const branchSl = s.items.find(x => x.code === b.items[0].service_line);
          setServiceLine(branchSl?.code ?? s.items[0]?.code ?? "");
        }
      })
      .catch(e => setErr(e.message));
  }, [token]);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await api<{ token: string; user: { full_name: string } }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(r.token);
      setStaffName(r.user.full_name);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const branch = branches.find(b => b.id === branchId);
    if (!branch || !serviceLine) return;
    onSave({
      branch_id: branch.id,
      branch_name: branch.name,
      service_line: serviceLine,
      staff_token: token,
      staff_name: staffName,
    });
  }

  return (
    <div className="setup">
      <div className="setup-card">
        <div className="setup-head">
          {brand.logo_url
            ? <img className="logo lg" src={brand.logo_url} alt="" />
            : <span className="logo lg" />}
          <div>
            <h1>{brand.brand_name}</h1>
            <p className="muted small">{token ? `Signed in as ${staffName}` : "Terminal setup — sign in with a front-desk account"}</p>
          </div>
        </div>

        {!token ? (
          <form onSubmit={signIn} className="stack">
            <label>Front-desk email
              <input value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" />
            </label>
            <label>Password
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
            </label>
            {err && <div className="err">{err}</div>}
            <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
        ) : (
          <div className="stack">
            <label>Branch
              <select value={branchId} onChange={e => {
                setBranchId(e.target.value);
                const b = branches.find(x => x.id === e.target.value);
                if (b) {
                  const branchSl = serviceLines.find(s => s.code === b.service_line);
                  if (branchSl) setServiceLine(branchSl.code);
                }
              }}>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label>Service line
              <select value={serviceLine} onChange={e => setServiceLine(e.target.value)}>
                {serviceLines.length === 0 && <option value="">Loading…</option>}
                {serviceLines.map(s => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
              </select>
            </label>
            {err && <div className="err">{err}</div>}
            <button onClick={save} disabled={!branchId || !serviceLine}>Start terminal →</button>
          </div>
        )}
      </div>
    </div>
  );
}
