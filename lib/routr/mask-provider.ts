import type { ProviderType, RoutrSyncStatus, VoipProvider } from '@/lib/types/voip-provider'

/** Backfill defaults when M2 columns are missing or null (legacy rows). */
export function normalizeProvider(row: Record<string, unknown>): VoipProvider {
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    api_key: (row.api_key as string | null) ?? null,
    api_secret: (row.api_secret as string | null) ?? null,
    slug: String(row.slug ?? ''),
    provider_type: (row.provider_type as ProviderType) || 'twilio',
    sip_host: (row.sip_host as string | null) ?? null,
    sip_port: Number(row.sip_port ?? 5060),
    sip_username: (row.sip_username as string | null) ?? null,
    sip_password: (row.sip_password as string | null) ?? null,
    send_register: Boolean(row.send_register ?? false),
    routr_trunk_ref: (row.routr_trunk_ref as string | null) ?? null,
    routr_credentials_ref: (row.routr_credentials_ref as string | null) ?? null,
    sync_status: (row.sync_status as RoutrSyncStatus) || 'pending',
    sync_error: (row.sync_error as string | null) ?? null,
    last_synced_at: (row.last_synced_at as string | null) ?? null,
    created_at: row.created_at as string | undefined,
  }
}

export function maskProviderForClient(provider: VoipProvider): VoipProvider {
  return {
    ...provider,
    sip_password: provider.sip_password ? '********' : null,
    api_secret: provider.api_secret ? '********' : provider.api_secret,
  }
}
