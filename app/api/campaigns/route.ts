import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { DEMO_CAMPAIGNS } from '@/lib/demo-data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  
  const { data, error } = await supabase.from('campaigns').select('*').neq('status','deleted').order('created_at', { ascending: false })
  
  if (error) {
    // Fallback to demo data if DB is empty/error during dev
    console.error('Supabase error:', error)
    return NextResponse.json({ campaigns: DEMO_CAMPAIGNS, demo: true })
  }
  
  return NextResponse.json({ campaigns: data })
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  
  const body = await req.json()
  const { name, agent, dialing_speed, window_start, window_end, voice_recording_url, contacts } = body

  if (!name || !agent) return NextResponse.json({ error: 'name and agent required' }, { status: 400 })
  
  // 1. Insert Campaign
  const { data: campaign, error: cErr } = await supabase.from('campaigns').insert({
    name, agent, status: 'draft',
    dialing_speed: dialing_speed ?? 1,
    time_window_start: window_start ?? '08:00',
    time_window_end: window_end ?? '20:00',
    voice_recording_url: voice_recording_url ?? '',
    transfer_key: body.transfer_key ?? '',
    transfer_target: body.transfer_target ?? '',
  }).select().single()

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  // 2. Insert Contacts if any
  if (contacts && Array.isArray(contacts) && contacts.length > 0) {
    const contactsWithCampaign = contacts.map((c: any) => ({
      campaign_id: campaign.id,
      phone: c.phone,
      first_name: c.first_name,
      last_name: c.last_name
    }))
    
    const { error: cntErr } = await supabase.from('contacts').insert(contactsWithCampaign)
    if (cntErr) console.error('Error inserting contacts:', cntErr)
  }

  return NextResponse.json({ campaign }, { status: 201 })
}
