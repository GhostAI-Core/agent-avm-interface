import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'
import { isValidVoiceId } from '@/lib/inworld-voices'
import { isScriptStorageConfigured, uploadCampaignScript } from '@/lib/avm-script-storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_AUDIO_BYTES = 50 * 1024 * 1024

export async function POST(req: Request) {
  const { supabase, user } = await getAuthUser()
  if (!user) return unauthorized()

  if (!isScriptStorageConfigured()) {
    return NextResponse.json({ error: 'Script audio storage is not configured' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const campaignName = typeof (body as { campaignName?: unknown }).campaignName === 'string'
    ? (body as { campaignName: string }).campaignName.trim()
    : ''
  const audioBase64 = typeof (body as { audioBase64?: unknown }).audioBase64 === 'string'
    ? (body as { audioBase64: string }).audioBase64
    : ''
  const voiceId = typeof (body as { voiceId?: unknown }).voiceId === 'string'
    ? (body as { voiceId: string }).voiceId
    : undefined
  const text = typeof (body as { text?: unknown }).text === 'string'
    ? (body as { text: string }).text.trim()
    : ''

  if (!campaignName) {
    return NextResponse.json({ error: 'campaignName is required' }, { status: 400 })
  }
  if (!audioBase64) {
    return NextResponse.json({ error: 'audioBase64 is required' }, { status: 400 })
  }
  if (voiceId && !isValidVoiceId(voiceId)) {
    return NextResponse.json({ error: 'invalid voiceId' }, { status: 400 })
  }

  let audio: Buffer
  try {
    audio = Buffer.from(audioBase64, 'base64')
  } catch {
    return NextResponse.json({ error: 'invalid audioBase64' }, { status: 400 })
  }

  if (audio.length === 0) {
    return NextResponse.json({ error: 'audio is empty' }, { status: 400 })
  }
  if (audio.length > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'audio exceeds size limit' }, { status: 400 })
  }

  try {
    const { storageKey, publicUrl } = await uploadCampaignScript(campaignName, audio)

    // Persist the source text so the voice generator can offer this script for reuse later.
    // Best-effort: the audio is already saved, so a library-row failure must not fail the save.
    if (text) {
      const { error: insErr } = await supabase
        .from('voice_scripts')
        .insert({ text, voice_id: voiceId ?? null, audio_url: publicUrl, campaign_name: campaignName })
      if (insErr) console.error('voice_scripts insert failed (audio saved OK):', insErr)
    }

    return NextResponse.json({
      storageKey,
      publicUrl,
      campaignName,
    })
  } catch (err) {
    console.error('uploadCampaignScript failed:', err)
    return NextResponse.json({ error: 'Could not save script audio' }, { status: 500 })
  }
}
