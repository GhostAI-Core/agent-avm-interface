import { NextRequest, NextResponse } from 'next/server'
import { supabase, DEMO_MODE } from '@/lib/supabase'
import { DEMO_CAMPAIGNS } from '@/lib/demo-data'

export async function GET() {
  if (DEMO_MODE) return NextResponse.json({ campaigns: DEMO_CAMPAIGNS, demo: true })
  const { data, error } = await supabase!.from('campaigns').select('*').neq('status','deleted').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaigns: data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!body.name || !body.agent) return NextResponse.json({ error: 'name and agent required' }, { status: 400 })
  if (DEMO_MODE) return NextResponse.json({ campaign: { ...body, id: Date.now(), status: 'draft' }, demo: true }, { status: 201 })
  const { data, error } = await supabase!.from('campaigns').insert({
    name: body.name, agent: body.agent, status: 'draft',
    dialing_speed: body.dialing_speed ?? 1,
    time_window_start: body.window_start ?? '08:00',
    time_window_end: body.window_end ?? '20:00',
    voice_recording_url: body.voice_recording_url ?? '',
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaign: data }, { status: 201 })
}
