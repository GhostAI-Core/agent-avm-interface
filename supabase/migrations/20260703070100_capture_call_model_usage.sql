-- Capture-migration (db-schema-cleanup, 2026-07-03): make the repo authoritative for
-- `call_model_usage`, a table that exists + is populated live (23 rows) but had NO migration
-- here. Written live by CallOps (`POST /calls/model-usage`) — Cale owns the writes; this repo
-- only captures the shape so `supabase/migrations/*` matches prod.
--
-- Columns match the live schema exactly (verified 2026-07-03 via service-role read of
-- PostgREST OpenAPI). IF NOT EXISTS makes this a NO-OP against live (the table already
-- exists) — the column list only takes effect on a fresh rebuild.
CREATE TABLE IF NOT EXISTS call_model_usage (
  session_id                 UUID PRIMARY KEY,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sdk_version                TEXT,
  job_id                     TEXT,
  room_id                    TEXT,
  llm_prompt_tokens          INTEGER,
  llm_completion_tokens      INTEGER,
  llm_total_tokens           INTEGER,
  tts_characters_count       INTEGER,
  stt_audio_duration_seconds NUMERIC,
  model_usage_detail         JSONB
);
