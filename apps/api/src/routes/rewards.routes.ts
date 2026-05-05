import { Router } from "express";
import { z } from "zod";
import { query } from "../db/client";
import { requireAuth, requireRole } from "../middleware/auth";
import { HttpError } from "../middleware/error";

export const rewardRoutes = Router();
rewardRoutes.use(requireAuth);

rewardRoutes.get("/", async (req, res, next) => {
  try {
    const all = req.query.all === "1" || req.query.all === "true";
    const where = all ? "" : "WHERE is_active = TRUE";
    const r = await query(`SELECT * FROM rewards ${where} ORDER BY service_line NULLS FIRST, stamps_cost`);
    res.json({ items: r.rows });
  } catch (err) { next(err); }
});

const upsertSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  service_line: z.enum(["diagnostic", "psychological", "gym"]).nullable().optional(),
  stamps_cost: z.number().int().positive(),
  validity_days: z.number().int().positive().default(30),
  per_member_limit: z.number().int().positive().nullable().optional(),
});

const updateSchema = upsertSchema.partial().extend({
  is_active: z.boolean().optional(),
});

rewardRoutes.post("/", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const b = upsertSchema.parse(req.body);
    const r = await query(
      `INSERT INTO rewards (code, name, description, service_line, stamps_cost, validity_days, per_member_limit)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.code, b.name, b.description ?? null, b.service_line ?? null, b.stamps_cost, b.validity_days, b.per_member_limit ?? null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
});

rewardRoutes.patch("/:id", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const b = updateSchema.parse(req.body);
    const fields = Object.keys(b) as (keyof typeof b)[];
    if (fields.length === 0) {
      const r = await query(`SELECT * FROM rewards WHERE id = $1`, [req.params.id]);
      if (!r.rows[0]) throw new HttpError(404, "Reward not found");
      return res.json(r.rows[0]);
    }
    const setSql = fields.map((f, i) => `${f} = $${i + 2}`).join(", ");
    const values = fields.map(f => (b as any)[f]);
    const r = await query(
      `UPDATE rewards SET ${setSql} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!r.rows[0]) throw new HttpError(404, "Reward not found");
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

rewardRoutes.delete("/:id", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const r = await query(`UPDATE rewards SET is_active = FALSE WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!r.rows[0]) throw new HttpError(404, "Reward not found");
    res.json({ ok: true });
  } catch (err) { next(err); }
});
