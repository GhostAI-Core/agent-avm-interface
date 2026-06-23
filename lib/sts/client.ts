import 'server-only'
import { toE164 } from './phone'

export { toE164 }

/**
 * STS SmartCall SDP client — the carrier platform (step 1) that owns opt-out/DNC truth and the AVM
 * channel. This is purely additive: it reads STS and feeds Supabase. It does NOT place calls (callops
 * owns dialing), so nothing here touches the working app→callops→LiveKit stream.
 *
 * Config (additive env, all optional — unconfigured = the client reports not-ready, never throws on import):
 *   STS_SDP_BASE_URL   default http://sdp.smartcalltech.co.za
 *   STS_GUID           per-partner service identifier, provided by STS
 *
 * Endpoints (SDP spec rev 1.5):
 *   GET /avm/optouts/{GUID}                       → daily opt-out (DNC) list
 *   GET /subscriberinfo/query/{GUID}/{MSISDN}     → { network, dnc, contentblocked, subscriptions }
 */

function baseUrl(): string {
  return (process.env.STS_SDP_BASE_URL?.trim() || 'http://sdp.smartcalltech.co.za').replace(/\/$/, '')
}

export function isStsConfigured(): boolean {
  return Boolean(process.env.STS_GUID?.trim())
}

function guid(): string {
  const g = process.env.STS_GUID?.trim()
  if (!g) throw new Error('STS_GUID is not configured')
  return g
}

export interface StsSubscriberInfo {
  msisdn: string
  network: string | null
  /** Do-Not-Contact flag — true means never contact. */
  dnc: boolean
  contentBlocked: boolean
  subscriptions: boolean
  serviceList: Array<{ name: string; status: string }>
}

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`STS ${path} → HTTP ${res.status}`)
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Pull the daily opt-out (DNC) list. STS may return a JSON array of msisdns or a newline/comma list;
 * we accept either and return normalized +E.164 phones, de-duplicated.
 */
export async function fetchOptOuts(): Promise<string[]> {
  const data = await getJson(`/avm/optouts/${encodeURIComponent(guid())}`)
  let raw: string[]
  if (Array.isArray(data)) {
    raw = data.map((d) => (typeof d === 'string' ? d : String((d as { msisdn?: string }).msisdn ?? '')))
  } else if (typeof data === 'string') {
    raw = data.split(/[\s,]+/)
  } else {
    raw = []
  }
  const seen = new Set<string>()
  for (const r of raw) {
    if (!r) continue
    seen.add(toE164(r))
  }
  return [...seen]
}

/** Look up one subscriber's DNC / network / subscription state. */
export async function fetchSubscriberInfo(msisdn: string): Promise<StsSubscriberInfo> {
  const m = toE164(msisdn).slice(1) // STS wants the bare msisdn (no +)
  const data = (await getJson(`/subscriberinfo/query/${encodeURIComponent(guid())}/${encodeURIComponent(m)}`)) as Record<string, unknown>
  return {
    msisdn: toE164(String(data.msisdn ?? msisdn)),
    network: (data.network as string) ?? null,
    dnc: Boolean(data.dnc),
    contentBlocked: Boolean(data.contentblocked),
    subscriptions: Boolean(data.subscriptions),
    serviceList: Array.isArray(data.servicelist)
      ? (data.servicelist as Array<Record<string, unknown>>).map((s) => ({
          name: String(s.name ?? ''),
          status: String(s.status ?? ''),
        }))
      : [],
  }
}
