import { FormEvent, useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import * as XLSX from "xlsx";
import { apiFetch } from "../api/client";
import { useAuth } from "../api/auth";

type DailyRow = {
  day: string;
  branch_id: string;
  branch_name: string | null;
  service_line: "diagnostic" | "psychological" | "gym";
  visits: number | string;
};

type TrendRow = { day: string; visits: number };

type TopMember = {
  id: string;
  member_no: string;
  first_name: string;
  last_name: string;
  status: string;
  visits: number | string;
  service_lines: number | string;
  last_visit: string | null;
};

type Branch = { id: string; name: string; service_line: string; };

type Voucher = {
  id: string;
  voucher_code: string;
  status: "pending" | "redeemed" | "expired" | "voided";
  stamps_used: number;
  created_at: string;
  expires_at: string;
  redeemed_at: string | null;
  member_id: string;
  first_name: string;
  last_name: string;
  member_no: string;
  reward_id: string;
  reward_code: string;
  reward_name: string;
  reward_service_line: string | null;
  branch_id: string | null;
  branch_name: string | null;
};

type Filters = {
  from: string;
  to: string;
  branch_id: string;
  reward_q: string;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmt(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  return withTime ? d.toLocaleString() : d.toLocaleDateString();
}

function buildQuery(f: Filters, extra: Record<string, string | undefined> = {}): string {
  const p = new URLSearchParams();
  if (f.from) p.set("from", f.from);
  if (f.to)   p.set("to", f.to);
  if (f.branch_id) p.set("branch_id", f.branch_id);
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== "") p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function Reports() {
  const { token } = useAuth();
  const [filters, setFilters] = useState<Filters>({
    from: daysAgoISO(30),
    to: todayISO(),
    branch_id: "",
    reward_q: "",
  });
  // applied = the filter set most recently submitted (so typing in reward_q doesn't refetch every keystroke)
  const [applied, setApplied] = useState<Filters>(filters);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [top, setTop] = useState<TopMember[]>([]);
  const [pending, setPending] = useState<Voucher[]>([]);
  const [redeemed, setRedeemed] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<{ items: Branch[] }>("/branches", { token })
      .then(r => setBranches(r.items)).catch(() => {});
  }, [token]);

  async function loadAll(f: Filters) {
    setLoading(true);
    const q = buildQuery(f);
    const qReward = buildQuery(f, { reward_q: f.reward_q });
    try {
      const [d, t, m, p, r] = await Promise.all([
        apiFetch<{ items: DailyRow[] }>(`/reports/visits/daily${q}`, { token }),
        apiFetch<{ items: TrendRow[] }>(`/reports/visits/trend${q}`, { token }),
        apiFetch<{ items: TopMember[] }>(`/reports/members/top${q}&limit=10`.replace("?&", "?"), { token }),
        apiFetch<{ items: Voucher[] }>(`/reports/redemptions${buildQuery(f, { status: "pending", reward_q: f.reward_q })}`, { token }),
        apiFetch<{ items: Voucher[] }>(`/reports/redemptions${buildQuery(f, { status: "redeemed", reward_q: f.reward_q })}`, { token }),
      ]);
      setRows(d.items);
      setTrend(t.items.map(x => ({ ...x, visits: Number(x.visits) })));
      setTop(m.items);
      setPending(p.items);
      setRedeemed(r.items);
    } catch {
      // surfaced via empty tables; could add toast later
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(applied); /* eslint-disable-next-line */ }, [applied.from, applied.to, applied.branch_id, applied.reward_q]);

  function setField<K extends keyof Filters>(k: K, v: Filters[K]) {
    setFilters(f => ({ ...f, [k]: v }));
  }

  function applyFilters(e?: FormEvent) {
    if (e) e.preventDefault();
    setApplied(filters);
  }

  function resetFilters() {
    const reset: Filters = { from: daysAgoISO(30), to: todayISO(), branch_id: "", reward_q: "" };
    setFilters(reset);
    setApplied(reset);
  }

  const chartData = useMemo(
    () => trend.map(r => ({ day: shortDate(r.day), visits: r.visits })),
    [trend]
  );
  const trendTotal = useMemo(() => trend.reduce((s, r) => s + Number(r.visits), 0), [trend]);

  function exportXlsx() {
    const wb = XLSX.utils.book_new();
    const meta = [
      ["Generated",     new Date().toLocaleString()],
      ["Date range",    `${applied.from} → ${applied.to}`],
      ["Branch filter", branches.find(b => b.id === applied.branch_id)?.name || "All branches"],
      ["Reward filter", applied.reward_q || "—"],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["RFID Loyalty — Report Export"],
      [],
      ...meta,
    ]), "Summary");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      trend.map(r => ({ Day: r.day.slice(0, 10), Visits: Number(r.visits) }))
    ), "Trend");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      rows.map(r => ({
        Day:          fmt(r.day),
        Branch:       r.branch_name ?? r.branch_id,
        ServiceLine:  r.service_line,
        Visits:       Number(r.visits),
      }))
    ), "Daily Visits");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      top.map((m, i) => ({
        Rank:         i + 1,
        Member:       `${m.first_name} ${m.last_name}`,
        MemberNo:     m.member_no,
        Visits:       Number(m.visits),
        ServiceLines: Number(m.service_lines),
        LastVisit:    fmt(m.last_visit),
        Status:       m.status,
      }))
    ), "Top Members");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      pending.map(v => ({
        Voucher:    v.voucher_code,
        Reward:     v.reward_name,
        RewardCode: v.reward_code,
        Member:     `${v.first_name} ${v.last_name}`,
        MemberNo:   v.member_no,
        Stamps:     v.stamps_used,
        Branch:     v.branch_name ?? "",
        Created:    fmt(v.created_at, true),
        Expires:    fmt(v.expires_at, true),
      }))
    ), "Pending Vouchers");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      redeemed.map(v => ({
        Voucher:    v.voucher_code,
        Reward:     v.reward_name,
        RewardCode: v.reward_code,
        Member:     `${v.first_name} ${v.last_name}`,
        MemberNo:   v.member_no,
        Stamps:     v.stamps_used,
        Branch:     v.branch_name ?? "",
        Created:    fmt(v.created_at, true),
        Redeemed:   fmt(v.redeemed_at, true),
      }))
    ), "Redeemed Vouchers");

    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `rfid-loyalty-report-${stamp}.xlsx`);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p className="muted">Network activity at a glance.</p>
        </div>
        <div className="actions">
          <button className="btn-secondary" onClick={resetFilters} disabled={loading}>Reset</button>
          <button className="btn-primary" onClick={exportXlsx} disabled={loading}>Export to Excel</button>
        </div>
      </div>

      {/* ---------- filter bar ---------- */}
      <section className="panel filters">
        <form className="filters-grid" onSubmit={applyFilters}>
          <label className="field">
            <span>From</span>
            <input type="date" value={filters.from} onChange={(e) => setField("from", e.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={filters.to} onChange={(e) => setField("to", e.target.value)} />
          </label>
          <label className="field">
            <span>Branch</span>
            <select value={filters.branch_id} onChange={(e) => setField("branch_id", e.target.value)}>
              <option value="">All branches</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name} ({b.service_line})</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Reward search <small className="muted">(vouchers)</small></span>
            <input
              value={filters.reward_q}
              onChange={(e) => setField("reward_q", e.target.value)}
              placeholder="Reward name or code"
            />
          </label>
          <div className="filters-actions">
            <button type="submit" className="btn-primary" disabled={loading}>Apply</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Visits trend</h2>
          <small className="muted">{trendTotal} total · {applied.from} → {applied.to}</small>
        </div>
        {chartData.length === 0 ? (
          <p className="muted">No visit data in this range.</p>
        ) : (
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="#e5e9f2" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#6b7280" }} interval={Math.max(0, Math.floor(chartData.length / 12))} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "rgba(59,91,219,.08)" }}
                  contentStyle={{ borderRadius: 8, border: "1px solid #e5e9f2", fontSize: 13 }}
                  labelStyle={{ color: "#0f172a", fontWeight: 600 }}
                />
                <Bar dataKey="visits" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Daily visits by branch</h2>
          <small className="muted">{rows.length} rows</small>
        </div>
        <table className="data">
          <thead><tr><th>Day</th><th>Branch</th><th>Service Line</th><th>Visits</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{fmt(r.day)}</td>
                <td>{r.branch_name || <span className="muted mono">{r.branch_id.slice(0, 8)}…</span>}</td>
                <td>{r.service_line}</td>
                <td><b>{r.visits}</b></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="muted center">No visit data.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Top members</h2>
          <small className="muted">top 10 in window</small>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>#</th><th>Member</th><th>Member #</th>
              <th>Visits</th><th>Service lines</th><th>Last visit</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {top.map((m, i) => (
              <tr key={m.id}>
                <td className="muted">{i + 1}</td>
                <td><Link to={`/members/${m.id}`} className="link-strong">{m.first_name} {m.last_name}</Link></td>
                <td className="mono">{m.member_no}</td>
                <td><b>{m.visits}</b></td>
                <td>{m.service_lines}</td>
                <td>{m.last_visit ? fmt(m.last_visit) : <span className="muted">—</span>}</td>
                <td><span className={`badge badge-${m.status}`}>{m.status}</span></td>
              </tr>
            ))}
            {top.length === 0 && <tr><td colSpan={7} className="muted center">No qualifying visits.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Pending vouchers</h2>
          <small className="muted">{pending.length} outstanding</small>
        </div>
        <VoucherTable items={pending} variant="pending" />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Redeemed vouchers</h2>
          <small className="muted">{redeemed.length} in window</small>
        </div>
        <VoucherTable items={redeemed} variant="redeemed" />
      </section>
    </div>
  );
}

const PAGE_SIZES = [10, 25, 50, 100];

function VoucherTable({ items, variant }: { items: Voucher[]; variant: "pending" | "redeemed" }) {
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState<number>(1);

  // Reset to first page when the data set changes (filters re-applied, etc.)
  const lastSig = useRef("");
  const sig = `${items.length}:${items[0]?.id ?? ""}`;
  if (sig !== lastSig.current) {
    lastSig.current = sig;
    if (page !== 1) setPage(1);
  }

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage  = Math.min(page, pageCount);
  const start     = (safePage - 1) * pageSize;
  const end       = Math.min(start + pageSize, total);
  const slice     = items.slice(start, end);

  if (total === 0) {
    return <p className="muted">No {variant} vouchers in this window.</p>;
  }

  return (
    <>
      <table className="data">
        <thead>
          <tr>
            <th>Voucher</th><th>Reward</th><th>Member</th><th>Stamps</th><th>Branch</th>
            <th>Created</th>
            <th>{variant === "redeemed" ? "Redeemed" : "Expires"}</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {slice.map(v => (
            <tr key={v.id}>
              <td className="mono">{v.voucher_code}</td>
              <td>
                {v.reward_name}
                <div className="muted small mono">{v.reward_code}{v.reward_service_line ? ` · ${v.reward_service_line}` : ""}</div>
              </td>
              <td>
                <Link to={`/members/${v.member_id}`} className="link">{v.first_name} {v.last_name}</Link>
                <div className="muted small mono">{v.member_no}</div>
              </td>
              <td>{v.stamps_used}</td>
              <td>{v.branch_name || <span className="muted">—</span>}</td>
              <td>{new Date(v.created_at).toLocaleDateString()}</td>
              <td>
                {variant === "redeemed"
                  ? (v.redeemed_at ? new Date(v.redeemed_at).toLocaleString() : <span className="muted">—</span>)
                  : new Date(v.expires_at).toLocaleDateString()}
              </td>
              <td><span className={`badge badge-${v.status}`}>{v.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pagination">
        <div className="page-size">
          <label className="muted small">Rows per page</label>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          >
            {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="page-info muted small">
          Showing <b>{start + 1}</b>–<b>{end}</b> of <b>{total}</b>
        </div>
        <div className="page-nav">
          <button
            type="button"
            className="btn-ghost btn-sm"
            disabled={safePage <= 1}
            onClick={() => setPage(1)}
            title="First page"
          >« First</button>
          <button
            type="button"
            className="btn-ghost btn-sm"
            disabled={safePage <= 1}
            onClick={() => setPage(safePage - 1)}
          >‹ Prev</button>
          <span className="page-indicator small">
            Page <b>{safePage}</b> of <b>{pageCount}</b>
          </span>
          <button
            type="button"
            className="btn-ghost btn-sm"
            disabled={safePage >= pageCount}
            onClick={() => setPage(safePage + 1)}
          >Next ›</button>
          <button
            type="button"
            className="btn-ghost btn-sm"
            disabled={safePage >= pageCount}
            onClick={() => setPage(pageCount)}
            title="Last page"
          >Last »</button>
        </div>
      </div>
    </>
  );
}
