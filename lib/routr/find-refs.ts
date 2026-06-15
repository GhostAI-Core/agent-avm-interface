import type { RoutrClients } from './client'

export async function findPeerRefByUsername(clients: RoutrClients, username: string) {
  const { items } = await clients.peers.listPeers({ pageSize: 50, pageToken: '' })
  return items?.find((p) => p.username === username)?.ref
}

export async function findCredentialsRefByName(clients: RoutrClients, name: string) {
  const { items } = await clients.credentials.listCredentials({ pageSize: 50, pageToken: '' })
  return items?.find((c) => c.name === name)?.ref
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
