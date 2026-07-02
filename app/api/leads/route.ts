import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

// Leads = contacts who pressed 1 in a Lead-Gen campaign → call_records.outcome = 'lead'.
// Read from Supabase (the rows CallOps writes) so it's plug-and-play the moment lead-mode ships.
// Empty until then. Optional ?campaignId filter.

type Rec = { phone: string | null; contact_id: number | null; campaign_id: number | null; called_at: string | null; created_at: string | null; talk_seconds: number | null; business_disposition: string | null }

export async function GET(req: NextRequest) {
  const { user } = await getAuthUser()
  if (!user) return unauthorized()
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'server not configured' }, { status: 503 })

  const campaignId = new URL(req.url).searchParams.get('campaignId')
  let q = admin.from('call_records')
    .select('phone, contact_id, campaign_id, called_at, created_at, talk_seconds, business_disposition')
    .eq('outcome', 'lead').order('called_at', { ascending: false, nullsFirst: false }).limit(5000)
  if (campaignId) q = q.eq('campaign_id', Number(campaignId))
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const recs = (data ?? []) as Rec[]

  // Names (contacts) + campaign labels, fetched once and mapped.
  const [{ data: camps }, { data: contacts }] = await Promise.all([
    admin.from('campaigns').select('id, name'),
    recs.length ? admin.from('contacts').select('id, first_name, last_name').in('id', recs.map(r => r.contact_id).filter((v): v is number => v != null))
      : Promise.resolve({ data: [] as { id: number; first_name: string | null; last_name: string | null }[] }),
  ])
  const campName = new Map((camps ?? []).map((c: { id: number; name: string | null }) => [c.id, c.name]))
  const name = new Map((contacts ?? []).map((c: { id: number; first_name: string | null; last_name: string | null }) => [c.id, [c.first_name, c.last_name].filter(Boolean).join(' ')]))

  const leads = recs.map(r => ({
    phone: r.phone,
    name: (r.contact_id != null ? name.get(r.contact_id) : '') || '',
    campaign_id: r.campaign_id,
    campaign: (r.campaign_id != null ? campName.get(r.campaign_id) : '') || '—',
    at: r.called_at ?? r.created_at,
    talk_seconds: r.talk_seconds ?? 0,
    disposition: r.business_disposition ?? null,
  }))
  return NextResponse.json({ leads, total: leads.length })
}
