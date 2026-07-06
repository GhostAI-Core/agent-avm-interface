import { NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsGet, callopsPost, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type ScriptAudio = {
  id: number
  campaign_id: number
  audio_url: string
  text: string | null
  voice: string | null
  duration_seconds: number | null
  created_at: string
}

/**
 * Per-campaign script/audio history. Proxies callops GET /script-audio?campaign_id=…
 * Used to reload a campaign's last-saved script text (and the voice it was generated with)
 * when reopening it for editing — script_audio.campaign_id makes this scoped to one campaign,
 * unlike the global reuse library at /api/voice-scripts.
 */
export async function GET(req: Request) {
  const { token } = await getAccessToken()
  if (!token) return unauthorized()

  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaign_id')
  if (!campaignId) return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 })

  try {
    const data = await callopsGet<{ items: ScriptAudio[] }>(
      `/script-audio?campaign_id=${encodeURIComponent(campaignId)}&page_size=1`,
      token,
    )
    return NextResponse.json({ items: data.items ?? [] })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}

/**
 * Records that a script's audio + text was saved against a specific campaign — proxies callops
 * POST /script-audio. Called right after a campaign is created/updated with a newly-generated
 * recording, so there's a real per-campaign script history (separate from the global reuse
 * library).
 */
export async function POST(req: Request) {
  const { token } = await getAccessToken()
  if (!token) return unauthorized()

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const campaign_id = Number(body.campaign_id)
  const audio_url = typeof body.audio_url === 'string' ? body.audio_url : ''
  if (!campaign_id) return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 })
  if (!audio_url) return NextResponse.json({ error: 'audio_url is required' }, { status: 400 })

  try {
    const data = await callopsPost('/script-audio', token, {
      campaign_id,
      audio_url,
      text: typeof body.text === 'string' ? body.text : undefined,
      voice: typeof body.voice === 'string' ? body.voice : undefined,
      duration_seconds: typeof body.duration_seconds === 'number' ? body.duration_seconds : undefined,
    })
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
