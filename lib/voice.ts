import 'server-only'
import { createAdminClient } from '@/utils/supabase/admin'

const VOICE_BUCKET = 'voice-recordings'
const SIGNED_TTL_SECONDS = 60 * 60 // 1 hour — comfortably longer than a call

/**
 * Resolve a playable URL for a campaign's voice recording.
 * - `voice_path` set → a short-lived signed URL for the private storage object (service role).
 * - otherwise → any external `voice_recording_url` as-is (back-compat).
 * Returns null when there's nothing to play.
 */
export async function resolveVoiceUrl(
  campaign: { voice_path?: string | null; voice_recording_url?: string | null },
): Promise<string | null> {
  if (campaign.voice_path) {
    const admin = createAdminClient()
    if (admin) {
      const { data, error } = await admin.storage
        .from(VOICE_BUCKET)
        .createSignedUrl(campaign.voice_path, SIGNED_TTL_SECONDS)
      if (!error && data?.signedUrl) return data.signedUrl
      if (error) console.error('createSignedUrl failed for', campaign.voice_path, error.message)
    } else {
      console.warn('resolveVoiceUrl: SUPABASE_SERVICE_ROLE_KEY not set; cannot sign voice_path')
    }
  }
  return campaign.voice_recording_url || null
}
