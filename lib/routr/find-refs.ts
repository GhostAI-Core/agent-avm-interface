import type { RoutrClients } from './client'

export async function findPeerRefByUsername(clients: RoutrClients, username: string) {
  const { items } = await clients.peers.listPeers({ pageSize: 50, pageToken: '' })
  return items?.find((p) => p.username === username)?.ref
}

export async function findPeerRefByName(clients: RoutrClients, name: string) {
  const { items } = await clients.peers.listPeers({ pageSize: 50, pageToken: '' })
  return items?.find((p) => p.name === name)?.ref
}

/** Peers created without a client ref get a server UUID — match by role or display name. */
export async function findLiveKitPeerRef(clients: RoutrClients, username: string) {
  const byUsername = await findPeerRefByUsername(clients, username)
  if (byUsername) return byUsername

  const byName = await findPeerRefByName(clients, 'LiveKit Cloud')
  if (byName) return byName

  const { items } = await clients.peers.listPeers({ pageSize: 50, pageToken: '' })
  return items?.find((p) => {
    const ext = p.extended as Record<string, unknown> | undefined
    return ext?.evraRole === 'livekit-sip-gateway'
  })?.ref
}

export async function findCredentialsRefByName(clients: RoutrClients, name: string) {
  const { items } = await clients.credentials.listCredentials({ pageSize: 50, pageToken: '' })
  return items?.find((c) => c.name === name)?.ref
}

export async function findTrunkRefByName(clients: RoutrClients, name: string) {
  const { items } = await clients.trunks.listTrunks({ pageSize: 50, pageToken: '' })
  return items?.find((t) => t.name === name)?.ref
}

export async function findTrunkRefByInboundUri(clients: RoutrClients, inboundUri: string) {
  const { items } = await clients.trunks.listTrunks({ pageSize: 50, pageToken: '' })
  return items?.find((t) => t.inboundUri === inboundUri)?.ref
}

export async function findTrunkRefByProviderId(clients: RoutrClients, providerId: number) {
  const { items } = await clients.trunks.listTrunks({ pageSize: 50, pageToken: '' })
  return items?.find((t) => {
    const ext = t.extended as Record<string, unknown> | undefined
    return ext?.evraProviderId === providerId
  })?.ref
}

export async function findNumberRefByTelUrl(clients: RoutrClients, telUrl: string) {
  const { items } = await clients.numbers.listNumbers({ pageSize: 50, pageToken: '' })
  return items?.find((n) => n.telUrl === telUrl)?.ref
}
