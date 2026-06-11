-- Per-campaign LiveKit gateway overrides.
-- Both optional: when NULL the dial route falls back to the LIVEKIT_* env defaults.
-- Idempotent.

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sip_trunk_id VARCHAR(64);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS agent_name   VARCHAR(64);

COMMENT ON COLUMN campaigns.sip_trunk_id IS 'LiveKit SIP outbound trunk id (ST_…); NULL = use LIVEKIT_SIP_OUTBOUND_TRUNK_ID env default';
COMMENT ON COLUMN campaigns.agent_name   IS 'LiveKit agent dispatch name; NULL = use LIVEKIT_AGENT_NAME env default';
