import { query } from "../db/client";
import { HttpError } from "../middleware/error";

/**
 * Throws HttpError(400) if `code` isn't an active row in the `service_lines`
 * table. Use this AFTER `z.parse` so other field validation runs first.
 */
export async function assertActiveServiceLine(code: string): Promise<void> {
  if (!code || typeof code !== "string") throw new HttpError(400, "service_line is required");
  // The cast guards against codes that aren't even in the enum (would otherwise
  // surface as a Postgres error rather than a clean 400).
  let r;
  try {
    r = await query(
      `SELECT 1 FROM service_lines WHERE code = $1::service_line AND is_active = TRUE`,
      [code]
    );
  } catch {
    throw new HttpError(400, `Unknown service line "${code}"`);
  }
  if (!r.rows[0]) throw new HttpError(400, `Unknown or inactive service line "${code}"`);
}

/** Same, but allows null (for rewards.service_line which means "any"). */
export async function assertActiveServiceLineOrAny(code: string | null | undefined): Promise<void> {
  if (code === null || code === undefined || code === "") return;
  await assertActiveServiceLine(code);
}
