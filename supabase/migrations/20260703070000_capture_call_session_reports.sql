-- Capture-migration (db-schema-cleanup, 2026-07-03): make the repo authoritative for
-- `call_session_reports`, a table that exists + is populated live (323 rows) but had NO
-- migration here. Written live by CallOps (`POST /calls/call-report`) — Cale owns the writes;
-- this repo only captures the shape so `supabase/migrations/*` matches prod.
--
-- Columns match the live schema exactly (verified 2026-07-03 via service-role read of
-- PostgREST OpenAPI). IF NOT EXISTS makes this a NO-OP against live (the table already
-- exists) — the column list only takes effect on a fresh rebuild.
CREATE TABLE IF NOT EXISTS call_session_reports (
  session_id              UUID PRIMARY KEY,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  room                    TEXT,
  job_id                  TEXT,
  room_id                 TEXT,
  mode                    TEXT,
  attempt                 INTEGER,
  started_at              TIMESTAMPTZ,
  ended_at                TIMESTAMPTZ,
  amd_category            TEXT,
  amd_duration_ms         INTEGER,
  dtmf_digits             TEXT,
  matched_key             TEXT,
  disconnect_reason       TEXT,
  sip_participant_sid     TEXT,
  sip_attributes          JSONB,
  sip_call_status_history JSONB,
  transfer_target         TEXT,
  voice_recording_url     TEXT,
  audio_version           TEXT,
  talk_seconds            INTEGER
);
