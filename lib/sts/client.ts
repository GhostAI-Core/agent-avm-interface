import 'server-only'
import { toE164 } from './phone'

export { toE164 }

/**
 * STS SmartCall SDP client — the carrier platform (step 1) and the SYSTEM OF RECORD for subscription /
 * opt-out state. Our only job is a one-way relay: when an AI agent call captures a keypress we TELL STS
 * "this number subscribed (press 1) / opted out (press 9)" so STS manages contact on its side. We keep
 * no consent tables of our own. Outbound only — nothing here touches the working app→callops→LiveKit stream.
 *
 * The GUID is PER AGENT (per product): seeker has its own GUID, grace has its own. A campaign dialing
 * with the seeker agent relays under the seeker GUID. Configured via env:
 *   STS_GUID_SEEKER, STS_GUID_GRACE, …   (STS_GUID_<AGENT-UPPERCASED>)
 *   STS_SDP_BASE_URL                     default http://sdp.smartcalltech.co.za
 *
 * Endpoints (SDP spec rev 1.5):
 *   POST /avm/{GUID}/{MSISDN}     → register a subscription   (press 1)
 *   POST /cancel/{GUID}/{MSISDN}  → cancel / opt out          (press 9)
 */

function baseUrl(): string {
  return (process.env.STS_SDP_BASE_URL?.trim() || 'http://sdp.smartcalltech.co.za').replace(/\/$/, '')
}

/** The STS GUID configured for an agent (product), or null when that agent isn't wired to STS. */
export function guidForAgent(agent: string): string | null {
  const key = `STS_GUID_${agent.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`
  return process.env[key]?.trim() || null
}

/** True when at least one agent GUID is configured (so STS routes can report ready). */
export function isStsConfigured(): boolean {
  return Object.keys(process.env).some((k) => k.startsWith('STS_GUID_') && process.env[k]?.trim())
}

/** STS wants the bare MSISDN (no leading +). */
function bareMsisdn(msisdn: string): string {
  return toE164(msisdn).slice(1)
}

export type StsAction = 'subscribe' | 'opt_out'

export interface StsRelayResult {
  ok: boolean
  agent: string
  action: StsAction
  status: number
  body: string
}

/**
 * Relay a keypress decision to STS. press 1 → subscribe (/avm), press 9 → opt out (/cancel).
 * Throws if the agent has no GUID configured (the caller decides how to surface that).
 */
export async function relayToSts(agent: string, msisdn: string, action: StsAction): Promise<StsRelayResult> {
  const guid = guidForAgent(agent)
  if (!guid) throw new Error(`No STS GUID configured for agent "${agent}" (set STS_GUID_${agent.toUpperCase()})`)

  const m = bareMsisdn(msisdn)
  const path = action === 'subscribe' ? `/avm/${guid}/${m}` : `/cancel/${guid}/${m}`
  const res = await fetch(`${baseUrl()}${path}`, { method: 'POST', cache: 'no-store' })
  const body = await res.text()
  return { ok: res.ok, agent, action, status: res.status, body: body.slice(0, 300) }
}
