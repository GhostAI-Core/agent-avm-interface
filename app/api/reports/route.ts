import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const agent = searchParams.get('agent')
    const date  = searchParams.get('date')

    const { supabase, user } = await getAuthUser()
    if (!user) return unauthorized()

    let query = supabase
      .from('call_logs')
      .select('*, campaign:campaigns(name, agent)')
      .order('created_at', { ascending: false })
      .limit(500)
    
    if (date) query = query.gte('called_at', `${date}T00:00:00`).lte('called_at', `${date}T23:59:59`)
    
    const { data, error } = await query
    
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = agent ? (data ?? []).filter((r: any) => r.campaign?.agent === agent) : (data ?? [])
    return NextResponse.json({ reports: rows })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
