-- M2: carrier SIP fields + Routr sync state on voip_providers
ALTER TABLE voip_providers ADD COLUMN IF NOT EXISTS slug VARCHAR(32) NOT NULL DEFAULT '';
ALTER TABLE voip_providers ADD COLUMN IF NOT EXISTS provider_type VARCHAR(20) NOT NULL DEFAULT 'twilio';
ALTER TABLE voip_providers ADD COLUMN IF NOT EXISTS sip_host VARCHAR(255);
ALTER TABLE voip_providers ADD COLUMN IF NOT EXISTS sip_port INT NOT NULL DEFAULT 5060;
ALTER TABLE voip_providers ADD COLUMN IF NOT EXISTS sip_username VARCHAR(60);
ALTER TABLE voip_providers ADD COLUMN IF NOT EXISTS sip_password VARCHAR(255);
ALTER TABLE voip_providers ADD COLUMN IF NOT EXISTS send_register BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE voip_providers ADD COLUMN IF NOT EXISTS routr_trunk_ref VARCHAR(64);
ALTER TABLE voip_providers ADD COLUMN IF NOT EXISTS routr_credentials_ref VARCHAR(64);
ALTER TABLE voip_providers ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE voip_providers ADD COLUMN IF NOT EXISTS sync_error TEXT;
ALTER TABLE voip_providers ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

ALTER TABLE voip_providers DROP CONSTRAINT IF EXISTS voip_providers_provider_type_check;
ALTER TABLE voip_providers ADD CONSTRAINT voip_providers_provider_type_check
  CHECK (provider_type IN ('twilio', 'telnyx', 'sangoma'));

ALTER TABLE voip_providers DROP CONSTRAINT IF EXISTS voip_providers_sync_status_check;
ALTER TABLE voip_providers ADD CONSTRAINT voip_providers_sync_status_check
  CHECK (sync_status IN ('pending', 'synced', 'error'));

COMMENT ON COLUMN voip_providers.slug IS 'Routr trunk inboundUri = {slug}.evra.local';
COMMENT ON COLUMN voip_providers.routr_trunk_ref IS 'Routr Trunk ref (UUID or stable id)';
COMMENT ON COLUMN voip_providers.sync_status IS 'pending | synced | error after Routr SDK sync';

-- Platform LiveKit peer settings (JSON blob per row id)
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS config JSONB;
