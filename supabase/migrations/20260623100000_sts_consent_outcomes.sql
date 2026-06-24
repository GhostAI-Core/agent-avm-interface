-- STS SmartCall SDP alignment — add the consent-carrying AVM outcomes to call_records.
--
-- STS reports AVM results in its own vocabulary (DIALED/ANSWERED/HANGUP/VOICEMAIL/SUBSCRIBE/
-- DECLINE/UNSUBSCRIBE/OPT OUT). Most map onto our existing internal outcomes, but three are
-- consent events with no clean internal equivalent and are worth keeping as first-class signal:
--   subscribed   ← STS SUBSCRIBE    (billing conversion)
--   unsubscribed ← STS UNSUBSCRIBE  (product churn)
--   opted_out    ← STS OPT OUT      (global DNC)
-- DIALED is transient (call placed, not resolved) and is never persisted, so it is NOT added here.
-- The mapping itself lives in lib/sts/outcomes.ts; this only widens the storage constraint.
ALTER TABLE call_records DROP CONSTRAINT IF EXISTS call_records_outcome_check;
ALTER TABLE call_records ADD  CONSTRAINT call_records_outcome_check
  CHECK (outcome IN (
    -- callops outcomes
    'answered','transferred','voicemail','no_answer','busy','failed',
    -- STS consent outcomes (this migration)
    'subscribed','unsubscribed','opted_out',
    -- legacy IVR outcomes (retained for existing data + back-compat)
    'pending','connected','qualified','no_speech','hangup','ni','dnq','callback'
  ));
