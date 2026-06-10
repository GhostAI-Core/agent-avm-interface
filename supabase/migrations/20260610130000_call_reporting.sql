-- Call reporting: per-call detail (call_records) + intent waterfall (intent_stats),
-- the realistic campaign roster, per-campaign aggregates, and demo seed data.
-- Idempotent; authenticated-only RLS (matches the app's real-login model).

-- 1. Tables
CREATE TABLE IF NOT EXISTS call_records (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    campaign_id   INT          NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    phone         VARCHAR(20)  NOT NULL,
    outcome       VARCHAR(20)  NOT NULL DEFAULT 'pending'
                  CHECK (outcome IN ('pending','connected','qualified','voicemail','no_speech','hangup','ni','dnq','callback','no_answer','busy','failed')),
    talk_seconds  INT           NOT NULL DEFAULT 0,      -- talk/handle time in seconds (UI formats to mm:ss)
    cost          NUMERIC(10,2) NOT NULL DEFAULT 0.00,   -- per-call cost (rolls up to CPL / total spend)
    transferred   BOOLEAN       NOT NULL DEFAULT FALSE,  -- transferred to human / transfer_target
    recording_url TEXT,                                  -- per-call recording (null when no audio)
    called_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_call_records_campaign_time ON call_records (campaign_id, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_records_outcome       ON call_records (campaign_id, outcome);

CREATE TABLE IF NOT EXISTS intent_stats (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    campaign_id INT          NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    day         DATE         NOT NULL,
    intent_name VARCHAR(120) NOT NULL,
    step        INT          NOT NULL DEFAULT 0,   -- position in the conversation flow
    reached     INT          NOT NULL DEFAULT 0,   -- calls that hit this intent that day
    UNIQUE (campaign_id, day, intent_name)
);
CREATE INDEX IF NOT EXISTS idx_intent_stats_lookup ON intent_stats (campaign_id, day);

-- 2. RLS (authenticated only)
ALTER TABLE call_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE intent_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_call_records" ON call_records;
CREATE POLICY "auth_all_call_records" ON call_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_intent_stats" ON intent_stats;
CREATE POLICY "auth_all_intent_stats" ON intent_stats FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Seed: realistic campaign roster (matched by name so re-running won't duplicate)
INSERT INTO campaigns (name, agent, status, dialing_speed, time_window_start, time_window_end)
SELECT v.name, v.agent, v.status, v.speed, TIME '08:00', TIME '20:00'
FROM (VALUES
    ('1Life BMI AI V4.2',                'seeker', 'running', 2),
    ('1Life Funeral BMI AI V4.3',        'grace',  'running', 1),
    ('3Way Miway STI AI NEW',            'seeker', 'running', 2),
    ('Miway STI UGOC AI V4.3 Male',      'seeker', 'paused',  2),
    ('Ivyze STI Old Mutual Vantage Male','grace',  'running', 1),
    ('Metropolitan Funeral UGOC AI V4.3','grace',  'paused',  1)
) AS v(name, agent, status, speed)
WHERE NOT EXISTS (SELECT 1 FROM campaigns c WHERE c.name = v.name);

-- 4. Seed: per-campaign aggregate row read by the Campaign Report (/api/reports)
INSERT INTO call_logs (campaign_id, phone_number, status, dialed, connected, qualified, voicemail, no_speech, hangup, ni, dnq, callback, no_answer, busy_line, failed, duration, cpl, total_spent, called_at)
SELECT c.id, agg.phone_number, agg.status, agg.dialed, agg.connected, agg.qualified, agg.voicemail, agg.no_speech, agg.hangup, agg.ni, agg.dnq, agg.callback, agg.no_answer, agg.busy_line, agg.failed, agg.duration::interval, agg.cpl, agg.total_spent, NOW()
FROM (VALUES
    ('1Life BMI AI V4.2',                '+27 82 123 4567','connected',117728,17853,43,30568,10668,14137,188, 170,62, 36189, 11052,14545,'101:03:03', 35.96, 1546.08),
    ('1Life Funeral BMI AI V4.3',        '+27 71 987 6543','voicemail',117190,18223,59,30528,10778,10666,209, 144,64, 35907, 11230,13741,'102:37:16', 26.61, 1570.10),
    ('3Way Miway STI AI NEW',            '+27 63 456 7890','no_answer',112004,21020,32,29420,8928, 17612,302, 79, 119,27639, 8644, 19141,'124:14:20', 59.40, 1900.86),
    ('Miway STI UGOC AI V4.3 Male',      '+27 83 321 0987','connected',348886,64408,48,63267,38064,47766,405, 113,112,121703,44834,32335,'298:42:55', 95.22, 4570.34),
    ('Ivyze STI Old Mutual Vantage Male','+27 72 654 3210','connected',242162,41806,30,71316,17844,36020,2189,291,680,53673, 21409,38568,'254:43:36', 129.91,3897.32),
    ('Metropolitan Funeral UGOC AI V4.3','+27 61 789 0123','hangup',   121468,19418,66,28875,11360,15473,330, 125,101,39271, 12428,13359,'132:16:42', 30.66, 2023.86)
) AS agg(name, phone_number, status, dialed, connected, qualified, voicemail, no_speech, hangup, ni, dnq, callback, no_answer, busy_line, failed, duration, cpl, total_spent)
JOIN campaigns c ON c.name = agg.name
WHERE NOT EXISTS (SELECT 1 FROM call_logs cl WHERE cl.campaign_id = c.id);

-- 5. Seed: ~60 realistic calls per campaign (per-campaign backfill; existing data untouched)
INSERT INTO call_records (campaign_id, phone, outcome, talk_seconds, cost, transferred, recording_url, called_at)
SELECT
    c.id,
    '+27 ' || (60 + floor(random()*30))::int || ' '
            || lpad(floor(random()*1000)::text, 3, '0') || ' '
            || lpad(floor(random()*10000)::text, 4, '0'),
    oc.outcome,
    tk.talk,
    round((tk.talk * 0.15 + 0.50)::numeric, 2),
    (oc.outcome = 'qualified' AND random() < 0.6),
    CASE WHEN tk.talk > 0 THEN 'https://recordings.local/' || c.id || '/' || gs || '.mp3' ELSE NULL END,
    NOW() - (random() * interval '14 days')
FROM campaigns c
CROSS JOIN generate_series(1, 60) AS gs
CROSS JOIN LATERAL (SELECT random() AS r) rnd
CROSS JOIN LATERAL (
    SELECT CASE
        WHEN rnd.r < 0.02 THEN 'qualified'
        WHEN rnd.r < 0.20 THEN 'connected'
        WHEN rnd.r < 0.45 THEN 'voicemail'
        WHEN rnd.r < 0.55 THEN 'no_speech'
        WHEN rnd.r < 0.68 THEN 'hangup'
        WHEN rnd.r < 0.72 THEN 'callback'
        WHEN rnd.r < 0.74 THEN 'ni'
        WHEN rnd.r < 0.76 THEN 'dnq'
        WHEN rnd.r < 0.88 THEN 'no_answer'
        WHEN rnd.r < 0.94 THEN 'busy'
        ELSE 'failed'
    END AS outcome
) oc
CROSS JOIN LATERAL (
    SELECT CASE oc.outcome
        WHEN 'qualified' THEN 120 + floor(random()*240)::int
        WHEN 'connected' THEN  30 + floor(random()*180)::int
        WHEN 'callback'  THEN  20 + floor(random()*60)::int
        WHEN 'voicemail' THEN   5 + floor(random()*25)::int
        WHEN 'no_speech' THEN   3 + floor(random()*12)::int
        WHEN 'ni'        THEN  10 + floor(random()*40)::int
        WHEN 'dnq'       THEN  10 + floor(random()*30)::int
        WHEN 'hangup'    THEN   1 + floor(random()*8)::int
        ELSE 0
    END AS talk
) tk
WHERE NOT EXISTS (SELECT 1 FROM call_records cr WHERE cr.campaign_id = c.id);

-- 6. Seed: per-intent daily counts for the last 14 days (per-campaign backfill)
INSERT INTO intent_stats (campaign_id, day, intent_name, step, reached)
SELECT
    c.id,
    (CURRENT_DATE - d)::date,
    i.intent_name,
    i.step::int,
    GREATEST(0, floor((1500.0 / i.step) * (0.5 + random())))::int
FROM campaigns c
CROSS JOIN generate_series(0, 13) AS d
CROSS JOIN (
    SELECT name AS intent_name, row_number() OVER () AS step
    FROM unnest(ARRAY[
        'Greeting','Hello','Intro','CallPositioning','AlreadyCoveredHandling',
        'CanIContinue','CallbackHandling','CallbackGoodbye','DidNotQualify','FallbackGoodbye',
        'NotInterestedHandling','NotInterestedGoodbye','UnemployedGoodbye','PopiInfo','WhoYou',
        'QuesRSA','QuesAge','QuesSalary','FinalContinue','QualifiedGoodbye'
    ]) AS name
) i
WHERE NOT EXISTS (SELECT 1 FROM intent_stats s WHERE s.campaign_id = c.id)
ON CONFLICT (campaign_id, day, intent_name) DO NOTHING;
