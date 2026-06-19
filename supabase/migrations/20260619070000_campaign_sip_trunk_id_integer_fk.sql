-- Corrective migration — reverts 20260619060000.
--
-- 20260619060000 wrongly changed campaigns.sip_trunk_id to VARCHAR on the theory
-- that callops reads the LiveKit trunk id (ST_…) string directly. It does NOT:
-- callops resolves the trunk by INTEGER FK — get_sip_trunk(trunk_id: int) looks up
-- sip_trunks.id and uses that row's livekit_trunk_id. (See evra_callops
-- app/db/queries.py / queue_dispatcher.py.) The undocumented 500 was a callops-side
-- bug (get_campaign selecting a non-existent `mode` column + dispatch issues), not a
-- trunk/schema problem.
--
-- Restore campaigns.sip_trunk_id to an integer FK into sip_trunks(id).

BEGIN;

-- Defensive: clear any FK left over from a prior run.
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_sip_trunk_id_fkey;

-- VARCHAR -> integer. Pure-digit values (e.g. '2') cast cleanly; anything else -> NULL.
ALTER TABLE campaigns
  ALTER COLUMN sip_trunk_id TYPE integer
  USING (CASE WHEN sip_trunk_id ~ '^\d+$' THEN sip_trunk_id::integer ELSE NULL END);

COMMENT ON COLUMN campaigns.sip_trunk_id IS
  'FK to sip_trunks.id; callops resolves it to sip_trunks.livekit_trunk_id for dialing. NULL = no trunk configured.';

-- Point the test campaign at the real trunk row (utility_connect -> ST_J4VapLgizb32).
UPDATE campaigns SET sip_trunk_id = 2 WHERE id = 26;

-- Drop orphaned values so the FK can be added cleanly.
UPDATE campaigns SET sip_trunk_id = NULL
  WHERE sip_trunk_id IS NOT NULL
    AND sip_trunk_id NOT IN (SELECT id FROM sip_trunks);

ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_sip_trunk_id_fkey
  FOREIGN KEY (sip_trunk_id) REFERENCES sip_trunks(id);

COMMIT;
