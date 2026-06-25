import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * callops call-outcome SECONDARY CHECK (reconciliation).
 *
 * callops is the source of truth: the agent posts each outcome to `POST $CALLOPS_URL/calls/outcome`
 * and callops writes the `call_records` row itself (the "first load"). callops ALSO forwards the same
 * outcome payload here so the dashboard can backfill that row IF the primary write never landed
 * (callops down mid-write, DB blip, etc.). This is a safety net, not the main path.
 *
 * Idempotent by design: we check for an existing row by `room` and only INSERT when it's missing, so
 * if callops already wrote the row (the normal case) this is a no-op. We never update an existing row —
 * callops owns it. (`call_records` has only a PARTIAL unique index on room — `uq_call_records_room`,
 * WHERE room IS NOT NULL — which PostgREST upsert/onConflict can't target, hence check-then-insert with
 * a 23505 race guard rather than ON CONFLICT.)
 *
 *   auth : header `X-Webhook-Secret: <CALLOPS_WEBHOOK_SECRET>`
 *   body : the callops/agent CallOutcomeRequest — { contact_id, campaign_id, room_name, outcome, phone,
 *          talk_seconds?, transferred?, agent_outcome?, business_disposition?, ended_at? }
 *   resp : { ok, action: 'inserted' | 'exists' | 'skipped' }
 *
 * ASSUMPTIONS to confirm with Cale (the callops→dashboard forward is his in-progress work):
 *   1. callops posts the SAME CallOutcomeRequest shape it ingests, with `room_name` as the key.
 *   2. callops sends the RAW agent outcome (we normalise here to match call_records, mirroring
 *      callops' own _OUTCOME_MAP). If callops forwards an already-normalised outcome, drop the map.
 *   3. the shared secret reused for this direction is CALLOPS_WEBHOOK_SECRET.
 */

// Mirror callops' app/services/call_result_handler._OUTCOME_MAP so a backfilled row matches what
// callops would have written (identity fallback for everything else, e.g. voicemail/no_answer/busy).
const OUTCOME_MAP: Record<string, string> = {
  answered: 'connected',
  ivr: 'failed',
  opt_out: 'opted_out',
  subscribe: 'subscribed',
}

export async function POST(req: Request) {
  // Authenticate the callops→dashboard forward with the shared webhook secret.
  const secret = process.env.CALLOPS_WEBHOOK_SECRET
  if (!secret) {
    // No secret configured → can't trust callers. Ack so callops doesn't spin on retries.
    console.warn('[calls/result] CALLOPS_WEBHOOK_SECRET not set; ignoring reconciliation payload')
    return NextResponse.json({ ok: true, action: 'skipped' })
  }
  if (req.headers.get('X-Webhook-Secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const room = typeof body.room_name === 'string' ? body.room_name.trim() : ''
  const campaignId = Number(body.campaign_id)
  // room is the unique natural key for call_records; without it we can't reconcile safely.
  if (!room || !Number.isFinite(campaignId)) {
    return NextResponse.json({ error: 'room_name and campaign_id are required' }, { status: 400 })
  }

  const admin = createAdminClient()
  if (!admin) {
    console.warn('[calls/result] SUPABASE_SERVICE_ROLE_KEY not set; cannot backfill call_records')
    return NextResponse.json({ ok: true, action: 'skipped' })
  }

  const rawOutcome = typeof body.outcome === 'string' ? body.outcome : ''
  const record = {
    campaign_id: campaignId,
    contact_id: Number.isFinite(Number(body.contact_id)) ? Number(body.contact_id) : null,
    phone: typeof body.phone === 'string' ? body.phone : null,
    outcome: OUTCOME_MAP[rawOutcome] ?? rawOutcome,
    talk_seconds: Number.isFinite(Number(body.talk_seconds)) ? Number(body.talk_seconds) : 0,
    transferred: Boolean(body.transferred),
    room,
    agent_outcome: typeof body.agent_outcome === 'string' && body.agent_outcome ? body.agent_outcome : null,
    business_disposition:
      typeof body.business_disposition === 'string' && body.business_disposition ? body.business_disposition : null,
    called_at: typeof body.ended_at === 'string' && body.ended_at ? body.ended_at : new Date().toISOString(),
  }

  try {
    // Secondary check: did callops' primary write already land for this room? If so, leave it alone.
    const { data: existing } = await admin
      .from('call_records').select('id').eq('room', room).maybeSingle()
    if (existing) return NextResponse.json({ ok: true, action: 'exists' })

    // Gap detected — backfill the missing row.
    const { error } = await admin.from('call_records').insert(record)
    if (error) {
      // 23505 = unique violation: callops inserted it in the race window between our check and insert.
      if (error.code === '23505') return NextResponse.json({ ok: true, action: 'exists' })
      console.error('[calls/result] backfill failed:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    console.warn(`[calls/result] backfilled missing call_records row for room=${room} (callops primary write was absent)`)
    return NextResponse.json({ ok: true, action: 'inserted' })
  } catch (err) {
    console.error('[calls/result] reconciliation error:', err)
    return NextResponse.json({ error: 'reconciliation failed' }, { status: 500 })
  }
}
