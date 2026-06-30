import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsGet, callopsItems, callopsErrorResponse } from '@/utils/callops'
import type { Agent, CampaignReport } from '@/types'

export const dynamic = 'force-dynamic'

// Campaign roll-up sourced from CallOps `/companies/{id}/dashboard/campaign-performance`
// (joined with the campaign list for agent/status) — NOT the Supabase `call_logs` table.
//
// CallOps 0.2.0 reports calls / connected / opt_out / failed / avg_talk per campaign. The
// legacy outcome columns (qualified, voicemail, no_speech, hangup, ni, dnq, callback,
// no_answer, busy_line) and cost/CPL/spend have NO backend source and are reported as 0 —
// the FE `CampaignReport` shape is preserved so existing consumers keep working; those
// widgets simply read 0 until CallOps exposes the data. `connected` already EXCLUDES opt-out.

type PerfRow = { campaign_id: number; name?: string; calls?: number; connected?: number; opt_out?: number; failed?: number; average_talk_seconds?: number }
type CampMeta = { id: number; name?: string; agent?: string; agent_name?: string; status?: string }

function fmtDuration(seconds?: number): string {
  const s = Math.max(0, Math.round(seconds ?? 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function toReport(p: PerfRow, meta?: CampMeta): CampaignReport {
  return {
    id: p.campaign_id,
    campaign_id: p.campaign_id,
    campaign: { name: meta?.name ?? p.name ?? '—', agent: (meta?.agent ?? meta?.agent_name ?? 'seeker') as Agent },
    phone_number: '',
    status: meta?.status ?? '',
    dialed: p.calls ?? 0,
    connected: p.connected ?? 0,
    // No CallOps source — retired legacy outcome vocab. See header.
    qualified: 0, voicemail: 0, no_speech: 0, hangup: 0, ni: 0, dnq: 0, callback: 0, no_answer: 0, busy_line: 0,
    failed: p.failed ?? 0,
    duration: fmtDuration(p.average_talk_seconds),
    cpl: 0,
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
      for (const p of perf.campaigns ?? []) rows.push(toReport(p, meta.get(p.campaign_id)))
    }
    // Agent filter retained for the reports view; date filter is inert (campaign-performance
    // is all-time per company in 0.2.0).
    const filtered = agent ? rows.filter((r) => r.campaign?.agent === agent) : rows
    return NextResponse.json({ reports: filtered })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
