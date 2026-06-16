import type { RoutrClients } from './client'
import { findNumberRefByTelUrl } from './find-refs'
import { upsertResource } from './upsert'

export const LIVEKIT_PEER_AOR = 'sip:livekit@evra.local'

/** E.164 for Routr Number telUrl (tel:+27…). */
export function normalizeOutboundCallerId(raw?: string | null): string | undefined {
  const trimmed = raw?.trim()
  if (!trimmed) return undefined
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return undefined
  return trimmed.startsWith('+') ? `+${digits}` : `+${digits}`
}

export function outboundCallerTelUrl(callerId: string): string {
  const e164 = normalizeOutboundCallerId(callerId)
  if (!e164) {
    throw new Error(`Invalid ROUTR_OUTBOUND_CALLER_ID: ${callerId}`)
  }
  return `tel:${e164}`
}

/** Maps caller ID (X-Dod-Number) → carrier trunk for peer-to-pstn egress. */
export async function syncOutboundCallerNumber(
  clients: RoutrClients,
  trunkRef: string,
  callerId: string,
  log: (msg: string) => void = console.log,
) {
  const e164 = normalizeOutboundCallerId(callerId)
  if (!e164) {
    throw new Error('ROUTR_OUTBOUND_CALLER_ID must be a valid E.164 number')
  }
  const telUrl = `tel:${e164}`

  await upsertResource(
    'number-outbound-default',
    (ref) => clients.numbers.getNumber(ref),
    (p) => clients.numbers.createNumber(p),
    (p) => clients.numbers.updateNumber(p),
    {
      ref: 'number-outbound-default',
      name: e164,
      telUrl,
      trunkRef,
      aorLink: LIVEKIT_PEER_AOR,
      city: 'Johannesburg',
      country: 'South Africa',
      countryIsoCode: 'ZA',
      extended: { evraRole: 'outbound-caller-id' },
    },
    () => findNumberRefByTelUrl(clients, telUrl),
    log,
    { omitRefOnCreate: true },
  )
}
