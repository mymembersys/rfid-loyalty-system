import { Router } from "express";
import { z } from "zod";
import { query } from "../db/client";
import { recordAudit } from "../db/audit";
import { requireAuth, requireRole } from "../middleware/auth";
import { HttpError } from "../middleware/error";

export const serviceLineRoutes = Router();
serviceLineRoutes.use(requireAuth);

// Lowercase letters/digits/underscore, must start with a letter, 2–30 chars.
// Strict to make ALTER TYPE safe (no parameter binding for DDL).
const CODE_RE = /^[a-z][a-z0-9_]{1,29}$/;
const HEX     = /^#[0-9a-fA-F]{6}$/;

serviceLineRoutes.get("/", async (req, res, next) => {
  try {
    const all = req.query.all === "1" || req.query.all === "true";
    const where = all ? "" : "WHERE is_active = TRUE";
    const r = await query(
      `SELECT code, name, description, color, sort_order, is_active, created_at, updated_at
       FROM service_lines ${where}
       ORDER BY sort_order, name`
    );
    res.json({ items: r.rows });
  } catch (err) { next(err); }
});

const createSchema = z.object({
  code:        z.string().regex(CODE_RE, "Code must be lowercase letters/digits/underscores, 2–30 chars, starting with a letter"),
  name:        z.string().min(1).max(60),
  description: z.string().max(500).nullable().optional(),
  color:       z.string().regex(HEX, "Color must be a #RRGGBB hex value").optional(),
  sort_order:  z.number().int().optional(),
});

serviceLineRoutes.post("/", requireRole("admin"), async (req, res, next) => {
  try {
    const b = createSchema.parse(req.body);

    // 1. Add the new value to the `service_line` enum (Postgres 12+).
    //    Code is regex-validated; we still wrap in single quotes carefully.
    //    `IF NOT EXISTS` is a no-op if a previous attempt already added it.
    await query(`ALTER TYPE service_line ADD VALUE IF NOT EXISTS '${b.code}'`);

    // 2. Insert the metadata row. We have to cast the text to the enum.
    const r = await query(
      `INSERT INTO service_lines (code, name, description, color, sort_order)
       VALUES ($1::service_line, $2, $3, COALESCE($4, '#3b5bdb'), COALESCE($5, 0))
       ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name,
             description = EXCLUDED.description,
             color = EXCLUDED.color,
             sort_order = EXCLUDED.sort_order,
             is_active = TRUE,
             updated_at = now()
       RETURNING *`,
      [b.code, b.name, b.description ?? null, b.color ?? null, b.sort_order ?? null]
    );

    await recordAudit(req, {
      action: "service_line.create",
      entity_type: "service_line",
      entity_id: null,
      payload: { code: b.code, name: b.name },
    });
    res.status(201).json(r.rows[0]);
  } catch (err: any) {
    if (typeof err?.message === "string" && /unsafe use of new value/i.test(err.message)) {
      // Some pgbouncer transaction-mode setups may need a session-mode connection.
      return next(new HttpError(500, "Could not add the new code to the database. Try again, or run `ALTER TYPE service_line ADD VALUE '<code>'` directly in the Supabase SQL editor."));
    }
    next(err);
  }
});

const updateSchema = z.object({
  name:        z.string().min(1).max(60).optional(),
  description: z.string().max(500).nullable().optional(),
  color:       z.string().regex(HEX).optional(),
  sort_order:  z.number().int().optional(),
  is_active:   z.boolean().optional(),
});

serviceLineRoutes.patch("/:code", requireRole("admin"), async (req, res, next) => {
  try {
    if (!CODE_RE.test(req.params.code)) throw new HttpError(400, "Invalid code");
    const b = updateSchema.parse(req.body);
    const fields = Object.keys(b) as (keyof typeof b)[];
    if (fields.length === 0) {
      const r = await query(`SELECT * FROM service_lines WHERE code = $1::service_line`, [req.params.code]);
      if (!r.rows[0]) throw new HttpError(404, "Service line not found");
      return res.json(r.rows[0]);
    }
    const setSql = fields.map((f, i) => `${f} = $${i + 2}`).join(", ") + ", updated_at = now()";
    const values = fields.map(f => (b as any)[f]);
    const r = await query(
      `UPDATE service_lines SET ${setSql} WHERE code = $1::service_line RETURNING *`,
      [req.params.code, ...values]
    );
    if (!r.rows[0]) throw new HttpError(404, "Service line not found");
    await recordAudit(req, {
      action: "service_line.update",
      entity_type: "service_line",
      entity_id: null,
      payload: { code: req.params.code, changed: fields },
    });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

serviceLineRoutes.delete("/:code", requireRole("admin"), async (req, res, next) => {
  try {
    if (!CODE_RE.test(req.params.code)) throw new HttpError(400, "Invalid code");
    // Soft-deactivate. Postgres can't drop enum values, so existing branches /
    // visits / etc. that reference this code keep working. Operators can
    // re-activate later by editing the row.
    const r = await query(
      `UPDATE service_lines SET is_active = FALSE, updated_at = now()
       WHERE code = $1::service_line RETURNING code, name`,
      [req.params.code]
    );
    if (!r.rows[0]) throw new HttpError(404, "Service line not found");
    await recordAudit(req, {
      action: "service_line.deactivate",
      entity_type: "service_line",
      entity_id: null,
      payload: { code: req.params.code, name: r.rows[0].name },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
