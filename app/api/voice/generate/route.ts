import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Inworld TTS → MP3 → saved to the private voice-recordings bucket.
// The API key stays server-side (never sent to the browser).
const INWORLD_URL = 'https://api.inworld.ai/tts/v1/voice'
const DEFAULT_VOICE = process.env.INWORLD_TTS_VOICE_ID || 'default-hzau9tlenfqr0yc2k7co6g__charlotte'
const MODEL = process.env.INWORLD_TTS_MODEL || 'inworld-tts-1.5-max'
const VOICE_BUCKET = 'voice-recordings'
const MAX_CHARS = 2000 // Inworld hard limit

export async function POST(req: Request) {
  const { supabase, user } = await getAuthUser()
  if (!user) return unauthorized()

  const key = process.env.INWORLD_API_KEY
  if (!key) {
    return NextResponse.json({ error: 'Inworld is not configured (INWORLD_API_KEY missing).' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  const script = String(body.script ?? '').trim()
  const voiceId = String(body.voiceId ?? '').trim() || DEFAULT_VOICE
  if (!script) return NextResponse.json({ error: 'Script is required.' }, { status: 400 })
  if (script.length > MAX_CHARS) {
    return NextResponse.json({ error: `Script is too long (max ${MAX_CHARS} characters).` }, { status: 400 })
  }

  // 1. Synthesize → base64 MP3
  let audioContent: string | undefined
  try {
    const res = await fetch(INWORLD_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: script,
        voiceId,
        modelId: MODEL,
        audioConfig: { audioEncoding: 'MP3', speakingRate: 1.2 },
        temperature: 1.4,
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return NextResponse.json({ error: `Inworld error (${res.status}): ${detail.slice(0, 300)}` }, { status: 502 })
    }
    const json = await res.json()
    audioContent = json?.audioContent
    if (!audioContent) return NextResponse.json({ error: 'Inworld returned no audio.' }, { status: 502 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Failed to reach Inworld: ${msg}` }, { status: 502 })
  }

  // 2. Upload to the private bucket as the authenticated user (same path the browser
  //    upload uses; RLS-governed, so no service-role key required).
  const audio = Buffer.from(audioContent, 'base64')
  const path = `${crypto.randomUUID()}.mp3`
  const { error: upErr } = await supabase.storage
    .from(VOICE_BUCKET)
    .upload(path, audio, { contentType: 'audio/mpeg', upsert: false })
  if (upErr) return NextResponse.json({ error: `Could not save audio: ${upErr.message}` }, { status: 500 })

  // 3. Sign for in-modal preview (best-effort — the campaign only needs the path).
  const { data: signed } = await supabase.storage.from(VOICE_BUCKET).createSignedUrl(path, 60 * 60)
  return NextResponse.json({ voice_path: path, signedUrl: signed?.signedUrl ?? null })
}
