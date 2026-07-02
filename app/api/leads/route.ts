import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { estimateCallCost } from '@/lib/callCost'

export const dynamic = 'force-dynamic'

// Lead-Gen reporting — every record where the contact pressed 1 at least once:
//  - DOUBLE opt-in → call_records.outcome = 'lead'
//  - SINGLE opt-in (pressed 1, listened, no second press) → business_disposition = 'single_opt_in'
// Read from Supabase (the rows CallOps writes) + join call_sessions for on-air, so the dash has
// the full per-record picture. Empty until lead-mode ships. Optional ?campaignId filter.

type Rec = {
  id: number; phone: string | null; contact_id: number | null; campaign_id: number | null
  called_at: string | null; created_at: string | null; talk_seconds: number | null
  outcome: string | null; business_disposition: string | null; agent_outcome: string | null; cost: number | null
}

export async function GET(req: NextRequest) {
  const { user } = await getAuthUser()
  if (!user) return unauthorized()
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'server not configured' }, { status: 503 })

  const campaignId = new URL(req.url).searchParams.get('campaignId')
  // Both opt-in tiers: outcome='lead' (double) OR business_disposition='single_opt_in' (single).
  let q = admin.from('call_records')
    .select('id, phone, contact_id, campaign_id, called_at, created_at, talk_seconds, outcome, business_disposition, agent_outcome, cost')
    .or('outcome.eq.lead,business_disposition.eq.single_opt_in')
    .order('called_at', { ascending: false, nullsFirst: false }).limit(5000)
  if (campaignId) q = q.eq('campaign_id', Number(campaignId))
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const recs = (data ?? []) as Rec[]

  // On-air per record (session ended_at − started_at) + campaign/contact labels.
  const [{ data: sessions }, { data: camps }, { data: contacts }] = await Promise.all([
    admin.from('call_sessions').select('call_record_id, started_at, ended_at'),
    admin.from('campaigns').select('id, name'),
    recs.length ? admin.from('contacts').select('id, first_name, last_name').in('id', recs.map(r => r.contact_id).filter((v): v is number => v != null))
      : Promise.resolve({ data: [] as { id: number; first_name: string | null; last_name: string | null }[] }),
  ])
  const air = new Map<number, number>()
  for (const s of (sessions ?? []) as { call_record_id: number | null; started_at: string | null; ended_at: string | null }[]) {
    if (s.call_record_id == null || !s.started_at || !s.ended_at) continue
    const secs = (+new Date(s.ended_at) - +new Date(s.started_at)) / 1000
    if (secs > 0 && secs < 3600) air.set(s.call_record_id, Math.round(secs))
  }
  const campName = new Map((camps ?? []).map((c: { id: number; name: string | null }) => [c.id, c.name]))
  const name = new Map((contacts ?? []).map((c: { id: number; first_name: string | null; last_name: string | null }) => [c.id, [c.first_name, c.last_name].filter(Boolean).join(' ')]))

  const leads = recs.map(r => {
    const talk = r.talk_seconds ?? 0
    const optin = r.outcome === 'lead' ? 'double' : 'single'
    return {
      phone: r.phone,
      name: (r.contact_id != null ? name.get(r.contact_id) : '') || '',
      campaign_id: r.campaign_id,
      campaign: (r.campaign_id != null ? campName.get(r.campaign_id) : '') || '—',
      optin,                                   // 'double' (lead) | 'single' (opt-in only)
      at: r.called_at ?? r.created_at,
      talk_seconds: talk,
      on_air_seconds: air.get(r.id) ?? null,
      disposition: r.business_disposition ?? null,
      agent_outcome: r.agent_outcome ?? null,
      cost: (typeof r.cost === 'number' && r.cost > 0) ? r.cost : estimateCallCost(talk, air.get(r.id) ?? talk),
    }
  })
  const doubleN = leads.filter(l => l.optin === 'double').length
  return NextResponse.json({ leads, total: leads.length, double_optin: doubleN, single_optin: leads.length - doubleN })
}
