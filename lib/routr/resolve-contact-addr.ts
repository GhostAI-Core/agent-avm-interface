import dns from 'dns/promises'

export const CONTACT_ADDR_MAX_LEN = 20

export function stripSipHostPrefix(raw: string): string {
  return raw.trim().replace(/^sip:/i, '')
}

/** Drop values Routr cannot store (contact_addr VARCHAR(20)). */
export function enforceContactAddrLimit(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined
  const trimmed = value.trim()
  if (trimmed.length > CONTACT_ADDR_MAX_LEN) return undefined
  return trimmed
}

/** Routr DB: contact_addr VARCHAR(20) — IP:port only. */
export async function resolveContactAddr(
  raw?: string | null,
  log: (msg: string) => void = () => {},
): Promise<string | undefined> {
  if (!raw) return undefined

  const trimmed = stripSipHostPrefix(raw)
  const withinLimit = enforceContactAddrLimit(trimmed)
  if (withinLimit) return withinLimit

  const match = trimmed.match(/^([^:]+):(\d+)$/)
  if (!match) {
    log(`[routr] ROUTR_LIVEKIT_SIP_HOST "${trimmed}" exceeds ${CONTACT_ADDR_MAX_LEN} chars; omitting contactAddr`)
    return undefined
  }

  const [, host, port] = match
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    log(`[routr] contactAddr "${trimmed}" exceeds ${CONTACT_ADDR_MAX_LEN} chars; omitting contactAddr`)
    return undefined
  }

  try {
    const { address } = await dns.lookup(host, { family: 4 })
    const resolved = `${address}:${port}`
    const ok = enforceContactAddrLimit(resolved)
    if (!ok) {
      log(`[routr] resolved ${trimmed} → ${resolved} (${resolved.length} chars) exceeds ${CONTACT_ADDR_MAX_LEN}; omitting contactAddr`)
      return undefined
    }
    log(`[routr] resolved contactAddr ${trimmed} → ${resolved}`)
    return ok
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`[routr] DNS lookup failed for ${host} (${message}); omitting contactAddr`)
    return undefined
  }
}
