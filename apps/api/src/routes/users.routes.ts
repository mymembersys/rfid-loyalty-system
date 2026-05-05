import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "../db/client";
import { recordAudit } from "../db/audit";
import { requireAuth, requireRole } from "../middleware/auth";
import { HttpError } from "../middleware/error";

export const userRoutes = Router();
userRoutes.use(requireAuth);
userRoutes.use(requireRole("admin"));

const SAFE_COLUMNS = `
  u.id, u.email, u.full_name, u.role, u.branch_id, u.is_active,
  u.last_login_at, u.created_at, u.updated_at,
  b.name AS branch_name
`;

userRoutes.get("/", async (req, res, next) => {
  try {
    const all = req.query.all === "1" || req.query.all === "true";
    const where = all ? "" : "WHERE u.is_active = TRUE";
    const r = await query(
      `SELECT ${SAFE_COLUMNS}
       FROM users u
       LEFT JOIN branches b ON b.id = u.branch_id
       ${where}
       ORDER BY u.is_active DESC, u.role, u.full_name`
    );
    res.json({ items: r.rows });
  } catch (err) { next(err); }
});

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1),
  role: z.enum(["admin", "manager", "frontdesk", "auditor"]),
  branch_id: z.string().uuid().nullable().optional(),
});

userRoutes.post("/", async (req, res, next) => {
  try {
    const b = createSchema.parse(req.body);
    const dup = await query(`SELECT id FROM users WHERE email = $1`, [b.email]);
    if (dup.rows[0]) throw new HttpError(409, "Email already in use");

    const hash = await bcrypt.hash(b.password, 10);
    const r = await query(
      `INSERT INTO users (email, password_hash, full_name, role, branch_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, full_name, role, branch_id, is_active, created_at`,
      [b.email, hash, b.full_name, b.role, b.branch_id ?? null]
    );
    const created = r.rows[0];
    await recordAudit(req, {
      action: "user.create",
      entity_type: "user",
      entity_id: created.id,
      payload: { email: created.email, role: created.role, branch_id: created.branch_id },
    });
    res.status(201).json(created);
  } catch (err) { next(err); }
});

const updateSchema = z.object({
  full_name: z.string().min(1).optional(),
  role: z.enum(["admin", "manager", "frontdesk", "auditor"]).optional(),
  branch_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
});

userRoutes.patch("/:id", async (req, res, next) => {
  try {
    const b = updateSchema.parse(req.body);
    const fields = Object.keys(b) as (keyof typeof b)[];
    if (fields.length === 0) {
      const r = await query(
        `SELECT ${SAFE_COLUMNS} FROM users u
         LEFT JOIN branches b ON b.id = u.branch_id
         WHERE u.id = $1`,
        [req.params.id]
      );
      if (!r.rows[0]) throw new HttpError(404, "User not found");
      return res.json(r.rows[0]);
    }

    const before = await query(`SELECT * FROM users WHERE id = $1`, [req.params.id]);
    if (!before.rows[0]) throw new HttpError(404, "User not found");
    const prev = before.rows[0];

    // Prevent the acting admin from locking themselves out
    if (req.auth?.sub === req.params.id) {
      if (b.role && b.role !== "admin") throw new HttpError(400, "Cannot demote yourself");
      if (b.is_active === false)        throw new HttpError(400, "Cannot deactivate yourself");
    }

    const setSql = fields.map((f, i) => `${f} = $${i + 2}`).join(", ") + ", updated_at = now()";
    const values = fields.map(f => (b as any)[f]);
    const r = await query(
      `UPDATE users SET ${setSql} WHERE id = $1
       RETURNING id, email, full_name, role, branch_id, is_active, last_login_at, created_at, updated_at`,
      [req.params.id, ...values]
    );
    const updated = r.rows[0];

    const changed: Record<string, { from: any; to: any }> = {};
    for (const f of fields) {
      if (prev[f] !== updated[f]) changed[f] = { from: prev[f], to: updated[f] };
    }
    await recordAudit(req, {
      action: "user.update",
      entity_type: "user",
      entity_id: updated.id,
      payload: { changed },
    });
    if (changed.role || changed.is_active) {
      await recordAudit(req, {
        action: "user.role_change",
        entity_type: "user",
        entity_id: updated.id,
        payload: {
          role:      changed.role,
          is_active: changed.is_active,
        },
      });
    }
    res.json(updated);
  } catch (err) { next(err); }
});

userRoutes.delete("/:id", async (req, res, next) => {
  try {
    if (req.auth?.sub === req.params.id) throw new HttpError(400, "Cannot deactivate yourself");
    const r = await query(
      `UPDATE users SET is_active = FALSE, updated_at = now() WHERE id = $1
       RETURNING id, email`,
      [req.params.id]
    );
    if (!r.rows[0]) throw new HttpError(404, "User not found");
    await recordAudit(req, {
      action: "user.deactivate",
      entity_type: "user",
      entity_id: r.rows[0].id,
      payload: { email: r.rows[0].email },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

const resetSchema = z.object({ password: z.string().min(8) });

userRoutes.post("/:id/reset-password", async (req, res, next) => {
  try {
    const { password } = resetSchema.parse(req.body);
    const hash = await bcrypt.hash(password, 10);
    const r = await query(
      `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1
       RETURNING id, email`,
      [req.params.id, hash]
    );
    if (!r.rows[0]) throw new HttpError(404, "User not found");
    await recordAudit(req, {
      action: "user.password_reset",
      entity_type: "user",
      entity_id: r.rows[0].id,
      payload: { email: r.rows[0].email, self: req.auth?.sub === r.rows[0].id },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
