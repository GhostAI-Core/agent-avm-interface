import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const allowed = ['name','company_id','status','dialing_speed','time_window_start','time_window_end',
      'voice_recording_url','audio_path','sip_trunk_id','start_date','end_date','agent',
      'max_concurrent','max_retries','retry_cooldown_seconds']
    const payload = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)))
    if (!Object.keys(payload).length) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    const { supabase, user } = await getAuthUser()
    if (!user) return unauthorized()
    const { data, error } = await supabase.from('campaigns').update(payload).eq('id', id).select().single()
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
    const { supabase, user } = await getAuthUser()
    if (!user) return unauthorized()
    await supabase.from('campaigns').update({ status: 'deleted' }).eq('id', id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('API DELETE Error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
