import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsGet, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

// Contacts for a campaign, proxied from CallOps `GET /campaigns/{id}/contacts` +
// `GET /campaigns/{id}/contacts/network-breakdown` (CallOps 0.3.0). This previously read
// Supabase directly because CallOps' `total` was unreliable and there was no dedicated
// breakdown endpoint (both fixed in 0.3.0 — real `count="exact"` total, page_size up to 200).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { token } = await getAccessToken()
  if (!token) return unauthorized()

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const network = searchParams.get('network')  // Vodacom | MTN | Cell C — filters the visible list
  const search = (searchParams.get('search') || searchParams.get('phone') || '').trim()
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('page_size')) || 100))

  const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  if (status) qs.set('status', status)
  if (network) qs.set('network_provider', network)
  if (search) qs.set('search', search)

  try {
    const [list, breakdownRes] = await Promise.all([
      callopsGet<{ items?: Record<string, unknown>[]; total?: number }>(
        `/campaigns/${id}/contacts?${qs}`, token,
      ),
      // Breakdown is over the WHOLE campaign (independent of the status/search/network filters
      // above), so an operator sees the mix before dialing / before setting the network gate.
      // Tolerate this one failing — the contact list is still useful without it.
      callopsGet<{ breakdown?: { network_provider: string; count: number }[] }>(
        `/campaigns/${id}/contacts/network-breakdown`, token,
      ).catch(() => ({ breakdown: [] as { network_provider: string; count: number }[] })),
    ])

    const breakdown: Record<string, number> = {}
    for (const row of breakdownRes.breakdown ?? []) breakdown[row.network_provider] = row.count

    return NextResponse.json({
      items: list.items ?? [],
      page,
      page_size: pageSize,
      total: list.total ?? (list.items?.length ?? 0),
      breakdown,
    })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
