import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { supabase, user } = await getAuthUser()
  if (!user) return unauthorized()

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
  const { supabase, user } = await getAuthUser()
  if (!user) return unauthorized()
  const body = await req.json()
  const { name, api_key, api_secret } = body

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const { data, error } = await supabase.from('voip_providers').insert({ name, api_key, api_secret }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ provider: data }, { status: 201 })
}
