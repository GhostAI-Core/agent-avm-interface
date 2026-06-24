import 'server-only'
import { ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

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

export interface SavedScript {
  storageKey: string
  publicUrl: string
  name: string
  lastModified: string | null
}

/** List the script audio objects saved in the bucket (issue #31 #6 — the edit dropdown). */
export async function listCampaignScripts(): Promise<SavedScript[]> {
  if (!isScriptStorageConfigured()) return []
  const bucket = requiredEnv('AVM_SCRIPT_AUDIO_STORAGE_BUCKET')
  const prefix = process.env.AVM_SCRIPT_AUDIO_STORAGE_PREFIX ?? 'script-'
  const res = await getS3Client().send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }))
  return (res.Contents ?? [])
    .filter(o => o.Key && o.Key.toLowerCase().endsWith('.mp3'))
    .map(o => ({
      storageKey: o.Key!,
      publicUrl: publicScriptUrl(o.Key!),
      // Friendly label: strip the prefix, the trailing dd-mm-yyyy date, and the extension.
      name: o.Key!.slice(prefix.length).replace(/\.mp3$/i, '').replace(/-\d{2}-\d{2}-\d{4}$/, ''),
      lastModified: o.LastModified ? o.LastModified.toISOString() : null,
    }))
    .sort((a, b) => (b.lastModified ?? '').localeCompare(a.lastModified ?? ''))
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

// ── Per-voice consent response scripts (opt-in / opt-out) ──────────────────────
// Each voice carries two pre-generated response clips played on DTMF after the pitch:
//   opt-in  → press 1 (STS SUBSCRIBE)   opt-out → press 9 (STS OPT OUT)
// They live in the dedicated public `avm_response_scripts` bucket, keyed by voice so a clip is
// generated once per voice and reused across every campaign that picks it. The DTMF result gates
// to STS and writes back to product_consent / suppression_list (see lib/sts/outcomes.ts).

export const RESPONSE_SCRIPT_BUCKET = 'avm_response_scripts'

export type ResponseKind = 'opt-in' | 'opt-out'

/** Slug for a voice id/name — same rules as campaign slugs, falls back to 'voice'. */
export function slugifyVoice(voice: string): string {
  return voice
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'voice'
}

/** Object key for a voice's response clip, e.g. `grace/opt-in.mp3`. */
export function buildVoiceResponseKey(voice: string, kind: ResponseKind): string {
  return `${slugifyVoice(voice)}/${kind}.mp3`
}

/** Public URL for a stored response clip (dial-time playback). */
export function voiceResponseScriptUrl(voice: string, kind: ResponseKind): string {
  const base = requiredEnv('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '')
  return `${base}/storage/v1/object/public/${RESPONSE_SCRIPT_BUCKET}/${buildVoiceResponseKey(voice, kind)}`
}

/** Upload (or overwrite) a voice's opt-in/opt-out response clip. */
export async function uploadVoiceResponseScript(
  voice: string,
  kind: ResponseKind,
  audio: Buffer,
  contentType = 'audio/mpeg',
): Promise<{ storageKey: string; publicUrl: string }> {
  if (!isScriptStorageConfigured()) {
    throw new Error('Script audio storage is not configured')
  }
  const storageKey = buildVoiceResponseKey(voice, kind)

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: RESPONSE_SCRIPT_BUCKET,
      Key: storageKey,
      Body: audio,
      ContentType: contentType,
    }),
  )

  return { storageKey, publicUrl: voiceResponseScriptUrl(voice, kind) }
}
