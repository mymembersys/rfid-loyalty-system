export const API_BASE: string = import.meta.env.VITE_API_URL ?? "";
const ROOT = `${API_BASE}/api/v1`;

export function apiOrigin(): string {
  return API_BASE || window.location.origin;
}

export async function api<T = any>(
  path: string,
  init: RequestInit & { token?: string } = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  const r = await fetch(`${ROOT}${path}`, { ...init, headers });
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).error || msg; } catch { /* noop */ }
    throw new Error(msg);
  }
  return r.json();
}
