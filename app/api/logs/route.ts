import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

// Call history from Supabase `call_records` — the per-call rows CallOps writes.
// We read them directly (service-role, server-side) rather than CallOps' `/companies/{id}/calls`
// / `/campaigns/{id}/calls`, which are bearer-JWT-only and currently 401 — that left the whole
// dashboard's call-driven insights (talk-time, busiest-hours, CPL, and every KPI sparkline) empty.
// Same data, populated source, no CallOps-auth dependency (consistent with /api/reports).

const COLS = 'id, campaign_id, phone, outcome, talk_seconds, cost, transferred, recording_url, ' +
  'called_at, created_at, room, contact_id, business_disposition, agent_outcome'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaignId')

  const { user } = await getAuthUser()
  if (!user) return unauthorized()
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'server not configured' }, { status: 503 })

  let q = admin.from('call_records').select(COLS).order('called_at', { ascending: false, nullsFirst: false }).limit(5000)
  if (campaignId) q = q.eq('campaign_id', Number(campaignId))
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // daySeries groups on `called_at`; coalesce to created_at so date grouping never drops a row.
  const logs = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    ...row,
    called_at: row.called_at ?? row.created_at,
  }))
  return NextResponse.json({ logs })
}
