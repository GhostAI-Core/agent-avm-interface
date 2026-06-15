import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'
import {
  isLivekitConfigured,
  isEgressConfigured,
  placeOutboundCall,
  resolveTrunkId,
  routrTrunkConfigError,
  startRoomRecording,
} from '@/lib/livekit'
import { normalizePhone } from '@/lib/phone'
import { resolveVoiceUrl } from '@/lib/voice'

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

  const { data: campaign, error: cErr } = await supabase.from('campaigns').select('*').eq('id', id).single()
  if (cErr || !campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const routrErr = routrTrunkConfigError(campaign)
  if (routrErr) {
    return NextResponse.json({ mode: 'live', error: routrErr, dispatched: 0, attempted: 0 }, { status: 503 })
  }

  const trunkId = await resolveTrunkId(supabase, campaign)
  if (!isLivekitConfigured(trunkId)) {
    return NextResponse.json({ mode: 'unconfigured' })
  }

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

  // Sign the campaign's voice recording once (short-lived) so the agent can fetch + play it.
  const voiceUrl = await resolveVoiceUrl(campaign)

  // TODO(cale): confirm pacing model. For now we dispatch a bounded batch immediately and
  // mark them dialed; final outcomes arrive via /api/livekit/webhook. `sip_trunk_id` and
  // `agent_name` are optional per-campaign overrides (migration 20260611100000) and fall
  // back to the LIVEKIT_* env defaults when unset.
  const contactIds = contacts.map(c => c.id)
  if (contactIds.length) {
    await supabase.from('contacts').update({ status: 'in_progress', last_attempted_at: new Date().toISOString() }).in('id', contactIds)
  }

  const results = await Promise.all(
    contacts.map(c =>
      placeOutboundCall({
        phone: normalizePhone(c.phone),
        campaignId: id,
        contactId: c.id,
        agentName: campaign.agent_name ?? campaign.agent ?? null,
        trunkId,
        metadata: {
          campaignName: campaign.name,
          firstName: c.first_name,
          lastName: c.last_name,
          voiceRecordingUrl: voiceUrl,
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

  // For each placed call: start a recording (best-effort) and create a 'pending'
  // call_records row keyed by room. The webhook (egress_ended / room_finished) and the
  // agent result endpoint then upsert that row in place as events arrive.
  const placed = contacts.map((c, i) => ({ c, r: results[i] })).filter(x => x.r.ok)
  const egressIds = await Promise.all(
    placed.map(x => (isEgressConfigured() ? startRoomRecording(x.r.room) : Promise.resolve(null))),
  )
  const now = new Date().toISOString()
  const records = placed.map((x, i) => ({
    campaign_id: Number(id),
    contact_id: x.c.id,
    phone: normalizePhone(x.c.phone),
    room: x.r.room,
    egress_id: egressIds[i]?.egressId ?? null,
    outcome: 'pending',
    called_at: now,
  }))
  if (records.length) {
    const { error: recErr } = await supabase.from('call_records').insert(records)
    if (recErr) console.error('call_records insert failed:', recErr.message)
  }

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
