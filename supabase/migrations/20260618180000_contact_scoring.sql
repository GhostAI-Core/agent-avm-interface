-- Master-contact scoring (cost control). The canonical `contacts` table IS the master sheet
-- (one row per number, fed by every CSV upload). Each contact carries a global, cross-campaign
-- score: fresh = 0, clamped to [-10, +10]. The call OUTCOME moves the score; at -10 a number is
-- DEAD (the gate blocks it everywhere — stop wasting spend), at +10 it's a PREMIUM lead.
--
-- Scoring is once per call (guarded by call_records.scored) and only on a TERMINAL disposition —
-- not 'pending'/'connected', so connected→qualified doesn't double-count.

ALTER TABLE contacts     ADD COLUMN IF NOT EXISTS score  INT     NOT NULL DEFAULT 0;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS scored BOOLEAN NOT NULL DEFAULT false;

-- Outcome → score delta. UNIT STEPS only (±1): repeat success → premium (+10), repeat failure →
-- dead (-10). One call never decides; it takes ~10 consistent outcomes to reach a pole.
-- This is the single source of truth — adjust which outcomes count as success/failure here.
CREATE OR REPLACE FUNCTION score_delta(p_outcome TEXT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_outcome
    -- success (+1): a real, positive contact.
    WHEN 'qualified'           THEN  1
    WHEN 'callback'            THEN  1
    -- failure (-1): no contact, or reached-but-no-value (each still cost us a dial).
    WHEN 'voicemail'           THEN -1
    WHEN 'no_answer'           THEN -1
    WHEN 'busy'                THEN -1
    WHEN 'no_speech'           THEN -1
    WHEN 'dropped_no_response' THEN -1
    WHEN 'dnq'                 THEN -1
    WHEN 'ni'                  THEN -1
    WHEN 'hangup'              THEN -1
    -- neutral (0): technical failure or intermediate states.
    ELSE 0                               -- failed / pending / connected / unknown
  END;
$$;

-- Apply a call's outcome to its contact's score, once. No-op for pending/connected (intermediate),
-- already-scored calls, or rows without a contact. Clamps to [-10, +10].
CREATE OR REPLACE FUNCTION apply_call_score(p_room TEXT, p_outcome TEXT)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_contact INT; v_scored BOOLEAN;
BEGIN
  IF p_outcome IN ('pending', 'connected') THEN RETURN; END IF;
  SELECT contact_id, scored INTO v_contact, v_scored FROM call_records WHERE room = p_room;
  IF v_contact IS NULL OR v_scored IS DISTINCT FROM false THEN RETURN; END IF;
  UPDATE contacts SET score = GREATEST(-10, LEAST(10, score + score_delta(p_outcome))) WHERE id = v_contact;
  UPDATE call_records SET scored = true WHERE room = p_room;
END;
$$;

-- Re-create the call_events ETL trigger fn with scoring wired into the terminal-outcome cases.
CREATE OR REPLACE FUNCTION process_call_event()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.room IS NOT NULL THEN
    INSERT INTO call_records (campaign_id, contact_id, phone, room, outcome, called_at)
    VALUES (NEW.campaign_id, NEW.contact_id, NEW.phone, NEW.room, 'pending', NOW())
    ON CONFLICT (room) WHERE room IS NOT NULL DO NOTHING;
  END IF;

  CASE NEW.event_type
    WHEN 'answered' THEN
      UPDATE call_records SET outcome = 'connected' WHERE room = NEW.room AND outcome = 'pending';

    WHEN 'voicemail_detected' THEN
      UPDATE call_records SET outcome = 'voicemail' WHERE room = NEW.room;
      PERFORM apply_call_score(NEW.room, 'voicemail');

    WHEN 'dropped_no_response' THEN
      UPDATE call_records SET outcome = 'dropped_no_response' WHERE room = NEW.room;
      PERFORM apply_call_score(NEW.room, 'dropped_no_response');

    WHEN 'outcome' THEN
      UPDATE call_records SET
        outcome      = COALESCE(NEW.payload->>'outcome', outcome),
        talk_seconds = COALESCE((NEW.payload->>'talk_seconds')::INT, talk_seconds),
        cost         = COALESCE((NEW.payload->>'cost')::NUMERIC, cost),
        transferred  = COALESCE((NEW.payload->>'transferred')::BOOLEAN, transferred)
      WHERE room = NEW.room;
      PERFORM apply_call_score(NEW.room, NEW.payload->>'outcome');

    WHEN 'recording' THEN
      UPDATE call_records SET recording_url = NEW.payload->>'url' WHERE room = NEW.room;

    WHEN 'intent' THEN
      PERFORM bump_intent(NEW.campaign_id, CURRENT_DATE, NEW.payload->>'name', COALESCE((NEW.payload->>'step')::INT, 0));

    ELSE
      NULL;
  END CASE;

  NEW.processed := true;
  RETURN NEW;
END;
$$;
