import { NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsPost, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

// Archive a trunk via CallOps `POST /sip-trunks/{id}/archive`.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { token } = await getAccessToken()
  if (!token) return unauthorized()
  try {
    const res = await callopsPost(`/sip-trunks/${id}/archive`, token)
    return NextResponse.json(res ?? { status: 'archived' })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
