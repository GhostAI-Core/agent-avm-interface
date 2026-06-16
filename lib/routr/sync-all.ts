import { createRoutrClients } from './client'
import { syncCarrierProvider } from './sync-carrier'
import { syncOutboundCallerNumber } from './sync-outbound-number'
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

/** True when ROUTR_CARRIER_SEND_REGISTER is true/1/yes (case-insensitive). */
export function carrierSendRegisterFromEnv(): boolean {
  const v = (process.env.ROUTR_CARRIER_SEND_REGISTER ?? '').trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
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
  const sendRegister = carrierSendRegisterFromEnv()
  if (!username || !password) {
    throw new Error('ROUTR_CARRIER_SIP_HOST is set but ROUTR_CARRIER_SIP_USERNAME/PASSWORD are missing')
  }

  log(`[routr] carrier sendRegister=${sendRegister}`)

  const { trunkRef } = await syncCarrierProvider(
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
      send_register: sendRegister,
      routr_trunk_ref: 'trunk-carrier-default',
      routr_credentials_ref: 'cred-carrier',
    },
    log,
  )

  const callerId = process.env.ROUTR_OUTBOUND_CALLER_ID?.trim()
  if (callerId) {
    await syncOutboundCallerNumber(clients, trunkRef, callerId, log)
  } else {
    log('[routr] skip outbound Number (set ROUTR_OUTBOUND_CALLER_ID for peer-to-pstn)')
  }
}
