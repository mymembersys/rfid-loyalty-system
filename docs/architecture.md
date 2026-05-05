# Architecture Overview

## Topology

```
[ Member ]                   [ Front-Desk Staff ]                [ HQ Admin / Manager ]
    |                                |                                   |
   Tap RFID                     Web terminal                         Web admin portal
    |                                |                                   |
[ RFID Reader (USB HID) ] -> [ Terminal app  :5174 ] -> [ API  :4000 ] <- [ Admin app  :5173 ]
                                                            |
                                                       [ PostgreSQL :5432 ]
```

## Apps

- **api** (`apps/api`) — Express + TypeScript REST API. Owns the database. JWT auth.
- **admin** (`apps/admin`) — React + Vite portal. Used by HQ admins, branch managers, auditors.
- **terminal** (`apps/terminal`) — React + Vite terminal app. Runs full-screen at the front desk; one terminal config per device.

All three speak HTTP to the API.

## Authentication

JWTs issued at `/api/v1/auth/login`. Two consumer scenarios:

1. **Admin portal** — interactive sign-in per session, token stored in `localStorage`.
2. **Branch terminal** — front-desk staff signs in once during *Terminal Setup*; token is stored locally and used for every check-in until the terminal is "signed out" by an admin.

## RFID reader integration

Most desktop USB RFID readers operate as HID keyboards: tapping a card "types" the UID into the focused field followed by Enter. The terminal app keeps an always-focused capture input that:

1. Receives the UID
2. Posts to `POST /api/v1/visits/check-in`
3. Displays the member name and updated stamp balance

For non-HID readers (vendor SDK over WebUSB / native) the integration point is a single function that resolves to the UID string — drop-in replaceable in `apps/terminal/src/pages/CheckIn.tsx`.

## Loyalty engine (current)

Stamps are computed dynamically from the `visits` table via the `member_stamp_balance` view. This keeps the implementation simple and auditable: there is no separate "balance" column to drift out of sync.

A cooldown rule per service line + branch prevents double-stamping. Rules live in `stamp_rules`.

## Data flow on tap

```
Terminal -> POST /visits/check-in
        -> API resolves card UID -> member
        -> Cooldown check via stamp_rules
        -> INSERT INTO visits
        -> Return updated balance from member_stamp_balance
Terminal displays result.
```

## Multi-branch & offline strategy (planned)

The current scaffold is online-only. The proposal commits to a local-cache + sync strategy. Implementation plan:

- A SQLite cache file in the terminal (or IndexedDB if running purely in browser) keyed by card UID with name + service line + last-known stamp count.
- On boot, terminal pulls a snapshot of active members.
- During outage, check-ins are queued locally and replayed on reconnect.
- The API's cooldown rule is applied authoritatively on replay — duplicates are dropped.

## Extension points (already wired)

- **Audit log** — `audit_log` table is created but not yet written from middleware. Add a small `recordAudit()` helper used by every mutating route.
- **SMS notifications** — outbound notifications hub planned as a worker subscribing to a `notifications_outbox` table.
- **Door access (gym, Phase 4)** — same `cards.uid` becomes the door card; access events feed an additional table that mirrors `visits`.
