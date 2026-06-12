-- ============================================================
-- agent-avm-interface DB setup (control plane + reporting + voice upload).
-- Idempotent, seed-free, additive. Safe to re-run.
-- Does NOT touch dialer-config columns (sip_trunk_id, max_retries, company_id …);
-- those are owned by evra_callops / pending @ResonantSyntax (issue #24, open Q1).
-- ============================================================

-- 1. Tables the dashboard READS (callops writes them). Created here so the UI
--    works on a fresh DB; harmless (IF NOT EXISTS) if callops already owns them.
CREATE TABLE IF NOT EXISTS call_records (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id   INT          NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  phone         VARCHAR(20)  NOT NULL,
  outcome       VARCHAR(20)  NOT NULL DEFAULT 'pending'
                CHECK (outcome IN ('pending','connected','qualified','voicemail','no_speech','hangup','ni','dnq','callback','no_answer','busy','failed')),
  talk_seconds  INT           NOT NULL DEFAULT 0,
  cost          NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  transferred   BOOLEAN       NOT NULL DEFAULT FALSE,
  recording_url TEXT,
  called_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_call_records_campaign_time ON call_records (campaign_id, called_at DESC);

CREATE TABLE IF NOT EXISTS intent_stats (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id INT          NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  day         DATE         NOT NULL,
  intent_name VARCHAR(120) NOT NULL,
  step        INT          NOT NULL DEFAULT 0,
  reached     INT          NOT NULL DEFAULT 0,
  UNIQUE (campaign_id, day, intent_name)
);

ALTER TABLE call_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE intent_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_call_records" ON call_records;
CREATE POLICY "auth_all_call_records" ON call_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_intent_stats" ON intent_stats;
CREATE POLICY "auth_all_intent_stats" ON intent_stats FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Voice recordings — THIS app's feature: private bucket + campaign path.
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-recordings', 'voice-recordings', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "voice_auth_insert" ON storage.objects;
CREATE POLICY "voice_auth_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'voice-recordings');
DROP POLICY IF EXISTS "voice_auth_select" ON storage.objects;
CREATE POLICY "voice_auth_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'voice-recordings');
DROP POLICY IF EXISTS "voice_auth_update" ON storage.objects;
CREATE POLICY "voice_auth_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'voice-recordings');

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS voice_path TEXT;

-- Sanity checks (run manually after applying):
--   select id, public from storage.buckets where id = 'voice-recordings';  -- voice-recordings | false
--   select count(*) from call_records;                                     -- runs without error
