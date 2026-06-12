-- Link a call_records row back to its LiveKit room / contact / egress so the webhook
-- and the agent result endpoint can upsert the right row as events arrive in any order.
-- Also adds an atomic intent counter for the (future) per-call intent reporting.
-- Idempotent.

ALTER TABLE call_records ADD COLUMN IF NOT EXISTS room       VARCHAR(80);
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS contact_id INT REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS egress_id  VARCHAR(64);

-- One row per LiveKit room → lets us upsert-by-room from out-of-order webhook/agent events.
CREATE UNIQUE INDEX IF NOT EXISTS uq_call_records_room ON call_records (room) WHERE room IS NOT NULL;

-- Atomic "this call hit intent X today" counter for the intent waterfall.
CREATE OR REPLACE FUNCTION bump_intent(p_campaign INT, p_day DATE, p_intent VARCHAR, p_step INT)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO intent_stats (campaign_id, day, intent_name, step, reached)
  VALUES (p_campaign, p_day, p_intent, p_step, 1)
  ON CONFLICT (campaign_id, day, intent_name)
  DO UPDATE SET reached = intent_stats.reached + 1;
$$;
