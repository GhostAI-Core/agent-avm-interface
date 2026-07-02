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
  const search = (searchParams.get('search') || searchParams.get('phone') || '').trim()
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const pageSize = Math.min(500, Math.max(1, Number(searchParams.get('page_size')) || 100))
  const from = (page - 1) * pageSize

  let q = admin.from('contacts').select(COLS, { count: 'exact' }).eq('campaign_id', Number(id))
  if (status) q = q.eq('status', status)
  if (search) {
    const s = search.replace(/[%,]/g, '') // guard PostgREST or-filter syntax
    q = q.or(`phone.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%`)
  }
  q = q.order('created_at', { ascending: true, nullsFirst: false }).range(from, from + pageSize - 1)

  const { data, error, count } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ items: data ?? [], page, page_size: pageSize, total: count ?? 0 })
}
