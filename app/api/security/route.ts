import { NextResponse } from 'next/server'
import { DEMO_SECURITY_LOGS } from '@/lib/demo-data'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase, user } = await getAuthUser()
    if (!user) return unauthorized()

    const { data, error } = await supabase
      .from('security_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    
    if (error || !data || data.length === 0) {
      return NextResponse.json({ logs: DEMO_SECURITY_LOGS, demo: true })
    }
    
    return NextResponse.json({ logs: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
