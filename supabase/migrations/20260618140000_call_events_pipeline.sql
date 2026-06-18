-- Agent → Supabase call pipeline (EOB 2026-06-18).
-- The LiveKit agent (Cale's worker) dumps raw per-call events into `call_events`; a BEFORE INSERT
-- trigger maps each one into the structured `call_records` / `intent_stats` the dashboards read.
-- Also adds the in-call behavior knobs the agent reads (2s answer delay, AMD, 4s silence drop)
-- and the new `dropped_no_response` outcome.

-- ── campaign behavior knobs (the agent reads these by campaign_id from the room name) ──
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS answer_delay_sec    INT     NOT NULL DEFAULT 2;  -- wait Ns after answer before speaking
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS silence_timeout_sec INT     NOT NULL DEFAULT 4;  -- no response for Ns → drop the call
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS amd_enabled         BOOLEAN NOT NULL DEFAULT true; -- answering-machine detection on
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS voicemail_action    TEXT    NOT NULL DEFAULT 'hangup'
  CHECK (voicemail_action IN ('hangup','leave_message','continue'));

-- ── new terminal outcome: dropped from our side after silence_timeout_sec of no response ──
ALTER TABLE call_records DROP CONSTRAINT IF EXISTS call_records_outcome_check;
ALTER TABLE call_records ADD CONSTRAINT call_records_outcome_check
  CHECK (outcome IN ('pending','connected','qualified','voicemail','no_speech','hangup',
                     'ni','dnq','callback','no_answer','busy','failed','dropped_no_response'));

-- NOTE: `call_records` already has a PARTIAL unique index on room (uq_call_records_room,
-- WHERE room IS NOT NULL, from 20260612120000). The trigger's ON CONFLICT below repeats that
-- predicate so Postgres can match it as the arbiter.

-- ── raw landing table the agent dumps into ─────────────────────────────────
CREATE TABLE IF NOT EXISTS call_events (
  id          BIGSERIAL PRIMARY KEY,
  room        TEXT NOT NULL,                  -- avm_<campaignId>_<contactId>_<rand>
  campaign_id INT,
  contact_id  INT,
  phone       TEXT,
  event_type  TEXT NOT NULL,                  -- see trigger below
  payload     JSONB NOT NULL DEFAULT '{}',    -- everything else (talk_seconds, cost, intent, transcript, reason…)
  processed   BOOLEAN NOT NULL DEFAULT false, -- set true by the trigger; raw row is kept for later manipulation
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_call_events_room ON call_events (room);
CREATE INDEX IF NOT EXISTS idx_call_events_unprocessed ON call_events (processed) WHERE processed = false;

ALTER TABLE call_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "auth_all_call_events" ON call_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── ETL: map each dumped event into the structured tables (OUR mapping, tweak freely) ──
CREATE OR REPLACE FUNCTION process_call_event()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Ensure a call_records row exists for this room (the dial route usually pre-creates a 'pending'
  -- one, but the agent may dump first — upsert so neither order loses data).
  IF NEW.room IS NOT NULL THEN
    INSERT INTO call_records (campaign_id, contact_id, phone, room, outcome, called_at)
    VALUES (NEW.campaign_id, NEW.contact_id, NEW.phone, NEW.room, 'pending', NOW())
    ON CONFLICT (room) WHERE room IS NOT NULL DO NOTHING;
  END IF;

  CASE NEW.event_type
    WHEN 'answered' THEN
      UPDATE call_records SET outcome = 'connected' WHERE room = NEW.room AND outcome = 'pending';

    WHEN 'voicemail_detected' THEN          -- AMD hit a machine → we hung up; don't waste spend
      UPDATE call_records SET outcome = 'voicemail' WHERE room = NEW.room;

    WHEN 'dropped_no_response' THEN          -- silence_timeout_sec elapsed → dropped from our side
      UPDATE call_records SET outcome = 'dropped_no_response' WHERE room = NEW.room;

    WHEN 'outcome' THEN                       -- final disposition + metrics from the agent
      UPDATE call_records SET
        outcome      = COALESCE(NEW.payload->>'outcome', outcome),
        talk_seconds = COALESCE((NEW.payload->>'talk_seconds')::INT, talk_seconds),
        cost         = COALESCE((NEW.payload->>'cost')::NUMERIC, cost),
        transferred  = COALESCE((NEW.payload->>'transferred')::BOOLEAN, transferred)
      WHERE room = NEW.room;

    WHEN 'recording' THEN
      UPDATE call_records SET recording_url = NEW.payload->>'url' WHERE room = NEW.room;

    WHEN 'intent' THEN                        -- feed the intent waterfall
      PERFORM bump_intent(
        NEW.campaign_id, CURRENT_DATE,
        NEW.payload->>'name', COALESCE((NEW.payload->>'step')::INT, 0)
      );

    ELSE
      NULL;  -- unknown event_type: kept raw in call_events for later manipulation, no mapping
  END CASE;

  NEW.processed := true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_process_call_event ON call_events;
CREATE TRIGGER trg_process_call_event
  BEFORE INSERT ON call_events
  FOR EACH ROW EXECUTE FUNCTION process_call_event();
