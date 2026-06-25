import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Campaign lifecycle proxy → evra-callops (issue #34).
 *
 * The orchestrator owns dispatch, pacing, concurrency and retries. The dashboard only
 * issues lifecycle commands; we proxy them server-side so CALLOPS_WEBHOOK_SECRET never
 * reaches the browser. callops writes the campaign row itself, so the client just refetches.
 *
 *   POST /api/campaigns/{id}/start | pause | stop   → callops /campaigns/{id}/{action}
 *   GET  /api/campaigns/{id}/status                 → callops /campaigns/{id}/status (live stats)
 *
 * When CALLOPS_URL / CALLOPS_WEBHOOK_SECRET are unset (local dev, pre-cutover) the POST
 * falls back to a direct status write so the controls still work; GET reports unconfigured.
 */
const ACTIONS: Record<string, { localStatus: string }> = {
  start: { localStatus: 'running' },
  pause: { localStatus: 'paused' },
  stop: { localStatus: 'stopped' },
}

function callopsEnv() {
  return { base: process.env.CALLOPS_URL?.replace(/\/+$/, ''), secret: process.env.CALLOPS_WEBHOOK_SECRET }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params
  const spec = ACTIONS[action]
  if (!spec) return NextResponse.json({ error: `unknown action "${action}"` }, { status: 404 })

  const { supabase, user } = await getAuthUser()
  if (!user) return unauthorized()

  const { base, secret } = callopsEnv()

  // No orchestrator wired. In production this must NOT happen — callops owns lifecycle, so the
  // dashboard refuses rather than writing campaigns.status itself. Outside production we mirror
  // the lifecycle locally so the dashboard stays usable without callops running.
  if (!base || !secret) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'callops not configured' }, { status: 503 })
    }
    const patch: Record<string, unknown> = { status: spec.localStatus }
    if (action === 'start') patch.auto_paused = false // resuming clears an auto-pause
    const { data, error } = await supabase.from('campaigns').update(patch).eq('id', id).select('id, status').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ mode: 'local', campaign_id: Number(id), status: data.status })
  }

  try {
    const res = await fetch(`${base}/campaigns/${id}/${action}`, {
      method: 'POST',
      headers: { 'X-Webhook-Secret': secret },
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      // Pass a callops client error (e.g. 422 campaign_missing_sip_trunk) through with its real status +
      // detail so the dashboard shows the actionable reason. Only true upstream faults (5xx) read as 502.
      const status = res.status >= 400 && res.status < 500 ? res.status : 502
      return NextResponse.json({ error: json?.detail ?? json?.error ?? `callops ${res.status}` }, { status })
    }
    return NextResponse.json({ mode: 'callops', ...json })
  } catch (err) {
    console.error('callops lifecycle proxy failed:', err)
    return NextResponse.json({ error: 'callops unreachable' }, { status: 502 })
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params
  if (action !== 'status') return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { user } = await getAuthUser()
  if (!user) return unauthorized()

  const { base, secret } = callopsEnv()
  if (!base || !secret) return NextResponse.json({ mode: 'unconfigured' })

  try {
    const res = await fetch(`${base}/campaigns/${id}/status`, {
      headers: { 'X-Webhook-Secret': secret },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const status = res.status >= 400 && res.status < 500 ? res.status : 502
      return NextResponse.json({ error: json?.detail ?? `callops ${res.status}` }, { status })
    }
    return NextResponse.json(json)
  } catch (err) {
    console.error('callops status proxy failed:', err)
    return NextResponse.json({ error: 'callops unreachable' }, { status: 502 })
  }
}
