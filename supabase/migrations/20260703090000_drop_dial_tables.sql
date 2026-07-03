-- db-schema-cleanup Tier 2 (2026-07-03): drop the two 0-row tables that were referenced ONLY
-- by the orphaned dashboard /dial route (app/api/campaigns/[id]/dial/route.ts), which is
-- deleted in the same change. The UI's live control path is app/api/campaigns/[id]/[action]
-- -> CallOps /campaigns/{id}/{action}; /dial had no callers (verified repo-wide incl. scripts/).
--   * campaign_contacts  — legacy M:N join; CallOps reads contacts.campaign_id, not this.
--   * compliance_events  — legacy dashboard-side audit log; the real gate lives in CallOps.
-- Verified 0 rows live 2026-07-03. Transaction self-guards + reversible in-DB backups, same
-- pattern as Tier 1. compliance_events dropped before campaign_contacts in case of an inter-FK.
BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM campaign_contacts) <> 0 THEN RAISE EXCEPTION 'campaign_contacts not empty — aborting'; END IF;
  IF (SELECT count(*) FROM compliance_events) <> 0 THEN RAISE EXCEPTION 'compliance_events not empty — aborting'; END IF;
END $$;

CREATE TABLE IF NOT EXISTS _backup_20260703_campaign_contacts
  (LIKE campaign_contacts INCLUDING ALL EXCLUDING DEFAULTS EXCLUDING IDENTITY);
INSERT INTO _backup_20260703_campaign_contacts SELECT * FROM campaign_contacts;
CREATE TABLE IF NOT EXISTS _backup_20260703_compliance_events
  (LIKE compliance_events INCLUDING ALL EXCLUDING DEFAULTS EXCLUDING IDENTITY);
INSERT INTO _backup_20260703_compliance_events SELECT * FROM compliance_events;

DROP TABLE IF EXISTS compliance_events;
DROP TABLE IF EXISTS campaign_contacts;

COMMIT;

-- ── REVERSIBLE RESTORE (run manually if needed) ──
--   ALTER TABLE _backup_20260703_campaign_contacts RENAME TO campaign_contacts;
--   ALTER TABLE _backup_20260703_compliance_events  RENAME TO compliance_events;
--   -- (re-add serial defaults / FKs from 20260618160000_campaign_contacts.sql +
--   --  20260618120000_compliance_gate.sql if the full original DDL is needed.)
-- ── optional backup cleanup once confident ──
--   DROP TABLE IF EXISTS _backup_20260703_campaign_contacts;
--   DROP TABLE IF EXISTS _backup_20260703_compliance_events;
