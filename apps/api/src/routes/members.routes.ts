import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { query } from "../db/client";
import { recordAudit } from "../db/audit";
import { requireAuth, requireRole } from "../middleware/auth";
import { HttpError } from "../middleware/error";

export const memberRoutes = Router();
memberRoutes.use(requireAuth);

const createMemberSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  date_of_birth: z.string().optional(),     // YYYY-MM-DD
  gender: z.string().optional(),
  emergency_contact: z.string().optional(),
  origin_branch_id: z.string().uuid().optional(),
  consent_marketing: z.boolean().optional(),
});

memberRoutes.get("/", async (req, res, next) => {
  try {
    const search = (req.query.q as string) || "";
    const params: any[] = [];
    let where = "WHERE TRUE";
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (first_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR phone ILIKE $${params.length} OR email ILIKE $${params.length} OR member_no ILIKE $${params.length})`;
    }
    const r = await query(
      `SELECT id, member_no, first_name, last_name, email, phone, status, created_at
       FROM members ${where}
       ORDER BY created_at DESC LIMIT 100`,
      params
    );
    res.json({ items: r.rows });
  } catch (err) { next(err); }
});

memberRoutes.get("/:id", async (req, res, next) => {
  try {
    const r = await query(`SELECT * FROM members WHERE id = $1`, [req.params.id]);
    if (!r.rows[0]) throw new HttpError(404, "Member not found");
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

memberRoutes.post("/", requireRole("admin", "manager", "frontdesk"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createMemberSchema.parse(req.body);
    // Generate a simple member_no — replace with a more sophisticated rule later
    const memberNo = `M-${Date.now().toString(36).toUpperCase()}`;
    const r = await query(
      `INSERT INTO members (member_no, first_name, last_name, email, phone, date_of_birth,
                            gender, emergency_contact, origin_branch_id, consent_given_at, consent_marketing)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now(), COALESCE($10, FALSE))
       RETURNING *`,
      [
        memberNo, body.first_name, body.last_name, body.email ?? null, body.phone ?? null,
        body.date_of_birth ?? null, body.gender ?? null, body.emergency_contact ?? null,
        body.origin_branch_id ?? null, body.consent_marketing ?? null,
      ]
    );
    const created = r.rows[0];
    await recordAudit(req, {
      action: "member.create",
      entity_type: "member",
      entity_id: created.id,
      branch_id: created.origin_branch_id ?? null,
      payload: { member_no: created.member_no, first_name: created.first_name, last_name: created.last_name },
    });
    res.status(201).json(created);
  } catch (err) { next(err); }
});

const updateMemberSchema = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  date_of_birth: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  emergency_contact: z.string().nullable().optional(),
  origin_branch_id: z.string().uuid().nullable().optional(),
  consent_marketing: z.boolean().optional(),
  status: z.enum(["active", "suspended", "inactive", "blacklisted"]).optional(),
});

memberRoutes.patch("/:id", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const body = updateMemberSchema.parse(req.body);
    const fields = Object.keys(body) as (keyof typeof body)[];
    if (fields.length === 0) {
      const r = await query(`SELECT * FROM members WHERE id = $1`, [req.params.id]);
      if (!r.rows[0]) throw new HttpError(404, "Member not found");
      return res.json(r.rows[0]);
    }
    const before = await query(`SELECT * FROM members WHERE id = $1`, [req.params.id]);
    if (!before.rows[0]) throw new HttpError(404, "Member not found");
    const prev = before.rows[0];

    const setSql = fields.map((f, i) => `${f} = $${i + 2}`).join(", ");
    const values = fields.map(f => (body as any)[f] === "" ? null : (body as any)[f]);
    const r = await query(
      `UPDATE members SET ${setSql} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    const updated = r.rows[0];

    const changed: Record<string, { from: any; to: any }> = {};
    for (const f of fields) {
      if (prev[f] !== updated[f]) changed[f] = { from: prev[f], to: updated[f] };
    }
    await recordAudit(req, {
      action: "member.update",
      entity_type: "member",
      entity_id: updated.id,
      branch_id: updated.origin_branch_id ?? null,
      payload: { changed },
    });
    if (changed.status) {
      await recordAudit(req, {
        action: "member.status_change",
        entity_type: "member",
        entity_id: updated.id,
        branch_id: updated.origin_branch_id ?? null,
        payload: { from: changed.status.from, to: changed.status.to },
      });
    }
    res.json(updated);
  } catch (err) { next(err); }
});

memberRoutes.get("/:id/balance", async (req, res, next) => {
  try {
    const r = await query(
      `SELECT service_line, stamps_earned, stamps_spent, stamps_balance
       FROM member_stamp_balance WHERE member_id = $1`,
      [req.params.id]
    );
    res.json({ items: r.rows });
  } catch (err) { next(err); }
});

memberRoutes.get("/:id/cards", async (req, res, next) => {
  try {
    const r = await query(
      `SELECT id, uid, status, issued_at, issued_branch_id, replaced_by_card_id
       FROM cards WHERE member_id = $1 ORDER BY issued_at DESC`,
      [req.params.id]
    );
    res.json({ items: r.rows });
  } catch (err) { next(err); }
});
