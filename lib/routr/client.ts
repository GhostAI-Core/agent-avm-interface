import SDK from '@routr/sdk'

export function normalizeRoutrEndpoint(raw?: string | null): string {
  const value = raw || process.env.ROUTR_API_ENDPOINT || 'agent-avm-sip-routr:51908'
  return value.replace(/^insecure:\/\//, '').replace(/^https?:\/\//, '')
}

/** Shell/npm on the deploy host — Routr admin API is bound to localhost (see docker-compose). */
export function hostRoutrEndpoint(): string {
  return normalizeRoutrEndpoint(
    process.env.ROUTR_CTL_ENDPOINT || process.env.ROUTR_HOST_API_ENDPOINT || '127.0.0.1:51908',
  )
}

export function routrClientOptions(endpoint?: string) {
  return {
    endpoint: endpoint ? normalizeRoutrEndpoint(endpoint) : normalizeRoutrEndpoint(process.env.ROUTR_API_ENDPOINT),
    insecure: true,
  }
}

export function createRoutrClients(endpoint?: string) {
  const opts = routrClientOptions(endpoint)
  return {
    acls: new SDK.Acls(opts),
    credentials: new SDK.Credentials(opts),
    peers: new SDK.Peers(opts),
    trunks: new SDK.Trunks(opts),
    numbers: new SDK.Numbers(opts),
  }
}

export type RoutrClients = ReturnType<typeof createRoutrClients>
