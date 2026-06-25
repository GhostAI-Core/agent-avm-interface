-- Campaign-creation fields for issue #31 (Cale).
--   audio_path  — unified pointer to the campaign's script audio. Holds EITHER a public URL
--                 (AI-generated via tts/save → S3) OR a private storage key (manual upload →
--                 voice-recordings bucket). resolveVoiceUrl() handles both forms.
--   start_date / end_date — the campaign's date range (Schedule step).
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS audio_path TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS end_date   DATE;

-- sip_trunk_id (outbound trunk) and agent (= product) already exist on campaigns.
