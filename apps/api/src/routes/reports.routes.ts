import { Router, Request } from "express";
import { query } from "../db/client";
import { requireAuth } from "../middleware/auth";

export const reportRoutes = Router();
reportRoutes.use(requireAuth);

/**
 * Pull `from`, `to`, and `branch_id` from req.query, apply sensible defaults,
 * and return SQL fragments + bound parameters ready to splice into a query.
 */
function visitFilters(req: Request, alias = "v") {
  const fromRaw = (req.query.from as string) || null;
  const toRaw   = (req.query.to as string)   || null;
  const branch  = (req.query.branch_id as string) || null;

  const params: any[] = [];
  const wheres: string[] = [];

  // Date range — both inclusive on date level
  if (fromRaw) {
    params.push(fromRaw);
    wheres.push(`${alias}.visited_at >= $${params.length}::date`);
  }
  if (toRaw) {
    params.push(toRaw);
    // Add 1 day so the upper bound is inclusive of the chosen day
    wheres.push(`${alias}.visited_at < ($${params.length}::date + interval '1 day')`);
  }
  if (!fromRaw && !toRaw) {
    wheres.push(`${alias}.visited_at >= now() - interval '30 days'`);
  }
  if (branch) {
    params.push(branch);
    wheres.push(`${alias}.branch_id = $${params.length}`);
  }
  return { where: "WHERE " + wheres.join(" AND "), params };
}

reportRoutes.get("/visits/daily", async (req, res, next) => {
  try {
    const { where, params } = visitFilters(req, "v");
    const r = await query(
      `SELECT date_trunc('day', v.visited_at) AS day,
              v.branch_id,
              b.name AS branch_name,
              v.service_line,
              COUNT(*) FILTER (WHERE v.is_voided = FALSE) AS visits
       FROM visits v
       LEFT JOIN branches b ON b.id = v.branch_id
       ${where}
       GROUP BY 1, 2, 3, 4
       ORDER BY 1 DESC, 3`,
      params
    );
    res.json({ items: r.rows });
  } catch (err) { next(err); }
});

reportRoutes.get("/visits/trend", async (req, res, next) => {
  try {
    // For the chart we want gap-filled days, so we work in two steps:
    // 1) Find the desired window
    // 2) generate_series + LEFT JOIN against the filtered visits
    const fromRaw = (req.query.from as string) || null;
    const toRaw   = (req.query.to as string)   || null;
    const branch  = (req.query.branch_id as string) || null;

    const params: any[] = [];
    const visitWheres: string[] = [];
    let lower: string;
    let upper: string;

    if (fromRaw) {
      params.push(fromRaw);
      lower = `$${params.length}::date`;
    } else {
      lower = `(date_trunc('day', now()) - interval '29 days')::date`;
    }
    if (toRaw) {
      params.push(toRaw);
      upper = `$${params.length}::date`;
    } else {
      upper = `date_trunc('day', now())::date`;
    }

    visitWheres.push(`v.visited_at >= ${lower}`);
    visitWheres.push(`v.visited_at < (${upper} + interval '1 day')`);
    if (branch) {
      params.push(branch);
      visitWheres.push(`v.branch_id = $${params.length}`);
    }

    const r = await query(
      `WITH days AS (
         SELECT generate_series(${lower}, ${upper}, interval '1 day')::date AS day
       )
       SELECT d.day,
              COALESCE(COUNT(v.id) FILTER (WHERE v.is_voided = FALSE), 0)::int AS visits
       FROM days d
       LEFT JOIN visits v
         ON date_trunc('day', v.visited_at)::date = d.day
        AND ${visitWheres.join(" AND ")}
       GROUP BY d.day
       ORDER BY d.day ASC`,
      params
    );
    res.json({ items: r.rows });
  } catch (err) { next(err); }
});

reportRoutes.get("/members/top", async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
    const fromRaw = (req.query.from as string) || null;
    const toRaw   = (req.query.to as string)   || null;
    const branch  = (req.query.branch_id as string) || null;

    const params: any[] = [];
    const wheres: string[] = ["v.is_voided = FALSE"];

    if (fromRaw) { params.push(fromRaw); wheres.push(`v.visited_at >= $${params.length}::date`); }
    if (toRaw)   { params.push(toRaw);   wheres.push(`v.visited_at < ($${params.length}::date + interval '1 day')`); }
    if (!fromRaw && !toRaw) wheres.push(`v.visited_at >= now() - interval '90 days'`);
    if (branch)  { params.push(branch); wheres.push(`v.branch_id = $${params.length}`); }

    params.push(limit);
    const r = await query(
      `SELECT m.id,
              m.member_no,
              m.first_name,
              m.last_name,
              m.status,
              COUNT(v.id) AS visits,
              COUNT(DISTINCT v.service_line) AS service_lines,
              MAX(v.visited_at) AS last_visit
       FROM members m
       JOIN visits v ON v.member_id = m.id
       WHERE ${wheres.join(" AND ")}
       GROUP BY m.id
       ORDER BY visits DESC, last_visit DESC
       LIMIT $${params.length}`,
      params
    );
    res.json({ items: r.rows });
  } catch (err) { next(err); }
});

/**
 * Vouchers (redemptions) with filters:
 *   ?status=pending|redeemed|expired|voided
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD   (filters by created_at)
 *   ?branch_id=<uuid>                (issuing branch)
 *   ?reward_q=<text>                 (ILIKE on reward name or code)
 */
reportRoutes.get("/redemptions", async (req, res, next) => {
  try {
    const status   = (req.query.status as string)    || null;
    const fromRaw  = (req.query.from as string)      || null;
    const toRaw    = (req.query.to as string)        || null;
    const branch   = (req.query.branch_id as string) || null;
    const rewardQ  = (req.query.reward_q as string)  || null;

    const params: any[] = [];
    const wheres: string[] = [];

    if (status) {
      params.push(status);
      wheres.push(`r.status = $${params.length}::redemption_status`);
    }
    if (fromRaw) { params.push(fromRaw); wheres.push(`r.created_at >= $${params.length}::date`); }
    if (toRaw)   { params.push(toRaw);   wheres.push(`r.created_at < ($${params.length}::date + interval '1 day')`); }
    if (branch)  { params.push(branch); wheres.push(`r.branch_id = $${params.length}`); }
    if (rewardQ) {
      params.push(`%${rewardQ}%`);
      wheres.push(`(rw.name ILIKE $${params.length} OR rw.code ILIKE $${params.length})`);
    }

    const where = wheres.length ? "WHERE " + wheres.join(" AND ") : "";
    const r = await query(
      `SELECT r.id, r.voucher_code, r.status, r.stamps_used,
              r.created_at, r.expires_at, r.redeemed_at,
              r.member_id, m.first_name, m.last_name, m.member_no,
              r.reward_id, rw.code AS reward_code, rw.name AS reward_name, rw.service_line AS reward_service_line,
              r.branch_id, b.name AS branch_name
       FROM redemptions r
       JOIN members  m  ON m.id  = r.member_id
       JOIN rewards  rw ON rw.id = r.reward_id
       LEFT JOIN branches b ON b.id = r.branch_id
       ${where}
       ORDER BY r.created_at DESC
       LIMIT 500`,
      params
    );
    res.json({ items: r.rows });
  } catch (err) { next(err); }
});

reportRoutes.get("/members/activity", async (_req, res, next) => {
  try {
    const r = await query(
      `SELECT
         COUNT(*) FILTER (WHERE last_visit IS NOT NULL AND last_visit >= now() - interval '60 days') AS active_60d,
         COUNT(*) FILTER (WHERE last_visit IS NULL OR last_visit <  now() - interval '60 days')      AS dormant_60d,
         COUNT(*) AS total
       FROM (
         SELECT m.id, MAX(v.visited_at) AS last_visit
         FROM members m LEFT JOIN visits v ON v.member_id = m.id AND v.is_voided = FALSE
         WHERE m.status = 'active'
         GROUP BY m.id
       ) s`
    );
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

reportRoutes.get("/members/cross-service", async (_req, res, next) => {
  try {
    const r = await query(
      `SELECT
         COUNT(*) FILTER (WHERE distinct_lines >= 2) AS members_2plus,
         COUNT(*) FILTER (WHERE distinct_lines >= 3) AS members_3plus,
         COUNT(*) AS total_active_members
       FROM (
         SELECT m.id, COUNT(DISTINCT v.service_line) AS distinct_lines
         FROM members m JOIN visits v ON v.member_id = m.id AND v.is_voided = FALSE
         WHERE m.status = 'active'
         GROUP BY m.id
       ) s`
    );
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});
