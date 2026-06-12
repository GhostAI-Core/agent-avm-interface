import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseRoomName } from '@/lib/livekit'

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
 *     intents?: { name: string, step?: number }[]   // intents reached, for the waterfall
 *   }
 */
const OUTCOMES = new Set([
  'pending', 'connected', 'qualified', 'voicemail', 'no_speech', 'hangup',
  'ni', 'dnq', 'callback', 'no_answer', 'busy', 'failed',
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
    transferred?: boolean; cost?: number; intents?: { name: string; step?: number }[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const { room, outcome, talkSeconds, transferred, cost, intents } = body
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

  // Intent waterfall — count each reached intent for the call's campaign, today.
  if (Array.isArray(intents) && intents.length) {
    const ids = parseRoomName(room)
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
