import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data, error } = await supabase.from('voip_providers').select('*').order('created_at', { ascending: false })
  
  if (error || !data || data.length === 0) {
    return NextResponse.json({
      providers: [
        { id: 1, name: 'Twilio', api_key: 'AC...', api_secret: '********' },
        { id: 2, name: 'Vonage', api_key: 'vn...', api_secret: '********' },
      ],
      demo: true
    })
  }

  return NextResponse.json({ providers: data })
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const body = await req.json()
  const { name, api_key, api_secret } = body

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const { data, error } = await supabase.from('voip_providers').insert({ name, api_key, api_secret }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ provider: data }, { status: 201 })
}
