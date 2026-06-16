import type { CreatePeerRequest } from '@routr/sdk/dist/peers/types'
import type { RoutrClients } from './client'
import { enforceContactAddrLimit } from './resolve-contact-addr'
import { findLiveKitPeerRef } from './find-refs'
import { isAlreadyExists } from './upsert'

export type PeerUpsertBody = {
  name: string
  username: string
  aor: string
  contactAddr?: string
  withSessionAffinity?: boolean
  credentialsRef?: string
  accessControlListRef?: string
  extended?: Record<string, unknown>
  enabled?: boolean
}

/** Routr protos: CreatePeerRequest has no ref; UpdatePeerRequest has no username. */
export async function upsertPeer(
  clients: RoutrClients,
  body: PeerUpsertBody,
  log: (msg: string) => void = console.log,
) {
  const username = body.username?.trim() || 'livekit'
  const createBody: Record<string, unknown> = {
    name: body.name,
    username,
    aor: body.aor,
    withSessionAffinity: body.withSessionAffinity ?? false,
    enabled: body.enabled ?? true,
    extended: body.extended,
  }
  if (body.contactAddr?.trim()) {
    const addr = enforceContactAddrLimit(body.contactAddr)
    if (addr) createBody.contactAddr = addr
    else log(`[routr] omitting contactAddr (exceeds Routr ${20}-char limit)`)
  }
  if (body.credentialsRef) createBody.credentialsRef = body.credentialsRef
  if (body.accessControlListRef) createBody.accessControlListRef = body.accessControlListRef

  const updateBody = { ...createBody }
  delete updateBody.username

  let existingRef = await findLiveKitPeerRef(clients, username)
  if (!existingRef) {
    try {
      await clients.peers.getPeer('peer-livekit')
      existingRef = 'peer-livekit'
    } catch {
      // not found by stable ref
    }
  }

  if (existingRef) {
    log(`[routr] update peer ${existingRef}`)
    return clients.peers.updatePeer({ ref: existingRef, ...updateBody })
  }

  log(`[routr] create peer (${username})`)
  try {
    return await clients.peers.createPeer(createBody as unknown as CreatePeerRequest)
  } catch (err) {
    if (!isAlreadyExists(err)) throw err
    const found = await findLiveKitPeerRef(clients, username)
    if (!found) throw err
    log(`[routr] update peer ${found} (existing resource)`)
    return clients.peers.updatePeer({ ref: found, ...updateBody })
  }
}

export function normalizePeerUsername(raw?: string | null): string {
  const value = raw?.trim()
  return value || 'livekit'
}
