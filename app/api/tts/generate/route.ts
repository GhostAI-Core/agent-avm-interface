import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'
import { isValidVoiceId } from '@/lib/inworld-voices'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const INWORLD_TTS_URL = 'https://api.inworld.ai/tts/v1/voice'
const MAX_SCRIPT_LENGTH = 2000

export async function POST(req: Request) {
  const { user } = await getAuthUser()
  if (!user) return unauthorized()

  const apiKey = process.env.INWORLD_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json({ error: 'TTS is not configured' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const text = typeof (body as { text?: unknown }).text === 'string'
    ? (body as { text: string }).text.trim()
    : ''
  const voiceId = typeof (body as { voiceId?: unknown }).voiceId === 'string'
    ? (body as { voiceId: string }).voiceId
    : ''

  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }
  if (!voiceId) {
    return NextResponse.json({ error: 'voiceId is required' }, { status: 400 })
  }
  if (text.length > MAX_SCRIPT_LENGTH) {
    return NextResponse.json(
      { error: `text must be at most ${MAX_SCRIPT_LENGTH} characters` },
      { status: 400 },
    )
  }
  if (!isValidVoiceId(voiceId)) {
    return NextResponse.json({ error: 'invalid voiceId' }, { status: 400 })
  }

  let inworldRes: Response
  try {
    inworldRes = await fetch(INWORLD_TTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voiceId,
        modelId: 'inworld-tts-1.5-max',
        timestampType: 'WORD',
        audioConfig: { speakingRate: 1.2 },
        temperature: 1.4,
      }),
    })
  } catch (err) {
    console.error('Inworld TTS request failed:', err)
    return NextResponse.json({ error: 'TTS generation failed' }, { status: 502 })
  }

  if (!inworldRes.ok) {
    console.error('Inworld TTS error:', inworldRes.status)
    return NextResponse.json({ error: 'TTS generation failed' }, { status: 502 })
  }

  let data: { audioContent?: string }
  try {
    data = await inworldRes.json()
  } catch {
    return NextResponse.json({ error: 'TTS generation failed' }, { status: 502 })
  }

  if (!data.audioContent) {
    return NextResponse.json({ error: 'TTS generation failed' }, { status: 502 })
  }

  return NextResponse.json({
    audioBase64: data.audioContent,
    contentType: 'audio/mpeg',
  })
}
