import { NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsGet, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

// Telephony narrative for a call (AMD category, SIP, DTMF/matched-key, playback,
// disconnect reason, transfer target, talk_seconds). Live split endpoint — NOT the
// stale combined `/calls/telemetry` webhook. A missing report passes 404 through.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { token } = await getAccessToken()
  if (!token) return unauthorized()
  try {
    const res = await callopsGet(`/calls/${id}/call-report`, token)
    return NextResponse.json(res ?? {})
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
