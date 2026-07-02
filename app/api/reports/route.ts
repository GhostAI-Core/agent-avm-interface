import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { estimateCallCost } from '@/lib/callCost'
import type { Agent, CampaignReport } from '@/types'

export const dynamic = 'force-dynamic'

// Campaign roll-up computed from the RAW per-call truth in Supabase `call_records`
// (100% populated: outcome, talk_seconds, cost), NOT the CallOps `call_logs`/`campaign_report`
// aggregates — those mis-divide the outcome vocab (they drop `subscribed`/`opted_out`, never
// count `dialed`, and the two disagree). We map the six real outcomes into the report columns
// ourselves so the numbers are correct and conversions (subscribed) finally surface.
//
//   raw outcome   → report column
//   connected     → connected
//   subscribed    → qualified      (the UI's success/conversion bucket; drives CPL)
//   opted_out     → opt_out        (compliance opt-out / DNC)
//   no_answer     → no_answer
//   voicemail     → voicemail
//   failed        → failed
//   dialed        = attempt count (rows), total_spent = Σ cost, cpl = spend / subscribed
// Columns we never produce (no_speech/hangup/ni/callback/busy_line) stay 0 — honest, not faked.

type CampMeta = { id: number; name: string | null; agent: string | null; agent_name: string | null; status: string | null }
type RecRow = { id: number; campaign_id: number | null; outcome: string | null; talk_seconds: number | null; cost: number | null }

const OUTCOME_COL: Record<string, keyof CampaignReport> = {
  connected: 'connected',
  subscribed: 'qualified',
  opted_out: 'opt_out',
  no_answer: 'no_answer',
  voicemail: 'voicemail',
  failed: 'failed',
}

function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function blankReport(meta: CampMeta): CampaignReport & { _talkTotal: number; _talkCount: number } {
  return {
    id: meta.id,
    campaign_id: meta.id,
    campaign: { name: meta.name ?? '—', agent: (meta.agent ?? meta.agent_name ?? 'seeker') as Agent },
    phone_number: '',
    status: meta.status ?? '',
    dialed: 0, connected: 0, qualified: 0, voicemail: 0, no_speech: 0, hangup: 0,
    ni: 0, dnq: 0, callback: 0, no_answer: 0, busy_line: 0, opt_out: 0, failed: 0,
    duration: '0:00', cpl: 0, total_spent: 0,
    _talkTotal: 0, _talkCount: 0,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agent = searchParams.get('agent')

  const { user } = await getAuthUser()
  if (!user) return unauthorized()
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'server not configured' }, { status: 503 })

  // Campaign metadata (name/agent/status) + all per-call records.
  const [{ data: camps }, { data: recs, error: recErr }, { data: sessions }] = await Promise.all([
    admin.from('campaigns').select('id, name, agent, agent_name, status'),
    admin.from('call_records').select('id, campaign_id, outcome, talk_seconds, cost'),
    admin.from('call_sessions').select('call_record_id, started_at, ended_at'),
  ])
  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 })

  // On-air per call (session ended_at − started_at) — LiveKit bills this, not talk.
  const airByRec = new Map<number, number>()
  for (const s of (sessions ?? []) as { call_record_id: number | null; started_at: string | null; ended_at: string | null }[]) {
    if (s.call_record_id == null || !s.started_at || !s.ended_at) continue
    const secs = (+new Date(s.ended_at) - +new Date(s.started_at)) / 1000
    if (secs > 0 && secs < 3600) airByRec.set(s.call_record_id, secs)
  }

  const byId = new Map<number, ReturnType<typeof blankReport>>()
  for (const c of (camps ?? []) as CampMeta[]) byId.set(c.id, blankReport(c))

  for (const r of (recs ?? []) as RecRow[]) {
    if (r.campaign_id == null) continue
    let row = byId.get(r.campaign_id)
    // A record for a campaign we don't have metadata for still counts.
    if (!row) { row = blankReport({ id: r.campaign_id, name: null, agent: null, agent_name: null, status: null }); byId.set(r.campaign_id, row) }
    row.dialed += 1
    const col = r.outcome ? OUTCOME_COL[r.outcome] : undefined
    if (col) (row[col] as number) += 1
    // `cost` is always 0 (CallOps doesn't bill yet) — ESTIMATE from talk + on-air instead.
    const talk = typeof r.talk_seconds === 'number' ? r.talk_seconds : 0
    const onAir = airByRec.get(r.id) ?? talk
    row.total_spent += (typeof r.cost === 'number' && r.cost > 0) ? r.cost : estimateCallCost(talk, onAir)
    if (talk > 0) { row._talkTotal += talk; row._talkCount += 1 }
  }

  const reports: CampaignReport[] = [...byId.values()]
    .filter((row) => row.dialed > 0) // only campaigns that actually placed calls
    .map(({ _talkTotal, _talkCount, ...row }) => ({
      ...row,
      duration: fmtDuration(_talkCount ? _talkTotal / _talkCount : 0),
      cpl: row.qualified ? row.total_spent / row.qualified : 0,
    }))

  const filtered = agent ? reports.filter((r) => r.campaign?.agent === agent) : reports
  return NextResponse.json({ reports: filtered })
}
