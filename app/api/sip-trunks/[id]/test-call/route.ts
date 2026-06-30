import { NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsPost, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

// Place a test call via CallOps `POST /sip-trunks/{id}/test-call`.
// A failed *call* still returns HTTP 200 with `ok:false` — pass that through so the
// UI shows it as a failed call, not a crash.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { token } = await getAccessToken()
  if (!token) return unauthorized()
  const body = await req.json().catch(() => ({}))
  if (!body?.phone) return NextResponse.json({ error: 'phone required' }, { status: 400 })
  try {
    const res = await callopsPost(`/sip-trunks/${id}/test-call`, token, body)
    return NextResponse.json(res ?? {})
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
