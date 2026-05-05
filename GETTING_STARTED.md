# Getting Started

## 1. Open in VS Code

```
File → Open Folder…  →  rfid-loyalty-system/
```

Recommended VS Code extensions:

- ESLint (`dbaeumer.vscode-eslint`)
- Prettier (`esbenp.prettier-vscode`)
- Docker (`ms-azuretools.vscode-docker`)
- SQLTools + PostgreSQL Driver (`mtxr.sqltools`, `mtxr.sqltools-driver-pg`)

## 2. Install dependencies

From the project root:

```bash
npm install
```

This installs all three workspaces (`api`, `admin`, `terminal`).

## 3. Start PostgreSQL

Easiest path — Docker:

```bash
docker compose up -d
```

This starts PostgreSQL 16 on `localhost:5432` with these credentials (set in `docker-compose.yml`):

- DB: `rfid_loyalty`
- User: `rfid_user`
- Password: `rfid_pass`

If you'd rather use an existing local PostgreSQL, just update `apps/api/.env`.

## 4. Configure the API

```bash
cp apps/api/.env.example apps/api/.env
```

Then edit `apps/api/.env` — at minimum, change `JWT_SECRET` to a long random string.

## 5. Initialize the database schema

```bash
npm run db:init --workspace apps/api
```

Then seed sample data:

```bash
npm run db:seed --workspace apps/api
```

This creates:

- 3 branches (one diagnostic, one psych, one gym)
- 3 users (admin / manager / frontdesk)
- 3 stamp rules (one per service line)
- 3 sample rewards

## 6. Run the three apps

In three terminals:

```bash
# Terminal 1 — API
npm run dev --workspace apps/api
# -> http://localhost:4000

# Terminal 2 — Admin portal
npm run dev --workspace apps/admin
# -> http://localhost:5173
# Login: admin@example.com / admin123

# Terminal 3 — Branch terminal
npm run dev --workspace apps/terminal
# -> http://localhost:5174
# Login: frontdesk@example.com / front123
```

## 7. Try a check-in

There are no cards or members in the seed yet — that's intentional, it's the first thing to build out together.

Quickest manual flow once you're set up:

1. In the admin portal, create a branch (or use the seeded ones).
2. Use the API directly to create a member: `POST /api/v1/members`.
3. Use the API directly to issue a card: `POST /api/v1/cards`.
4. On the terminal, type the card UID into the focused field and press Enter — that simulates a tap.

A "Members → New" form and a "Cards → Issue" flow in the admin portal are the next logical things to wire up.

## What's stubbed and waiting

- Audit log writes (table exists; helper not yet called).
- Email/SMS notifications (no provider chosen yet).
- Offline cache on the terminal (online-only at the moment).
- A handful of admin pages are read-only — no create/edit forms yet.
- No tests yet.

## Suggested next steps

1. **Wire up "New Member" form on the admin portal.** Member create endpoint already works.
2. **Wire up "Issue Card" flow.** Either inline on the member detail page, or as a dedicated action.
3. **Add audit log writes.** A small `recordAudit({ action, entity_type, entity_id, payload })` helper called from each mutating route.
4. **Plug in a real RFID reader.** Most USB readers will Just Work because they emulate keyboards.
5. **Pilot at one branch** before rolling out to the rest of the network — see Phase 2 of the proposal.
