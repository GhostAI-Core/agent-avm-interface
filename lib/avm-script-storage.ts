import 'server-only'
import { createAdminClient } from '@/utils/supabase/admin'

export function isScriptStorageConfigured(): boolean {
  return Boolean(
    process.env.AVM_SCRIPT_AUDIO_STORAGE_BUCKET &&
    process.env.AVM_SCRIPT_AUDIO_STORAGE_ENDPOINT,
  )
}

export function slugifyCampaignName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'campaign'
}

/** Object key in the avm-scripts bucket, e.g. script-my-campaign.mp3 */
export function buildCampaignScriptKey(campaignName: string): string {
  const prefix = process.env.AVM_SCRIPT_AUDIO_STORAGE_PREFIX ?? 'script-'
  return `${prefix}${slugifyCampaignName(campaignName)}.mp3`
}

export function publicScriptUrl(storageKey: string): string {
  const base = process.env.AVM_SCRIPT_AUDIO_STORAGE_ENDPOINT!.replace(/\/$/, '')
  return `${base}/${storageKey}`
}

export async function uploadCampaignScript(
  campaignName: string,
  audio: Buffer,
  contentType = 'audio/mpeg',
): Promise<{ storageKey: string; publicUrl: string }> {
  const bucket = process.env.AVM_SCRIPT_AUDIO_STORAGE_BUCKET
  if (!bucket || !process.env.AVM_SCRIPT_AUDIO_STORAGE_ENDPOINT) {
    throw new Error('Script audio storage is not configured')
  }

  const admin = createAdminClient()
  if (!admin) throw new Error('Script audio storage is not configured')

  const storageKey = buildCampaignScriptKey(campaignName)
  const { error } = await admin.storage
    .from(bucket)
    .upload(storageKey, audio, { contentType, upsert: true })

  if (error) throw new Error(error.message)

  return { storageKey, publicUrl: publicScriptUrl(storageKey) }
}
