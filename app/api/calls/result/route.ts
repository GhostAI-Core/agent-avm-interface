import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseRoomName } from '@/lib/livekit'
import { isReachedOutcome, isRetryableOutcome } from '@/lib/compliance/outcomes'
import { rollNumberState } from '@/lib/compliance/rollover'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Agent → app call result. The LiveKit outbound agent POSTs the structured outcome for a
 * call here when it ends (server-to-server, so it's guarded by a shared secret rather than
 * a user session). Upserts the call_records row for the room and bumps the intent waterfall.
 *
 *   POST /api/calls/result
 *   headers: { 'x-agent-secret': AGENT_RESULT_SECRET }
 *   body: {
 *     room: string,                 // the LiveKit room, e.g. "avm_42_1007_ab12cd34"
 *     outcome: string,              // one of the call_records outcomes
 *     talkSeconds?: number,
 *     transferred?: boolean,
 *     cost?: number,
 *     intents?: { name: string, step?: number }[],  // intents reached, for the waterfall
 *     optOut?: boolean              // caller asked to be removed — suppress all future calls
 *   }
 */
const OUTCOMES = new Set([
  'pending', 'connected', 'qualified', 'voicemail', 'no_speech', 'hangup',
  'ni', 'dnq', 'callback', 'no_answer', 'busy', 'failed', 'dropped_no_response',
])

export async function POST(req: Request) {
  const secret = process.env.AGENT_RESULT_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'agent result endpoint not configured' }, { status: 503 })
  }
  if (req.headers.get('x-agent-secret') !== secret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 503 })
  }

  let body: {
    room?: string; outcome?: string; talkSeconds?: number;
    transferred?: boolean; cost?: number; intents?: { name: string; step?: number }[];
    optOut?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const { room, outcome, talkSeconds, transferred, cost, intents, optOut } = body
  if (!room) return NextResponse.json({ error: 'room is required' }, { status: 400 })
  if (outcome && !OUTCOMES.has(outcome)) {
    return NextResponse.json({ error: `invalid outcome "${outcome}"` }, { status: 400 })
  }

  // Update only the fields the agent actually sent.
  const patch: Record<string, unknown> = {}
  if (outcome !== undefined) patch.outcome = outcome
  if (typeof talkSeconds === 'number') patch.talk_seconds = Math.max(0, Math.round(talkSeconds))
  if (typeof transferred === 'boolean') patch.transferred = transferred
  if (typeof cost === 'number') patch.cost = cost

  if (Object.keys(patch).length) {
    const { error } = await admin.from('call_records').update(patch).eq('room', room)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Campaign/contact ids parsed from the room — both the rollover and opt-out paths use them.
  const ids = parseRoomName(room)

  // Roll the per-number daily ledger forward (plan.md §5.4). A reached outcome ends the day for
  // this number on every campaign; a retryable one bumps attempts and pushes next_eligible_at out
  // by cooldown + random jitter. Pending/unknown outcomes skip.
  if (outcome && (isReachedOutcome(outcome) || isRetryableOutcome(outcome))) {
    await rollNumberState(admin, room, isReachedOutcome(outcome))
  }

  // Master-sheet score (cost control): nudge the contact's global score ±1 by this outcome, once
  // per call. At -10 the gate marks the number dead and stops dialing it everywhere.
  if (outcome) {
    await admin.rpc('apply_call_score', { p_room: room, p_outcome: outcome })
  }

  // Opt-out write-back (plan.md §7): the worker heard a removal request. Consent is PER-PRODUCT
  // (product = the campaign's agent value), so we opt the contact out of THIS product only —
  // it blocks every campaign of the same product, but never another product.
  if (optOut === true && ids) {
    const nowIso = new Date().toISOString()
    const { data: camp } = await admin.from('campaigns').select('agent').eq('id', ids.campaignId).maybeSingle()
    const product = camp?.agent ?? null
    if (product) {
      await admin.from('product_consent').upsert(
        { contact_id: ids.contactId, product, consent_status: 'opted_out', consent_source: 'in_call', consent_at: nowIso, updated_at: nowIso },
        { onConflict: 'contact_id,product' },
      )
    }
    await admin.from('compliance_events').insert({
      contact_id: ids.contactId,
      campaign_id: ids.campaignId,
      event_type: 'opt_out',
      reason: product ? `in_call:${product}` : 'in_call',
    })
  }

  // Intent waterfall — count each reached intent for the call's campaign, today.
  if (Array.isArray(intents) && intents.length) {
    if (ids) {
      const day = new Date().toISOString().slice(0, 10)
      await Promise.all(intents.map((it, i) =>
        admin.rpc('bump_intent', {
          p_campaign: ids.campaignId,
          p_day: day,
          p_intent: it.name,
          p_step: it.step ?? i,
        }),
      ))
    }
  }

  return NextResponse.json({ ok: true })
}
