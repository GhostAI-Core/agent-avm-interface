import { NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsGet, callopsItems, callopsPost, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

// Campaigns are sourced from CallOps. CallOps lists per-company, so we fan out over
// the user's companies and merge (preserving the flat {campaigns:[...]} shape the UI expects).
export async function GET() {
  const { token } = await getAccessToken()
  if (!token) return unauthorized()
  try {
    const companies = await callopsItems<{ id: number; name?: string }>('/companies', token)
    const all: Record<string, unknown>[] = []
    for (const co of companies ?? []) {
      const res = await callopsGet<{ items?: Record<string, unknown>[] }>(
        `/companies/${co.id}/campaigns`, token,
      )
      const items = res.items ?? (Array.isArray(res) ? (res as Record<string, unknown>[]) : [])
      for (const c of items) all.push({ ...c, company: co.name ?? null })
    }
    all.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
    return NextResponse.json({ campaigns: all })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}

export async function POST(req: Request) {
  const { token } = await getAccessToken()
  if (!token) return unauthorized()

  const body = await req.json().catch(() => ({}))
  const {
    name, agent, company_id, sip_trunk_id, audio_path, voice_recording_url,
    dialing_speed, window_start, window_end, contacts,
    max_concurrent, max_retries, retry_cooldown_seconds,
  } = body

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!company_id) return NextResponse.json({ error: 'company required' }, { status: 400 })

  const toInt = (v: unknown, fallback: number) => {
    const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : fallback
  }
  const str = (v: unknown) => { const s = String(v ?? '').trim(); return s ? s : undefined }

  // THE FIX: the wizard sends the script URL as `audio_path`, but the dispatcher reads
  // `voice_recording_url`. Send it as voice_recording_url so the worker can fetch it.
  const scriptUrl = str(voice_recording_url) ?? str(audio_path)

  // Hand contacts to CallOps verbatim — it owns E.164 normalisation, dedupe, and
  // contacts.campaign_id. No local normalisation, no campaign_contacts M:N, no campaign_id patch.
  const contactList = Array.isArray(contacts)
    ? contacts
        .filter((c) => c && c.phone)
        .map((c) => ({ phone: String(c.phone), first_name: str(c.first_name), last_name: str(c.last_name) }))
    : undefined

  const payload = {
    name: String(name).trim(),
    agent: str(agent),
    // Only 'outbound-recorder' is deployed; force it so CallOps doesn't fall back to `agent`.
    agent_name: 'outbound-recorder',
    sip_trunk_id: sip_trunk_id != null && sip_trunk_id !== '' ? Number(sip_trunk_id) : undefined,
    voice_recording_url: scriptUrl,
    dialing_speed: dialing_speed != null ? toInt(dialing_speed, 1) : undefined,
    time_window_start: str(window_start),
    time_window_end: str(window_end),
    max_concurrent: max_concurrent != null ? toInt(max_concurrent, 5) : undefined,
    max_retries: max_retries != null ? toInt(max_retries, 2) : undefined,
    retry_cooldown_seconds: retry_cooldown_seconds != null ? toInt(retry_cooldown_seconds, 3600) : undefined,
    transfer_key: str(body.transfer_key),
    transfer_target: str(body.transfer_target),
    network_provider: str(body.network_provider),
    // Inworld voice id → campaigns.voice_id. The worker needs it to select the TTS voice
    // and match the two-step-consent confirm audio; a null voice_id makes the agent fail.
    // CallOps ignores unknown fields today (CampaignCreate has no voice_id yet) — forwarding
    // it here is forward-compatible so it persists the moment Cale adds it to the model.
    voice_id: str(body.voice_id),
    // Dial mode: 'script' (Seeker/Grace consent-subscribe) | 'lead' (Lead Gen). Column exists;
    // CallOps ignores it until CampaignCreate accepts it (openspec: campaign-dial-mode).
    routing_mode: str(body.routing_mode),
    contacts: contactList,
  }

  try {
    // Returns { campaign, contacts_imported, contacts_rejected } — pass through so the UI
    // can surface import counts.
    const data = await callopsPost(`/companies/${company_id}/campaigns`, token, payload)
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
