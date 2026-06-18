import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'
import { normalizePhone } from '@/lib/phone'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase, user } = await getAuthUser()
    if (!user) return unauthorized()
    
    const { data, error } = await supabase
      .from('campaigns')
      .select('*, company:companies(name)')
      .neq('status','deleted')
      .neq('status','archived')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Flatten the joined company to a plain name for the client
    const campaigns = (data ?? []).map((c) => ({ ...c, company: c.company?.name ?? null }))
    return NextResponse.json({ campaigns })
  } catch (err) {
    console.error('API Route Error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await getAuthUser()
    if (!user) return unauthorized()

    const body = await req.json()
    const {
      name, agent, company_id, sip_trunk_id, audio_path,
      dialing_speed, window_start, window_end, start_date, end_date, contacts,
    } = body

    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    // A campaign must belong to a company (enforced in the create wizard too).
    if (!company_id) return NextResponse.json({ error: 'company required' }, { status: 400 })

    // 1. Insert Campaign — agent (= product) is optional; company is required (issue #31).
    const { data: campaign, error: cErr } = await supabase.from('campaigns').insert({
      name, agent: agent || null, company_id, status: 'draft',
      sip_trunk_id: sip_trunk_id || null,           // outbound trunk (ST_…); null = env default
      audio_path: audio_path || null,               // unified script audio (url or storage key)
      dialing_speed: dialing_speed ?? 1,
      time_window_start: window_start ?? '08:00',
      time_window_end: window_end ?? '20:00',
      start_date: start_date || null,               // campaign date range
      end_date: end_date || null,
      transfer_key: body.transfer_key ?? '',
      transfer_target: body.transfer_target ?? '',
    }).select().single()

    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

    // 2. Contacts are M:N (unique per campaign): one canonical contact per phone, linked to the
    //    campaign via campaign_contacts. Reuse an existing contact for a phone, create the rest,
    //    then upsert the join rows (the unique (campaign_id, contact_id) makes re-links no-ops).
    if (contacts && Array.isArray(contacts) && contacts.length > 0) {
      // Normalize + dedup the incoming list by phone (a CSV may repeat a number).
      const incoming = new Map<string, { phone: string; first_name?: string; last_name?: string }>()
      for (const c of contacts) {
        const phone = normalizePhone(c.phone)
        if (phone && !incoming.has(phone)) incoming.set(phone, { phone, first_name: c.first_name, last_name: c.last_name })
      }
      const phones = [...incoming.keys()]

      // Map phone → canonical contact id (existing rows first).
      const byPhone = new Map<string, number>()
      const { data: existing } = await supabase.from('contacts').select('id, phone').in('phone', phones)
      for (const r of existing ?? []) byPhone.set(r.phone, r.id)

      // Create the contacts we don't have yet.
      const toCreate = phones.filter(p => !byPhone.has(p)).map(p => incoming.get(p)!)
      if (toCreate.length) {
        const { data: inserted, error: insErr } = await supabase
          .from('contacts')
          .insert(toCreate.map(c => ({ phone: c.phone, first_name: c.first_name ?? null, last_name: c.last_name ?? null })))
          .select('id, phone')
        if (insErr) console.error('Error inserting contacts:', insErr)
        for (const r of inserted ?? []) byPhone.set(r.phone, r.id)
      }

      // Link every contact to this campaign (unique per campaign).
      const links = [...byPhone.values()].map(contact_id => ({ campaign_id: campaign.id, contact_id }))
      if (links.length) {
        const { error: linkErr } = await supabase
          .from('campaign_contacts')
          .upsert(links, { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true })
        if (linkErr) console.error('Error linking contacts:', linkErr)
      }
    }

    return NextResponse.json({ campaign }, { status: 201 })
  } catch (err) {
    console.error('API POST Error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
