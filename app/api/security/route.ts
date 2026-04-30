import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { DEMO_SECURITY_LOGS } from '@/lib/demo-data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

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
