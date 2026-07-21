import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsGet, callopsItems, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

// Call history sourced from CallOps `GET /companies/{id}/calls` / `GET /campaigns/{id}/calls`
// (0.6.0) -- previously read Supabase `call_records` directly because CallOps' bearer-JWT
// routes 401'd; that's fixed, so we proxy through like every other migrated route. CallOps
// already enriches each row with `duration_seconds` (call_sessions ended_at - started_at, the
// true on-air/billed room duration) which we rename to `on_air_seconds` for compatibility with
// existing widgets (lib/dashboardInsights.tsx, CampaignDetail.tsx, CostBreakdown.tsx).
//
// Two shapes of caller:
//  - ?campaignId=X (campaign drill-down table): full history for that one campaign, unbounded
//    by date -- operators expect to see everything for a campaign they're inspecting.
//  - no campaignId (dashboard-wide feed for lib/dashboardInsights.tsx): fanned out over every
//    company the user belongs to (like /api/campaigns and /api/reports) and bounded to the last
//    `DASHBOARD_WINDOW_DAYS` days, since every widget that consumes this list only looks at the
//    last 14 days anyway (see daySeries() in dashboardInsights.tsx) -- fetching a company's
//    entire multi-year call history on every 15s poll would be needless read amplification.

const PAGE_SIZE = 200
const MAX_ROWS = 5000
const DASHBOARD_WINDOW_DAYS = 45

type CallItem = Record<string, unknown> & {
  id: number
  called_at?: string | null
  created_at?: string | null
  duration_seconds?: number | null
}

async function fetchAllCalls(path: string, token: string, extraParams: Record<string, string> = {}): Promise<CallItem[]> {
  const out: CallItem[] = []
  let page = 1
  while (out.length < MAX_ROWS) {
    const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), ...extraParams })
    const res = await callopsGet<{ items?: CallItem[] }>(`${path}?${qs}`, token)
    const batch = res.items ?? []
    out.push(...batch)
    if (batch.length < PAGE_SIZE) break
    page++
  }
  return out.slice(0, MAX_ROWS)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaignId')

  const { token } = await getAccessToken()
  if (!token) return unauthorized()

  try {
    let items: CallItem[]
    if (campaignId) {
      items = await fetchAllCalls(`/campaigns/${campaignId}/calls`, token)
    } else {
      const fromDate = new Date(Date.now() - DASHBOARD_WINDOW_DAYS * 86400000).toISOString()
      const companies = await callopsItems<{ id: number }>('/companies', token)
      const perCompany = await Promise.all(
        (companies ?? []).map((co) =>
          fetchAllCalls(`/companies/${co.id}/calls`, token, { from_date: fromDate }).catch(() => [] as CallItem[]),
        ),
      )
      items = perCompany.flat()
    }

    const logs = items
      .map((row) => ({
        ...row,
        called_at: row.called_at ?? row.created_at,
        on_air_seconds: row.duration_seconds ?? null,
      }))
      .sort((a, b) => String(b.called_at ?? '').localeCompare(String(a.called_at ?? '')))
      .slice(0, MAX_ROWS)

    return NextResponse.json({ logs })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
