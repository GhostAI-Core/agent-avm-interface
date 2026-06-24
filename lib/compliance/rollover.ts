import type { SupabaseClient } from '@supabase/supabase-js'
import { parseRoomName } from '@/lib/outbound-call'

/**
 * Roll the per-number daily ledger (dial_number_state) forward for a finished call.
 *
 * Called from BOTH outcome sources so the rollover works no matter who reports first:
 *   - /api/calls/result (agent) — rich outcome → `reached` from the disposition
 *   - /api/livekit/webhook      — participant_joined (reached) / room_finished no_answer (retry)
 *
 * `reached=true` ends the day for the number on every campaign; `false` bumps the retryable
 * attempt count and pushes next_eligible_at out by cooldown + random jitter (in the RPC).
 * Idempotent enough for our purposes: a reached row stays reached (record_dial_outcome ORs it).
 */
export async function rollNumberState(
  admin: SupabaseClient,
  room: string,
  reached: boolean,
): Promise<void> {
  const ids = parseRoomName(room)
  if (!ids) return
  const { data: rec } = await admin.from('call_records').select('phone').eq('room', room).maybeSingle()
  if (!rec?.phone) return
  const { data: camp } = await admin
    .from('campaigns')
    .select('retry_cooldown_seconds, retry_jitter_seconds')
    .eq('id', ids.campaignId)
    .maybeSingle()
  await admin.rpc('record_dial_outcome', {
    p_phone: rec.phone,
    p_reached: reached,
    p_cooldown_seconds: camp?.retry_cooldown_seconds ?? 3600,
    p_jitter_seconds: camp?.retry_jitter_seconds ?? 2700,
  })
}
