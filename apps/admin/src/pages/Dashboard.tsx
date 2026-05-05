import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import { useAuth } from "../api/auth";

export function Dashboard() {
  const { token } = useAuth();
  const [activity, setActivity] = useState<any>(null);
  const [cross, setCross] = useState<any>(null);

  useEffect(() => {
    apiFetch("/reports/members/activity", { token }).then(setActivity).catch(() => {});
    apiFetch("/reports/members/cross-service", { token }).then(setCross).catch(() => {});
  }, [token]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">An overview of member activity across all branches.</p>
        </div>
      </div>
      <div className="cards">
        <div className="card"><h3>Active members (60d)</h3><p>{activity?.active_60d ?? "—"}</p></div>
        <div className="card"><h3>Dormant members (60d)</h3><p>{activity?.dormant_60d ?? "—"}</p></div>
        <div className="card"><h3>Total active</h3><p>{activity?.total ?? "—"}</p></div>
        <div className="card"><h3>2+ services</h3><p>{cross?.members_2plus ?? "—"}</p></div>
        <div className="card"><h3>3 services</h3><p>{cross?.members_3plus ?? "—"}</p></div>
      </div>
    </div>
  );
}
