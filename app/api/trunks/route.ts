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
