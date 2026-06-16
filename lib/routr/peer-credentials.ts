/** getPeer returns expanded `credentials`; create/update use `credentialsRef`. */
export function peerCredentialsRef(peer: {
  credentialsRef?: string | null
  credentials?: { ref?: string | null } | null
}): string | undefined {
  const ref = peer.credentialsRef ?? peer.credentials?.ref
  return ref?.trim() || undefined
}
