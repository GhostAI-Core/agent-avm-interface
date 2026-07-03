-- db-schema-cleanup Tier 1 (2026-07-03): drop dead, 0-row, code-uncoupled relations.
--   * call_events      — superseded by call_session_events (719 rows). Its BEFORE-INSERT
--                        trigger trg_process_call_event drops with the table; the orphaned
--                        ETL fn process_call_event() is dropped alongside.
--   * voip_providers   — replaced by sip_trunks + CallOps trunk mgmt (campaigns.sip_trunk_id
--                        FKs sip_trunks, not this table).
-- campaign_report is a live VIEW (kept, captured separately) — NOT dropped here.
-- Verified 0 rows live 2026-07-03. The transaction self-guards: it ABORTS if either table is
-- non-empty at run time, and takes a structural in-DB backup before dropping (reversible).
BEGIN;

-- ── safety guard: abort the whole transaction if anything is non-empty ──
DO $$
BEGIN
  IF (SELECT count(*) FROM call_events)    <> 0 THEN RAISE EXCEPTION 'call_events not empty — aborting'; END IF;
  IF (SELECT count(*) FROM voip_providers) <> 0 THEN RAISE EXCEPTION 'voip_providers not empty — aborting'; END IF;
END $$;

-- ── reversible structural backup. EXCLUDING DEFAULTS/IDENTITY so the backup does NOT inherit
--    the source's `nextval(<table>_id_seq)` default — that owned sequence drops with the table,
--    and a lingering reference would block the DROP. Backups are 0-row structural copies; the
--    full DDL (incl. the serial defaults) also lives in the original CREATE migrations. ──
CREATE TABLE IF NOT EXISTS _backup_20260703_call_events
  (LIKE call_events    INCLUDING ALL EXCLUDING DEFAULTS EXCLUDING IDENTITY);
INSERT INTO _backup_20260703_call_events    SELECT * FROM call_events;
CREATE TABLE IF NOT EXISTS _backup_20260703_voip_providers
  (LIKE voip_providers INCLUDING ALL EXCLUDING DEFAULTS EXCLUDING IDENTITY);
INSERT INTO _backup_20260703_voip_providers SELECT * FROM voip_providers;

-- ── drops ──
DROP TABLE    IF EXISTS call_events;          -- trigger trg_process_call_event drops with it
DROP FUNCTION IF EXISTS process_call_event(); -- orphaned ETL fn (body preserved in 20260618140000)
DROP TABLE    IF EXISTS voip_providers;

COMMIT;

-- ── REVERSIBLE RESTORE (run manually if needed) ──
--   ALTER TABLE _backup_20260703_call_events    RENAME TO call_events;
--   ALTER TABLE _backup_20260703_voip_providers RENAME TO voip_providers;
--   -- then re-run the process_call_event() fn + trg_process_call_event trigger from
--   -- 20260618140000_call_events_pipeline.sql to restore the ETL path.
-- ── cleanup of the backup tables, once you're confident (optional) ──
--   DROP TABLE IF EXISTS _backup_20260703_call_events;
--   DROP TABLE IF EXISTS _backup_20260703_voip_providers;
