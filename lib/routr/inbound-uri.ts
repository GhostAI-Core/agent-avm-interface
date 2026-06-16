/** Routr inbound trunk URI host label — FQDN-safe (no underscores). */
export function carrierInboundUri(slug: string): string {
  const label = slug
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
  if (!label) {
    throw new Error('slug is required for Routr trunk inboundUri')
  }
  return `${label}.evra.local`
}
