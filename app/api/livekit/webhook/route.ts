import { NextResponse } from 'next/server'
import { isLivekitAuthConfigured, webhookReceiver } from '@/lib/livekit'
import { createAdminClient } from '@/utils/supabase/admin'
import { rollNumberState } from '@/lib/compliance/rollover'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * LiveKit webhook receiver — point your LiveKit project's webhook at this URL
 * (Project Settings → Webhooks → https://<host>/api/livekit/webhook).
 *
 * Validates the signature, then updates the call_records row for the event's room
 * (rows are created 'pending' by the dial route, keyed by room):
 *   - participant_joined (the SIP caller answered) → outcome 'connected'
 *   - egress_ended                                 → recording_url (the stored file)
 *   - room_finished                                → fill talk_seconds; anything still
 *                                                    'pending' never connected → 'no_answer'
 *
 * Rich outcomes + intents come from the agent via /api/calls/result; this covers
 * answered/duration/recording even when the agent reports nothing.
 */
export async function POST(req: Request) {
  if (!isLivekitAuthConfigured()) {
    return NextResponse.json({ ok: false, reason: 'gateway not configured' }, { status: 503 })
  }

  const body = await req.text()
  const authHeader = req.headers.get('Authorization') ?? ''

  let event
  try {
    event = await webhookReceiver().receive(body, authHeader)
  } catch (err) {
    console.error('LiveKit webhook validation failed:', err)
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  const admin = createAdminClient()
  if (!admin) {
    // No service-role key → we can't write past RLS. Ack so LiveKit stops retrying.
    console.warn('LiveKit webhook: SUPABASE_SERVICE_ROLE_KEY not set; skipping DB write for', event.event)
    return NextResponse.json({ ok: true, persisted: false })
  }

  try {
    switch (event.event) {
      case 'participant_joined': {
        const room = event.room?.name
        // Only the dialed callee matters (identity is `caller_<contactId>`), not the agent.
        if (room && event.participant?.identity?.startsWith('caller_')) {
          await admin.from('call_records').update({ outcome: 'connected' }).eq('room', room).eq('outcome', 'pending')
          // The callee answered → reached. End the day for this number (cross-campaign).
          await rollNumberState(admin, room, true)
        }
        break
      }

      case 'egress_ended': {
        const eg = event.egressInfo
        const room = eg?.roomName
        const location = eg?.fileResults?.[0]?.location
        if (room && location) {
          await admin.from('call_records').update({ recording_url: location }).eq('room', room)
        }
        break
      }

      case 'room_finished': {
        const room = event.room
        if (room?.name) {
          // Fallback talk time for answered calls the agent didn't report (unix seconds).
          if (room.creationTime) {
            const secs = Math.max(0, Number(event.createdAt - room.creationTime))
            await admin.from('call_records').update({ talk_seconds: secs })
              .eq('room', room.name).eq('outcome', 'connected').eq('talk_seconds', 0)
          }
          // Never answered → no_answer. Bump the retryable attempt count + spaced next_eligible_at,
          // but only for rows that were still 'pending' (i.e. this event is what made it no_answer).
          const { data: stillPending } = await admin
            .from('call_records').select('id').eq('room', room.name).eq('outcome', 'pending').maybeSingle()
          await admin.from('call_records').update({ outcome: 'no_answer' }).eq('room', room.name).eq('outcome', 'pending')
          if (stillPending) {
            await rollNumberState(admin, room.name, false)
            await admin.rpc('apply_call_score', { p_room: room.name, p_outcome: 'no_answer' }) // -1: cost us a dial, no contact
          }
        }
        break
      }
    }
  } catch (err) {
    console.error('LiveKit webhook DB write failed for', event.event, err)
  }

  return NextResponse.json({ ok: true })
}
