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
    const campaigns = (data ?? []).map((c: any) => ({ ...c, company: c.company?.name ?? null }))
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
    const { name, agent, dialing_speed, window_start, window_end, voice_recording_url, voice_path, contacts,
      max_concurrent, max_retries, retry_cooldown_seconds, sip_trunk_id } = body

    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

    // Form fields arrive as strings (FormData). Coerce to int, keeping callops' column
    // defaults when blank/invalid. 0 is valid for retries, so don't use `|| fallback`.
    const toInt = (v: unknown, fallback: number) => {
      const n = Number(v)
      return Number.isFinite(n) ? Math.trunc(n) : fallback
    }

    // 1. Insert Campaign — agent is optional in the fast-dial flow (stored NULL when unset).
    const { data: campaign, error: cErr } = await supabase.from('campaigns').insert({
      name, agent: agent || null, status: 'draft',
      dialing_speed: dialing_speed ?? 1,
      time_window_start: window_start ?? '08:00',
      time_window_end: window_end ?? '20:00',
      max_concurrent: toInt(max_concurrent, 5),
      max_retries: toInt(max_retries, 2),
      retry_cooldown_seconds: toInt(retry_cooldown_seconds, 3600),
      // FK to sip_trunks.id; callops resolves it to the LiveKit trunk for dialing.
      sip_trunk_id: sip_trunk_id != null && sip_trunk_id !== '' ? Number(sip_trunk_id) : null,
      voice_recording_url: voice_recording_url ?? '',
      voice_path: voice_path ?? null,
      transfer_key: body.transfer_key ?? '',
      transfer_target: body.transfer_target ?? '',
    }).select().single()

    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

    // 2. Insert Contacts if any — normalise to E.164 (callops/LiveKit SIP require it)
    // and drop rows whose phone can't be coerced into a dialable number.
    if (contacts && Array.isArray(contacts) && contacts.length > 0) {
      const contactsWithCampaign = contacts
        .map((c: any) => ({
          campaign_id: campaign.id,
          phone: normalizePhone(c.phone),
          first_name: c.first_name,
          last_name: c.last_name,
        }))
        .filter((c: { phone: string }) => c.phone)

      const { error: cntErr } = await supabase.from('contacts').insert(contactsWithCampaign)
      if (cntErr) console.error('Error inserting contacts:', cntErr)
    }

    return NextResponse.json({ campaign }, { status: 201 })
  } catch (err) {
    console.error('API POST Error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
