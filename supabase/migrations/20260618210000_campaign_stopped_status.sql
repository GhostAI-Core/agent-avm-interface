-- Issue #34 — evra-callops uses 'stopped' as a terminal campaign state (halted mid-run).
-- The existing campaigns_status_check (migration 20260610150000) rejects it, so callops
-- writes would fail. Add 'stopped' to the allowed set. Additive only — existing rows unaffected.
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE campaigns ADD  CONSTRAINT campaigns_status_check
  CHECK (status IN ('draft','running','paused','stopped','completed','deleted','archived'));
