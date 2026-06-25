import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Place a one-off test call through a SIP trunk, via callops → LiveKit.
 *
 * callops owns LiveKit; we proxy server-side so CALLOPS_WEBHOOK_SECRET never reaches the
 * browser. Both success and failure come back as upstream 200 with the result in the body
 * ({ ok, sip_status_code, sip_status, message, … }); callops only 400s when sip_trunk_id is
 * missing. We require phone + sip_trunk_id here too so an obvious mistake fails fast.
 *
 *   request  : { phone, sip_trunk_id, room_name?, participant_identity?, participant_name?,
 *                from_number?, wait_until_answered?, krisp_enabled?, timeout_seconds? }
 *   response : { ok, room_name?, sip_trunk_id?, phone?, participant_identity?,
 *                sip_status_code?, sip_status?, message? }
 *
 * When CALLOPS_URL / CALLOPS_WEBHOOK_SECRET are unset (local dev) we return a clear
 * "telephony not configured" response (503) instead of throwing.
 */
export async function POST(req: Request) {
  const { user } = await getAuthUser()
  if (!user) return unauthorized()

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const sip_trunk_id = typeof body.sip_trunk_id === 'string' ? body.sip_trunk_id.trim() : ''

  // Mirror callops' own validation: phone + sip_trunk_id are required.
  const missing: string[] = []
  if (!phone) missing.push('phone')
  if (!sip_trunk_id) missing.push('sip_trunk_id')
  if (missing.length) {
    return NextResponse.json({ error: `missing required field(s): ${missing.join(', ')}` }, { status: 400 })
  }

  const base = process.env.CALLOPS_URL?.replace(/\/+$/, '')
  const secret = process.env.CALLOPS_WEBHOOK_SECRET
  if (!base || !secret) {
    return NextResponse.json({ error: 'telephony not configured' }, { status: 503 })
  }

  // Forward only the fields the caller actually supplied so callops applies its own defaults
  // (participant_identity="sip-test", wait_until_answered=true, krisp_enabled=true, timeout=45, …).
  const payload: Record<string, unknown> = { phone, sip_trunk_id }
  for (const k of [
    'room_name', 'participant_identity', 'participant_name', 'from_number',
    'wait_until_answered', 'krisp_enabled', 'timeout_seconds',
  ] as const) {
    if (body[k] !== undefined && body[k] !== '') payload[k] = body[k]
  }

  try {
    const res = await fetch(`${base}/livekit/test-call`, {
      method: 'POST',
      headers: { 'X-Webhook-Secret': secret, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      // A failed *call* still returns 200 with ok:false; a non-2xx here is a request/upstream
      // fault (e.g. 400 missing sip_trunk_id). Pass 4xx through, fold 5xx into 502.
      const status = res.status >= 400 && res.status < 500 ? res.status : 502
      return NextResponse.json({ error: json?.detail ?? json?.error ?? `callops ${res.status}` }, { status })
    }
    return NextResponse.json(json)
  } catch (err) {
    console.error('callops test-call proxy failed:', err)
    return NextResponse.json({ error: 'callops unreachable' }, { status: 502 })
  }
}
