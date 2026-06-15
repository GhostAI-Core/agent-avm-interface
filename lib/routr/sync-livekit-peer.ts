import type { LiveKitPeerSettings } from '@/lib/types/voip-provider'
import type { RoutrClients } from './client'
import { resolveContactAddr } from './resolve-contact-addr'
import { normalizePeerUsername, upsertPeer } from './upsert-peer'
import { upsertResource } from './upsert'

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
    { omitRefOnCreate: true },
  )
}

export async function syncLiveKitPeer(
  clients: RoutrClients,
  settings: LiveKitPeerSettings,
  log: (msg: string) => void = console.log,
) {
  const username = normalizePeerUsername(settings.peer_username)
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
      { omitRefOnCreate: true },
    )
    credentialsRef = CRED_REF
  }

  await upsertPeer(
    clients,
    {
      name: 'LiveKit Cloud',
      username,
      aor: 'sip:livekit@evra.local',
      contactAddr: contactAddr || undefined,
      withSessionAffinity: false,
      credentialsRef,
      accessControlListRef,
      extended: { evraRole: 'livekit-sip-gateway' },
      enabled: true,
    },
    log,
  )
}

export function liveKitSettingsFromEnv(): LiveKitPeerSettings {
  const rawHost = process.env.ROUTR_LIVEKIT_SIP_HOST || 'sip.livekit.cloud:5060'
  return {
    sip_host: rawHost.replace(/^sip:/i, '').trim(),
    allowed_cidrs: process.env.ROUTR_LIVEKIT_ALLOWED_CIDRS,
    peer_username: normalizePeerUsername(process.env.ROUTR_LIVEKIT_PEER_USERNAME),
    peer_password: process.env.ROUTR_LIVEKIT_PEER_PASSWORD,
  }
}
