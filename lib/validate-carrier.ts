import type { ProviderType } from '@/lib/types/voip-provider'

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const PROVIDER_TYPES: ProviderType[] = ['twilio', 'telnyx', 'sangoma']

export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
}

export function validateCarrierInput(body: Record<string, unknown>): { error?: string; data?: CarrierBody } {
  const name = String(body.name || '').trim()
  if (!name) return { error: 'Name is required' }

  const provider_type = (body.provider_type || 'twilio') as ProviderType
  if (!PROVIDER_TYPES.includes(provider_type)) {
    return { error: 'provider_type must be twilio, telnyx, or sangoma' }
  }

  const slug = String(body.slug || slugifyName(name)).trim()
  if (!SLUG_RE.test(slug)) {
    return { error: 'slug must be 1–32 lowercase letters, numbers, or hyphens' }
  }

  const sip_host = String(body.sip_host || '').trim().replace(/^sip:/i, '')
  if (!sip_host) return { error: 'sip_host is required' }

  const sip_port = Number(body.sip_port ?? 5060)
  if (!Number.isInteger(sip_port) || sip_port < 1 || sip_port > 65535) {
    return { error: 'sip_port must be between 1 and 65535' }
  }

  const sip_username = String(body.sip_username || '').trim()
  const sip_password = String(body.sip_password || '')
  if (!sip_username) return { error: 'sip_username is required' }
  if (!sip_password && !body.keep_password) return { error: 'sip_password is required' }

  return {
    data: {
      name,
      slug,
      provider_type,
      sip_host,
      sip_port,
      sip_username,
      sip_password,
      send_register: Boolean(body.send_register),
      keep_password: Boolean(body.keep_password),
    },
  }
}

export type CarrierBody = {
  name: string
  slug: string
  provider_type: ProviderType
  sip_host: string
  sip_port: number
  sip_username: string
  sip_password: string
  send_register: boolean
  keep_password?: boolean
}
