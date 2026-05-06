import { Router } from "express";
import { z } from "zod";
import { query } from "../db/client";
import { recordAudit } from "../db/audit";
import { requireAuth, requireRole } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import { assertActiveServiceLine } from "../lib/serviceLineCheck";

export const branchRoutes = Router();
branchRoutes.use(requireAuth);

branchRoutes.get("/", async (req, res, next) => {
  try {
    const all = req.query.all === "1" || req.query.all === "true";
    const where = all ? "" : "WHERE is_active = TRUE";
    const r = await query(`SELECT * FROM branches ${where} ORDER BY is_active DESC, name`);
    res.json({ items: r.rows });
  } catch (err) { next(err); }
});

const createSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(1),
  service_line: z.string().min(2),
  address: z.string().optional(),
  phone: z.string().optional(),
});

branchRoutes.post("/", requireRole("admin"), async (req, res, next) => {
  try {
    const b = createSchema.parse(req.body);
    await assertActiveServiceLine(b.service_line);
    const r = await query(
      `INSERT INTO branches (code, name, service_line, address, phone)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [b.code, b.name, b.service_line, b.address ?? null, b.phone ?? null]
    );
    const created = r.rows[0];
    await recordAudit(req, {
      action: "branch.create",
      entity_type: "branch",
      entity_id: created.id,
      branch_id: created.id,
      payload: { code: created.code, name: created.name, service_line: created.service_line },
    });
    res.status(201).json(created);
  } catch (err) { next(err); }
});

const updateSchema = z.object({
  code: z.string().min(2).optional(),
  name: z.string().min(1).optional(),
  service_line: z.string().min(2).optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

branchRoutes.patch("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const b = updateSchema.parse(req.body);
    if (b.service_line) await assertActiveServiceLine(b.service_line);
    const fields = Object.keys(b) as (keyof typeof b)[];
    if (fields.length === 0) {
      const r = await query(`SELECT * FROM branches WHERE id = $1`, [req.params.id]);
      if (!r.rows[0]) throw new HttpError(404, "Branch not found");
      return res.json(r.rows[0]);
    }
    const before = await query(`SELECT * FROM branches WHERE id = $1`, [req.params.id]);
    if (!before.rows[0]) throw new HttpError(404, "Branch not found");
    const prev = before.rows[0];

    const setSql = fields.map((f, i) => `${f} = $${i + 2}`).join(", ") + ", updated_at = now()";
    const values = fields.map(f => (b as any)[f] === "" ? null : (b as any)[f]);
    const r = await query(
      `UPDATE branches SET ${setSql} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    const updated = r.rows[0];
    const changed: Record<string, { from: any; to: any }> = {};
    for (const f of fields) {
      if (prev[f] !== updated[f]) changed[f] = { from: prev[f], to: updated[f] };
    }
    await recordAudit(req, {
      action: "branch.update",
      entity_type: "branch",
      entity_id: updated.id,
      branch_id: updated.id,
      payload: { changed },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

branchRoutes.delete("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const r = await query(
      `UPDATE branches SET is_active = FALSE, updated_at = now() WHERE id = $1
       RETURNING id, code, name`,
      [req.params.id]
    );
    if (!r.rows[0]) throw new HttpError(404, "Branch not found");
    await recordAudit(req, {
      action: "branch.deactivate",
      entity_type: "branch",
      entity_id: r.rows[0].id,
      branch_id: r.rows[0].id,
      payload: { code: r.rows[0].code, name: r.rows[0].name },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
