import { Router } from "express";
import { z } from "zod";
import { query } from "../db/client";
import { recordAudit } from "../db/audit";
import { requireAuth, requireRole } from "../middleware/auth";
import { HttpError } from "../middleware/error";

export const cardRoutes = Router();
cardRoutes.use(requireAuth);

const issueSchema = z.object({
  uid: z.string().min(4),
  member_id: z.string().uuid(),
  branch_id: z.string().uuid().optional(),
});

// Issue a card to a member
cardRoutes.post("/", requireRole("admin", "manager", "frontdesk"), async (req, res, next) => {
  try {
    const body = issueSchema.parse(req.body);
    const dup = await query(`SELECT id FROM cards WHERE uid = $1`, [body.uid]);
    if (dup.rows[0]) throw new HttpError(409, "Card UID already exists");
    const r = await query(
      `INSERT INTO cards (uid, member_id, issued_branch_id, issued_by_user_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [body.uid, body.member_id, body.branch_id ?? null, req.auth?.sub ?? null]
    );
    const card = r.rows[0];
    await recordAudit(req, {
      action: "card.issue",
      entity_type: "card",
      entity_id: card.id,
      branch_id: body.branch_id ?? null,
      payload: { uid: card.uid, member_id: card.member_id },
    });
    res.status(201).json(card);
  } catch (err) { next(err); }
});

// Look up a card by UID (used by terminal on tap)
cardRoutes.get("/by-uid/:uid", async (req, res, next) => {
  try {
    const r = await query(
      `SELECT c.*, m.first_name, m.last_name, m.member_no, m.status AS member_status
       FROM cards c JOIN members m ON m.id = c.member_id
       WHERE c.uid = $1`,
      [req.params.uid]
    );
    if (!r.rows[0]) throw new HttpError(404, "Card not found");
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// Replace a lost/damaged card
cardRoutes.post("/:id/replace", requireRole("admin", "manager", "frontdesk"), async (req, res, next) => {
  try {
    const newUid = z.object({ new_uid: z.string().min(4) }).parse(req.body).new_uid;
    const old = await query(`SELECT * FROM cards WHERE id = $1`, [req.params.id]);
    if (!old.rows[0]) throw new HttpError(404, "Card not found");

    const newCard = await query(
      `INSERT INTO cards (uid, member_id, issued_branch_id, issued_by_user_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [newUid, old.rows[0].member_id, old.rows[0].issued_branch_id, req.auth?.sub ?? null]
    );
    await query(
      `UPDATE cards SET status = 'replaced', replaced_by_card_id = $2 WHERE id = $1`,
      [req.params.id, newCard.rows[0].id]
    );
    await recordAudit(req, {
      action: "card.replace",
      entity_type: "card",
      entity_id: req.params.id,
      branch_id: old.rows[0].issued_branch_id ?? null,
      payload: {
        member_id: old.rows[0].member_id,
        old_uid: old.rows[0].uid,
        new_uid: newCard.rows[0].uid,
        new_card_id: newCard.rows[0].id,
      },
    });
    res.json({ old_card_id: req.params.id, new_card: newCard.rows[0] });
  } catch (err) { next(err); }
});

// Blacklist a card
cardRoutes.post("/:id/blacklist", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const r = await query(
      `UPDATE cards SET status = 'blacklisted' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!r.rows[0]) throw new HttpError(404, "Card not found");
    const card = r.rows[0];
    await recordAudit(req, {
      action: "card.blacklist",
      entity_type: "card",
      entity_id: card.id,
      branch_id: card.issued_branch_id ?? null,
      payload: { uid: card.uid, member_id: card.member_id },
    });
    res.json(card);
  } catch (err) { next(err); }
});
