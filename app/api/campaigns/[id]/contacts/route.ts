import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsGet, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

// Contacts for a campaign, sourced from CallOps (which owns contacts.campaign_id,
// E.164 normalisation, and per-campaign status). The dashboard never reads the
// Supabase `contacts` table directly. Pass through status/search/pagination.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { token } = await getAccessToken()
  if (!token) return unauthorized()

  const { searchParams } = new URL(req.url)
  const qs = new URLSearchParams()
  for (const key of ['status', 'search', 'phone', 'page', 'page_size', 'sort']) {
    const v = searchParams.get(key)
    if (v) qs.set(key, v)
  }
  const query = qs.toString()

  try {
    const res = await callopsGet<{ items?: unknown[]; page?: number; page_size?: number; total?: number }>(
      `/campaigns/${id}/contacts${query ? `?${query}` : ''}`,
      token,
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
