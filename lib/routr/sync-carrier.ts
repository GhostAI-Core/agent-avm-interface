import type { CreateTrunkRequest } from '@routr/sdk/dist/trunks/types'
import type { VoipProvider } from '@/lib/types/voip-provider'
import type { RoutrClients } from './client'
import { findCredentialsRefByName, findTrunkRefByInboundUri, findTrunkRefByProviderId } from './find-refs'
import { upsertResource } from './upsert'

export type CarrierSyncInput = Pick<
  VoipProvider,
  | 'id'
  | 'name'
  | 'slug'
  | 'provider_type'
  | 'sip_host'
  | 'sip_port'
  | 'sip_username'
  | 'sip_password'
  | 'send_register'
  | 'routr_trunk_ref'
  | 'routr_credentials_ref'
>

export function carrierCredentialsRef(provider: CarrierSyncInput) {
  return provider.routr_credentials_ref || `cred-provider-${provider.id}`
}

export function carrierTrunkRef(provider: CarrierSyncInput) {
  return provider.routr_trunk_ref || `trunk-provider-${provider.id}`
}

export function buildCredentialsPayload(provider: CarrierSyncInput) {
  return {
    ref: carrierCredentialsRef(provider),
    name: `${provider.name} credentials`,
    username: provider.sip_username || '',
    password: provider.sip_password || '',
  }
}

export function buildTrunkPayload(provider: CarrierSyncInput, credentialsRef: string) {
  const inboundUri = `${provider.slug}.evra.local`
  return {
    ref: carrierTrunkRef(provider),
    name: provider.name,
    inboundUri,
    outboundCredentialsRef: credentialsRef,
    sendRegister: provider.send_register,
    uris: [
      {
        host: provider.sip_host || '',
        port: provider.sip_port || 5060,
        transport: 'UDP',
        user: provider.sip_username || '',
        weight: 1,
        priority: 1,
        enabled: true,
      },
    ],
    extended: {
      evraProviderId: provider.id,
      evraProviderType: provider.provider_type,
      syncedAt: new Date().toISOString(),
    },
  } as CreateTrunkRequest & { ref: string }
}

export async function syncCarrierProvider(
  clients: RoutrClients,
  provider: CarrierSyncInput,
  log: (msg: string) => void = console.log,
) {
  if (!provider.sip_host || !provider.sip_username || !provider.sip_password) {
    throw new Error('sip_host, sip_username, and sip_password are required for Routr sync')
  }
  if (!provider.slug) {
    throw new Error('slug is required for Routr trunk inboundUri')
  }

  const credPayload = buildCredentialsPayload(provider)
  const cred = await upsertResource(
    credPayload.ref,
    (ref) => clients.credentials.getCredentials(ref),
    (p) => clients.credentials.createCredentials(p),
    (p) => clients.credentials.updateCredentials(p),
    credPayload,
    () => findCredentialsRefByName(clients, credPayload.name),
    log,
    { omitRefOnCreate: true },
  )

  const trunkPayload = buildTrunkPayload(provider, cred.ref)
  const trunk = await upsertResource(
    trunkPayload.ref,
    (ref) => clients.trunks.getTrunk(ref),
    (p) => clients.trunks.createTrunk(p),
    (p) => clients.trunks.updateTrunk(p),
    trunkPayload,
    async () =>
      (await findTrunkRefByProviderId(clients, provider.id)) ||
      findTrunkRefByInboundUri(clients, trunkPayload.inboundUri),
    log,
    { omitRefOnCreate: true },
  )

  return { credentialsRef: cred.ref, trunkRef: trunk.ref }
}
