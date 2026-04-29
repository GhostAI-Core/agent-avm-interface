-- Agent AVM — Supabase (PostgreSQL) schema
-- Run this in the Supabase SQL editor for your project

CREATE TABLE IF NOT EXISTS voip_providers (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50)  NOT NULL,
    api_key     VARCHAR(255),
    api_secret  VARCHAR(255),
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(100) NOT NULL,
    agent               VARCHAR(20)  NOT NULL CHECK (agent IN ('seeker','grace','sangoma')),
    status              VARCHAR(20)  NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','paused','completed','deleted')),
    dialing_speed       INT          DEFAULT 1,
    time_window_start   TIME,
    time_window_end     TIME,
    voice_recording_url TEXT,
    created_at          TIMESTAMPTZ  DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS campaigns_updated_at ON campaigns;
CREATE TRIGGER campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TABLE IF NOT EXISTS call_logs (
    id          SERIAL PRIMARY KEY,
    campaign_id INT REFERENCES campaigns(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    status      VARCHAR(20)  DEFAULT 'pending' CHECK (status IN ('pending','connected','qualified','voicemail','no_speech','hangup','ni','dnq','callback','no_answer','busy','failed')),
    -- Disposition counters (aggregated row per campaign batch)
    dialed      INT          DEFAULT 0,
    connected   INT          DEFAULT 0,
    qualified   INT          DEFAULT 0,
    voicemail   INT          DEFAULT 0,
    no_speech   INT          DEFAULT 0,
    hangup      INT          DEFAULT 0,
    ni          INT          DEFAULT 0,
    dnq         INT          DEFAULT 0,
    callback    INT          DEFAULT 0,
    no_answer   INT          DEFAULT 0,
    busy_line   INT          DEFAULT 0,
    failed      INT          DEFAULT 0,
    duration    INTERVAL     DEFAULT '0 seconds',
    cpl         NUMERIC(10,2) DEFAULT 0.00,
    total_spent NUMERIC(10,2) DEFAULT 0.00,
    called_at   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Enable Row Level Security (adjust policies for your auth setup)
ALTER TABLE campaigns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs  ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access (tighten per role as needed)
CREATE POLICY "auth_all_campaigns" ON campaigns  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_call_logs" ON call_logs  FOR ALL TO authenticated USING (true) WITH CHECK (true);
