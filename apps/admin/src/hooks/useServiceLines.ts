import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";

export type ServiceLine = {
  code: string;
  name: string;
  description: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
};

export function useServiceLines(token: string | null): ServiceLine[] {
  const [items, setItems] = useState<ServiceLine[]>([]);
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ items: ServiceLine[] }>("/service-lines", { token })
      .then(r => { if (!cancelled) setItems(r.items); })
      .catch(() => { /* surfaces as empty list; pages render their own empty state */ });
    return () => { cancelled = true; };
  }, [token]);
  return items;
}
