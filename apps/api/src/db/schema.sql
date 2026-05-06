-- =====================================================================
-- RFID Loyalty Card System - PostgreSQL schema
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ----------- enums -----------
DO $$ BEGIN
  CREATE TYPE service_line AS ENUM ('diagnostic', 'psychological', 'gym');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE member_status AS ENUM ('active', 'inactive', 'suspended', 'blacklisted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE card_status AS ENUM ('active', 'lost', 'damaged', 'replaced', 'blacklisted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'manager', 'frontdesk', 'auditor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE redemption_status AS ENUM ('pending', 'redeemed', 'expired', 'voided');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------- service line metadata (display name, color, ordering) -----------
-- The `service_line` enum stays as the FK type for branches/visits/rewards/stamp_rules;
-- this table just adds editable presentation fields for each code so operators can
-- rename and re-color them from the admin portal.
CREATE TABLE IF NOT EXISTS service_lines (
  code         service_line PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  color        TEXT NOT NULL DEFAULT '#3b5bdb',
  sort_order   INT  NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO service_lines (code, name, sort_order) VALUES
  ('diagnostic',    'Diagnostic',    0),
  ('psychological', 'Psychological', 1),
  ('gym',           'Gym',           2)
ON CONFLICT (code) DO NOTHING;

-- ----------- branches -----------
CREATE TABLE IF NOT EXISTS branches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  service_line  service_line NOT NULL,
  address       TEXT,
  phone         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------- staff users -----------
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          CITEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  full_name      TEXT NOT NULL,
  role           user_role NOT NULL,
  branch_id      UUID REFERENCES branches(id) ON DELETE SET NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------- members (customers) -----------
CREATE TABLE IF NOT EXISTS members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_no        TEXT UNIQUE NOT NULL,            -- human-friendly
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  email            CITEXT,
  phone            TEXT,
  date_of_birth    DATE,
  gender           TEXT,
  emergency_contact TEXT,
  origin_branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  status           member_status NOT NULL DEFAULT 'active',
  consent_given_at TIMESTAMPTZ,
  consent_marketing BOOLEAN NOT NULL DEFAULT FALSE,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);

-- ----------- RFID cards -----------
CREATE TABLE IF NOT EXISTS cards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid             TEXT UNIQUE NOT NULL,             -- raw card UID
  member_id       UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status          card_status NOT NULL DEFAULT 'active',
  issued_branch_id UUID REFERENCES branches(id),
  issued_by_user_id UUID REFERENCES users(id),
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  replaced_by_card_id UUID REFERENCES cards(id),
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_cards_member ON cards(member_id);
CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);

-- ----------- stamp rules (per service line, configurable) -----------
CREATE TABLE IF NOT EXISTS stamp_rules (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_line             service_line NOT NULL,
  branch_id                UUID REFERENCES branches(id) ON DELETE CASCADE, -- NULL = network default
  stamps_required          INT NOT NULL CHECK (stamps_required > 0),
  cooldown_minutes         INT NOT NULL DEFAULT 720,
  cross_service_eligible   BOOLEAN NOT NULL DEFAULT FALSE,
  active_from              TIMESTAMPTZ NOT NULL DEFAULT now(),
  active_to                TIMESTAMPTZ,
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------- rewards catalog -----------
CREATE TABLE IF NOT EXISTS rewards (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT UNIQUE NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  service_line        service_line,                  -- NULL = any
  stamps_cost         INT NOT NULL CHECK (stamps_cost > 0),
  validity_days       INT NOT NULL DEFAULT 30,
  per_member_limit    INT,                           -- NULL = unlimited
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------- visit log (one row per recorded check-in) -----------
CREATE TABLE IF NOT EXISTS visits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  card_id         UUID REFERENCES cards(id),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  service_line    service_line NOT NULL,
  sub_service     TEXT,                              -- e.g. "blood test"
  staff_user_id   UUID REFERENCES users(id),
  stamps_awarded  INT NOT NULL DEFAULT 1,
  is_voided       BOOLEAN NOT NULL DEFAULT FALSE,
  voided_by       UUID REFERENCES users(id),
  voided_at       TIMESTAMPTZ,
  void_reason     TEXT,
  visited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visits_member ON visits(member_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_branch ON visits(branch_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_service_line ON visits(service_line, visited_at DESC);

-- ----------- redemptions -----------
CREATE TABLE IF NOT EXISTS redemptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  reward_id       UUID NOT NULL REFERENCES rewards(id),
  stamps_used     INT NOT NULL,
  branch_id       UUID NOT NULL REFERENCES branches(id),
  staff_user_id   UUID REFERENCES users(id),
  voucher_code    TEXT UNIQUE NOT NULL,
  status          redemption_status NOT NULL DEFAULT 'pending',
  expires_at      TIMESTAMPTZ NOT NULL,
  redeemed_at     TIMESTAMPTZ,
  voided_by       UUID REFERENCES users(id),
  voided_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_redemptions_member ON redemptions(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_redemptions_status ON redemptions(status);

-- ----------- audit log -----------
CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID REFERENCES users(id),
  branch_id    UUID REFERENCES branches(id),
  action       TEXT NOT NULL,            -- e.g. 'visit.create', 'card.replace'
  entity_type  TEXT,                     -- e.g. 'member','card','visit'
  entity_id    UUID,
  payload      JSONB,
  ip_address   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at DESC);

-- ----------- network-wide settings (single row) -----------
CREATE TABLE IF NOT EXISTS settings (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  brand_name      TEXT NOT NULL DEFAULT 'RFID Loyalty',
  logo_url        TEXT,
  primary_color   TEXT NOT NULL DEFAULT '#1F4E79',
  accent_color    TEXT NOT NULL DEFAULT '#2E75B6',
  updated_by      UUID REFERENCES users(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ----------- short-token map for NFC tags (URL must fit in ~140 bytes on NTAG213) -----------
CREATE TABLE IF NOT EXISTS nfc_links (
  token        TEXT PRIMARY KEY,
  member_id    UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_nfc_links_member ON nfc_links(member_id, created_at DESC);

-- ----------- helper view: stamp balance per member per service line -----------
CREATE OR REPLACE VIEW member_stamp_balance AS
SELECT
  m.id AS member_id,
  v.service_line,
  COALESCE(SUM(CASE WHEN v.is_voided THEN 0 ELSE v.stamps_awarded END), 0) AS stamps_earned,
  COALESCE((
    SELECT SUM(r.stamps_used)
    FROM redemptions r
    JOIN rewards rw ON rw.id = r.reward_id
    WHERE r.member_id = m.id
      AND r.status IN ('pending','redeemed')
      AND (rw.service_line = v.service_line OR rw.service_line IS NULL)
  ), 0) AS stamps_spent,
  COALESCE(SUM(CASE WHEN v.is_voided THEN 0 ELSE v.stamps_awarded END), 0)
    - COALESCE((
        SELECT SUM(r.stamps_used)
        FROM redemptions r
        JOIN rewards rw ON rw.id = r.reward_id
        WHERE r.member_id = m.id
          AND r.status IN ('pending','redeemed')
          AND (rw.service_line = v.service_line OR rw.service_line IS NULL)
      ), 0) AS stamps_balance
FROM members m
LEFT JOIN visits v ON v.member_id = m.id
GROUP BY m.id, v.service_line;
