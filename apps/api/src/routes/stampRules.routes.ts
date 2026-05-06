import { Router } from "express";
import { z } from "zod";
import { query } from "../db/client";
import { requireAuth, requireRole } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import { assertActiveServiceLine } from "../lib/serviceLineCheck";

export const stampRuleRoutes = Router();
stampRuleRoutes.use(requireAuth);

stampRuleRoutes.get("/", async (req, res, next) => {
  try {
    const all = req.query.all === "1" || req.query.all === "true";
    const where = all ? "" : "WHERE is_active = TRUE";
    const r = await query(
      `SELECT sr.*, b.name AS branch_name
       FROM stamp_rules sr
       LEFT JOIN branches b ON b.id = sr.branch_id
       ${where}
       ORDER BY service_line, branch_id NULLS FIRST, created_at DESC`
    );
    res.json({ items: r.rows });
  } catch (err) { next(err); }
});

const baseSchema = z.object({
  service_line: z.string().min(2),
  branch_id: z.string().uuid().nullable().optional(),
  stamps_required: z.number().int().positive(),
  cooldown_minutes: z.number().int().nonnegative().default(720),
  cross_service_eligible: z.boolean().optional(),
  active_from: z.string().optional(),
  active_to: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

stampRuleRoutes.post("/", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const b = baseSchema.parse(req.body);
    await assertActiveServiceLine(b.service_line);
    const r = await query(
      `INSERT INTO stamp_rules
         (service_line, branch_id, stamps_required, cooldown_minutes, cross_service_eligible, active_from, active_to, is_active)
       VALUES ($1,$2,$3,$4, COALESCE($5, FALSE), COALESCE($6::timestamptz, now()), $7, COALESCE($8, TRUE))
       RETURNING *`,
      [
        b.service_line, b.branch_id ?? null, b.stamps_required, b.cooldown_minutes,
        b.cross_service_eligible ?? null, b.active_from ?? null, b.active_to ?? null, b.is_active ?? null,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
});

const updateSchema = baseSchema.partial();

stampRuleRoutes.patch("/:id", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const b = updateSchema.parse(req.body);
    if (b.service_line) await assertActiveServiceLine(b.service_line);
    const fields = Object.keys(b) as (keyof typeof b)[];
    if (fields.length === 0) {
      const r = await query(`SELECT * FROM stamp_rules WHERE id = $1`, [req.params.id]);
      if (!r.rows[0]) throw new HttpError(404, "Rule not found");
      return res.json(r.rows[0]);
    }
    const setSql = fields.map((f, i) => `${f} = $${i + 2}`).join(", ");
    const values = fields.map(f => (b as any)[f]);
    const r = await query(
      `UPDATE stamp_rules SET ${setSql} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!r.rows[0]) throw new HttpError(404, "Rule not found");
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

stampRuleRoutes.delete("/:id", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const r = await query(
      `UPDATE stamp_rules SET is_active = FALSE WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!r.rows[0]) throw new HttpError(404, "Rule not found");
    res.json({ ok: true });
  } catch (err) { next(err); }
});
