import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const allowed = ['name', 'livekit_trunk_id', 'from_number', 'company_id']
    const payload = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)))
    if (!Object.keys(payload).length) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    const { supabase, user } = await getAuthUser()
    if (!user) return unauthorized()
    const { data, error } = await supabase.from('sip_trunks').update(payload).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ trunk: data })
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
    const { error } = await supabase.from('sip_trunks').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('API DELETE Error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
