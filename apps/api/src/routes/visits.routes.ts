import { Router } from "express";
import { z } from "zod";
import { query } from "../db/client";
import { recordAudit } from "../db/audit";
import { requireAuth, requireRole } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import { signBalanceToken } from "../lib/balanceToken";
import { assertActiveServiceLine } from "../lib/serviceLineCheck";

export const visitRoutes = Router();
visitRoutes.use(requireAuth);

const checkInSchema = z.object({
  card_uid: z.string().min(4),
  branch_id: z.string().uuid(),
  service_line: z.string().min(2),
  sub_service: z.string().optional(),
});

/**
 * Tap-to-check-in.
 * 1. Resolve card UID -> member.
 * 2. Enforce cooldown rule for this service line.
 * 3. Insert visit. Return updated balance.
 */
visitRoutes.post("/check-in", requireRole("admin", "manager", "frontdesk"), async (req, res, next) => {
  try {
    const body = checkInSchema.parse(req.body);
    await assertActiveServiceLine(body.service_line);

    const cardR = await query(
      `SELECT c.id AS card_id, c.status AS card_status, c.member_id,
              m.first_name, m.last_name, m.member_no, m.status AS member_status
       FROM cards c JOIN members m ON m.id = c.member_id
       WHERE c.uid = $1`,
      [body.card_uid]
    );
    const card = cardR.rows[0];
    if (!card) throw new HttpError(404, "Card not found");
    if (card.card_status !== "active") throw new HttpError(400, `Card is ${card.card_status}`);
    if (card.member_status !== "active") throw new HttpError(400, `Member is ${card.member_status}`);

    // cooldown rule
    const ruleR = await query(
      `SELECT cooldown_minutes FROM stamp_rules
       WHERE service_line = $1 AND is_active = TRUE
         AND (branch_id = $2 OR branch_id IS NULL)
       ORDER BY (branch_id IS NULL) ASC LIMIT 1`,
      [body.service_line, body.branch_id]
    );
    const cooldown = ruleR.rows[0]?.cooldown_minutes ?? 720;

    const dupR = await query(
      `SELECT id, visited_at FROM visits
       WHERE member_id = $1 AND service_line = $2
         AND is_voided = FALSE
         AND visited_at >= now() - ($3 || ' minutes')::interval
       ORDER BY visited_at DESC LIMIT 1`,
      [card.member_id, body.service_line, String(cooldown)]
    );
    if (dupR.rows[0]) {
      throw new HttpError(409, `Within cooldown window (${cooldown} min). Last visit at ${dupR.rows[0].visited_at}.`);
    }

    const insR = await query(
      `INSERT INTO visits (member_id, card_id, branch_id, service_line, sub_service, staff_user_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [card.member_id, card.card_id, body.branch_id, body.service_line, body.sub_service ?? null, req.auth?.sub ?? null]
    );

    const balR = await query(
      `SELECT stamps_balance FROM member_stamp_balance
       WHERE member_id = $1 AND service_line = $2`,
      [card.member_id, body.service_line]
    );

    await recordAudit(req, {
      action: "visit.create",
      entity_type: "visit",
      entity_id: insR.rows[0].id,
      branch_id: body.branch_id,
      payload: {
        member_id: card.member_id,
        card_id: card.card_id,
        card_uid: body.card_uid,
        service_line: body.service_line,
        sub_service: body.sub_service ?? null,
      },
    });

    res.status(201).json({
      visit: insR.rows[0],
      member: {
        id: card.member_id,
        member_no: card.member_no,
        first_name: card.first_name,
        last_name: card.last_name,
      },
      balance: balR.rows[0]?.stamps_balance ?? 0,
      balance_token: signBalanceToken(card.member_id),
    });
  } catch (err) { next(err); }
});

// Void a visit (manager / admin only)
visitRoutes.post("/:id/void", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const reason = z.object({ reason: z.string().min(1) }).parse(req.body).reason;
    const r = await query(
      `UPDATE visits SET is_voided = TRUE, voided_at = now(), voided_by = $2, void_reason = $3
       WHERE id = $1 RETURNING *`,
      [req.params.id, req.auth?.sub ?? null, reason]
    );
    if (!r.rows[0]) throw new HttpError(404, "Visit not found");
    const v = r.rows[0];
    await recordAudit(req, {
      action: "visit.void",
      entity_type: "visit",
      entity_id: v.id,
      branch_id: v.branch_id ?? null,
      payload: {
        member_id: v.member_id,
        service_line: v.service_line,
        reason,
        visited_at: v.visited_at,
      },
    });
    res.json(v);
  } catch (err) { next(err); }
});

// Member visit history
visitRoutes.get("/by-member/:memberId", async (req, res, next) => {
  try {
    const r = await query(
      `SELECT v.*, b.name AS branch_name
       FROM visits v JOIN branches b ON b.id = v.branch_id
       WHERE v.member_id = $1
       ORDER BY v.visited_at DESC LIMIT 200`,
      [req.params.memberId]
    );
    res.json({ items: r.rows });
  } catch (err) { next(err); }
});
