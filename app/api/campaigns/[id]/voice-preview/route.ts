import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'
import { resolveVoiceUrl } from '@/lib/voice'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * UI-only: returns a short-lived signed URL for a campaign's stored voice recording so it
 * can be previewed/played in the app. Dial-time signing for the agent is owned by
 * evra_callops, NOT this app — this endpoint is purely for the dashboard.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, user } = await getAuthUser()
  if (!user) return unauthorized()

  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('voice_path, voice_recording_url')
    .eq('id', id)
    .single()
  if (error || !campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const url = await resolveVoiceUrl(campaign)
  return NextResponse.json({ url })
}
