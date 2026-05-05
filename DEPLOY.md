# Deployment guide — Supabase + Vercel + GitHub

You're going to end up with:

- **Supabase** — Postgres database + Storage bucket for the brand logo.
- **Three Vercel projects** (one for each app) sharing one GitHub repo:
  - `rfid-api`      → `apps/api`        (Express on serverless)
  - `rfid-admin`    → `apps/admin`      (Vite SPA)
  - `rfid-terminal` → `apps/terminal`   (Vite SPA)
- **GitHub** — single repo, automatic deploys per push.

> All paths below are relative to the repo root.

## 1. Push the repo to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

If you prefer the GitHub web UI, create the repo there and push to it.

## 2. Set up Supabase

1. Go to https://supabase.com → **New project**. Region close to your users. Note down:
   - **Project URL** (e.g. `https://abcdefgh.supabase.co`)
   - **service_role key** (from *Project Settings → API*) — used **only** by the API.
   - **Connection string** (from *Project Settings → Database → Connection string*).
     Copy the **Transaction pooler** string — looks like
     `postgres://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`.
     Replace `[YOUR-PASSWORD]` with the DB password you saved at project creation.

2. Run the schema. **Project → SQL Editor → New query**, paste the contents of
   `apps/api/src/db/schema.sql`, **Run**. (The API also creates `settings` and
   `nfc_links` automatically on cold start, but running the full schema once is
   the cleanest first-time setup.)

3. Create the logo storage bucket. **Storage → Create new bucket** named `logos`.
   Tick **Public bucket** so a `<img src>` from the browser can load directly.

4. Seed an admin user. From your laptop (replace the connection string with
   yours):

   ```powershell
   $env:DATABASE_URL = "postgres://postgres....pooler.supabase.com:6543/postgres"
   $env:JWT_SECRET   = "any-string-here-doesnt-matter-for-seed"
   cd apps/api
   npm run db:seed
   ```

   That creates `admin@example.com / admin123`. **Change the password from the
   Users page right after first login.**

## 3. Deploy the API to Vercel

1. **vercel.com → Add New → Project → Import** your GitHub repo.
2. **Root Directory**: `apps/api`.
3. **Framework Preset**: *Other* (Vercel will auto-detect the `vercel.json`).
4. **Environment Variables** (Settings → Environment Variables):

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL`              | Supabase pooler connection string |
   | `JWT_SECRET`                | Long random string. `openssl rand -base64 48` |
   | `JWT_EXPIRES_IN`            | `12h` (default) |
   | `BALANCE_TOKEN_TTL`         | `24h` (QR/post-tap link lifetime) |
   | `BALANCE_NFC_TOKEN_TTL`     | `1825d` (NFC tag lifetime; default 5 y) |
   | `SUPABASE_URL`              | `https://<ref>.supabase.co` |
   | `SUPABASE_SERVICE_KEY`      | service_role key from Supabase |
   | `SUPABASE_LOGO_BUCKET`      | `logos` |
   | `CRON_SECRET`               | Long random string (different from JWT_SECRET). Used by Vercel Cron. |
   | `CORS_ORIGINS`              | filled in once admin/terminal are deployed (see step 6) |

5. Click **Deploy**. After it finishes, note the URL — e.g.
   `https://rfid-api-xxxx.vercel.app`. Hitting `/healthz` should return `ok`.

6. **Vercel Cron** — already declared in `apps/api/vercel.json`. The voucher
   expiry job will start firing every 5 minutes, calling
   `/api/cron/expire-vouchers` with `Authorization: Bearer <CRON_SECRET>`.

## 4. Deploy the admin

1. Vercel → **Add New → Project → Import** the same repo (it lets you import
   the same repo into multiple projects).
2. **Root Directory**: `apps/admin`.
3. **Framework Preset**: *Vite* (auto-detected).
4. **Environment Variables**:

   | Key | Value |
   | --- | --- |
   | `VITE_API_URL` | The API URL from step 3 (e.g. `https://rfid-api-xxxx.vercel.app`) |

5. **Deploy**. Note the URL, e.g. `https://rfid-admin-xxxx.vercel.app`.

## 5. Deploy the terminal (kiosk)

Same steps as the admin:

1. Vercel → **Add New → Project → Import** the same repo.
2. **Root Directory**: `apps/terminal`.
3. **Framework Preset**: *Vite*.
4. **Environment Variables**:

   | Key | Value |
   | --- | --- |
   | `VITE_API_URL` | Same API URL |

5. **Deploy**. Note the URL, e.g. `https://rfid-terminal-xxxx.vercel.app`.

## 6. Lock CORS down to your two frontends

Go back to the **API project → Settings → Environment Variables → Edit** and
set:

```
CORS_ORIGINS = https://rfid-admin-xxxx.vercel.app,https://rfid-terminal-xxxx.vercel.app
```

Then **Redeploy** the API project (Deployments tab → ⋯ → Redeploy) so the new
env value takes effect.

## 7. Smoke test

1. Open the admin URL → log in with `admin@example.com / admin123`.
2. **Settings** → upload a logo (PNG/JPEG ≤ 2 MB) → it lands in the Supabase
   `logos` bucket and the public URL is saved.
3. **Branches** → create a branch.
4. **Stamp Rules** → add a rule.
5. **Members** → enroll a member, issue a card.
6. Open the terminal URL → sign in with the same admin (or a front-desk user
   you create), pick the branch + service line.
7. Type the card UID → **Record visit**. The QR appears.
8. Scan the QR with a phone camera → balance page loads (HTTPS, branded, fast).
9. **Voucher expiry cron** — wait 5 minutes after creating an expired voucher,
   then check `redemptions.status` flipped to `expired`.

## 8. Web NFC writing

Vercel deployments are HTTPS by default → Web NFC works on Android Chrome
without further configuration. On a member's detail page, click
**Write NFC URL** → tap the card on the back of an Android phone → URL is
burned onto the NTAG.

## Local development after deployment

The split-origin setup above is **production only**. Locally, leave
`VITE_API_URL` unset (or remove it from `.env.local`) and run:

```powershell
# Terminal 1
cd apps/api
$env:DATABASE_URL="postgres://postgres....pooler.supabase.com:6543/postgres"  # or local PG
$env:JWT_SECRET="dev-secret"
npm run dev

# Terminal 2 (admin)
cd apps/admin
npm run dev          # or `npm run dev:https` if you want Web NFC over LAN

# Terminal 3 (terminal/kiosk)
cd apps/terminal
npm run dev
```

The Vite proxies forward `/api`, `/uploads`, `/balance` to `localhost:4000`,
exactly as before.

## Updating

Push to `main`. Vercel rebuilds all three projects automatically. If you
change the schema, either:
- Edit `apps/api/src/db/bootstrap.ts` to add the new `CREATE TABLE IF NOT EXISTS`
  (idempotent, runs on cold start), **or**
- Run the new SQL via Supabase **SQL Editor** before pushing the code that
  needs it.

## Troubleshooting

- **`relation "..." does not exist`** — bootstrap migrations didn't run, or
  the schema isn't applied. Run the SQL in the Supabase SQL editor.
- **`401 Unauthorized` from /api/cron/expire-vouchers** — `CRON_SECRET` env
  var is missing or doesn't match what Vercel Cron is sending. Make sure it's
  set on the API project and redeploy.
- **`fetch failed: connect ENOTFOUND`** in the API logs — the Supabase
  pooler URL is malformed. Use the **Transaction pooler** string
  (port 6543), not the direct connection (5432) which has lower limits.
- **Logo upload fails with `Bucket not found`** — create the `logos` bucket
  in Supabase Storage (must be public).
- **Web NFC button greyed out** — your URL must be HTTPS. Vercel deploys
  satisfy this; only an issue locally over LAN HTTP.
- **Cards table grows but balances stay zero** — `member_stamp_balance` is a
  view that depends on the `visits` and `redemptions` rows actually
  existing. Check that visits aren't being voided by mistake.
