import { createRoutrClients } from './client'
import { syncCarrierProvider } from './sync-carrier'
import type { CarrierSyncInput } from './sync-carrier'
import type { SupabaseClient } from '@supabase/supabase-js'

export function routrErrorStatus(err: unknown): number {
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('not reachable') || message.includes('ECONNREFUSED') || message.includes('UNAVAILABLE')) {
    return 503
  }
  return 500
}

export async function syncProviderRow(
  supabase: SupabaseClient,
  provider: CarrierSyncInput,
): Promise<{ ok: true; credentialsRef: string; trunkRef: string } | { ok: false; error: string; status: number }> {
  try {
    const clients = createRoutrClients()
    const refs = await syncCarrierProvider(clients, provider)
    const { error } = await supabase
      .from('voip_providers')
      .update({
        routr_trunk_ref: refs.trunkRef,
        routr_credentials_ref: refs.credentialsRef,
        sync_status: 'synced',
        sync_error: null,
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', provider.id)

    if (error) throw new Error(error.message)
    return { ok: true, ...refs }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    const status = routrErrorStatus(err)
    await supabase
      .from('voip_providers')
      .update({ sync_status: 'error', sync_error: error })
      .eq('id', provider.id)
    return { ok: false, error, status }
  }
}
