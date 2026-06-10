import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaignId')

  const { supabase, user } = await getAuthUser()
  if (!user) return unauthorized()

  const { data, error } = await supabase
    .from('call_logs')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(200)
  
  if (error || !data || data.length === 0) {
    return NextResponse.json({
      logs: [
        { id: 1, phone: '+27 71 234 5678', outcome: 'qualified', duration: '1:12', called_at: new Date().toISOString() },
        { id: 2, phone: '+27 82 987 6543', outcome: 'voicemail', duration: '0:15', called_at: new Date().toISOString() },
        { id: 3, phone: '+27 11 555 0199', outcome: 'hangup', duration: '0:03', called_at: new Date().toISOString() },
        { id: 4, phone: '+27 60 111 2222', outcome: 'no_answer', duration: '0:00', called_at: new Date().toISOString() },
      ],
      demo: true
    })
  }

  return NextResponse.json({ logs: data })
}
