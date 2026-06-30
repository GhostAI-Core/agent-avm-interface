import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsGet, callopsItems, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

type Row = Record<string, unknown>
function rows(res: unknown): Row[] {
  const r = res as { items?: Row[]; calls?: Row[] }
  return r?.items ?? r?.calls ?? (Array.isArray(res) ? (res as Row[]) : [])
}

// Call history from CallOps (call_records), not Supabase. Per-campaign when campaignId is
// given; otherwise fan out across the user's companies for the cross-campaign feed.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaignId')
  const { token } = await getAccessToken()
  if (!token) return unauthorized()

  try {
    if (campaignId) {
      const res = await callopsGet(`/campaigns/${campaignId}/calls`, token)
      return NextResponse.json({ logs: rows(res) })
    }
    const companies = await callopsItems<{ id: number }>('/companies', token)
    const all: Row[] = []
    for (const co of companies ?? []) {
      all.push(...rows(await callopsGet(`/companies/${co.id}/calls`, token)))
    }
    all.sort((a, b) => String(b.called_at ?? '').localeCompare(String(a.called_at ?? '')))
    return NextResponse.json({ logs: all })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
