import { NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsGet, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

// Trunk health via CallOps `GET /sip-trunks/{id}/health` → {live, status, ...}.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { token } = await getAccessToken()
  if (!token) return unauthorized()
  try {
    const res = await callopsGet(`/sip-trunks/${id}/health`, token)
    return NextResponse.json(res ?? {})
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
