-- Fix schema drift on campaigns.sip_trunk_id.
--
-- callops reads campaigns.sip_trunk_id DIRECTLY as the LiveKit SIP trunk id
-- string (ST_…). Migration 20260611100000 already declared this column as
-- VARCHAR(64), but `ADD COLUMN IF NOT EXISTS` silently no-op'd because the base
-- schema had already created the column as INTEGER. The live column therefore
-- stayed INTEGER, so callops read an integer (e.g. 2) as the trunk id and
-- crashed the dispatcher with an undocumented HTTP 500 on /campaigns/{id}/start.
--
-- This migration aligns the live column with the original VARCHAR(64) design.
-- Existing integer values are stale FK-style ids (not real LiveKit trunk ids),
-- so they are cleared to NULL; trunks must be re-set to a real ST_… id.

BEGIN;

-- Drop any leftover FK to sip_trunks(id) from the integer-FK design.
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_sip_trunk_id_fkey;

-- integer -> varchar(64). Existing integer values are invalid as trunk ids → NULL them.
ALTER TABLE campaigns
  ALTER COLUMN sip_trunk_id TYPE VARCHAR(64) USING NULL;

COMMENT ON COLUMN campaigns.sip_trunk_id IS
  'LiveKit SIP outbound trunk id (ST_…) used directly by callops; NULL = callops env default';

-- Point the existing test campaign at the only real LiveKit trunk so dispatch works.
UPDATE campaigns SET sip_trunk_id = 'ST_J4VapLgizb32' WHERE id = 26;

COMMIT;
