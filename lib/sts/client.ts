import 'server-only'
import { toE164 } from './phone'

export { toE164 }

/**
 * STS SmartCall SDP client — the carrier platform (step 1) and the SYSTEM OF RECORD for subscription /
 * opt-out state. Our only job is a one-way relay: when an AI agent call captures a keypress we TELL STS
 * "this number subscribed (press 1) / opted out (press 9)" so STS manages contact on its side. We keep
 * no consent tables of our own. Outbound only — nothing here touches the working app→callops→LiveKit stream.
 *
 * The GUID is PER PRODUCT: seeker has its own GUID, grace has its own. A campaign dialing
 * the seeker product relays under the seeker GUID. Configured via env:
 *   STS_GUID_SEEKER, STS_GUID_GRACE, …   (STS_GUID_<PRODUCT-UPPERCASED>)
 *   STS_SDP_BASE_URL                     default http://sdp.smartcalltech.co.za
 *
 * Endpoints (SDP spec rev 1.5):
 *   POST /avm/{GUID}/{MSISDN}     → register a subscription   (press 1)
 *   POST /cancel/{GUID}/{MSISDN}  → cancel / opt out          (press 9)
 */

function baseUrl(): string {
  return (process.env.STS_SDP_BASE_URL?.trim() || 'http://sdp.smartcalltech.co.za').replace(/\/$/, '')
}

/** The STS GUID configured for a product, or null when that product isn't wired to STS. */
export function guidForProduct(product: string): string | null {
  const key = `STS_GUID_${product.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`
  return process.env[key]?.trim() || null
}

/** True when at least one product GUID is configured (so STS routes can report ready). */
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
  product: string
  action: StsAction
  status: number
  body: string
}

/** STS subscribe needs a 'YYYY-MM-DD HH:mm:ss' timestamp. */
function stsDate(callDate?: string): string {
  return callDate?.trim() || new Date().toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * Relay a keypress decision to STS. press 1 → subscribe (POST /avm with the result body), press 9 →
 * opt out (POST /cancel). Throws if the product has no GUID configured.
 *
 * Verified against STS 2026-06-24: /avm requires a {number, CallDuration, CallDate, Result} body and
 * a minimum call duration; production subscribes also need this server's IP whitelisted by STS
 * ("Interface auth failed" otherwise). /cancel needs only the path and returns `true`.
 */
export async function relayToSts(
  product: string,
  msisdn: string,
  action: StsAction,
  meta: { durationSeconds?: number; callDate?: string } = {},
): Promise<StsRelayResult> {
  const guid = guidForProduct(product)
  if (!guid) throw new Error(`No STS GUID configured for product "${product}" (set STS_GUID_${product.toUpperCase()})`)

  const m = bareMsisdn(msisdn)
  let res: Response
  if (action === 'subscribe') {
    res = await fetch(`${baseUrl()}/avm/${guid}/${m}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        number: m,
        CallDuration: String(meta.durationSeconds ?? 0),
        CallDate: stsDate(meta.callDate),
        Result: 'SUBSCRIBE',
      }),
    })
  } else {
    res = await fetch(`${baseUrl()}/cancel/${guid}/${m}`, {
      method: 'POST',
      headers: { 'Content-Length': '0' },
      cache: 'no-store',
    })
  }
  const body = await res.text()
  return { ok: res.ok, product, action, status: res.status, body: body.slice(0, 300) }
}
