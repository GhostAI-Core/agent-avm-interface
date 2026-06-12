-- Private Supabase Storage bucket for campaign voice recordings (MP4/MP3/WAV).
-- The browser uploads as an authenticated user; the dial route mints a short-lived
-- signed URL (service role) at call time. Idempotent.

-- 1. Private bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-recordings', 'voice-recordings', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Object policies — authenticated users manage objects in this bucket only.
DROP POLICY IF EXISTS "voice_auth_insert" ON storage.objects;
CREATE POLICY "voice_auth_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'voice-recordings');

DROP POLICY IF EXISTS "voice_auth_select" ON storage.objects;
CREATE POLICY "voice_auth_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'voice-recordings');

DROP POLICY IF EXISTS "voice_auth_update" ON storage.objects;
CREATE POLICY "voice_auth_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'voice-recordings');

-- 3. Campaign points at the stored object (signed at dial time). voice_recording_url
--    stays for any external URL fallback.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS voice_path TEXT;
COMMENT ON COLUMN campaigns.voice_path IS 'Object key in the private voice-recordings bucket; signed at dial time';
