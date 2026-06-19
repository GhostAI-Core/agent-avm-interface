-- Issue #34 / #31 (DB hardening) — align call_records.outcome with evra-callops.
-- callops reports outcomes as `answered` / `transferred` (plus voicemail/no_answer/busy/failed),
-- but the original CHECK only allowed the legacy IVR vocabulary, so those writes are rejected.
-- Widen the constraint to a superset: keep the legacy values (existing rows + report seed view)
-- and add the callops values. Frontend display still maps these per the #34 table.
ALTER TABLE call_records DROP CONSTRAINT IF EXISTS call_records_outcome_check;
ALTER TABLE call_records ADD  CONSTRAINT call_records_outcome_check
  CHECK (outcome IN (
    -- callops outcomes
    'answered','transferred','voicemail','no_answer','busy','failed',
    -- legacy IVR outcomes (retained for existing data + back-compat)
    'pending','connected','qualified','no_speech','hangup','ni','dnq','callback'
  ));
