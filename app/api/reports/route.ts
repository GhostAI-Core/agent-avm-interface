import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsGet, callopsItems, callopsErrorResponse } from '@/utils/callops'
import type { Agent, CampaignReport } from '@/types'

export const dynamic = 'force-dynamic'

// Campaign roll-up sourced from CallOps `GET /companies/{id}/dashboard/campaign-performance`
// (0.6.0) — the authoritative aggregate over `call_records`, including the real per-call `cost`
// CallOps now persists at call-outcome time (see evra_callops app/services/cost_estimator.py).
// `by_outcome` gives a raw tally of every outcome value, which we map into the report's six
// dispositions the same way the previous Supabase-direct version did:
//
//   raw outcome   -> report column
//   connected     -> connected
//   subscribed    -> qualified      (the UI's success/conversion bucket; drives CPL)
//   opted_out     -> opt_out        (compliance opt-out / DNC)
//   no_answer     -> no_answer
//   voicemail     -> voicemail
//   failed        -> failed
//   lead          -> lead
//   dialed        = calls, total_spent = total_cost (real, not estimated)
// Columns we never produce (no_speech/hangup/ni/dnq/callback/busy_line) stay 0 -- honest, not faked.
//
// CallOps lists per company, so -- like /api/campaigns and /api/leads -- we fan out over the
// user's companies and merge.

type PerfItem = {
  campaign_id: number
  name: string | null
  status: string | null
  agent: string | null
  agent_name: string | null
  calls: number
  average_talk_seconds: number
  total_cost: number
  by_outcome: Record<string, number>
}

const OUTCOME_COL: Record<string, keyof CampaignReport> = {
  connected: 'connected',
  subscribed: 'qualified',
  lead: 'lead',
  opted_out: 'opt_out',
  no_answer: 'no_answer',
  voicemail: 'voicemail',
  failed: 'failed',
}

function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function toReport(p: PerfItem): CampaignReport {
  const row: CampaignReport = {
    id: p.campaign_id,
    campaign_id: p.campaign_id,
    campaign: { name: p.name ?? '—', agent: (p.agent ?? p.agent_name ?? 'seeker') as Agent },
    phone_number: '',
    status: p.status ?? '',
    dialed: p.calls, connected: 0, qualified: 0, voicemail: 0, no_speech: 0, hangup: 0,
    ni: 0, dnq: 0, callback: 0, no_answer: 0, busy_line: 0, opt_out: 0, lead: 0, failed: 0,
    duration: fmtDuration(p.average_talk_seconds), cpl: 0, total_spent: Math.round((p.total_cost ?? 0) * 100) / 100,
  }
  for (const [outcome, count] of Object.entries(p.by_outcome ?? {})) {
    const col = OUTCOME_COL[outcome]
    if (col) (row[col] as number) = count
  }
  const conversions = row.qualified + row.lead
  row.cpl = conversions ? row.total_spent / conversions : 0
  return row
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agent = searchParams.get('agent')

  const { token } = await getAccessToken()
  if (!token) return unauthorized()

  try {
    const companies = await callopsItems<{ id: number }>('/companies', token)
    const perCompany = await Promise.all(
      (companies ?? []).map((co) =>
        callopsGet<{ campaigns?: PerfItem[] }>(`/companies/${co.id}/dashboard/campaign-performance`, token)
          .then((r) => r.campaigns ?? [])
          .catch(() => [] as PerfItem[]),
      ),
    )

    const reports = perCompany.flat()
      .filter((p) => p.calls > 0) // only campaigns that actually placed calls
      .map(toReport)

    const filtered = agent ? reports.filter((r) => r.campaign?.agent === agent) : reports
    return NextResponse.json({ reports: filtered })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
