import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { z } from "zod";
import { query } from "../db/client";
import { recordAudit } from "../db/audit";
import { requireAuth, requireRole } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import {
  isSupabaseStorageEnabled,
  uploadLogoToSupabase,
  deleteLogoFromSupabase,
} from "../lib/storage";

export const settingsRoutes = Router();

const HEX = /^#[0-9a-fA-F]{6}$/;

// Local-disk uploads dir (only used when Supabase Storage isn't configured).
// Vercel's filesystem is read-only outside /tmp, so production must enable Supabase.
export const UPLOADS_DIR = path.resolve(__dirname, "..", "..", "uploads");
if (!isSupabaseStorageEnabled) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// In-memory storage works for both backends (we then either pipe to Supabase
// or write to disk). Keeps 2 MB cap server-side.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "image/png" || file.mimetype === "image/jpeg") cb(null, true);
    else cb(new HttpError(400, "Only PNG or JPEG images are allowed"));
  },
});

settingsRoutes.get("/", async (_req, res, next) => {
  try {
    const r = await query(
      `SELECT brand_name, logo_url, primary_color, accent_color, updated_at
       FROM settings WHERE id = 1`
    );
    const row = r.rows[0] || {
      brand_name: "RFID Loyalty",
      logo_url: null,
      primary_color: "#1F4E79",
      accent_color: "#2E75B6",
      updated_at: null,
    };
    res.json(row);
  } catch (err) { next(err); }
});

const updateSchema = z.object({
  brand_name:    z.string().min(1).max(80).optional(),
  primary_color: z.string().regex(HEX, "Must be a #RRGGBB color").optional(),
  accent_color:  z.string().regex(HEX, "Must be a #RRGGBB color").optional(),
  logo_url:      z.string().nullable().optional(),
});

settingsRoutes.put("/", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const b = updateSchema.parse(req.body);
    const fields = Object.keys(b) as (keyof typeof b)[];
    if (fields.length === 0) {
      const r = await query(`SELECT * FROM settings WHERE id = 1`);
      return res.json(r.rows[0]);
    }
    const setSql = fields.map((f, i) => `${f} = $${i + 1}`).join(", ")
                 + `, updated_by = $${fields.length + 1}, updated_at = now()`;
    const values = fields.map(f => (b as any)[f]);
    const r = await query(
      `UPDATE settings SET ${setSql} WHERE id = 1 RETURNING *`,
      [...values, req.auth?.sub ?? null]
    );
    await recordAudit(req, {
      action: "settings.update",
      entity_type: "settings",
      entity_id: null,
      payload: { changed: fields.reduce((acc, f) => ({ ...acc, [f]: (b as any)[f] }), {}) },
    });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

settingsRoutes.post(
  "/logo",
  requireAuth,
  requireRole("admin"),
  upload.single("logo"),
  async (req, res, next) => {
    try {
      if (!req.file) throw new HttpError(400, "No file uploaded");
      const ext = req.file.mimetype === "image/png" ? ".png" : ".jpg";
      const filename = `${crypto.randomBytes(8).toString("hex")}${ext}`;

      const prev = await query(`SELECT logo_url FROM settings WHERE id = 1`);
      const oldUrl: string | null = prev.rows[0]?.logo_url ?? null;

      let logoUrl: string;
      if (isSupabaseStorageEnabled) {
        logoUrl = await uploadLogoToSupabase({
          filename,
          contentType: req.file.mimetype,
          buffer: req.file.buffer,
        });
      } else {
        // Local dev — write to disk and serve via /uploads
        const dest = path.join(UPLOADS_DIR, filename);
        await fs.promises.writeFile(dest, req.file.buffer);
        logoUrl = `/uploads/${filename}`;
      }

      await query(
        `UPDATE settings SET logo_url = $1, updated_by = $2, updated_at = now() WHERE id = 1`,
        [logoUrl, req.auth?.sub ?? null]
      );

      // Best-effort cleanup of the old asset
      if (oldUrl) {
        if (isSupabaseStorageEnabled) {
          // Old URL might be a Supabase public URL — derive filename from path tail
          const tail = oldUrl.split("/").pop();
          if (tail) deleteLogoFromSupabase(tail);
        } else if (oldUrl.startsWith("/uploads/")) {
          const oldPath = path.join(UPLOADS_DIR, path.basename(oldUrl));
          fs.unlink(oldPath, () => { /* ignore */ });
        }
      }

      await recordAudit(req, {
        action: "settings.logo_update",
        entity_type: "settings",
        entity_id: null,
        payload: { logo_url: logoUrl, size: req.file.size, mime: req.file.mimetype },
      });

      res.json({ logo_url: logoUrl });
    } catch (err) { next(err); }
  }
);
