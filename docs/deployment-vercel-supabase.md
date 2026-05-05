# Deployment Guide — Vercel + Supabase

This guide takes the project from "running locally" to "running in production on Vercel + Supabase." It assumes the codebase as currently structured: monorepo with three workspaces (`apps/api`, `apps/admin`, `apps/terminal`), Express API, two Vite React apps, and PostgreSQL.

## Architecture after deployment

```
[ Members / customers ]
        |
        v
   [ Vercel — admin app ]   [ Vercel — terminal app ]
        |                            |
        +----------- HTTPS ----------+
                     |
                     v
            [ Vercel — API serverless ]
                     |
                     v
           [ Supabase — Postgres + Storage ]
                     ^
                     |
        [ HQ NFC writer machine ] ----- USB ---> [ NFC reader ]
        (local Node service that performs NDEF writes)
```

The API runs as a Vercel serverless function. The two frontends are static Vite builds. PostgreSQL and file storage live in Supabase. The NFC writer is a small local service at HQ because USB hardware can't run on Vercel.

## 1. Code changes required before deploying

### 1.1 API: serverless entry point

Create `apps/api/api/index.ts`:

```ts
import { app } from "../src/app";
export default app;
```

Create `apps/api/vercel.json`:

```json
{
  "version": 2,
  "rewrites": [
    { "source": "/(.*)", "destination": "/api" }
  ],
  "functions": {
    "api/index.ts": { "maxDuration": 10 }
  }
}
```

Keep `apps/api/src/index.ts` (with `app.listen`) — it's used for local dev only, not deployed.

### 1.2 API: SSL for Postgres in production

Edit `apps/api/src/db/client.ts`:

```ts
import { Pool } from "pg";
import { env } from "../config/env";

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 5,                                  // lower for serverless
  idleTimeoutMillis: 10_000,
  ssl: env.nodeEnv === "production" ? { rejectUnauthorized: false } : undefined,
});
```

Lower `max` to 5 — serverless functions are short-lived and shouldn't each open many connections.

### 1.3 API: Supabase Storage for logo upload

Install:

```bash
npm i @supabase/supabase-js --workspace apps/api
```

Add to `apps/api/src/config/env.ts`:

```ts
supabaseUrl: required("SUPABASE_URL"),
supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
publicBaseUrl: required("PUBLIC_BASE_URL"),
```

Create `apps/api/src/services/storage.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env";

export const supabase = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey
);

export async function uploadLogo(buf: Buffer, filename: string, contentType: string) {
  const path = `logos/${Date.now()}-${filename}`;
  const { error } = await supabase.storage
    .from("branding")
    .upload(path, buf, { contentType, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from("branding").getPublicUrl(path);
  return data.publicUrl;
}
```

In `apps/api/src/routes/settings.routes.ts`, replace the disk-write logic with `uploadLogo()` and store the returned public URL in `settings.logo_url`.

### 1.4 API: trust Vercel proxy headers

Add near the top of `apps/api/src/app.ts`:

```ts
app.set("trust proxy", 1);
```

This makes `req.ip` correct behind Vercel's edge proxy, which matters for rate limiting.

### 1.5 Frontends: configurable API URL

In `apps/admin/src/api/client.ts` and `apps/terminal/src/api.ts`, replace the hardcoded `/api/v1` with:

```ts
const BASE = (import.meta.env.VITE_API_URL ?? "/api") + "/v1";
```

In each app's `.env.example`:

```
VITE_API_URL=
```

In dev, leave `VITE_API_URL` unset — the Vite proxy handles `/api`. In production on Vercel, set it to `https://your-api.vercel.app/api`.

### 1.6 Frontends: vercel.json (optional but recommended)

`apps/admin/vercel.json`:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Same for `apps/terminal/vercel.json`. This makes client-side routing (BrowserRouter) work on direct page loads.

### 1.7 Build scripts sanity check

Make sure `apps/api/package.json` has:

```json
"scripts": {
  "build": "tsc -p tsconfig.json"
}
```

And `apps/admin/package.json` and `apps/terminal/package.json` have:

```json
"scripts": {
  "build": "tsc && vite build"
}
```

## 2. Supabase setup

### 2.1 Create project

1. Go to https://supabase.com and create a new project.
2. Pick the region closest to your branches (e.g., `ap-southeast-1` for Philippines).
3. Set a strong database password and save it.
4. Wait ~2 minutes for provisioning.

### 2.2 Run schema

1. In the dashboard, go to **SQL Editor → New query**.
2. Paste the contents of `apps/api/src/db/schema.sql`.
3. Run it. All tables, enums, views, and indexes are created.
4. Verify in **Table editor**: you should see `branches`, `users`, `members`, `cards`, `visits`, `redemptions`, `audit_log`, etc.

### 2.3 Seed initial data

Easiest path: run the seed locally with the Supabase pooled URL.

```bash
# Set this locally (don't commit)
DATABASE_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true"

npm run db:seed --workspace apps/api
```

This creates the seeded admin/manager/frontdesk users, the three sample branches, the stamp rules, and the sample rewards.

**Immediately change the seeded passwords** in production. Use the SQL editor:

```sql
UPDATE users SET password_hash = crypt('YourStrongAdminPassword', gen_salt('bf', 10)) WHERE email = 'admin@example.com';
```

### 2.4 Storage bucket for branding

1. **Storage → Create bucket** → name `branding`, set to **public**.
2. Optionally add a policy that only authenticated service-role uploads are allowed:
   - The service role bypasses RLS, so no policy needed for write.
   - Read is public because the bucket is public.

### 2.5 Get connection strings

In **Settings → Database**:

- **Connection string (URI mode)** — direct, port 5432. Don't use this from Vercel.
- **Connection pooling (Transaction mode)** — port 6543. **Use this** as `DATABASE_URL` on Vercel.

In **Settings → API**:

- `Project URL` → use as `SUPABASE_URL`
- `service_role` key (under "Project API keys") → use as `SUPABASE_SERVICE_ROLE_KEY`. **Never** expose this to the frontend.

## 3. Vercel setup

You will create **three** Vercel projects from the same GitHub repo. Push the project to GitHub first if you haven't.

### 3.1 Project: API

1. New Project → Import your GitHub repo.
2. **Root directory**: `apps/api`.
3. **Framework preset**: Other.
4. **Build command**: `npm run build`.
5. **Install command**: `cd ../.. && npm install` (so workspaces resolve from the root).
6. **Output directory**: leave default.
7. Environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase pooled URL (port 6543) |
| `JWT_SECRET` | Generate a long random string (e.g., `openssl rand -hex 64`) |
| `JWT_EXPIRES_IN` | `12h` |
| `CORS_ORIGINS` | Temporarily `*` — update after admin/terminal deploy |
| `SUPABASE_URL` | From Supabase Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase Settings → API |
| `PUBLIC_BASE_URL` | The API's Vercel URL (set this *after* first deploy) |
| `NODE_ENV` | `production` |

8. Deploy. Note the URL, e.g., `rfid-loyalty-api.vercel.app`.

### 3.2 Project: Admin

1. New Project → same repo.
2. **Root directory**: `apps/admin`.
3. **Framework preset**: Vite.
4. **Build command**: `npm run build`.
5. **Install command**: `cd ../.. && npm install`.
6. **Output directory**: `dist`.
7. Environment variable:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://rfid-loyalty-api.vercel.app/api` |

8. Deploy. Note the URL, e.g., `rfid-loyalty-admin.vercel.app`.

### 3.3 Project: Terminal

Identical to admin, but root directory `apps/terminal`. Note its URL.

### 3.4 Lock down CORS

Go back to the API project's environment variables and update:

```
CORS_ORIGINS=https://rfid-loyalty-admin.vercel.app,https://rfid-loyalty-terminal.vercel.app
```

Redeploy the API for the change to take effect.

### 3.5 Update API's PUBLIC_BASE_URL

Update `PUBLIC_BASE_URL` to the API's own deployed URL — needed for the balance URL generation.

## 4. Custom domains (recommended)

In each Vercel project → Settings → Domains, add:

- `app.yourcompany.com` for admin
- `terminal.yourcompany.com` for terminal
- `api.yourcompany.com` for API

Update DNS at your registrar with the CNAME records Vercel provides. SSL is automatic.

After domains are set, update:

- `CORS_ORIGINS` to use the custom domains
- `VITE_API_URL` on both frontends to use the API's custom domain
- `PUBLIC_BASE_URL` on the API

## 5. The NFC writer caveat

`nfc-pcsc` requires a USB-connected NFC reader. Vercel serverless functions have no USB access. Three options:

**Option A — local encoding service (recommended for production).** A small Node service runs on the HQ machine that has the reader attached. When admin issues a card from the deployed portal, the API stores the card row with `ndef_pending = true`. The local service polls a queue endpoint, retrieves the encoding job (member ID + URL), performs the NDEF write, then calls back to the API to mark `ndef_pending = false`. This decouples web infrastructure from hardware.

**Option B — local CLI for issuance only.** Treat card issuance as a HQ-only operation done through a local script (not the web admin portal). The script writes NDEF locally then calls the deployed API to record the card. This is simpler than Option A but means card issuance can't happen at branches.

**Option C — defer NDEF entirely.** Deploy without NFC encoding. Cards still work for front-desk RFID reads. Customers see the QR fallback on receipts. Add NDEF encoding later via a one-time bulk encoding session at HQ once you have the reader.

For a pilot at one branch, **Option C is the lowest-friction**. Add Option A's queue mechanism in a later phase.

## 6. Operational checklist after first deploy

- [ ] Log in to the admin portal at the deployed URL with the seeded admin account.
- [ ] Change the admin, manager, and frontdesk passwords to strong production values.
- [ ] Create at least one real branch.
- [ ] Create at least one real reward.
- [ ] Verify a manual member create → card issue → terminal check-in flow end-to-end.
- [ ] Check Supabase dashboard → Logs to confirm queries are landing.
- [ ] Verify CORS is locked to your specific origins (open the browser dev tools network tab, confirm requests from the admin URL succeed).
- [ ] Verify a logo upload writes to Supabase Storage (Storage → branding → see the file).
- [ ] Test the rate limit on the public balance endpoint (if implemented).
- [ ] Set up Supabase database backups (daily backups are automatic on paid tiers; on free tier, set a manual schedule with `pg_dump` to your own storage).

## 7. Cost expectations

For a pilot with 2–3 branches and ~500 members:

- **Supabase Free tier** is sufficient: 500 MB DB, 1 GB storage, 50K monthly active users. Data volume here will be tiny.
- **Vercel Hobby tier** is sufficient for the frontends. The API runs as a serverless function and the free tier includes 100 GB-hours/month, which is far more than this workload needs.
- **Custom domain**: $10–15/year per domain at your registrar. Vercel doesn't charge.

You should be able to run a one-branch pilot for **$0/month** infrastructure cost.

For network-wide rollout to 10 branches, expect to need:

- **Supabase Pro**: $25/month — gives daily backups, 8 GB DB, and dedicated resources.
- **Vercel Pro** ($20/month): only if traffic grows past hobby limits, which is unlikely at this scale.

## 8. Things that could bite you

- **Cold starts on the API.** The first request after idle takes ~1–2 seconds. For a tap-to-check-in flow, this matters. Mitigation: ping the API every 5 minutes from a free uptime monitor (UptimeRobot) to keep it warm.
- **Connection pool exhaustion** if you use the direct connection (port 5432) instead of the pooler. Always use 6543 from Vercel.
- **CORS misconfiguration.** Wildcard `*` works but can't be combined with `credentials: true`. The current code uses `credentials: true`, so explicit origins are required.
- **Database password rotation.** If you ever rotate the Supabase DB password, you must update `DATABASE_URL` on Vercel. Existing JWTs continue to work because they're signed with `JWT_SECRET`, not the DB password.
- **Cookie/auth domain quirks.** Currently auth uses `Authorization: Bearer` headers, not cookies — so cross-domain works fine. Don't switch to cookies without setting up the domain config carefully.
- **Logo upload size.** Vercel functions have a 4.5 MB request body limit on hobby tier. Keep the multer file size cap at 2 MB to stay safely under.

## 9. Rollback plan

If a deployment breaks something:

- Vercel keeps every previous deployment. From the project's Deployments tab, click "Promote to Production" on the previous good build.
- For database changes that need rolling back, restore from a Supabase backup point (Pro tier) or replay your last good schema migration.
