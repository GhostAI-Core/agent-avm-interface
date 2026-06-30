import { NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsGet, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

// Signed recording URL from CallOps: GET /calls/{id}/recording → {recording_url, expires_at}.
// 404 (no recording) is passed through so the UI can show an unavailable state cleanly.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { token } = await getAccessToken()
  if (!token) return unauthorized()
  try {
    const res = await callopsGet(`/calls/${id}/recording`, token)
    return NextResponse.json(res ?? {})
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
