import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaignId')

  const { supabase, user } = await getAuthUser()
  if (!user) return unauthorized()

  const COLS = 'id, campaign_id, phone, outcome, business_disposition, talk_seconds, cost, transferred, recording_url, room, called_at'

  // No campaignId → all recent calls across campaigns (dashboard insights)
  if (!campaignId) {
    const { data, error } = await supabase
      .from('call_records')
      .select(COLS)
      .order('called_at', { ascending: false })
      .limit(2000)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ logs: data ?? [] })
  }

  const { data, error } = await supabase
    .from('call_records')
    .select(COLS)
    .eq('campaign_id', campaignId)
    .order('called_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ logs: data ?? [] })
}
