import SDK from '@routr/sdk'

export function normalizeRoutrEndpoint(raw?: string | null): string {
  const value = raw || process.env.ROUTR_API_ENDPOINT || 'agent-avm-sip-routr:51908'
  return value.replace(/^insecure:\/\//, '').replace(/^https?:\/\//, '')
}

export function routrClientOptions() {
  return {
    endpoint: normalizeRoutrEndpoint(process.env.ROUTR_API_ENDPOINT),
    insecure: true,
  }
}

export function createRoutrClients() {
  const opts = routrClientOptions()
  return {
    acls: new SDK.Acls(opts),
    credentials: new SDK.Credentials(opts),
    peers: new SDK.Peers(opts),
    trunks: new SDK.Trunks(opts),
    numbers: new SDK.Numbers(opts),
  }
}

export type RoutrClients = ReturnType<typeof createRoutrClients>
