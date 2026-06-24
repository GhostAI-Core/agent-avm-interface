-- Pre-dial compliance gate (plan.md)
-- Adds consent / suppression / calling-window / frequency data so the dial route can
-- gate every contact before placing a call. Additive + a one-time backfill so existing
-- (attested-consented) lists keep dialing. See plan.md §4 and §10.

-- ── contacts: locale only ───────────────────────────────────────────────────
-- Consent is PER-PRODUCT (product = campaigns.agent); it lives on product_consent below, NOT
-- here — opting out of one product must not affect another. Timezone is a property of the
-- person, so it stays on the canonical contact. Frequency lives on dial_number_state (keyed by
-- PHONE) and is intentionally cross-campaign.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Africa/Johannesburg';

-- ── campaigns: region + retry/pacing policy + disclosure ────────────────────
-- require_consent defaults FALSE: lists are supplied by clients who warrant consent
-- (responsible party); the operator relies on that warranty (plan.md §3a). Flip per-campaign
-- to TRUE to hard-require opt-in. Opt-out suppression is NOT optional — see dial_number_state.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'ZA';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS require_consent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_attempts_per_day INT NOT NULL DEFAULT 3;  -- retryable (no-answer/vm/busy) attempts/number/day
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS retry_jitter_seconds INT NOT NULL DEFAULT 2700; -- random extra gap on top of retry_cooldown_seconds (default +0–45m)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS disclosure_text TEXT;         -- "This is an automated call from X…"

-- ── call_records: recording disclosure ──────────────────────────────────────
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS recording_consent BOOLEAN;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS recording_disclosed BOOLEAN NOT NULL DEFAULT false;

-- ── account-wide suppression list (never dial these, regardless of campaign) ─
CREATE TABLE IF NOT EXISTS suppression_list (
  id          BIGSERIAL PRIMARY KEY,
  phone       TEXT NOT NULL,                  -- normalized +E.164
  reason      TEXT NOT NULL,                  -- 'opt_out' | 'dnc_registry' | 'complaint' | 'manual'
  company_id  INT REFERENCES companies(id),   -- null = global suppression
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (phone, company_id)
);
CREATE INDEX IF NOT EXISTS idx_suppression_phone ON suppression_list (phone);

-- ── immutable audit of every gate decision + consent change ─────────────────
CREATE TABLE IF NOT EXISTS compliance_events (
  id           BIGSERIAL PRIMARY KEY,
  contact_id   INT REFERENCES contacts(id),
  campaign_id  INT REFERENCES campaigns(id),
  event_type   TEXT NOT NULL,                 -- 'gate_pass' | 'gate_block' | 'opt_out' | 'opt_in'
  reason       TEXT,                           -- 'suppressed' | 'no_consent' | 'outside_window' | 'freq_cap' | 'region_not_approved' | 'cooldown'
  phone_masked TEXT,                           -- masked only, never raw
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_compliance_events_contact ON compliance_events (contact_id);

-- ── RLS (match the existing authenticated-all posture; tighten in feat/tenant-rls) ──
ALTER TABLE suppression_list  ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "auth_all_suppression"  ON suppression_list  FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth_all_compliance"   ON compliance_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── per-PRODUCT consent (one campaign = one product; product = campaigns.agent for now,
--    "active products" later). Opt-out of a product blocks that contact on EVERY campaign of
--    the SAME product, but never another product. Keyed by (contact, product). ──
CREATE TABLE IF NOT EXISTS product_consent (
  id             BIGSERIAL PRIMARY KEY,
  contact_id     INT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  product        TEXT NOT NULL,                 -- = campaigns.agent (seeker | grace | …)
  consent_status TEXT NOT NULL DEFAULT 'unknown' CHECK (consent_status IN ('opted_in','opted_out','unknown')),
  consent_source TEXT,                          -- 'import' | 'in_call' | 'manual'
  consent_at     TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contact_id, product)
);
CREATE INDEX IF NOT EXISTS idx_product_consent_lookup ON product_consent (contact_id, product);
ALTER TABLE product_consent ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "auth_all_product_consent" ON product_consent FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── per-NUMBER daily rollover ledger (cross-campaign) ───────────────────────
-- One row per phone. `reached` = we got a live answer today → no more calls today on ANY
-- campaign. `attempts` = retryable (no-answer/vm/busy) tries today. `next_eligible_at` =
-- earliest re-dial, stamped with random jitter so retries aren't back-to-back (plan.md §5.4).
CREATE TABLE IF NOT EXISTS dial_number_state (
  phone            TEXT PRIMARY KEY,                 -- normalized +E.164
  state_date       DATE NOT NULL,                    -- day the counters below apply to
  reached          BOOLEAN NOT NULL DEFAULT false,
  attempts         INT NOT NULL DEFAULT 0,
  next_eligible_at TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE dial_number_state ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "auth_all_dial_state" ON dial_number_state FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Provisional claim at DIAL time: marks the number busy for `p_hold_seconds` so a parallel
-- run can't double-dial before the outcome lands. Lazily resets counters on a new day.
CREATE OR REPLACE FUNCTION claim_dial(p_phone TEXT, p_hold_seconds INT)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO dial_number_state (phone, state_date, attempts, next_eligible_at, updated_at)
  VALUES (p_phone, CURRENT_DATE, 0, NOW() + make_interval(secs => p_hold_seconds), NOW())
  ON CONFLICT (phone) DO UPDATE SET
    state_date       = CASE WHEN dial_number_state.state_date = CURRENT_DATE THEN dial_number_state.state_date ELSE CURRENT_DATE END,
    attempts         = CASE WHEN dial_number_state.state_date = CURRENT_DATE THEN dial_number_state.attempts ELSE 0 END,
    reached          = CASE WHEN dial_number_state.state_date = CURRENT_DATE THEN dial_number_state.reached ELSE false END,
    next_eligible_at = NOW() + make_interval(secs => p_hold_seconds),
    updated_at       = NOW();
$$;

-- Outcome write-back: `p_reached` true ends the day for the number; otherwise bump the
-- retryable attempt count and push next_eligible_at out by cooldown + random jitter.
CREATE OR REPLACE FUNCTION record_dial_outcome(p_phone TEXT, p_reached BOOLEAN, p_cooldown_seconds INT, p_jitter_seconds INT)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE gap INT := GREATEST(0, p_cooldown_seconds) + floor(random() * GREATEST(1, p_jitter_seconds))::INT;
BEGIN
  INSERT INTO dial_number_state (phone, state_date, reached, attempts, next_eligible_at, updated_at)
  VALUES (p_phone, CURRENT_DATE, p_reached, CASE WHEN p_reached THEN 0 ELSE 1 END,
          NOW() + make_interval(secs => gap), NOW())
  ON CONFLICT (phone) DO UPDATE SET
    state_date       = CURRENT_DATE,
    reached          = dial_number_state.reached OR p_reached,
    attempts         = CASE WHEN dial_number_state.state_date = CURRENT_DATE THEN dial_number_state.attempts ELSE 0 END
                       + CASE WHEN p_reached THEN 0 ELSE 1 END,
    next_eligible_at = NOW() + make_interval(secs => gap),
    updated_at       = NOW();
END;
$$;

-- ── ONE-TIME BACKFILL (plan.md §10.3) ───────────────────────────────────────
-- Existing (contact, product) pairs are attested as already-consented, so mark them opted_in
-- to avoid halting current campaigns. Product = the contact's campaign's agent value. New
-- imports default to 'unknown'. (DISTINCT because a contact may sit in two same-product camps.)
INSERT INTO product_consent (contact_id, product, consent_status, consent_source, consent_at)
SELECT DISTINCT c.id, camp.agent, 'opted_in', 'import', NOW()
FROM contacts c
JOIN campaigns camp ON camp.id = c.campaign_id
WHERE c.campaign_id IS NOT NULL AND camp.agent IS NOT NULL AND camp.agent <> ''
ON CONFLICT (contact_id, product) DO NOTHING;
