import { query } from "./client";

/**
 * Idempotent CREATE-IF-NOT-EXISTS for tables added after the initial schema.sql.
 * Runs on every API boot so an operator who forgets to re-run `npm run db:init`
 * after pulling new code doesn't get hidden 500s.
 *
 * For schema changes that aren't safely idempotent (column drops, type changes,
 * etc.) you still need a real migration. This is just for additive new tables.
 */
export async function bootstrapDb(): Promise<void> {
  // Network-wide branding (single row)
  await query(`
    CREATE TABLE IF NOT EXISTS settings (
      id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      brand_name      TEXT NOT NULL DEFAULT 'RFID Loyalty',
      logo_url        TEXT,
      primary_color   TEXT NOT NULL DEFAULT '#1F4E79',
      accent_color    TEXT NOT NULL DEFAULT '#2E75B6',
      updated_by      UUID REFERENCES users(id),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING`);

  // Short opaque tokens written to NFC tags (the URL has to fit in ~140 bytes
  // on NTAG213, so we can't put a JWT on the card).
  await query(`
    CREATE TABLE IF NOT EXISTS nfc_links (
      token        TEXT PRIMARY KEY,
      member_id    UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      created_by   UUID REFERENCES users(id),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at   TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_nfc_links_member ON nfc_links(member_id, created_at DESC)`);
}
