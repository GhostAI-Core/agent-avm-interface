import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'
import { isLivekitConfigured, placeOutboundCall } from '@/lib/livekit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Safety cap per invocation. The real pacing model (place the whole list at
// dialing_speed within the time window via a worker/queue, vs. hand the list to the
// gateway) is still TBD with Cale — see TODO below.
const BATCH_LIMIT = 25

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, user } = await getAuthUser()
  if (!user) return unauthorized()

  // Gateway not wired yet → tell the client to fall back to the simulator.
  if (!isLivekitConfigured()) {
    return NextResponse.json({ mode: 'unconfigured' })
  }

  const { data: campaign, error: cErr } = await supabase.from('campaigns').select('*').eq('id', id).single()
  if (cErr || !campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const { data: contacts, error: cntErr } = await supabase
    .from('contacts')
    .select('*')
    .eq('campaign_id', id)
    .eq('status', 'pending')
    .limit(BATCH_LIMIT)
  if (cntErr) return NextResponse.json({ error: cntErr.message }, { status: 500 })

  if (!contacts || contacts.length === 0) {
    await supabase.from('campaigns').update({ status: 'completed' }).eq('id', id)
    return NextResponse.json({ mode: 'live', dispatched: 0, status: 'completed' })
  }

  // TODO(cale): confirm pacing model. For now we dispatch a bounded batch immediately and
  // mark them dialed; final outcomes arrive via /api/livekit/webhook. `sip_trunk_id` and
  // `agent_name` are optional per-campaign overrides (migration 20260611100000) and fall
  // back to the LIVEKIT_* env defaults when unset.
  const results = await Promise.all(
    contacts.map(c =>
      placeOutboundCall({
        phone: c.phone,
        campaignId: id,
        contactId: c.id,
        agentName: campaign.agent_name ?? campaign.agent ?? null,
        trunkId: campaign.sip_trunk_id ?? null,
        metadata: {
          campaignName: campaign.name,
          firstName: c.first_name,
          lastName: c.last_name,
          voiceRecordingUrl: campaign.voice_recording_url,
          transferKey: campaign.transfer_key,
          transferTarget: campaign.transfer_target,
        },
      }),
    ),
  )

  const dialedIds = contacts.filter((_, i) => results[i].ok).map(c => c.id)
  const failedIds = contacts.filter((_, i) => !results[i].ok).map(c => c.id)
  if (dialedIds.length) await supabase.from('contacts').update({ status: 'dialed' }).in('id', dialedIds)
  if (failedIds.length) await supabase.from('contacts').update({ status: 'failed' }).in('id', failedIds)

  const dispatched = dialedIds.length
  await supabase.from('security_logs').insert({
    event_type: 'campaign_execution',
    agent_name: 'LiveKit Gateway',
    details: `Dispatched ${dispatched}/${contacts.length} outbound calls for "${campaign.name}".`,
    ip_address: '127.0.0.1',
  })

  return NextResponse.json({
    mode: 'live',
    dispatched,
    attempted: contacts.length,
    errors: results.filter(r => !r.ok).map(r => r.error),
  })
}
