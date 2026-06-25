-- Voice script library — persist the TEXT of generated TTS scripts.
--
-- Today the voice generator throws the script text away after producing audio (only the .mp3 is
-- saved to S3). This table keeps the source text + the voice it was generated with + the public
-- audio URL, so the generator can offer previously-used scripts as reusable, playable bubbles:
-- click to listen, click to load the text (and its voice) back into the editor.
--
-- This is dashboard authoring content (the create-campaign flow), NOT callops control/consent
-- state — so it lives here and the dashboard owns it. Existing audio-only scripts have no row here;
-- only scripts saved after this migration get an editable text entry.
CREATE TABLE IF NOT EXISTS voice_scripts (
  id            BIGSERIAL PRIMARY KEY,
  text          TEXT NOT NULL,
  voice_id      TEXT,                          -- inworld voiceId used to generate the audio
  audio_url     TEXT,                          -- public S3 URL of the saved clip (null if not saved)
  campaign_name TEXT,                          -- campaign it was first saved under (label only)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_voice_scripts_created_at ON voice_scripts (created_at DESC);

-- RLS: match the existing authenticated-all posture (tighten in feat/tenant-rls).
ALTER TABLE voice_scripts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "auth_all_voice_scripts" ON voice_scripts FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
