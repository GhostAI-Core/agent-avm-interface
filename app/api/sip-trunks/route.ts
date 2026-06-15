import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'
import { DEMO_MODE } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// SIP trunks the control plane manages (replaces the old voip_providers section).
// evra_callops dials through these; this app only stores the config.

export async function GET() {
  const { supabase, user } = await getAuthUser()
  if (!user) return unauthorized()

  const { data, error } = await supabase
    .from('sip_trunks')
    .select('*, company:companies(name)')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Supabase error:', error)
    if (DEMO_MODE) {
      return NextResponse.json({
        trunks: [
          { id: 1, name: 'Primary (Routr)', livekit_trunk_id: 'ST_demo1', from_number: '+27100000000', company_id: null },
        ],
        demo: true,
      })
    }
    return NextResponse.json({ trunks: [] })
  }

  // Flatten the joined company to a plain name for the client.
  const trunks = (data ?? []).map((t: { company?: { name?: string } | null }) => ({
    ...t,
    company: t.company?.name ?? null,
  }))
  return NextResponse.json({ trunks })
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await getAuthUser()
  if (!user) return unauthorized()

  const body = await req.json()
  const { name, livekit_trunk_id, from_number, company_id } = body
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data, error } = await supabase
    .from('sip_trunks')
    .insert({
      name,
      livekit_trunk_id: livekit_trunk_id || null,
      from_number: from_number || null,
      company_id: company_id ? Number(company_id) : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ trunk: data }, { status: 201 })
}
