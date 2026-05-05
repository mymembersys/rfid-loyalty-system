import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../api/auth";
import { useBranding } from "../useBranding";

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const brand = useBranding();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(email, password);
      nav("/");
    } catch (e: any) {
      setErr(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form onSubmit={onSubmit} className="login-card">
        <div className="login-brand">
          {brand.logo_url
            ? <img className="brand-logo lg" src={brand.logo_url} alt="" />
            : <span className="brand-glyph lg" />}
          <h1>{brand.brand_name}</h1>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>Sign in to manage members, cards, and rewards.</p>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        {err && <div className="err">{err}</div>}
        <button disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
