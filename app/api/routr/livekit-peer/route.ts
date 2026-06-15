import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-admin'
import { createRoutrClients } from '@/lib/routr/client'
import { liveKitSettingsFromEnv, syncLiveKitPeer } from '@/lib/routr/sync-livekit-peer'
import { routrErrorStatus } from '@/lib/routr/sync-provider-row'
import { ROUTR_LIVEKIT_SETTINGS_KEY, type LiveKitPeerSettings } from '@/lib/types/voip-provider'

export const dynamic = 'force-dynamic'

function maskSettings(settings: LiveKitPeerSettings): LiveKitPeerSettings {
  return {
    ...settings,
    peer_password: settings.peer_password ? '********' : '',
  }
}

async function loadSettings(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('system_settings')
    .select('config')
    .eq('id', ROUTR_LIVEKIT_SETTINGS_KEY)
    .maybeSingle()

  const stored = (data?.config || {}) as Partial<LiveKitPeerSettings>
  const fromEnv = liveKitSettingsFromEnv()

  return {
    sip_host: stored.sip_host || fromEnv.sip_host,
    allowed_cidrs: stored.allowed_cidrs ?? fromEnv.allowed_cidrs ?? '',
    peer_username: stored.peer_username || fromEnv.peer_username,
    peer_password: stored.peer_password || fromEnv.peer_password || '',
  } satisfies LiveKitPeerSettings
}

export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const settings = await loadSettings(auth.supabase)
  return NextResponse.json({ settings: maskSettings(settings) })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await req.json()
  const sip_host = String(body.sip_host || '').trim().replace(/^sip:/i, '')
  if (!sip_host) {
    return NextResponse.json({ error: 'sip_host is required (host:port, no sip: prefix)' }, { status: 400 })
  }

  const current = await loadSettings(auth.supabase)
  const peer_password = body.keep_password && !body.peer_password
    ? current.peer_password
    : String(body.peer_password || '')

  const settings: LiveKitPeerSettings = {
    sip_host,
    allowed_cidrs: String(body.allowed_cidrs || '').trim() || undefined,
    peer_username: String(body.peer_username || 'livekit').trim() || 'livekit',
    peer_password: peer_password || undefined,
  }

  const { error: upsertErr } = await auth.supabase.from('system_settings').upsert({
    id: ROUTR_LIVEKIT_SETTINGS_KEY,
    config: settings,
    updated_at: new Date().toISOString(),
  })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  try {
    const clients = createRoutrClients()
    await syncLiveKitPeer(clients, settings)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { settings: maskSettings(settings), sync_error: message, routr_unreachable: routrErrorStatus(err) === 503 },
      { status: routrErrorStatus(err) },
    )
  }

  return NextResponse.json({ settings: maskSettings(settings) })
}
