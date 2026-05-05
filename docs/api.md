# API Reference (v1)

All endpoints are under `/api/v1`. Auth: `Authorization: Bearer <jwt>` on everything except `POST /auth/login` and `GET /healthz`.

## Auth

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | /auth/login | `{ email, password }` | Returns `{ token, user }` |
| POST | /auth/logout | — | Stateless; client drops the token |

## Members

| Method | Path | Notes |
|---|---|---|
| GET  | /members?q= | Search members |
| GET  | /members/:id | Single member |
| POST | /members | Create. Auto-generates `member_no`. |
| GET  | /members/:id/balance | Stamp balance per service line |

## Cards

| Method | Path | Notes |
|---|---|---|
| POST | /cards | Issue a card to a member |
| GET  | /cards/by-uid/:uid | Lookup by RFID UID |
| POST | /cards/:id/replace | Replace a lost/damaged card |
| POST | /cards/:id/blacklist | Network-wide blacklist |

## Visits

| Method | Path | Notes |
|---|---|---|
| POST | /visits/check-in | The main tap-to-record endpoint |
| POST | /visits/:id/void | Void with reason |
| GET  | /visits/by-member/:memberId | History |

`POST /visits/check-in` body:
```json
{ "card_uid": "ABCD1234", "branch_id": "<uuid>", "service_line": "gym", "sub_service": "group class" }
```

## Rewards

| Method | Path | Notes |
|---|---|---|
| GET  | /rewards | List active rewards |
| POST | /rewards | Create a reward |
| DELETE | /rewards/:id | Soft-delete (sets `is_active = FALSE`) |

## Redemptions

| Method | Path | Notes |
|---|---|---|
| POST | /redemptions | Create — checks balance, creates pending voucher |
| POST | /redemptions/:id/redeem | Mark as redeemed |
| GET  | /redemptions/by-member/:memberId | History |

## Branches

| Method | Path | Notes |
|---|---|---|
| GET  | /branches | List active branches |
| POST | /branches | Create |

## Reports

| Method | Path | Notes |
|---|---|---|
| GET | /reports/visits/daily | Last 30 days, grouped by day/branch/service line |
| GET | /reports/members/activity | Active vs dormant counts (60-day window) |
| GET | /reports/members/cross-service | Members visiting 2+ and 3 service lines |
