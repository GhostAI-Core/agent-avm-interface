import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaignId')
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10)

  const { supabase, user } = await getAuthUser()
  if (!user) return unauthorized()

  // No campaignId → all intent rows for the date (dashboard drop-off insights)
  if (!campaignId) {
    const { data, error } = await supabase
      .from('intent_stats')
      .select('campaign_id, intent_name, step, reached')
      .eq('day', date)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ day: date, intents: data ?? [] })
  }

  const { data, error } = await supabase
    .from('intent_stats')
    .select('intent_name, step, reached')
    .eq('campaign_id', campaignId)
    .eq('day', date)
    .order('intent_name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) {
    return NextResponse.json({ day: date, connectedTotal: 0, intents: [] })
  }

  // Connected calls that day = denominator for "% of Connected"
  const { count } = await supabase
    .from('call_records')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .in('outcome', ['connected', 'qualified'])
    .gte('called_at', `${date}T00:00:00`)
    .lte('called_at', `${date}T23:59:59`)

  return NextResponse.json({ day: date, connectedTotal: count || 0, intents: data })
}
