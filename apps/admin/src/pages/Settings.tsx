import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth } from "../api/auth";
import { loadBranding } from "../branding";
import { useBranding } from "../useBranding";

type FormState = {
  brand_name: string;
  primary_color: string;
  accent_color: string;
};

type Palette = {
  name: string;
  primary: string;
  accent: string;
};

const PALETTES: Palette[] = [
  { name: "Office",     primary: "#1F4E79", accent: "#2E75B6" },
  { name: "Indigo Pro", primary: "#3B5BDB", accent: "#6C8AFF" },
  { name: "Forest",     primary: "#166534", accent: "#22C55E" },
  { name: "Ocean",      primary: "#0F766E", accent: "#06B6D4" },
  { name: "Royal",      primary: "#5B21B6", accent: "#8B5CF6" },
  { name: "Sunset",     primary: "#B91C1C", accent: "#F97316" },
  { name: "Rose",       primary: "#BE185D", accent: "#EC4899" },
  { name: "Slate",      primary: "#1E293B", accent: "#475569" },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

export function Settings() {
  const { token, user } = useAuth();
  if (user && user.role !== "admin") return <Navigate to="/" replace />;

  const brand = useBranding();
  const [form, setForm] = useState<FormState>({
    brand_name: brand.brand_name,
    primary_color: brand.primary_color,
    accent_color: brand.accent_color,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // keep form synced with whatever the rest of the app loaded
  useEffect(() => {
    setForm({
      brand_name: brand.brand_name,
      primary_color: brand.primary_color,
      accent_color: brand.accent_color,
    });
  }, [brand.brand_name, brand.primary_color, brand.accent_color]);

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function applyPalette(p: Palette) {
    setForm(f => ({ ...f, primary_color: p.primary, accent_color: p.accent }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    if (!form.brand_name.trim()) { setErr("Brand name is required"); return; }
    if (!HEX.test(form.primary_color)) { setErr("Primary color must be a #RRGGBB hex value"); return; }
    if (!HEX.test(form.accent_color))  { setErr("Accent color must be a #RRGGBB hex value");  return; }
    setBusy(true);
    try {
      await apiFetch("/settings", {
        method: "PUT",
        token,
        body: JSON.stringify({
          brand_name: form.brand_name.trim(),
          primary_color: form.primary_color,
          accent_color: form.accent_color,
        }),
      });
      await loadBranding();
      setOk("Saved.");
    } catch (e: any) {
      setErr(e.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function onLogoChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadErr(null);
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setUploadErr("Logo must be a PNG or JPEG image");
      e.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadErr("Logo must be 2 MB or smaller");
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const r = await fetch("/api/v1/settings/logo", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!r.ok) {
        let msg = r.statusText;
        try { msg = (await r.json()).error || msg; } catch { /* noop */ }
        throw new Error(msg);
      }
      await loadBranding();
    } catch (err: any) {
      setUploadErr(err.message || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  // Live preview swatch styles
  const swatchStyle = {
    background: `linear-gradient(135deg, ${form.primary_color} 0%, ${form.accent_color} 100%)`,
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Network-wide branding shown across the admin portal and the branch terminals.</p>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <h2>Brand</h2>
          <form onSubmit={submit} className="form-grid">
            <label className="field span-2">
              <span>Brand name *</span>
              <input
                required maxLength={80}
                value={form.brand_name}
                onChange={(e) => setField("brand_name", e.target.value)}
              />
            </label>

            <label className="field">
              <span>Primary color</span>
              <div className="color-row">
                <input
                  type="color"
                  value={form.primary_color}
                  onChange={(e) => setField("primary_color", e.target.value)}
                  className="color-swatch"
                  aria-label="Pick primary color"
                />
                <input
                  className="mono"
                  value={form.primary_color}
                  onChange={(e) => setField("primary_color", e.target.value)}
                  maxLength={7}
                />
              </div>
            </label>
            <label className="field">
              <span>Accent color</span>
              <div className="color-row">
                <input
                  type="color"
                  value={form.accent_color}
                  onChange={(e) => setField("accent_color", e.target.value)}
                  className="color-swatch"
                  aria-label="Pick accent color"
                />
                <input
                  className="mono"
                  value={form.accent_color}
                  onChange={(e) => setField("accent_color", e.target.value)}
                  maxLength={7}
                />
              </div>
            </label>

            <div className="span-2">
              <div className="muted small" style={{ marginBottom: ".5rem" }}>Preset palettes</div>
              <div className="palette-grid">
                {PALETTES.map(p => {
                  const selected =
                    p.primary.toLowerCase() === form.primary_color.toLowerCase() &&
                    p.accent.toLowerCase()  === form.accent_color.toLowerCase();
                  return (
                    <button
                      key={p.name}
                      type="button"
                      className={`palette-chip ${selected ? "selected" : ""}`}
                      onClick={() => applyPalette(p)}
                      title={`${p.primary} / ${p.accent}`}
                    >
                      <span className="palette-swatch" style={{ background: `linear-gradient(135deg, ${p.primary} 0%, ${p.accent} 100%)` }} />
                      <span>{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {err && <div className="err span-2">{err}</div>}
            {ok && <div className="ok-msg span-2">{ok}</div>}

            <div className="span-2 form-actions">
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? "Saving…" : "Save brand"}
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <h2>Preview</h2>
          <div className="brand-preview">
            <div className="bp-card">
              <div className="bp-head">
                {brand.logo_url
                  ? <img src={brand.logo_url} alt="" className="bp-logo" />
                  : <span className="bp-glyph" style={swatchStyle} />}
                <strong>{form.brand_name || "Brand"}</strong>
              </div>
              <div className="bp-actions">
                <button type="button" className="bp-btn" style={{ background: form.primary_color }}>Primary</button>
                <button type="button" className="bp-btn outline" style={{ color: form.accent_color, borderColor: form.accent_color }}>
                  Accent
                </button>
              </div>
              <div className="bp-bar">
                <span style={{ background: form.primary_color }} />
                <span style={{ background: form.accent_color }} />
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="panel">
        <h2>Logo</h2>
        <div className="logo-row">
          <div className="logo-preview">
            {brand.logo_url
              ? <img src={brand.logo_url} alt="Current logo" />
              : <span className="muted small">No logo uploaded.</span>}
          </div>
          <div>
            <p className="muted small" style={{ marginTop: 0 }}>
              PNG or JPEG up to 2 MB. Square images render best in the sidebar and login card.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/png, image/jpeg"
              onChange={onLogoChosen}
              style={{ display: "none" }}
            />
            <div className="form-actions" style={{ justifyContent: "flex-start" }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? "Uploading…" : brand.logo_url ? "Replace logo" : "Upload logo"}
              </button>
            </div>
            {uploadErr && <div className="err" style={{ marginTop: ".75rem" }}>{uploadErr}</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
