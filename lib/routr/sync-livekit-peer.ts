import type { CreatePeerRequest } from '@routr/sdk/dist/peers/types'
import type { LiveKitPeerSettings } from '@/lib/types/voip-provider'
import type { RoutrClients } from './client'
import { findPeerRefByUsername } from './find-refs'
import { resolveContactAddr } from './resolve-contact-addr'
import { upsertResource } from './upsert'

const PEER_REF = 'peer-livekit'
const ACL_REF = 'acl-livekit'
const CRED_REF = 'cred-livekit'

export async function syncLiveKitAcl(
  clients: RoutrClients,
  allowedCidrs: string | undefined,
  log: (msg: string) => void = console.log,
) {
  if (!allowedCidrs?.trim()) return

  await upsertResource(
    ACL_REF,
    (ref) => clients.acls.getAcl(ref),
    (p) => clients.acls.createAcl(p),
    (p) => clients.acls.updateAcl(p),
    {
      ref: ACL_REF,
      name: 'LiveKit SIP sources',
      allow: [allowedCidrs.trim()],
      deny: ['0.0.0.0/0'],
    },
    undefined,
    log,
  )
}

export async function syncLiveKitPeer(
  clients: RoutrClients,
  settings: LiveKitPeerSettings,
  log: (msg: string) => void = console.log,
) {
  const username = settings.peer_username || 'livekit'
  const password = settings.peer_password?.trim()
  const contactAddr = await resolveContactAddr(settings.sip_host, log)

  let credentialsRef: string | undefined
  let accessControlListRef: string | undefined

  if (settings.allowed_cidrs?.trim()) {
    await syncLiveKitAcl(clients, settings.allowed_cidrs, log)
    accessControlListRef = ACL_REF
  }

  if (password) {
    await upsertResource(
      CRED_REF,
      (ref) => clients.credentials.getCredentials(ref),
      (p) => clients.credentials.createCredentials(p),
      (p) => clients.credentials.updateCredentials(p),
      {
        ref: CRED_REF,
        name: 'LiveKit peer credentials',
        username,
        password,
      },
      undefined,
      log,
    )
    credentialsRef = CRED_REF
  }

  const peer = {
    ref: PEER_REF,
    name: 'LiveKit Cloud',
    aor: 'sip:livekit@evra.local',
    username,
    contactAddr: contactAddr || '',
    withSessionAffinity: false,
    extended: { evraRole: 'livekit-sip-gateway' },
    ...(credentialsRef ? { credentialsRef } : {}),
    ...(accessControlListRef ? { accessControlListRef } : {}),
  } as unknown as CreatePeerRequest & { ref: string }

  await upsertResource(
    PEER_REF,
    (ref) => clients.peers.getPeer(ref),
    (p) => clients.peers.createPeer(p),
    (p) => clients.peers.updatePeer(p),
    peer,
    () => findPeerRefByUsername(clients, username),
    log,
  )
}

export function liveKitSettingsFromEnv(): LiveKitPeerSettings {
  return {
    sip_host: process.env.ROUTR_LIVEKIT_SIP_HOST || 'sip.livekit.cloud:5060',
    allowed_cidrs: process.env.ROUTR_LIVEKIT_ALLOWED_CIDRS,
    peer_username: process.env.ROUTR_LIVEKIT_PEER_USERNAME || 'livekit',
    peer_password: process.env.ROUTR_LIVEKIT_PEER_PASSWORD,
  }
}
