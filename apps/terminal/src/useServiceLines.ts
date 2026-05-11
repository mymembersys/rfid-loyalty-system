import { useEffect, useState } from "react";
import { api } from "./api";

export type ServiceLineRow = {
  code: string;
  name: string;
  color: string;
  is_active: boolean;
};

// Module-level cache: service-lines change rarely and the terminal switches
// tabs (CheckIn / Redeem / Voucher) constantly. Fetching once per token
// avoids 2 extra cross-region round-trips on every tab switch.
let cache: { token: string; items: ServiceLineRow[] } | null = null;
let inflight: { token: string; promise: Promise<ServiceLineRow[]> } | null = null;
const listeners = new Set<(items: ServiceLineRow[]) => void>();

function fetchOnce(token: string): Promise<ServiceLineRow[]> {
  if (cache && cache.token === token) return Promise.resolve(cache.items);
  if (inflight && inflight.token === token) return inflight.promise;
  const p = api<{ items: ServiceLineRow[] }>("/service-lines", { token })
    .then(r => {
      cache = { token, items: r.items };
      inflight = null;
      for (const fn of listeners) fn(r.items);
      return r.items;
    })
    .catch(err => {
      inflight = null;
      throw err;
    });
  inflight = { token, promise: p };
  return p;
}

/** Fetches service-lines metadata using the kiosk's staff token. Cached per token. */
export function useServiceLines(token: string | null): ServiceLineRow[] {
  const [items, setItems] = useState<ServiceLineRow[]>(() =>
    cache && token && cache.token === token ? cache.items : []
  );
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const sub = (next: ServiceLineRow[]) => { if (!cancelled) setItems(next); };
    listeners.add(sub);
    fetchOnce(token).then(sub).catch(() => {});
    return () => { cancelled = true; listeners.delete(sub); };
  }, [token]);
  return items;
}
