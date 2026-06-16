-- Campaign SIP routing mode: legacy (LiveKit → carrier) or routr (LiveKit → Routr → carrier)
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS routing_mode VARCHAR(16) NOT NULL DEFAULT 'legacy'
    CHECK (routing_mode IN ('legacy', 'routr'));

COMMENT ON COLUMN campaigns.routing_mode IS
  'SIP path: legacy = direct LiveKit carrier trunk; routr = LiveKit ST_ROUTR → Routr → carrier';
