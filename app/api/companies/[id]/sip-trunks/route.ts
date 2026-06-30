import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsGet, callopsPost, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

// SIP trunks for a company, via CallOps `/companies/{id}/sip-trunks` (bearer).
// CallOps owns the table + credentials; auth_password is never returned.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { token } = await getAccessToken()
  if (!token) return unauthorized()

  const { searchParams } = new URL(req.url)
  const qs = new URLSearchParams()
  for (const k of ['page', 'page_size', 'sort', 'search']) {
    const v = searchParams.get(k); if (v) qs.set(k, v)
  }
  const q = qs.toString()
  try {
    const res = await callopsGet<{ items?: unknown[]; page?: number; page_size?: number; total?: number }>(
      `/companies/${id}/sip-trunks${q ? `?${q}` : ''}`, token,
    )
    return NextResponse.json({
      items: res.items ?? [],
      page: res.page ?? 1,
      page_size: res.page_size ?? (res.items?.length ?? 0),
      total: res.total ?? (res.items?.length ?? 0),
    })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { token } = await getAccessToken()
  if (!token) return unauthorized()
  const body = await req.json().catch(() => ({}))
  try {
    const res = await callopsPost(`/companies/${id}/sip-trunks`, token, body)
    return NextResponse.json(res ?? {}, { status: 201 })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
