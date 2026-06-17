// One-off: wipe demo/transactional data via the service role (bypasses RLS).
// Run: node --env-file=.env scripts/run-wipe.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const db = createClient(url, key, { auth: { persistSession: false } })

// Children first, then parents. Keeps: profiles, system_settings, sip_trunks,
// voip_providers, dashboard_templates.
const tables = ['call_records', 'call_logs', 'intent_stats', 'contacts', 'campaigns', 'companies', 'security_logs']

for (const t of tables) {
  const { count: before } = await db.from(t).select('*', { count: 'exact', head: true })
  const { error } = await db.from(t).delete().gte('id', 0)
  const { count: after } = await db.from(t).select('*', { count: 'exact', head: true })
  console.log(`${t.padEnd(14)} ${String(before ?? '?').padStart(5)} -> ${String(after ?? '?').padStart(5)}${error ? '   ERROR: ' + error.message : ''}`)
}
console.log('done')
