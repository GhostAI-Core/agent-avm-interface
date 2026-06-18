-- Record which script audio a call used (issue #31 item 6: "update call logs with script used").
-- Populated at dial time from the campaign's audio_path (the unified script pointer).
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS script_path TEXT;
