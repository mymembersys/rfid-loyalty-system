import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { query } from "../db/client";
import { recordAudit } from "../db/audit";
import { requireAuth, requireRole } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import { signBalanceToken, verifyBalanceToken } from "../lib/balanceToken";
import { env } from "../config/env";

export const balanceRoutes = Router();

/** ~12-char base62 random id. ~71 bits — collision-resistant. */
function shortToken(): string {
  const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += ALPHA[bytes[i] % 62];
  return out;
}

/**
 * Resolve a token (short DB-backed or signed JWT) to a member_id.
 * Returns null when the token isn't recognised or has expired.
 */
async function resolveToken(token: string): Promise<string | null> {
  // Short tokens are 12 chars, base62. Try DB first if it matches the shape.
  if (/^[A-Za-z0-9]{12}$/.test(token)) {
    const r = await query(
      `SELECT member_id, expires_at FROM nfc_links WHERE token = $1`,
      [token]
    );
    if (r.rows[0]) {
      if (r.rows[0].expires_at && new Date(r.rows[0].expires_at) < new Date()) return null;
      return r.rows[0].member_id;
    }
  }
  // Otherwise treat as a JWT (used by QR / post-tap)
  try {
    return verifyBalanceToken(token).mid;
  } catch {
    return null;
  }
}

/**
 * Public — no auth.
 * Returns the member's current balances + brand info for the customer-facing page.
 */
balanceRoutes.get("/:token", async (req, res, next) => {
  try {
    const mid = await resolveToken(req.params.token);
    if (!mid) throw new HttpError(401, "Invalid or expired link");

    const m = await query(
      `SELECT id, member_no, first_name, last_name, status
       FROM members WHERE id = $1`,
      [mid]
    );
    if (!m.rows[0]) throw new HttpError(404, "Member not found");

    const b = await query(
      `SELECT bal.service_line,
              COALESCE(sl.name, bal.service_line::text) AS service_line_name,
              COALESCE(sl.color, '#3b5bdb')             AS service_line_color,
              bal.stamps_earned, bal.stamps_spent, bal.stamps_balance
       FROM member_stamp_balance bal
       LEFT JOIN service_lines sl ON sl.code = bal.service_line
       WHERE bal.member_id = $1`,
      [mid]
    );

    const s = await query(
      `SELECT brand_name, logo_url, primary_color, accent_color
       FROM settings WHERE id = 1`
    );
    const brand = s.rows[0] || {
      brand_name: "RFID Loyalty",
      logo_url: null,
      primary_color: "#1F4E79",
      accent_color: "#2E75B6",
    };

    res.json({
      member: {
        member_no: m.rows[0].member_no,
        first_name: m.rows[0].first_name,
        last_name: m.rows[0].last_name,
        status: m.rows[0].status,
      },
      balances: b.rows,
      brand,
      generated_at: new Date().toISOString(),
    });
  } catch (err) { next(err); }
});

/**
 * Issue a short-lived JWT token for QR / phone-tap-link flows.
 * URL ends up long (~200+ chars) — fine for QR codes, NOT for NTAG213.
 */
balanceRoutes.post(
  "/issue",
  requireAuth,
  requireRole("admin", "manager", "frontdesk"),
  async (req, res, next) => {
    try {
      const { member_id } = z.object({ member_id: z.string().uuid() }).parse(req.body);
      const m = await query(`SELECT id FROM members WHERE id = $1`, [member_id]);
      if (!m.rows[0]) throw new HttpError(404, "Member not found");
      res.json({ token: signBalanceToken(member_id) });
    } catch (err) { next(err); }
  }
);

/**
 * Issue a *short* (12 char) token for embedding into the NDEF URI record of
 * the member's physical NFC card. Fits on NTAG213/215/216 with room to spare.
 * Default TTL ~5 years (configurable via BALANCE_NFC_TOKEN_TTL).
 */
balanceRoutes.post(
  "/issue-nfc",
  requireAuth,
  requireRole("admin", "manager", "frontdesk"),
  async (req, res, next) => {
    try {
      const { member_id } = z.object({ member_id: z.string().uuid() }).parse(req.body);
      const m = await query(
        `SELECT id, member_no FROM members WHERE id = $1`,
        [member_id]
      );
      if (!m.rows[0]) throw new HttpError(404, "Member not found");

      // Compute expiry from the configured TTL (e.g. "1825d" → ms)
      const ttlMs = parseTtlToMs(env.balanceNfcTokenTtl);
      const expiresAt = ttlMs ? new Date(Date.now() + ttlMs) : null;

      // Retry a couple of times on the astronomically unlikely collision
      let token = shortToken();
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await query(
            `INSERT INTO nfc_links (token, member_id, created_by, expires_at)
             VALUES ($1, $2, $3, $4)`,
            [token, member_id, req.auth?.sub ?? null, expiresAt]
          );
          break;
        } catch (e: any) {
          if (e?.code === "23505" && attempt < 2) { token = shortToken(); continue; }
          throw e;
        }
      }

      await recordAudit(req, {
        action: "card.nfc_token_issue",
        entity_type: "member",
        entity_id: member_id,
        payload: { member_no: m.rows[0].member_no, ttl: env.balanceNfcTokenTtl, token },
      });
      res.json({ token, ttl: env.balanceNfcTokenTtl, expires_at: expiresAt });
    } catch (err) { next(err); }
  }
);

/**
 * Parse a TTL string like "24h", "1825d", "5y" into milliseconds.
 * Returns null when the input isn't recognised (token never expires).
 */
function parseTtlToMs(ttl: string): number | null {
  const m = /^(\d+)\s*([smhdy])$/i.exec(ttl.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  const mul: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    y: 365 * 86_400_000,
  };
  return n * (mul[u] ?? 0);
}
