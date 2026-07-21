import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsGet, callopsItems, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

// Lead-Gen reporting sourced from CallOps `GET /companies/{id}/leads` (0.6.0) -- every record
// where the contact pressed 1 at least once: DOUBLE opt-in (`optin: 'double'`, outcome=lead) or
// SINGLE opt-in (`optin: 'single'`, business_disposition=single_opt_in). `cost` is now the real
// persisted per-call cost, not an estimate. Fans out over the user's companies (like
// /api/campaigns and /api/reports) and merges, mirroring the previous Supabase-direct version.
//
// CallOps doesn't join campaign/contact names into the leads payload, so we resolve them
// ourselves: campaign names via `/companies/{id}/campaigns` (cheap, one call per company), and
// contact names best-effort via `/campaigns/{id}/contacts` for just the campaigns that appear in
// the lead set (a lead is a small subset of a campaign's contacts, so a single page usually
// covers it; a rare miss just shows a blank name, same graceful fallback the UI already had).

const PAGE_SIZE = 200
const MAX_ROWS = 5000

type LeadItem = {
  id: number; phone: string | null; contact_id: number | null; campaign_id: number | null
  called_at: string | null; created_at: string | null; talk_seconds: number | null
  outcome: string | null; business_disposition: string | null
  cost: number | null; optin: 'double' | 'single'; duration_seconds?: number | null
}

async function fetchAllLeads(companyId: number, token: string, campaignId?: string | null) {
  const items: LeadItem[] = []
  let page = 1
  let doubleOptin = 0
  let singleOptin = 0
  while (items.length < MAX_ROWS) {
    const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) })
    if (campaignId) qs.set('campaign_id', campaignId)
    const res = await callopsGet<{ items?: LeadItem[]; double_optin?: number; single_optin?: number }>(
      `/companies/${companyId}/leads?${qs}`, token,
    )
    const batch = res.items ?? []
    items.push(...batch)
    doubleOptin = res.double_optin ?? doubleOptin
    singleOptin = res.single_optin ?? singleOptin
    if (batch.length < PAGE_SIZE) break
    page++
  }
  return { items: items.slice(0, MAX_ROWS), doubleOptin, singleOptin }
}

export async function GET(req: NextRequest) {
  const { token } = await getAccessToken()
  if (!token) return unauthorized()
  const campaignId = new URL(req.url).searchParams.get('campaignId')

  try {
    const companies = await callopsItems<{ id: number }>('/companies', token)
    const perCompany = await Promise.all(
      (companies ?? []).map((co) => fetchAllLeads(co.id, token, campaignId).catch(() => ({ items: [] as LeadItem[], doubleOptin: 0, singleOptin: 0 }))),
    )
    const recs = perCompany.flatMap((r) => r.items)
    const doubleOptin = perCompany.reduce((s, r) => s + r.doubleOptin, 0)
    const singleOptin = perCompany.reduce((s, r) => s + r.singleOptin, 0)

    // Best-effort campaign + contact name enrichment.
    const campaignIds = [...new Set(recs.map((r) => r.campaign_id).filter((v): v is number => v != null))]
    const campNames = new Map<number, string>()
    const contactNames = new Map<number, string>()
    await Promise.all(campaignIds.map(async (cid) => {
      try {
        const detail = await callopsGet<{ campaign?: { name?: string } }>(`/campaigns/${cid}`, token)
        if (detail.campaign?.name) campNames.set(cid, detail.campaign.name)
      } catch { /* keep '—' fallback */ }
      try {
        const contactsRes = await callopsGet<{ items?: { id: number; first_name?: string | null; last_name?: string | null }[] }>(
          `/campaigns/${cid}/contacts?page_size=200`, token,
        )
        for (const c of contactsRes.items ?? []) {
          const name = [c.first_name, c.last_name].filter(Boolean).join(' ')
          if (name) contactNames.set(c.id, name)
        }
      } catch { /* keep blank fallback */ }
    }))

    const leads = recs.map((r) => {
      const talk = r.talk_seconds ?? 0
      return {
        phone: r.phone,
        name: (r.contact_id != null ? contactNames.get(r.contact_id) : '') || '',
        campaign_id: r.campaign_id,
        campaign: (r.campaign_id != null ? campNames.get(r.campaign_id) : '') || '—',
        optin: r.optin,
        at: r.called_at ?? r.created_at,
        talk_seconds: talk,
        on_air_seconds: r.duration_seconds ?? null,
        disposition: r.business_disposition ?? null,
        cost: r.cost ?? 0,
      }
    }).sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))

    return NextResponse.json({ leads, total: leads.length, double_optin: doubleOptin, single_optin: singleOptin })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
