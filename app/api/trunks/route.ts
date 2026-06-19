import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Live SIP trunk catalog for the campaign wizard → proxies callops /livekit/trunks.
 *
 * The campaign's `sip_trunk_id` is read DIRECTLY by callops as the LiveKit trunk id
 * (ST_…), so the picker must offer the trunks LiveKit actually has — not a stale local
 * catalog. Proxied server-side so CALLOPS_WEBHOOK_SECRET never reaches the browser.
 *
 * Returns `{ trunks: [{ trunk_id, name, from_number, numbers }] }`. When callops is
 * unconfigured (local dev) returns an empty list so the UI degrades gracefully.
 */
export async function GET() {
  const { user } = await getAuthUser()
  if (!user) return unauthorized()

  const base = process.env.CALLOPS_URL?.replace(/\/+$/, '')
  const secret = process.env.CALLOPS_WEBHOOK_SECRET
  if (!base || !secret) return NextResponse.json({ trunks: [], mode: 'unconfigured' })

  try {
    const res = await fetch(`${base}/livekit/trunks`, {
      headers: { 'X-Webhook-Secret': secret },
      cache: 'no-store',
    })
    if (!res.ok) return NextResponse.json({ trunks: [], error: `callops ${res.status}` }, { status: 502 })
    const raw = (await res.json()) as Array<{ trunk_id: string; name?: string; numbers?: string[] }>
    const trunks = (raw ?? []).map(t => ({
      trunk_id: t.trunk_id,
      name: t.name ?? t.trunk_id,
      from_number: t.numbers?.[0] ?? null,
      numbers: t.numbers ?? [],
    }))
    return NextResponse.json({ trunks })
  } catch (err) {
    console.error('trunks proxy failed:', err)
    return NextResponse.json({ trunks: [], error: 'callops unreachable' }, { status: 502 })
  }
}
