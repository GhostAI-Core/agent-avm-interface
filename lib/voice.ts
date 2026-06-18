import 'server-only'
import { createAdminClient } from '@/utils/supabase/admin'

const VOICE_BUCKET = 'voice-recordings'
const SIGNED_TTL_SECONDS = 60 * 60 // 1 hour — comfortably longer than a call

/** Sign a private voice-recordings storage key into a short-lived playable URL. */
async function signStorageKey(key: string): Promise<string | null> {
  const admin = createAdminClient()
  if (!admin) {
    console.warn('resolveVoiceUrl: SUPABASE_SERVICE_ROLE_KEY not set; cannot sign storage key')
    return null
  }
  const { data, error } = await admin.storage.from(VOICE_BUCKET).createSignedUrl(key, SIGNED_TTL_SECONDS)
  if (error) { console.error('createSignedUrl failed for', key, error.message); return null }
  return data?.signedUrl ?? null
}

/**
 * Resolve a playable URL for a campaign's script audio (issue #31: unified `audio_path`).
 * Order: `audio_path` (a public URL → as-is, or a storage key → signed) → legacy `voice_path`
 * (signed) → legacy `voice_recording_url` (as-is). Returns null when there's nothing to play.
 */
export async function resolveVoiceUrl(
  campaign: { audio_path?: string | null; voice_path?: string | null; voice_recording_url?: string | null },
): Promise<string | null> {
  if (campaign.audio_path) {
    return /^https?:\/\//i.test(campaign.audio_path)
      ? campaign.audio_path                       // public URL (AI-generated → S3)
      : await signStorageKey(campaign.audio_path) // private storage key (manual upload)
  }
  if (campaign.voice_path) return await signStorageKey(campaign.voice_path)
  return campaign.voice_recording_url || null
}
