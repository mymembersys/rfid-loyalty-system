import { Router } from "express";
import { env } from "../config/env";
import { expireOverdueVouchers } from "../jobs/expireVouchers";
import { HttpError } from "../middleware/error";

export const cronRoutes = Router();

/**
 * Vercel Cron pings these endpoints on the schedule defined in vercel.json.
 * Authentication is the shared CRON_SECRET set as both:
 *   - Vercel project env var (CRON_SECRET)
 *   - Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically.
 */
function requireCron(req: any, _res: any, next: any) {
  if (!env.cronSecret) return next(new HttpError(500, "CRON_SECRET not configured"));
  const header = req.header("authorization") || "";
  if (header !== `Bearer ${env.cronSecret}`) return next(new HttpError(401, "Unauthorized"));
  next();
}

cronRoutes.get("/expire-vouchers", requireCron, async (_req, res, next) => {
  try {
    const n = await expireOverdueVouchers();
    res.json({ ok: true, expired: n });
  } catch (err) { next(err); }
});
