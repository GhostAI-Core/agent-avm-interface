-- Archive is a recoverable state distinct from accidental delete.
-- Extend the campaigns.status CHECK to allow 'archived'.
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE campaigns ADD  CONSTRAINT campaigns_status_check
  CHECK (status IN ('draft','running','paused','completed','deleted','archived'));
