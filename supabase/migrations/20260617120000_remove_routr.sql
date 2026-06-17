-- Remove Routr integration: routing mode and provider sync metadata

UPDATE campaigns SET routing_mode = 'legacy' WHERE routing_mode = 'routr';

ALTER TABLE campaigns DROP COLUMN IF EXISTS routing_mode;

ALTER TABLE voip_providers DROP COLUMN IF EXISTS routr_trunk_ref;
ALTER TABLE voip_providers DROP COLUMN IF EXISTS routr_credentials_ref;
ALTER TABLE voip_providers DROP COLUMN IF EXISTS sync_status;
ALTER TABLE voip_providers DROP COLUMN IF EXISTS sync_error;
ALTER TABLE voip_providers DROP COLUMN IF EXISTS last_synced_at;

ALTER TABLE voip_providers DROP CONSTRAINT IF EXISTS voip_providers_sync_status_check;
