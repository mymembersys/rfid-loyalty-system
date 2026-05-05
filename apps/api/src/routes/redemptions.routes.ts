import { Router } from "express";
import { z } from "zod";
import { pool, query } from "../db/client";
import { recordAudit } from "../db/audit";
import { requireAuth, requireRole } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import crypto from "crypto";

export const redemptionRoutes = Router();
redemptionRoutes.use(requireAuth);

const redeemSchema = z.object({
  member_id: z.string().uuid(),
  reward_id: z.string().uuid(),
  branch_id: z.string().uuid(),
});

redemptionRoutes.post("/", requireRole("admin", "manager", "frontdesk"), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const b = redeemSchema.parse(req.body);
    await client.query("BEGIN");

    const rewardR = await client.query(
      `SELECT * FROM rewards WHERE id = $1 AND is_active = TRUE`, [b.reward_id]
    );
    const reward = rewardR.rows[0];
    if (!reward) throw new HttpError(404, "Reward not found or inactive");

    // Check balance for the relevant service_line (or any)
    const balR = await client.query(
      `SELECT COALESCE(SUM(stamps_balance), 0) AS bal
       FROM member_stamp_balance
       WHERE member_id = $1 AND ($2::service_line IS NULL OR service_line = $2)`,
      [b.member_id, reward.service_line]
    );
    const balance = Number(balR.rows[0].bal);
    if (balance < reward.stamps_cost) {
      throw new HttpError(400, `Insufficient stamps (have ${balance}, need ${reward.stamps_cost})`);
    }

    // Per-member limit
    if (reward.per_member_limit) {
      const usedR = await client.query(
        `SELECT COUNT(*)::int AS c FROM redemptions WHERE member_id = $1 AND reward_id = $2 AND status IN ('pending','redeemed')`,
        [b.member_id, b.reward_id]
      );
      if (usedR.rows[0].c >= reward.per_member_limit) {
        throw new HttpError(400, "Per-member redemption limit reached");
      }
    }

    const voucher = `V-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const expiresAt = new Date(Date.now() + reward.validity_days * 86400_000).toISOString();

    const insR = await client.query(
      `INSERT INTO redemptions (member_id, reward_id, stamps_used, branch_id, staff_user_id, voucher_code, status, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',$7) RETURNING *`,
      [b.member_id, b.reward_id, reward.stamps_cost, b.branch_id, req.auth?.sub ?? null, voucher, expiresAt]
    );

    await client.query("COMMIT");
    const created = insR.rows[0];
    await recordAudit(req, {
      action: "redemption.create",
      entity_type: "redemption",
      entity_id: created.id,
      branch_id: b.branch_id,
      payload: {
        member_id: b.member_id,
        reward_id: b.reward_id,
        reward_code: reward.code,
        stamps_used: reward.stamps_cost,
        voucher_code: created.voucher_code,
      },
    });
    res.status(201).json(created);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

redemptionRoutes.get("/by-voucher/:code", async (req, res, next) => {
  try {
    const r = await query(
      `SELECT r.id, r.voucher_code, r.status, r.stamps_used, r.created_at,
              r.expires_at, r.redeemed_at,
              r.member_id, m.first_name, m.last_name, m.member_no, m.status AS member_status,
              r.reward_id, rw.code AS reward_code, rw.name AS reward_name,
              rw.description AS reward_description, rw.service_line AS reward_service_line,
              r.branch_id AS issued_branch_id, b.name AS issued_branch_name
       FROM redemptions r
       JOIN members  m  ON m.id  = r.member_id
       JOIN rewards  rw ON rw.id = r.reward_id
       LEFT JOIN branches b ON b.id = r.branch_id
       WHERE r.voucher_code = $1`,
      [req.params.code]
    );
    if (!r.rows[0]) throw new HttpError(404, "Voucher not found");
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

redemptionRoutes.post("/:id/redeem", requireRole("admin", "manager", "frontdesk"), async (req, res, next) => {
  try {
    const r = await query(
      `UPDATE redemptions SET status = 'redeemed', redeemed_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [req.params.id]
    );
    if (!r.rows[0]) throw new HttpError(400, "Redemption not pending");
    const red = r.rows[0];
    await recordAudit(req, {
      action: "redemption.redeem",
      entity_type: "redemption",
      entity_id: red.id,
      branch_id: red.branch_id ?? null,
      payload: {
        member_id: red.member_id,
        reward_id: red.reward_id,
        voucher_code: red.voucher_code,
        stamps_used: red.stamps_used,
      },
    });
    res.json(red);
  } catch (err) { next(err); }
});

redemptionRoutes.get("/by-member/:memberId", async (req, res, next) => {
  try {
    const r = await query(
      `SELECT r.*, rw.name AS reward_name, rw.code AS reward_code
       FROM redemptions r JOIN rewards rw ON rw.id = r.reward_id
       WHERE r.member_id = $1 ORDER BY r.created_at DESC LIMIT 100`,
      [req.params.memberId]
    );
    res.json({ items: r.rows });
  } catch (err) { next(err); }
});
