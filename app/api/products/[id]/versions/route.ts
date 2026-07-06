import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsItems, callopsPost, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

// A product's script version history via CallOps `/products/{id}/versions` (bearer).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { token } = await getAccessToken()
  if (!token) return unauthorized()
  try {
    const items = await callopsItems(`/products/${id}/versions`, token)
    return NextResponse.json({ versions: items })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { token } = await getAccessToken()
  if (!token) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const { text, voice_id, audio_url, duration_seconds, set_current } = body
  try {
    const data = await callopsPost(`/products/${id}/versions`, token, {
      text: text ?? undefined,
      voice_id: voice_id ?? undefined,
      audio_url: audio_url ?? undefined,
      duration_seconds: duration_seconds ?? undefined,
      set_current: typeof set_current === 'boolean' ? set_current : true,
    })
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
