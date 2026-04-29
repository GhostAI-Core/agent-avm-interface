import { NextRequest, NextResponse } from 'next/server'
import { supabase, DEMO_MODE } from '@/lib/supabase'
import { DEMO_REPORTS } from '@/lib/demo-data'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agent = searchParams.get('agent')
  const date  = searchParams.get('date')

  if (DEMO_MODE) {
    const rows = agent ? DEMO_REPORTS.filter(r => r.campaign?.agent === agent) : DEMO_REPORTS
    return NextResponse.json({ reports: rows, demo: true })
  }

  let query = supabase!.from('call_logs').select('*, campaigns(name,agent)').order('called_at', { ascending: false }).limit(500)
  if (date) query = query.gte('called_at', `${date}T00:00:00`).lte('called_at', `${date}T23:59:59`)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = agent ? (data ?? []).filter((r: any) => r.campaigns?.agent === agent) : (data ?? [])
  return NextResponse.json({ reports: rows })
}
