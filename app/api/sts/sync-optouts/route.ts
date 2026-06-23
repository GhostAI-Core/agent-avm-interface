import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fetchOptOuts, isStsConfigured } from '@/lib/sts/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * STS opt-out → suppression_list sync (additive — feeds the compliance gate, touches no dial logic).
 *
 * Pulls the daily STS opt-out (DNC) list and inserts any new numbers into suppression_list as global
 * suppressions (company_id = null, reason = 'opt_out'). Idempotent: existing global numbers are
 * skipped, so it is safe to run on a schedule (cron) or on demand.
 *
 * POST /api/sts/sync-optouts  →  { ok, fetched, inserted, skipped }
 */
export async function POST() {
  if (!isStsConfigured()) {
    return NextResponse.json({ ok: false, reason: 'STS not configured (STS_GUID unset)' }, { status: 503 })
  }
  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ ok: false, reason: 'service-role key not set' }, { status: 503 })
  }

  let optOuts: string[]
  try {
    optOuts = await fetchOptOuts()
  } catch (err) {
    console.error('STS opt-out fetch failed:', err)
    return NextResponse.json({ ok: false, reason: 'STS opt-out fetch failed' }, { status: 502 })
  }

  // Global suppressions only (company_id null). NULLs aren't deduped by the UNIQUE constraint, so we
  // diff against what's already there rather than relying on upsert/onConflict.
  const { data: existingRows, error: readErr } = await admin
    .from('suppression_list')
    .select('phone')
    .is('company_id', null)
  if (readErr) {
    console.error('suppression_list read failed:', readErr)
    return NextResponse.json({ ok: false, reason: 'suppression read failed' }, { status: 500 })
  }

  const existing = new Set((existingRows ?? []).map((r) => r.phone as string))
  const fresh = optOuts.filter((p) => !existing.has(p))

  if (fresh.length > 0) {
    const rows = fresh.map((phone) => ({ phone, reason: 'opt_out', company_id: null }))
    const { error: insErr } = await admin.from('suppression_list').insert(rows)
    if (insErr) {
      console.error('suppression_list insert failed:', insErr)
      return NextResponse.json({ ok: false, reason: 'suppression insert failed' }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok: true,
    fetched: optOuts.length,
    inserted: fresh.length,
    skipped: optOuts.length - fresh.length,
  })
}
