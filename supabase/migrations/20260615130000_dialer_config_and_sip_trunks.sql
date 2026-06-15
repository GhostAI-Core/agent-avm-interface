-- Dialer config the control plane writes for evra_callops to consume (issue #24 Phase 2).
-- Adds a first-class sip_trunks table and the per-campaign dialer limits.
-- Idempotent. Additive except for sip_trunk_id, which is migrated VARCHAR(ST_…) → INT FK.
--
-- NOTE (issue #24, open Q1): sip_trunk_id is modelled here as an INTEGER FK to
-- sip_trunks.id. If prod settles on the LiveKit VARCHAR ST_… form instead, this is
-- the single column to revisit.

-- 1. SIP trunks dimension (replaces the old voip_providers settings section).
CREATE TABLE IF NOT EXISTS sip_trunks (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(100) NOT NULL,
    livekit_trunk_id VARCHAR(64),                  -- LiveKit outbound trunk id (ST_…)
    from_number      VARCHAR(20),                  -- caller ID presented to the lead
    company_id       INT REFERENCES companies(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sip_trunks_company ON sip_trunks (company_id);

ALTER TABLE sip_trunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_sip_trunks" ON sip_trunks;
CREATE POLICY "auth_all_sip_trunks" ON sip_trunks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Migrate campaigns.sip_trunk_id from the legacy VARCHAR(ST_…) override to an INT FK.
--    The legacy values were LiveKit trunk ids; they now live in sip_trunks.livekit_trunk_id,
--    so the per-campaign override is safe to drop and re-add as a FK.
ALTER TABLE campaigns DROP COLUMN IF EXISTS sip_trunk_id;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sip_trunk_id INT REFERENCES sip_trunks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_sip_trunk ON campaigns (sip_trunk_id);

-- 3. Per-campaign dialer limits the callops dispatcher reads.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_retries            INT     NOT NULL DEFAULT 2;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS retry_cooldown_seconds INT     NOT NULL DEFAULT 3600;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_concurrent         INT     NOT NULL DEFAULT 10;

-- 4. Set by callops when a campaign is paused outside its calling window (Phase 3.3 badge).
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS auto_paused BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN campaigns.sip_trunk_id IS 'FK → sip_trunks.id; NULL = callops default trunk';
COMMENT ON COLUMN campaigns.max_retries IS 'Max redial attempts per contact';
COMMENT ON COLUMN campaigns.retry_cooldown_seconds IS 'Seconds to wait before retrying a contact';
COMMENT ON COLUMN campaigns.max_concurrent IS 'Max simultaneous calls for this campaign';
COMMENT ON COLUMN campaigns.auto_paused IS 'callops auto-paused this campaign (outside calling window)';
