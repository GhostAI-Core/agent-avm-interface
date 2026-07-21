import { NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsGet, callopsPost, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type LibraryScript = {
  id: number
  text: string
  voice_id: string | null
  audio_url: string | null
  campaign_name: string | null
  created_at: string
}

/**
 * List previously-saved scripts (text + voice + audio URL), newest first — feeds the voice
 * generator's "reuse a previous script" bubbles. Global across companies (deliberate product
 * decision, mirrors legacy behavior). Proxies callops GET /script-library.
 */
export async function GET() {
  const { token } = await getAccessToken()
  if (!token) return unauthorized()

  try {
    const data = await callopsGet<{ items: LibraryScript[] }>('/script-library?page_size=50', token)
    return NextResponse.json({ scripts: data.items ?? [] })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}

/**
 * Save a script's text (+ voice + audio URL) to the reuse library. Proxies callops
 * POST /script-library. Called after audio has already been uploaded elsewhere (see
 * /api/tts/save) — this call only persists the metadata needed for reuse bubbles.
 */
export async function POST(req: Request) {
  const { token } = await getAccessToken()
  if (!token) return unauthorized()

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })

  try {
    const data = await callopsPost<{ script: LibraryScript }>('/script-library', token, {
      text,
      voice_id: typeof body.voice_id === 'string' ? body.voice_id : undefined,
      audio_url: typeof body.audio_url === 'string' ? body.audio_url : undefined,
      campaign_name: typeof body.campaign_name === 'string' ? body.campaign_name : undefined,
    })
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
