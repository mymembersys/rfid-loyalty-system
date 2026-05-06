import { useEffect, useState } from "react";
import { api } from "./api";

export type ServiceLineRow = {
  code: string;
  name: string;
  color: string;
  is_active: boolean;
};

/** Fetches service-lines metadata using the kiosk's staff token. */
export function useServiceLines(token: string | null): ServiceLineRow[] {
  const [items, setItems] = useState<ServiceLineRow[]>([]);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api<{ items: ServiceLineRow[] }>("/service-lines", { token })
      .then(r => { if (!cancelled) setItems(r.items); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);
  return items;
}
