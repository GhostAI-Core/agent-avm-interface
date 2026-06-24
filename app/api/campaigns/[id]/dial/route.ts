import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'
import {
  isLivekitConfigured,
  isEgressConfigured,
  placeOutboundCall,
  resolveTrunkId,
  startRoomRecording,
} from '@/lib/livekit'
import { normalizePhone } from '@/lib/phone'
import { resolveVoiceUrl } from '@/lib/voice'
import { gateContacts, type GateContact, type NumberState } from '@/lib/compliance/gate'
import { maskPhone } from '@/lib/security'
import { resolveCallBehavior } from '@/lib/call-behavior'

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

  const trunkId = await resolveTrunkId(supabase, campaign)
  if (!isLivekitConfigured(trunkId)) {
    return NextResponse.json({ mode: 'unconfigured' })
  }

  // M:N: pending membership lives on the campaign_contacts join; contact identity (phone,
  // consent, timezone) comes from the canonical contacts row. cc_id is the join row id, used
  // for per-campaign status writes (a contact has a different status in each campaign).
  const { data: members, error: cntErr } = await supabase
    .from('campaign_contacts')
    .select('id, status, contact:contacts(id, phone, first_name, last_name, timezone, score)')
    .eq('campaign_id', id)
    .eq('status', 'pending')
    .limit(BATCH_LIMIT)
  if (cntErr) return NextResponse.json({ error: cntErr.message }, { status: 500 })

  const contacts = (members ?? [])
    .filter(m => m.contact)
    .map(m => {
      const ct = Array.isArray(m.contact) ? m.contact[0] : m.contact
      return {
        cc_id: m.id,                 // campaign_contacts join row id (per-campaign status target)
        id: ct.id,                   // canonical contact id
        phone: ct.phone,
        first_name: ct.first_name,
        last_name: ct.last_name,
        timezone: ct.timezone,
        score: ct.score ?? 0,
      }
    })

  if (contacts.length === 0) {
    await supabase.from('campaigns').update({ status: 'completed' }).eq('id', id)
    return NextResponse.json({ mode: 'live', dispatched: 0, status: 'completed' })
  }

  // ── Pre-dial compliance gate (plan.md §6) ──────────────────────────────────
  // Every contact must clear region → consent/DNC → calling window → freq cap → cooldown
  // before we place a call. Blocked contacts are SKIPPED, not failed — they stay 'pending'
  // so transient blocks (outside-window, cooldown) retry on a later run inside the window.
  const now = new Date()
  const phones = contacts.map(c => normalizePhone(c.phone))

  const { data: suppRows } = await supabase
    .from('suppression_list')
    .select('phone')
    .or(`company_id.is.null,company_id.eq.${campaign.company_id ?? 0}`)
  const suppressed = new Set((suppRows ?? []).map(r => r.phone as string))

  // Per-number daily rollover state (cross-campaign): reached / attempts / next_eligible_at.
  const { data: stateRows } = await supabase
    .from('dial_number_state')
    .select('phone, state_date, reached, attempts, next_eligible_at')
    .in('phone', phones)
  const numberState = new Map<string, NumberState>(
    (stateRows ?? []).map(r => [r.phone as string, r as NumberState]),
  )

  // Consent is PER-PRODUCT (product = the campaign's agent value). An opt-out of this product
  // on any campaign blocks the contact here; other products are unaffected.
  const product: string | null = campaign.agent ?? null
  const consentByContact = new Map<number, string>()
  if (product) {
    const { data: pcRows } = await supabase
      .from('product_consent')
      .select('contact_id, consent_status')
      .eq('product', product)
      .in('contact_id', contacts.map(c => c.id))
    for (const r of pcRows ?? []) consentByContact.set(r.contact_id, r.consent_status)
  }

  const gateInputs: GateContact[] = contacts.map(c => ({
    id: c.id,
    phone: normalizePhone(c.phone),
    consent_status: (consentByContact.get(c.id) ?? 'unknown') as GateContact['consent_status'],
    timezone: c.timezone ?? 'Africa/Johannesburg',
    score: c.score ?? 0,
  }))
  const decisions = gateContacts({ contacts: gateInputs, campaign, suppressed, numberState, now })
  const allowedIds = new Set(decisions.filter(d => d.allow).map(d => d.contact.id))
  const allowed = contacts.filter(c => allowedIds.has(c.id))
  const blocked = decisions.filter(d => !d.allow)

  // Audit every block (reason kept, phone masked) and tally reasons for the response.
  const blockedReasons: Record<string, number> = {}
  if (blocked.length) {
    await supabase.from('compliance_events').insert(
      blocked.map(d => {
        blockedReasons[d.reason!] = (blockedReasons[d.reason!] ?? 0) + 1
        return {
          contact_id: d.contact.id,
          campaign_id: Number(id),
          event_type: 'gate_block',
          reason: d.reason,
          phone_masked: maskPhone(d.contact.phone),
        }
      }),
    )
  }

  if (allowed.length === 0) {
    return NextResponse.json({ mode: 'live', dispatched: 0, blocked: blocked.length, blockedReasons })
  }

  // Sign the campaign's voice recording once (short-lived) so the agent can fetch + play it.
  const voiceUrl = await resolveVoiceUrl(campaign)

  // TODO(cale): confirm pacing model. For now we dispatch a bounded batch immediately and
  // mark them dialed; final outcomes arrive via /api/livekit/webhook. `sip_trunk_id` and
  // `agent_name` are optional per-campaign overrides (migration 20260611100000) and fall
  // back to the LIVEKIT_* env defaults when unset. Only gate-`allowed` contacts get here.
  const nowIso = now.toISOString()
  const recordingDisclosed = isEgressConfigured() && Boolean(campaign.disclosure_text)
  // In-call behavior the agent enforces (2s answer delay, AMD→hangup, 4s silence drop).
  const behavior = resolveCallBehavior(campaign)
  const ccIds = allowed.map(c => c.cc_id)
  if (ccIds.length) {
    await supabase.from('campaign_contacts').update({ status: 'in_progress', last_attempted_at: nowIso }).in('id', ccIds)
  }

  const results = await Promise.all(
    allowed.map(c =>
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
          // The worker reads the legally-required disclosure aloud (plan.md §2 boundary).
          disclosureText: campaign.disclosure_text ?? null,
          // In-call behavior knobs (also readable from the campaigns row by campaign_id).
          behavior,
          transferKey: campaign.transfer_key,
          transferTarget: campaign.transfer_target,
        },
      }),
    ),
  )

  const dialedCcIds = allowed.filter((_, i) => results[i].ok).map(c => c.cc_id)
  const failedCcIds = allowed.filter((_, i) => !results[i].ok).map(c => c.cc_id)
  if (dialedCcIds.length) await supabase.from('campaign_contacts').update({ status: 'dialed' }).in('id', dialedCcIds)
  if (failedCcIds.length) await supabase.from('campaign_contacts').update({ status: 'failed' }).in('id', failedCcIds)

  // Provisionally claim each placed number so a parallel run can't double-dial before the
  // outcome lands. The real attempt count + randomized next_eligible_at are written when the
  // outcome arrives (record_dial_outcome in /api/calls/result + webhook). Also audit gate_pass.
  const placedContacts = allowed.filter((_, i) => results[i].ok)
  if (placedContacts.length) {
    const holdSeconds = campaign.retry_cooldown_seconds ?? 3600
    await Promise.all(
      placedContacts.map(c => supabase.rpc('claim_dial', { p_phone: normalizePhone(c.phone), p_hold_seconds: holdSeconds })),
    )
    await supabase.from('compliance_events').insert(
      placedContacts.map(c => ({
        contact_id: c.id,
        campaign_id: Number(id),
        event_type: 'gate_pass',
        phone_masked: maskPhone(normalizePhone(c.phone)),
      })),
    )
  }

  // For each placed call: start a recording (best-effort) and create a 'pending'
  // call_records row keyed by room. The webhook (egress_ended / room_finished) and the
  // agent result endpoint then upsert that row in place as events arrive.
  const placed = allowed.map((c, i) => ({ c, r: results[i] })).filter(x => x.r.ok)
  const egressIds = await Promise.all(
    placed.map(x => (isEgressConfigured() ? startRoomRecording(x.r.room) : Promise.resolve(null))),
  )
  const records = placed.map((x, i) => ({
    campaign_id: Number(id),
    contact_id: x.c.id,
    phone: normalizePhone(x.c.phone),
    room: x.r.room,
    egress_id: egressIds[i]?.egressId ?? null,
    outcome: 'pending',
    recording_disclosed: recordingDisclosed,
    called_at: nowIso,
  }))
  if (records.length) {
    const { error: recErr } = await supabase.from('call_records').insert(records)
    if (recErr) console.error('call_records insert failed:', recErr.message)
  }

  const dispatched = dialedCcIds.length
  await supabase.from('security_logs').insert({
    event_type: 'campaign_execution',
    agent_name: 'LiveKit Gateway',
    details: `Dispatched ${dispatched}/${allowed.length} outbound calls for "${campaign.name}" (${blocked.length} gated).`,
    ip_address: '127.0.0.1',
  })

  return NextResponse.json({
    mode: 'live',
    dispatched,
    attempted: allowed.length,
    blocked: blocked.length,
    blockedReasons,
    errors: results.filter(r => !r.ok).map(r => r.error),
  })
}
