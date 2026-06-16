import type { CreatePeerRequest } from '@routr/sdk/dist/peers/types'
import type { RoutrClients } from './client'
import { enforceContactAddrLimit } from './resolve-contact-addr'
import { findLiveKitPeerRef } from './find-refs'
import { peerCredentialsRef } from './peer-credentials'
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

type PeerSnapshot = Awaited<ReturnType<RoutrClients['peers']['getPeer']>>

/** Routr updatePeer requires string fields (name, aor, …) — merge with the stored peer. */
function buildPeerUpdateRequest(
  existingRef: string,
  current: PeerSnapshot,
  createBody: Record<string, unknown>,
  body: PeerUpsertBody,
) {
  const contactAddr =
    (createBody.contactAddr as string | undefined) ?? current.contactAddr ?? undefined

  const request: Record<string, unknown> = {
    ref: existingRef,
    name: (createBody.name as string) ?? current.name,
    aor: (createBody.aor as string) ?? current.aor,
    withSessionAffinity:
      (createBody.withSessionAffinity as boolean | undefined) ??
      current.withSessionAffinity ??
      false,
    enabled: (createBody.enabled as boolean | undefined) ?? current.enabled ?? true,
    extended: (createBody.extended as Record<string, unknown> | undefined) ?? current.extended,
    balancingAlgorithm: current.balancingAlgorithm,
  }

  if (contactAddr) request.contactAddr = contactAddr
  if (body.credentialsRef) request.credentialsRef = body.credentialsRef
  else {
    const currentCredRef = peerCredentialsRef(current)
    if (currentCredRef) request.credentialsRef = currentCredRef
  }
  if (body.accessControlListRef) request.accessControlListRef = body.accessControlListRef
  else if (current.accessControlListRef) {
    request.accessControlListRef = current.accessControlListRef
  }
  if (current.maxContacts !== undefined) request.maxContacts = current.maxContacts

  return request
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
    const current = await clients.peers.getPeer(existingRef)
    await clients.peers.updatePeer(
      buildPeerUpdateRequest(existingRef, current, createBody, body) as Parameters<
        RoutrClients['peers']['updatePeer']
      >[0],
    )
    if (body.credentialsRef) {
      const after = await clients.peers.getPeer(existingRef)
      if (!peerCredentialsRef(after)) {
        log(`[routr] recreate peer ${existingRef} (link credentials on create)`)
        await clients.peers.deletePeer(existingRef)
        return clients.peers.createPeer(createBody as unknown as CreatePeerRequest)
      }
    }
    return clients.peers.getPeer(existingRef)
  }

  log(`[routr] create peer (${username})`)
  try {
    return await clients.peers.createPeer(createBody as unknown as CreatePeerRequest)
  } catch (err) {
    if (!isAlreadyExists(err)) throw err
    const found = await findLiveKitPeerRef(clients, username)
    if (!found) throw err
    log(`[routr] update peer ${found} (existing resource)`)
    const current = await clients.peers.getPeer(found)
    return clients.peers.updatePeer(
      buildPeerUpdateRequest(found, current, createBody, body) as Parameters<
        RoutrClients['peers']['updatePeer']
      >[0],
    )
  }
}

export function normalizePeerUsername(raw?: string | null): string {
  const value = raw?.trim()
  return value || 'livekit'
}
