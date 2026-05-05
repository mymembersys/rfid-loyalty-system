import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { query } from "../db/client";
import { env } from "../config/env";
import { HttpError } from "../middleware/error";

export const authRoutes = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRoutes.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const r = await query<{
      id: string; email: string; password_hash: string; role: string;
      full_name: string; branch_id: string | null; is_active: boolean;
    }>(
      `SELECT id, email, password_hash, role, full_name, branch_id, is_active
       FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );
    const user = r.rows[0];
    if (!user || !user.is_active) throw new HttpError(401, "Invalid credentials");

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new HttpError(401, "Invalid credentials");

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, branch_id: user.branch_id },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn } as jwt.SignOptions
    );

    await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id]);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        branch_id: user.branch_id,
      },
    });
  } catch (err) { next(err); }
});

authRoutes.post("/logout", (_req: Request, res: Response) => {
  // JWTs are stateless; client just drops the token. Add a denylist later if desired.
  res.json({ ok: true });
});
