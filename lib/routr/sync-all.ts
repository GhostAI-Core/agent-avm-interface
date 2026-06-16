import { createRoutrClients } from './client'
import { syncCarrierProvider } from './sync-carrier'
import { liveKitSettingsFromEnv, syncLiveKitAcl, syncLiveKitPeer } from './sync-livekit-peer'

export async function waitForRoutrApi(log: (msg: string) => void = console.log) {
  const clients = createRoutrClients()
  const endpoint = process.env.ROUTR_API_ENDPOINT || 'agent-avm-sip-routr:51908'
  let lastError = 'unknown'

  for (let i = 0; i < 120; i++) {
    try {
      await clients.peers.listPeers({ pageSize: 1, pageToken: '' })
      return clients
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      await new Promise((r) => setTimeout(r, 2000))
    }
  }

  throw new Error(`Routr API not reachable at ${endpoint} after 240s (last: ${lastError})`)
}

/** Bootstrap entry: env-driven LiveKit peer + optional carrier trunk. */
export async function runBootstrapFromEnv(log: (msg: string) => void = console.log) {
  const clients = await waitForRoutrApi(log)
  log('[routr] Routr API is up')

  const settings = liveKitSettingsFromEnv()
  if (settings.allowed_cidrs) {
    await syncLiveKitAcl(clients, settings.allowed_cidrs, log)
  }
  await syncLiveKitPeer(clients, settings, log)

  const host = process.env.ROUTR_CARRIER_SIP_HOST
  if (!host) {
    log('[routr] skip carrier trunk (ROUTR_CARRIER_SIP_HOST unset)')
    return
  }

  const name = process.env.ROUTR_CARRIER_NAME || 'carrier'
  const username = process.env.ROUTR_CARRIER_SIP_USERNAME
  const password = process.env.ROUTR_CARRIER_SIP_PASSWORD
  if (!username || !password) {
    throw new Error('ROUTR_CARRIER_SIP_HOST is set but ROUTR_CARRIER_SIP_USERNAME/PASSWORD are missing')
  }

  await syncCarrierProvider(
    clients,
    {
      id: 0,
      name,
      slug: name,
      provider_type: 'utility_connect',
      sip_host: host,
      sip_port: Number(process.env.ROUTR_CARRIER_SIP_PORT || 5060),
      sip_username: username,
      sip_password: password,
      send_register: false,
      routr_trunk_ref: 'trunk-carrier-default',
      routr_credentials_ref: 'cred-carrier',
    },
    log,
  )
}
