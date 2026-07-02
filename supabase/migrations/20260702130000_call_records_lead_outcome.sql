-- Lead-Gen: add the 'lead' outcome. A double opt-in (press-1 twice) in a
-- routing_mode='lead' campaign records outcome='lead' (no STS relay). Extends the
-- existing call_records_outcome_check (see 20260623100000_sts_consent_outcomes.sql).
ALTER TABLE call_records DROP CONSTRAINT IF EXISTS call_records_outcome_check;
ALTER TABLE call_records ADD  CONSTRAINT call_records_outcome_check
  CHECK (outcome IN (
    'answered','transferred','voicemail','no_answer','busy','failed',
    'subscribed','unsubscribed','opted_out','lead',
    'pending','connected','qualified','no_speech','hangup','ni','dnq','callback'
  ));
