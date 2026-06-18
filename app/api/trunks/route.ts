import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * List the configured SIP outbound trunks for the campaign-create wizard's Outbound Trunk step.
 * A campaign stores the chosen `livekit_trunk_id` (ST_…) in campaigns.sip_trunk_id; null = use the
 * LIVEKIT_SIP_OUTBOUND_TRUNK_ID env default.
 */
export async function GET() {
  const { supabase, user } = await getAuthUser()
  if (!user) return unauthorized()
  const { data, error } = await supabase
    .from('sip_trunks')
    .select('id, name, livekit_trunk_id, from_number')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ trunks: data ?? [] })
}
