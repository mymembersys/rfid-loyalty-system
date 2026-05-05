export type Branding = {
  brand_name: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
};

const DEFAULTS: Branding = {
  brand_name: "RFID Loyalty",
  logo_url: null,
  primary_color: "#1F4E79",
  accent_color: "#2E75B6",
};

let current: Branding = DEFAULTS;
const listeners = new Set<(b: Branding) => void>();

function applyToDom(b: Branding) {
  const root = document.documentElement;
  root.style.setProperty("--primary", b.primary_color);
  root.style.setProperty("--accent", b.accent_color);
  document.title = `${b.brand_name} — Terminal`;
}

export async function loadBranding(): Promise<Branding> {
  try {
    const base: string = import.meta.env.VITE_API_URL ?? "";
    const r = await fetch(`${base}/api/v1/settings`);
    if (!r.ok) throw new Error(String(r.status));
    const json = (await r.json()) as Branding;
    current = { ...DEFAULTS, ...json };
  } catch {
    current = DEFAULTS;
  }
  applyToDom(current);
  for (const fn of listeners) fn(current);
  return current;
}

export function getBranding(): Branding {
  return current;
}

export function subscribeBranding(fn: (b: Branding) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
