import { NextRequest, NextResponse } from 'next/server'
import { supabase, DEMO_MODE } from '@/lib/supabase'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const allowed = ['status','dialing_speed','time_window_start','time_window_end','voice_recording_url']
    const payload = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)))
    if (!Object.keys(payload).length) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
    if (DEMO_MODE) return NextResponse.json({ campaign: { id, ...payload }, demo: true })
    const { data, error } = await supabase!.from('campaigns').update(payload).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ campaign: data })
  } catch (err) {
    console.error('API PUT Error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!DEMO_MODE) await supabase!.from('campaigns').update({ status: 'deleted' }).eq('id', id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('API DELETE Error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
