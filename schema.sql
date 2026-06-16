-- Agent AVM — Supabase (PostgreSQL) schema
-- Run this in the Supabase SQL editor for your project
-- This script is idempotent (safe to run multiple times)

-- 1. Tables
CREATE TABLE IF NOT EXISTS voip_providers (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50)  NOT NULL,
    api_key     VARCHAR(255),
    api_secret  VARCHAR(255),
    slug        VARCHAR(32)  NOT NULL DEFAULT '',
    provider_type VARCHAR(20) NOT NULL DEFAULT 'twilio'
        CHECK (provider_type IN ('twilio', 'telnyx', 'sangoma', 'utility_connect')),
    sip_host    VARCHAR(255),
    sip_port    INT          NOT NULL DEFAULT 5060,
    sip_username VARCHAR(60),
    sip_password VARCHAR(255),
    send_register BOOLEAN    NOT NULL DEFAULT false,
    routr_trunk_ref VARCHAR(64),
    routr_credentials_ref VARCHAR(64),
    sync_status VARCHAR(20)  NOT NULL DEFAULT 'pending'
        CHECK (sync_status IN ('pending', 'synced', 'error')),
    sync_error  TEXT,
    last_synced_at TIMESTAMPTZ,
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
    transfer_key        VARCHAR(10),
    transfer_target     VARCHAR(100),
    created_at          TIMESTAMPTZ  DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS call_logs (
    id          SERIAL PRIMARY KEY,
    campaign_id INT REFERENCES campaigns(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    status      VARCHAR(20)  DEFAULT 'pending' CHECK (status IN ('pending','connected','qualified','voicemail','no_speech','hangup','ni','dnq','callback','no_answer','busy','failed')),
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

CREATE TABLE IF NOT EXISTS contacts (
    id          SERIAL PRIMARY KEY,
    campaign_id INT REFERENCES campaigns(id) ON DELETE CASCADE,
    phone       VARCHAR(20) NOT NULL,
    first_name  VARCHAR(100),
    last_name   VARCHAR(100),
    status      VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'dialed', 'failed')),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type  TEXT NOT NULL,
    agent_name  TEXT,
    ip_address  TEXT,
    details     TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_settings (
    id              TEXT PRIMARY KEY,
    whitelisted_ips TEXT[],
    environment     TEXT DEFAULT 'staging',
    config          JSONB,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name       TEXT,
    role            TEXT DEFAULT 'engineer' CHECK (role IN ('admin', 'engineer')),
    face_signature  TEXT,
    passkey_credential JSONB, -- Stores the WebAuthn public key & credential ID
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS campaigns_updated_at ON campaigns;
CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- 3. Seed
INSERT INTO system_settings (id, whitelisted_ips, environment) 
VALUES ('global_config', ARRAY['127.0.0.1'], 'staging')
ON CONFLICT (id) DO NOTHING;

-- 4. RLS (Row Level Security)
ALTER TABLE campaigns     ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;

-- 5. Policies (Drop first to avoid collision)
DROP POLICY IF EXISTS "auth_all_campaigns" ON campaigns;
CREATE POLICY "auth_all_campaigns" ON campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_call_logs" ON call_logs;
CREATE POLICY "auth_all_call_logs" ON call_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_contacts" ON contacts;
CREATE POLICY "auth_all_contacts" ON contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_all_security" ON security_logs;
CREATE POLICY "admin_all_security" ON security_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_all_settings" ON system_settings;
CREATE POLICY "admin_all_settings" ON system_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "users_read_own_profile" ON profiles;
CREATE POLICY "users_read_own_profile" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;
CREATE POLICY "users_update_own_profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "admin_all_profiles" ON profiles;
CREATE POLICY "admin_all_profiles" ON profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Auto-create profiles when auth users are provisioned (invite-only)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE assigned_role TEXT;
BEGIN
  assigned_role := COALESCE(NEW.raw_user_meta_data->>'role', 'engineer');
  IF assigned_role NOT IN ('admin', 'engineer') THEN assigned_role := 'engineer'; END IF;
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), assigned_role)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. LiveKit dialer (see supabase/migrations/20260611100000_campaign_gateway.sql et al.)
CREATE TABLE IF NOT EXISTS sip_trunks (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(100) NOT NULL,
    livekit_trunk_id VARCHAR(64)  NOT NULL,
    from_number      VARCHAR(20)  NOT NULL,
    company_id       INT,
    created_at       TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sip_trunk_id VARCHAR(64);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS routing_mode VARCHAR(16) NOT NULL DEFAULT 'legacy'
  CHECK (routing_mode IN ('legacy', 'routr'));
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS agent_name   VARCHAR(64);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS voice_path   TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_retries INT NOT NULL DEFAULT 2;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS retry_cooldown_seconds INT NOT NULL DEFAULT 3600;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_concurrent INT NOT NULL DEFAULT 10;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS auto_paused BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ;

ALTER TABLE sip_trunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_sip_trunks" ON sip_trunks;
CREATE POLICY "auth_all_sip_trunks" ON sip_trunks FOR ALL TO authenticated USING (true) WITH CHECK (true);
