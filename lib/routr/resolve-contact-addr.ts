import dns from 'dns/promises'

export const CONTACT_ADDR_MAX_LEN = 20

/** Routr DB: contact_addr VARCHAR(20) — IP:port only. */
export async function resolveContactAddr(
  raw?: string | null,
  log: (msg: string) => void = () => {},
): Promise<string | undefined> {
  if (!raw) return undefined

  const trimmed = raw.trim()
  if (trimmed.length <= CONTACT_ADDR_MAX_LEN) return trimmed

  const match = trimmed.match(/^([^:]+):(\d+)$/)
  if (!match) {
    log(`[routr] ROUTR_LIVEKIT_SIP_HOST "${trimmed}" exceeds ${CONTACT_ADDR_MAX_LEN} chars; omitting contactAddr`)
    return undefined
  }

  const [, host, port] = match
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    log(`[routr] contactAddr "${trimmed}" exceeds ${CONTACT_ADDR_MAX_LEN} chars; omitting`)
    return undefined
  }

  try {
    const { address } = await dns.lookup(host, { family: 4 })
    const resolved = `${address}:${port}`
    if (resolved.length > CONTACT_ADDR_MAX_LEN) {
      log(`[routr] resolved ${trimmed} → ${resolved} still too long; omitting contactAddr`)
      return undefined
    }
    log(`[routr] resolved contactAddr ${trimmed} → ${resolved}`)
    return resolved
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`[routr] DNS lookup failed for ${host} (${message}); omitting contactAddr`)
    return undefined
  }
}
