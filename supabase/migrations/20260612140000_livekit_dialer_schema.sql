-- LiveKit dialer schema sync: SIP trunk catalog, contact dial lifecycle, campaign pacing.
-- Idempotent. campaigns.sip_trunk_id / agent_name live in 20260611100000_campaign_gateway.sql.

-- 1. SIP trunk catalog (optional; campaigns.sip_trunk_id may also hold ST_… directly)
CREATE TABLE IF NOT EXISTS sip_trunks (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(100) NOT NULL,
    livekit_trunk_id VARCHAR(64)  NOT NULL,
    from_number      VARCHAR(20)  NOT NULL,
    company_id       INT REFERENCES companies(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE sip_trunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_sip_trunks" ON sip_trunks;
CREATE POLICY "auth_all_sip_trunks" ON sip_trunks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Campaign pacing / retry tuning
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_retries INT NOT NULL DEFAULT 2;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS retry_cooldown_seconds INT NOT NULL DEFAULT 3600;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_concurrent INT NOT NULL DEFAULT 10;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS auto_paused BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Contact dial lifecycle
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ;

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_status_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_status_check
  CHECK (status IN ('pending', 'in_progress', 'dialed', 'failed', 'retry'));
