import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsGet, callopsPatch, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

// Single SIP trunk detail/update via CallOps `/sip-trunks/{id}` (bearer).
// Credentials are never returned by CallOps; PATCH forwards only supplied fields.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { token } = await getAccessToken()
  if (!token) return unauthorized()
  try {
    const res = await callopsGet(`/sip-trunks/${id}`, token)
    return NextResponse.json(res ?? {})
  } catch (e) {
    return callopsErrorResponse(e)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { token } = await getAccessToken()
  if (!token) return unauthorized()
  const body = await req.json().catch(() => ({}))
  try {
    const res = await callopsPatch(`/sip-trunks/${id}`, token, body)
    return NextResponse.json(res ?? {})
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
