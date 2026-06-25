import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Update / delete a SIP outbound trunk in LiveKit, via callops — addressed by the LiveKit
 * `trunk_id` (ST_…), not our integer sip_trunks.id.
 *
 *   PATCH  /api/trunks/{trunk_id} → callops PATCH  /livekit/trunks/{trunk_id}  (partial update)
 *   DELETE /api/trunks/{trunk_id} → callops DELETE /livekit/trunks/{trunk_id}
 *
 * callops owns LiveKit; we proxy server-side so CALLOPS_WEBHOOK_SECRET never reaches the
 * browser. Replaces the old "edit re-POSTs create" path (callops now has a real PATCH, so
 * editing no longer risks duplicating the trunk). When CALLOPS_URL / CALLOPS_WEBHOOK_SECRET
 * are unset we return 503 (telephony not configured), mirroring the other trunk proxies.
 */
function callopsEnv() {
  return { base: process.env.CALLOPS_URL?.replace(/\/+$/, ''), secret: process.env.CALLOPS_WEBHOOK_SECRET }
}

// Only forward the recognised, non-empty trunk fields callops accepts on a partial update.
function patchBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) out.name = body.name.trim()
  if (typeof body.address === 'string' && body.address.trim()) out.address = body.address.trim()
  if (typeof body.auth_username === 'string' && body.auth_username.trim()) out.auth_username = body.auth_username.trim()
  if (typeof body.auth_password === 'string' && body.auth_password) out.auth_password = body.auth_password
  if (Array.isArray(body.numbers)) {
    const numbers = body.numbers.map((n) => String(n).trim()).filter(Boolean)
    if (numbers.length) out.numbers = numbers
  }
  return out
}

export async function PATCH(req: Request, { params }: { params: Promise<{ trunk_id: string }> }) {
  const { trunk_id } = await params
  const { user } = await getAuthUser()
  if (!user) return unauthorized()

  const { base, secret } = callopsEnv()
  if (!base || !secret) return NextResponse.json({ error: 'telephony not configured' }, { status: 503 })

  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const body = patchBody(raw)
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  }

  try {
    const res = await fetch(`${base}/livekit/trunks/${encodeURIComponent(trunk_id)}`, {
      method: 'PATCH',
      headers: { 'X-Webhook-Secret': secret, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      // Pass a callops client error (404 not found, 422 validation) through with its real status +
      // detail; only true upstream faults (5xx) read as 502.
      const status = res.status >= 400 && res.status < 500 ? res.status : 502
      return NextResponse.json({ error: json?.detail ?? json?.error ?? `callops ${res.status}` }, { status })
    }
    return NextResponse.json(json)
  } catch (err) {
    console.error('callops trunk update proxy failed:', err)
    return NextResponse.json({ error: 'callops unreachable' }, { status: 502 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ trunk_id: string }> }) {
  const { trunk_id } = await params
  const { user } = await getAuthUser()
  if (!user) return unauthorized()

  const { base, secret } = callopsEnv()
  if (!base || !secret) return NextResponse.json({ error: 'telephony not configured' }, { status: 503 })

  try {
    const res = await fetch(`${base}/livekit/trunks/${encodeURIComponent(trunk_id)}`, {
      method: 'DELETE',
      headers: { 'X-Webhook-Secret': secret },
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const status = res.status >= 400 && res.status < 500 ? res.status : 502
      return NextResponse.json({ error: json?.detail ?? json?.error ?? `callops ${res.status}` }, { status })
    }
    return NextResponse.json(json)
  } catch (err) {
    console.error('callops trunk delete proxy failed:', err)
    return NextResponse.json({ error: 'callops unreachable' }, { status: 502 })
  }
}
