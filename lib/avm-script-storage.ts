import 'server-only'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

let s3Client: S3Client | null = null

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

/** S3 API endpoint — derived from Supabase project URL when not set explicitly. */
export function getScriptStorageS3Endpoint(): string {
  const explicit = process.env.AVM_SCRIPT_AUDIO_STORAGE_S3_ENDPOINT?.trim()
  if (explicit) return explicit.replace(/\/$/, '')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required for S3 uploads')

  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
  return `https://${projectRef}.storage.supabase.co/storage/v1/s3`
}

export function isScriptStorageConfigured(): boolean {
  return Boolean(
    process.env.AVM_SCRIPT_AUDIO_STORAGE_BUCKET?.trim() &&
    process.env.AVM_SCRIPT_AUDIO_STORAGE_REGION?.trim() &&
    process.env.AVM_SCRIPT_AUDIO_STORAGE_ACCESS_KEY?.trim() &&
    process.env.AVM_SCRIPT_AUDIO_STORAGE_SECRET?.trim() &&
    process.env.AVM_SCRIPT_AUDIO_STORAGE_ENDPOINT?.trim(),
  )
}

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      forcePathStyle: true,
      region: requiredEnv('AVM_SCRIPT_AUDIO_STORAGE_REGION'),
      endpoint: getScriptStorageS3Endpoint(),
      credentials: {
        accessKeyId: requiredEnv('AVM_SCRIPT_AUDIO_STORAGE_ACCESS_KEY'),
        secretAccessKey: requiredEnv('AVM_SCRIPT_AUDIO_STORAGE_SECRET'),
      },
    })
  }
  return s3Client
}

export function slugifyCampaignName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'campaign'
}

function formatDateStamp(date = new Date()): string {
  return date.toLocaleDateString('en-GB').replace(/\//g, '-')
}

/** Object key in the avm-scripts bucket, e.g. script-my-campaign-17-06-2026.mp3 */
export function buildCampaignScriptKey(campaignName: string, date = new Date()): string {
  const prefix = process.env.AVM_SCRIPT_AUDIO_STORAGE_PREFIX ?? 'script-'
  return `${prefix}${slugifyCampaignName(campaignName)}-${formatDateStamp(date)}.mp3`
}

/** Public URL for a stored object (browser / dial playback). */
export function publicScriptUrl(storageKey: string): string {
  const base = requiredEnv('AVM_SCRIPT_AUDIO_STORAGE_ENDPOINT').replace(/\/$/, '')
  return `${base}/${storageKey}`
}

export async function uploadCampaignScript(
  campaignName: string,
  audio: Buffer,
  contentType = 'audio/mpeg',
): Promise<{ storageKey: string; publicUrl: string }> {
  if (!isScriptStorageConfigured()) {
    throw new Error('Script audio storage is not configured')
  }

  const bucket = requiredEnv('AVM_SCRIPT_AUDIO_STORAGE_BUCKET')
  const storageKey = buildCampaignScriptKey(campaignName)

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: audio,
      ContentType: contentType,
    }),
  )

  return { storageKey, publicUrl: publicScriptUrl(storageKey) }
}
