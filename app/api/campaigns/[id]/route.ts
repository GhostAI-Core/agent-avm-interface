import { NextResponse } from 'next/server'
import { getAuthUser, getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsPatch, callopsPost, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

function callopsEnv() {
  return { base: process.env.CALLOPS_URL?.replace(/\/+$/, ''), secret: process.env.CALLOPS_WEBHOOK_SECRET }
}

/**
 * Campaign read-through → callops `GET /campaigns/{id}` (via X-Webhook-Secret, server-side).
 * Surfaces the `summary` aggregates (connected / opt_out / calls_total …) the dashboard can't
 * re-derive client-side — `opt_out` exists only here. When callops is unconfigured we report
 * `{ summary: null }` so the campaign view degrades to its contact-status counts without error.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user } = await getAuthUser()
  if (!user) return unauthorized()

  const { base, secret } = callopsEnv()
  if (!base || !secret) return NextResponse.json({ mode: 'unconfigured', summary: null })

  try {
    const res = await fetch(`${base}/campaigns/${id}`, {
      headers: { 'X-Webhook-Secret': secret },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const status = res.status >= 400 && res.status < 500 ? res.status : 502
      return NextResponse.json({ error: json?.detail ?? `callops ${res.status}`, summary: null }, { status })
    }
    // callops returns the campaign object with an embedded `summary` block.
    return NextResponse.json({ summary: json?.summary ?? null, campaign: json ?? null })
  } catch (err) {
    console.error('callops campaign read proxy failed:', err)
    return NextResponse.json({ error: 'callops unreachable', summary: null }, { status: 502 })
  }
}

// Edit campaign → CallOps PATCH /campaigns/{id} (bearer). Lifecycle `status` stays out
// (owned by the control proxy). voice_id/company_id/start_date aren't in CampaignUpdate, so
// they're dropped (voice_id gap flagged for Cale); `audio_path` maps to voice_recording_url.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { token } = await getAccessToken()
  if (!token) return unauthorized()
  const body = await req.json().catch(() => ({}))

  const passthrough = ['name', 'agent', 'dialing_speed', 'time_window_start', 'time_window_end',
    'max_concurrent', 'max_retries', 'retry_cooldown_seconds', 'sip_trunk_id',
    'voice_recording_url', 'voice_path', 'transfer_key', 'transfer_target', 'network_provider',
    'voice_id', 'routing_mode']
  const payload: Record<string, unknown> = {}
  for (const k of passthrough) if (body[k] !== undefined) payload[k] = body[k]
  // The edit form may send the script URL as audio_path — feed the dispatcher-read column.
  if (payload.voice_recording_url === undefined && body.audio_path !== undefined) {
    payload.voice_recording_url = body.audio_path
  }
  if (!Object.keys(payload).length) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

  try {
    const data = await callopsPatch<{ campaign?: unknown }>(`/campaigns/${id}`, token, payload)
    return NextResponse.json({ campaign: (data as { campaign?: unknown })?.campaign ?? data })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}

// Soft-archive via CallOps (no hard delete in v1).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { token } = await getAccessToken()
  if (!token) return unauthorized()
  try {
    await callopsPost(`/campaigns/${id}/archive`, token)
    return NextResponse.json({ success: true })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
