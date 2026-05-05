# Implementation Prompt — NFC Tap-to-Phone Balance Feature

> Hand this to an AI assistant (or use as a developer brief) to implement the
> NFC NDEF feature in this codebase. It is self-contained and references
> existing files.

## Context

I'm building on top of an existing multi-branch RFID loyalty system in this repo (`rfid-loyalty-system`). The stack is Node 20 + Express + TypeScript (API), React + Vite (admin portal at port 5173 and branch terminal at port 5174), PostgreSQL 16. The system already supports member enrollment, RFID card issuance/replacement/blacklist, tap-to-record visits with cooldown rules, stamp/visit-based rewards, redemption with vouchers, audit logs, role-based access control, branding, and user management.

The cards I'm using are **NTAG (13.56 MHz, NFC Forum Type 2)** — most likely NTAG213, 215, or 216. These cards are perfect for NDEF tag-to-phone interactions on both iPhone (iOS 14+) and Android.

## Goal

Add a feature where a member can tap their physical card against their smartphone and see their stamp balance and rewards in their phone's browser, with no app installed. The same card continues to work at the front-desk RFID reader for check-ins.

The mechanism: at card issuance, write an NDEF URI record onto the NTAG card containing the member's personal, signed balance URL. When the member taps the card to their phone, iOS or Android shows a notification offering to open the URL; one tap and the browser shows their balance page.

## Deliverables

Implement the following six pieces. They are listed in dependency order.

### 1. JWT-based balance token helper

Create `apps/api/src/services/balance-tokens.ts` with two exports:

- `generateBalanceUrl(memberId: string): string` — returns an absolute URL of the form `${PUBLIC_BASE_URL}/balance/${memberId}?t=${token}` where `token` is a JWT signed with the existing `JWT_SECRET`, payload `{ sub: memberId, scope: "balance" }`, expiry of 5 years (effectively a long-lived token).
- `verifyBalanceToken(token: string, memberId: string): boolean` — verifies signature and that `sub === memberId` and `scope === "balance"`.

Add `PUBLIC_BASE_URL` to `apps/api/src/config/env.ts` (default `http://localhost:4000` in dev). Document in `.env.example`.

### 2. Public balance endpoint

Create `apps/api/src/routes/public.routes.ts` with one endpoint:

```
GET /api/v1/public/balance/:memberId?t=<token>
```

- No auth required; the token IS the auth.
- Validate the token using `verifyBalanceToken`. On failure, return 401.
- Rate-limit per IP: 30 requests/minute. Use `express-rate-limit` (add to dependencies).
- Return a deliberately trimmed payload:

```json
{
  "first_name": "Maria",
  "balances": [
    { "service_line": "gym",        "stamps": 7,  "next_reward_at": 10 },
    { "service_line": "diagnostic", "stamps": 2,  "next_reward_at": 4  }
  ],
  "pending_vouchers": [
    { "reward_name": "Free guest pass", "expires_at": "2026-05-30" }
  ]
}
```

- Do **NOT** include: last_name, email, phone, date_of_birth, full visit history.
- For `service_line = 'psychological'` entries, return only the count — no per-visit timestamps or sub_service detail anywhere on the response. The proposal flagged psych visits as sensitive.
- The `next_reward_at` is the lowest `stamps_required` from `stamp_rules` for that service line.
- Wire the route in `apps/api/src/app.ts`: `app.use("/api/v1/public", publicRoutes);`

In `apps/api/src/app.ts`, configure `morgan` to redact the `t` query parameter from the access log so tokens don't leak into logs.

### 3. Public balance page (static HTML)

Create `apps/api/public/balance.html` — a single-file mobile-first page. Serve it from the API:

```ts
// in app.ts
app.use(express.static(path.join(__dirname, "..", "public")));
// SPA-style fallback for /balance/:memberId
app.get("/balance/*", (_req, res) => res.sendFile(path.join(__dirname, "..", "public", "balance.html")));
```

The page should:

- Read `memberId` from `window.location.pathname` and `t` from the query string.
- Fetch `GET /api/v1/public/balance/:memberId?t=<t>`.
- Also fetch `GET /api/v1/settings` to apply branding (logo, colors, brand name).
- Render: brand header with logo, `Hi <first_name>!`, a list of balance cards (one per service line) showing `<stamps>/<next_reward_at>` and a progress bar, a list of pending vouchers with expiry dates.
- Be entirely self-contained (one HTML file, inline CSS, inline vanilla JS, no framework). It must load reliably on a five-year-old Android phone over branch wifi.
- Show a friendly error state if the token is invalid or expired.

### 4. NDEF write at card issuance (server-side)

Add support for writing an NDEF URI record to the NTAG card at the moment a card is issued or replaced.

Hardware assumption: a USB NFC reader/writer compatible with PC/SC (e.g., ACR122U) attached to the HQ card-issuance station running the API server. If running the reader on a different machine, expose this as a small helper service the API calls over HTTP — but the simplest deployment is one reader on the API host.

Create `apps/api/src/services/nfc-writer.ts`:

- Use `nfc-pcsc` (`npm i nfc-pcsc --workspace apps/api`) to talk to the reader.
- Export `writeNdefUri(targetUid: string, url: string): Promise<void>`. The function must:
  - Wait for a card to be present on the reader.
  - Verify the card UID matches `targetUid` — refuse to write if a different card is on the reader (prevents accidentally overwriting the wrong card).
  - Build an NDEF message containing a single URI record. Use the URI Identifier Code `0x04` for `https://` to save bytes; payload = the URL with the `https://` prefix stripped.
  - Wrap the NDEF message in a TLV (Type=0x03 NDEF Message, Length, Value, Terminator=0xFE).
  - Write to NTAG starting at page 4 (NTAG user memory begins at page 4). Use `reader.write(4, buffer)` from `nfc-pcsc`.
  - Verify by reading back pages 4 onward and parsing — return success only if the parsed URL matches.
- Add a development fallback: if `process.env.NFC_WRITE_ENABLED !== "true"`, the function logs the URL it *would* have written and resolves successfully. This lets the rest of the team work without hardware.

In `apps/api/src/routes/cards.routes.ts`:

- After `INSERT INTO cards` succeeds in `POST /cards`, generate the balance URL with `generateBalanceUrl(member_id)`, then call `writeNdefUri(card.uid, url)`. If the write fails, the card row stays in the DB but mark it with `notes = 'NDEF write failed: <reason>'`. Return a flag in the response so the UI can show a warning.
- Same logic in `POST /cards/:id/replace`.

### 5. Admin UI: NFC write feedback

In `apps/admin/src/pages/MemberDetail.tsx` (or wherever the issuance UI lives), update the "Issue Card" flow:

- After the user enters the new card UID, show a step: "Place card on the NFC writer and click Encode."
- On click, the existing `POST /cards` is called. The response includes `{ ndef_written: boolean, error?: string }`.
- If `ndef_written` is false, show a dismissable warning banner with the error message and a "Retry encode" button that calls a new endpoint `POST /cards/:id/encode-ndef` to retry just the NDEF write step.
- Surface the personal balance URL on the member detail page (admin-only) for debugging — useful when troubleshooting card encoding.

### 6. QR fallback on receipts

Some members will have phones without NFC, or NFC turned off. Print a QR code containing the same balance URL on the post-tap receipt as a universal fallback.

In `apps/terminal/src/pages/CheckIn.tsx`:

- The check-in response from `POST /visits/check-in` should now include `balance_url` (modify the API to include it).
- Render the URL as a QR using the `qrcode` package (`npm i qrcode --workspace apps/terminal`) into a `<canvas>` on the success screen.
- If a thermal printer is wired up, also include the QR on the printed receipt.

## Security requirements

- The balance token expiry is intentionally long (5 years) because rotating the URL after issuance would require re-encoding cards. If `JWT_SECRET` is ever rotated, all balance URLs invalidate at once — document this in the runbook.
- The public endpoint must be rate-limited per IP (30/min). Optionally add a per-token rate limit (10/min) using a small in-memory LRU.
- Never log full URLs or the `t` query parameter. Configure `morgan` to redact it.
- The balance page must NOT expose: last_name, email, phone, DOB, full visit history, or psych visit detail.
- For card replacement, the new card gets a new URL with a fresh token. The old card's URL must stop working — easiest way is to add a `balance_token_nonce` column on `members` that's included in the JWT payload and rotated when any card replacement happens. Token verification must check the current nonce.

## Database changes

Add to `apps/api/src/db/schema.sql`:

```sql
-- Per-member nonce, rotated on card replacement to invalidate the previous card's URL
ALTER TABLE members ADD COLUMN IF NOT EXISTS balance_token_nonce UUID NOT NULL DEFAULT gen_random_uuid();
```

Update `generateBalanceUrl` to include `nonce: member.balance_token_nonce` in the JWT payload, and `verifyBalanceToken` to check it against the current value in the DB on every request. On card replacement, run `UPDATE members SET balance_token_nonce = gen_random_uuid() WHERE id = $1`.

## Environment variables to add

In `apps/api/.env.example`:

```
PUBLIC_BASE_URL=http://localhost:4000
NFC_WRITE_ENABLED=false       # set to true on the host with the writer attached
NFC_READER_NAME=               # optional, leave blank to auto-pick the first reader
```

## Acceptance criteria

- A freshly issued NTAG card, when tapped on an iPhone 11 (iOS 14+) with the screen on, displays a notification within ~2 seconds offering to open the URL. One tap and the balance page renders correctly.
- Same behavior on a Pixel 5 (Android 12+) with NFC enabled.
- The same card continues to work at the front-desk RFID reader for check-ins; the existing cooldown rule still applies.
- Issuing a replacement card writes a new URL to the new card. Tapping the OLD card to a phone now opens the page but the page shows "Card no longer valid" because the nonce mismatch causes the API to return 401.
- The balance page renders the brand logo and colors from `/api/v1/settings`.
- Tapping a card whose member has psych-clinic visits shows the stamp count but no per-visit detail or timestamps.
- With `NFC_WRITE_ENABLED=false`, the issuance flow completes successfully (writes the card row to DB, logs the URL it would have written) so non-hardware devs can keep working.
- Rate limit kicks in at 31 requests/min from a single IP.

## Test approach

1. **Unit tests** (Vitest in `apps/api`):
   - `generateBalanceUrl` produces a valid URL with a token that `verifyBalanceToken` accepts.
   - `verifyBalanceToken` rejects: wrong member ID, wrong scope, wrong nonce, expired token, tampered signature.
   - NDEF buffer builder produces the correct byte sequence for known URLs.

2. **Integration tests** (Supertest):
   - Public balance endpoint: 200 with valid token, 401 with invalid/wrong-member token, 401 after nonce rotation.
   - Rate limit returns 429 after threshold.
   - Privacy: response shape strictly excludes the forbidden fields; psych entries strip detail.

3. **Manual hardware test** (documented as a checklist in `docs/nfc-test-plan.md`):
   - Encode a fresh card, verify NDEF write success in API logs.
   - Tap on iPhone 11 — notification appears, page loads.
   - Tap on Pixel 5 — page loads.
   - Tap same card on the front-desk reader — check-in records.
   - Replace the card; old card's URL returns 401, new card works.

## Files to create / modify

**New files:**

- `apps/api/src/services/balance-tokens.ts`
- `apps/api/src/services/nfc-writer.ts`
- `apps/api/src/routes/public.routes.ts`
- `apps/api/public/balance.html`
- `apps/api/test/balance-tokens.test.ts` (unit)
- `apps/api/test/public-balance.test.ts` (integration)
- `docs/nfc-test-plan.md` (manual test checklist)

**Modified files:**

- `apps/api/src/config/env.ts` (add `PUBLIC_BASE_URL`, `NFC_WRITE_ENABLED`, `NFC_READER_NAME`)
- `apps/api/.env.example` (document new vars)
- `apps/api/src/app.ts` (mount public routes, static, SPA fallback, morgan redact)
- `apps/api/src/db/schema.sql` (add `balance_token_nonce` column)
- `apps/api/src/routes/cards.routes.ts` (call NFC writer on issue and replace; rotate nonce on replace; new `POST /cards/:id/encode-ndef` route)
- `apps/api/src/routes/visits.routes.ts` (include `balance_url` in check-in response)
- `apps/api/package.json` (add `nfc-pcsc`, `express-rate-limit`)
- `apps/admin/src/pages/MemberDetail.tsx` (NFC write feedback in issuance UI; surface balance URL for admin)
- `apps/terminal/src/pages/CheckIn.tsx` (render QR from `balance_url`)
- `apps/terminal/package.json` (add `qrcode`)

## Out of scope for this iteration

- iOS automatic-launch behavior on locked screens (always-on-display tap detection varies by manufacturer).
- Member-initiated card-rotation from the balance page itself.
- A dedicated "I want to revoke my card" flow for members who lose theirs (today this is a staff-mediated flow at the branch).
- Multi-tag-write batching for bulk card pre-encoding before a launch event.

## Notes for the AI assistant taking this on

- Don't change unrelated files. The system has a lot of existing functionality — leave it alone unless this prompt explicitly requires modification.
- Match the existing code style: TypeScript strict, zod for request validation, no default exports, route files export a router.
- The API uses `query()` from `apps/api/src/db/client.ts` for parameterized queries. Continue that pattern; don't introduce an ORM.
- Branding CSS variables (`--primary`, `--accent`) are already wired in both apps; the balance page should use the same approach (fetch `/api/v1/settings` then `document.documentElement.style.setProperty`).
- If a step requires a hardware decision the user hasn't made (like which specific NFC reader brand to support beyond ACR122U), implement against `nfc-pcsc`'s generic API and note the assumption in code comments.
