import { NextResponse } from 'next/server'
import { isLivekitAuthConfigured, webhookReceiver } from '@/lib/livekit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * LiveKit webhook receiver — point your LiveKit project's webhook at this URL
 * (Project Settings → Webhooks → https://<host>/api/livekit/webhook).
 *
 * Validates the signature with the LiveKit API key/secret, then maps events to call
 * results. Scaffold only: the outcome mapping is left as a TODO because the Seeker/Grace
 * agents likely report structured results themselves — this must align with that source
 * before it writes real reporting rows.
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

  // TODO(cale): map LiveKit events → call outcomes and write to call_records / call_logs.
  // Relevant events: `room_finished` (call ended → duration), participant join/leave
  // (answered vs. no-answer), and any agent-published result data. Align with however
  // Seeker/Grace currently record outcome + intent so reporting stays consistent.
  console.log('LiveKit webhook:', event.event, 'room:', event.room?.name)

  return NextResponse.json({ ok: true })
}
