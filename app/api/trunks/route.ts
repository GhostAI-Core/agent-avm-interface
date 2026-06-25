import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * SIP trunk catalog for the campaign wizard.
 *
 * callops resolves a campaign's trunk by INTEGER FK: campaigns.sip_trunk_id ->
 * sip_trunks.id -> sip_trunks.livekit_trunk_id. So the picker stores the sip_trunks
 * row id, and this route returns that catalog. We cross-reference callops
 * /livekit/trunks (server-side, secret-protected) so only rows backed by a real
 * LiveKit trunk are offered; if callops is unreachable we return the full catalog
 * rather than block creation.
 *
 * Returns `{ trunks: [{ id, name, from_number, live }] }`.
 */
export async function GET() {
  const { supabase, user } = await getAuthUser()
  if (!user) return unauthorized()

  const { data: rows, error } = await supabase
    .from('sip_trunks')
    .select('id, name, from_number, livekit_trunk_id')
    .order('id')
  if (error) return NextResponse.json({ trunks: [], error: error.message }, { status: 500 })

  // Which livekit_trunk_ids actually exist in LiveKit (via callops)?
  let liveIds: Set<string> | null = null
  const base = process.env.CALLOPS_URL?.replace(/\/+$/, '')
  const secret = process.env.CALLOPS_WEBHOOK_SECRET
  if (base && secret) {
    try {
      const res = await fetch(`${base}/livekit/trunks`, {
        headers: { 'X-Webhook-Secret': secret },
        cache: 'no-store',
      })
      if (res.ok) {
        const real = (await res.json()) as Array<{ trunk_id: string }>
        liveIds = new Set(real.map(t => t.trunk_id))
      }
    } catch {
      // callops unreachable → skip the cross-reference, show the full catalog.
    }
  }

  const trunks = (rows ?? [])
    .map(r => ({
      id: r.id as number,
      name: (r.name as string) ?? `Trunk ${r.id}`,
      from_number: (r.from_number as string) ?? null,
      live: liveIds ? liveIds.has(r.livekit_trunk_id as string) : true,
    }))
    .filter(t => t.live)

  return NextResponse.json({ trunks })
}

/**
 * Create / update a SIP trunk in LiveKit, via callops.
 *
 * callops owns LiveKit; we proxy server-side so CALLOPS_WEBHOOK_SECRET never reaches the
 * browser. There is NO separate update endpoint upstream — callops exposes a single
 * idempotent CREATE at POST /livekit/trunks, so both "add trunk" and "edit trunk" re-POST
 * the same body here. The auth_password is required on every write (it is never returned by
 * callops, so the client must re-supply it on edit too).
 *
 *   request  (all required): { name, address, numbers: string[], auth_username, auth_password }
 *   response (201):          { trunk_id, name, address, numbers, auth_username }   // no password
 *
 * When CALLOPS_URL / CALLOPS_WEBHOOK_SECRET are unset (local dev) we return a clear
 * "telephony not configured" response (503) instead of throwing, mirroring how the rest of
 * the callops proxies degrade.
 */
export async function POST(req: Request) {
  const { user } = await getAuthUser()
  if (!user) return unauthorized()

  const base = process.env.CALLOPS_URL?.replace(/\/+$/, '')
  const secret = process.env.CALLOPS_WEBHOOK_SECRET
  if (!base || !secret) {
    return NextResponse.json({ error: 'telephony not configured' }, { status: 503 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const address = typeof body.address === 'string' ? body.address.trim() : ''
  const auth_username = typeof body.auth_username === 'string' ? body.auth_username.trim() : ''
  const auth_password = typeof body.auth_password === 'string' ? body.auth_password : ''
  const numbers = Array.isArray(body.numbers)
    ? body.numbers.map(n => String(n).trim()).filter(Boolean)
    : []

  const missing: string[] = []
  if (!name) missing.push('name')
  if (!address) missing.push('address')
  if (!auth_username) missing.push('auth_username')
  if (!auth_password) missing.push('auth_password')
  if (numbers.length === 0) missing.push('numbers')
  if (missing.length) {
    return NextResponse.json({ error: `missing required field(s): ${missing.join(', ')}` }, { status: 400 })
  }

  try {
    const res = await fetch(`${base}/livekit/trunks`, {
      method: 'POST',
      headers: { 'X-Webhook-Secret': secret, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, address, numbers, auth_username, auth_password }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      // Pass a callops client error through with its real status + detail; only true upstream
      // faults (5xx) read as 502.
      const status = res.status >= 400 && res.status < 500 ? res.status : 502
      return NextResponse.json({ error: json?.detail ?? json?.error ?? `callops ${res.status}` }, { status })
    }
    return NextResponse.json(json)
  } catch (err) {
    console.error('callops trunk write proxy failed:', err)
    return NextResponse.json({ error: 'callops unreachable' }, { status: 502 })
  }
}
