import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsGet, callopsItems, callopsErrorResponse } from '@/utils/callops'
import type { Agent, CampaignReport } from '@/types'

export const dynamic = 'force-dynamic'

// Campaign roll-up from CallOps. The per-campaign OUTCOME BREAKDOWN comes from
// `/companies/{id}/dashboard/outcomes?campaign_id=X` — its call-outcome vocab
// (connected/qualified/voicemail/no_speech/hangup/ni/dnq/callback/no_answer/busy/failed) maps
// 1:1 to the report columns. Totals + avg-talk come from `campaign-performance`.
// cost/CPL/spend have no CallOps source (call_records.cost is always 0) → reported as 0.

type PerfRow = { campaign_id: number; name?: string; calls?: number; connected?: number; failed?: number; average_talk_seconds?: number }
type CampMeta = { id: number; name?: string; agent?: string; agent_name?: string; status?: string }
type OutcomeItem = { value: string; count: number }

function fmtDuration(seconds?: number): string {
  const s = Math.max(0, Math.round(seconds ?? 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const n = (oc: Record<string, number>, k: string) => oc[k] ?? 0

function toReport(p: PerfRow, oc: Record<string, number>, meta?: CampMeta): CampaignReport {
  const outcomeTotal = Object.values(oc).reduce((a, b) => a + b, 0)
  return {
    id: p.campaign_id,
    campaign_id: p.campaign_id,
    campaign: { name: meta?.name ?? p.name ?? '—', agent: (meta?.agent ?? meta?.agent_name ?? 'seeker') as Agent },
    phone_number: '',
    status: meta?.status ?? '',
    dialed: p.calls ?? outcomeTotal,
    connected: n(oc, 'connected') || (p.connected ?? 0),
    qualified: n(oc, 'qualified'),
    voicemail: n(oc, 'voicemail'),
    no_speech: n(oc, 'no_speech'),
    hangup: n(oc, 'hangup'),
    ni: n(oc, 'ni'),
    dnq: n(oc, 'dnq'),
    callback: n(oc, 'callback'),
    no_answer: n(oc, 'no_answer'),
    busy_line: n(oc, 'busy'), // CallOps outcome `busy` → report column `busy_line`
    failed: n(oc, 'failed') || (p.failed ?? 0),
    duration: fmtDuration(p.average_talk_seconds),
    cpl: 0, // no cost source in CallOps yet
    total_spent: 0,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agent = searchParams.get('agent')
  const { token } = await getAccessToken()
  if (!token) return unauthorized()

  try {
    const companies = await callopsItems<{ id: number }>('/companies', token)
    const rows: CampaignReport[] = []
    for (const co of companies ?? []) {
      const [perf, camps] = await Promise.all([
        callopsGet<{ campaigns?: PerfRow[] }>(`/companies/${co.id}/dashboard/campaign-performance`, token),
        callopsGet<{ items?: CampMeta[] }>(`/companies/${co.id}/campaigns?page_size=200`, token).catch(() => ({ items: [] as CampMeta[] })),
      ])
      const meta = new Map((camps.items ?? []).map((c) => [c.id, c]))
      const perfRows = perf.campaigns ?? []
      // Per-campaign outcome breakdown, fetched in parallel within the company.
      const outcomeMaps = await Promise.all(perfRows.map(async (p) => {
        const d = await callopsGet<{ outcomes?: OutcomeItem[] }>(
          `/companies/${co.id}/dashboard/outcomes?campaign_id=${p.campaign_id}`, token,
        ).catch(() => ({ outcomes: [] as OutcomeItem[] }))
        const m: Record<string, number> = {}
        for (const o of d.outcomes ?? []) m[o.value] = o.count
        return m
      }))
      perfRows.forEach((p, i) => rows.push(toReport(p, outcomeMaps[i], meta.get(p.campaign_id))))
    }
    const filtered = agent ? rows.filter((r) => r.campaign?.agent === agent) : rows
    return NextResponse.json({ reports: filtered })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
