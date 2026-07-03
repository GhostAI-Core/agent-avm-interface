import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

// Contacts for a campaign, read from Supabase `contacts` (the rows CallOps writes) with an
// EXACT count. Previously proxied CallOps `/campaigns/{id}/contacts`, which caps `page_size`
// at 50 and (when it returns no `total`) left the dashboard computing total=50 → totalPages=1
// → the Next button disabled → stuck at the first 50 numbers regardless of filter. Reading
// Supabase directly gives the true total so the whole campaign is reachable (consistent with
// /api/logs + /api/reports).

const COLS = 'id, campaign_id, phone, first_name, last_name, status, created_at, retry_count, ' +
  'last_attempted_at, person_id, timezone, score, do_not_call, network_provider'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user } = await getAuthUser()
  if (!user) return unauthorized()
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'server not configured' }, { status: 503 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const network = searchParams.get('network')  // Vodacom | MTN | Cell C — filters the visible list
  const search = (searchParams.get('search') || searchParams.get('phone') || '').trim()
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const pageSize = Math.min(500, Math.max(1, Number(searchParams.get('page_size')) || 100))
  const from = (page - 1) * pageSize

  const campaignId = Number(id)
  let q = admin.from('contacts').select(COLS, { count: 'exact' }).eq('campaign_id', campaignId)
  if (status) q = q.eq('status', status)
  if (network) q = q.eq('network_provider', network)
  if (search) {
    const s = search.replace(/[%,]/g, '') // guard PostgREST or-filter syntax
    q = q.or(`phone.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%`)
  }
  q = q.order('created_at', { ascending: true, nullsFirst: false }).range(from, from + pageSize - 1)

  // Network breakdown over the WHOLE campaign (independent of the status/search/network filters),
  // so an operator sees the mix before dialing / before setting the network gate.
  const countFor = (net: string | null) => {
    let c = admin.from('contacts').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId)
    c = net === null ? c.is('network_provider', null) : c.eq('network_provider', net)
    return c.then(({ count }) => count ?? 0)
  }

  const [{ data, error, count }, mtn, vodacom, cellc, unknown] = await Promise.all([
    q, countFor('MTN'), countFor('Vodacom'), countFor('Cell C'), countFor(null),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    items: data ?? [],
    page,
    page_size: pageSize,
    total: count ?? 0,
    breakdown: { MTN: mtn, Vodacom: vodacom, 'Cell C': cellc, unknown },
  })
}
