import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

/** True when a service-role key is configured (server-to-server writes that bypass RLS). */
export function isAdminConfigured(): boolean {
  return Boolean(url && serviceKey)
}

/**
 * Service-role Supabase client for callers with no user session — the LiveKit webhook
 * and the agent result endpoint. It bypasses RLS, so it must NEVER be imported into the
 * browser (the `server-only` guard enforces that). Returns null when unconfigured.
 */
export function createAdminClient() {
  if (!url || !serviceKey) return null
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'ngrok-skip-browser-warning': 'true' } },
  })
}
