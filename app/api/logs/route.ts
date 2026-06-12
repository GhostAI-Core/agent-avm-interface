import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'
import { demoCallsFor, DEMO_CAMPAIGNS } from '@/lib/demo-data'
import { DEMO_MODE } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaignId')

  const { supabase, user } = await getAuthUser()
  if (!user) return unauthorized()

  const COLS = 'id, campaign_id, phone, outcome, talk_seconds, cost, transferred, recording_url, called_at'

  // No campaignId → all recent calls across campaigns (dashboard insights)
  if (!campaignId) {
    const { data, error } = await supabase
      .from('call_records')
      .select(COLS)
      .order('called_at', { ascending: false })
      .limit(2000)

    if (error || !data || data.length === 0) {
      if (DEMO_MODE) {
        const all = DEMO_CAMPAIGNS.flatMap(c => demoCallsFor(c.id))
        return NextResponse.json({ logs: all, demo: true })
      }
      return NextResponse.json({ logs: [] })
    }
    return NextResponse.json({ logs: data })
  }

  const { data, error } = await supabase
    .from('call_records')
    .select(COLS)
    .eq('campaign_id', campaignId)
    .order('called_at', { ascending: false })
    .limit(500)

  if (error || !data || data.length === 0) {
    if (DEMO_MODE) return NextResponse.json({ logs: demoCallsFor(Number(campaignId) || 1), demo: true })
    return NextResponse.json({ logs: [] })
  }

  return NextResponse.json({ logs: data })
}
