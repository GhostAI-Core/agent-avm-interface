import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsGet, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

// Intent waterfall sourced from CallOps intent-stats — NOT Supabase `intent_stats`/`call_records`.
//  - per campaign:  GET /campaigns/{id}/intent-stats  -> {connected_total, intents:[{intent_name,step,reached}]}
//  - dashboard-wide: GET /companies/{id}/intent-stats (fan-out) -> intents tagged with campaign_id
// Output contract preserved for existing consumers (CallQuality + drop-off insight).

type Intent = { campaign_id?: number; intent_name: string; step: number; reached: number }

function intentsOf(res: unknown): Intent[] {
  const r = res as { intents?: Intent[]; items?: Intent[] }
  return r?.intents ?? r?.items ?? (Array.isArray(res) ? (res as Intent[]) : [])
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaignId')
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10)

  const { token } = await getAccessToken()
  if (!token) return unauthorized()

  try {
    // Per-campaign: the "% of Connected" waterfall for one campaign.
    if (campaignId) {
      const res = await callopsGet<{ connected_total?: number; intents?: Intent[] }>(
        `/campaigns/${campaignId}/intent-stats?date=${date}`, token,
      )
      const intents = intentsOf(res).map((i) => ({ intent_name: i.intent_name, step: i.step, reached: i.reached }))
      return NextResponse.json({ day: date, connectedTotal: res.connected_total ?? 0, intents })
    }

    // Dashboard-wide: all campaigns' intents tagged with campaign_id (drop-off insights).
    const { companies } = await callopsGet<{ companies: { id: number }[] }>('/companies', token)
    const all: Intent[] = []
    for (const co of companies ?? []) {
      const res = await callopsGet(`/companies/${co.id}/intent-stats?from_date=${date}&to_date=${date}`, token)
        .catch(() => ({}))
      for (const i of intentsOf(res)) {
        if (i.campaign_id != null) all.push(i)
      }
    }
    return NextResponse.json({ day: date, intents: all })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
