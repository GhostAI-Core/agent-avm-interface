import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { isStsResult, mapStsResult } from '@/lib/sts/outcomes'
import { toE164 } from '@/lib/sts/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * STS AVM result callback (additive — does NOT touch the app→callops→LiveKit dial path).
 *
 * STS posts an AVM call result: { number, CallDuration, CallDate, Result, tag?, ref? }. The `Result`
 * carries the DTMF decision — press 1 = SUBSCRIBE, press 9 = OPT OUT — which this route turns into the
 * compliance writebacks so a contact "can't be contacted again for the same thing":
 *   SUBSCRIBE    → product_consent opted_in   (per product = campaign.agent)
 *   UNSUBSCRIBE  → product_consent opted_out
 *   OPT OUT      → suppression_list (global DNC)
 * Plus the per-number daily rollover (record_dial_outcome) and a compliance_events audit row.
 *
 * call_records is intentionally NOT written here — callops owns call persistence; we only own consent.
 * `tag` is expected to carry the campaign id (SDP spec: "campaign or client identifier").
 */
function maskPhone(phone: string): string {
  return phone.length <= 4 ? '****' : phone.slice(0, 3) + '*'.repeat(phone.length - 6) + phone.slice(-3)
}

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid JSON body' }, { status: 400 })
  }

  const rawResult = String(body.Result ?? body.result ?? '')
  if (!isStsResult(rawResult)) {
    return NextResponse.json({ ok: false, reason: `unknown STS result: ${rawResult}` }, { status: 400 })
  }
  const m = mapStsResult(rawResult)

  // DIALED (transient) — nothing to persist; ack so STS doesn't retry.
  if (!m.terminal) {
    return NextResponse.json({ ok: true, terminal: false, result: m.result })
  }

  const phone = toE164(String(body.number ?? body.msisdn ?? ''))
  if (phone.length < 6) {
    return NextResponse.json({ ok: false, reason: 'missing/invalid number' }, { status: 400 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ ok: false, reason: 'service-role key not set' }, { status: 503 })
  }

  // Resolve campaign (product + company + rollover spacing) from `tag` when it is a campaign id.
  const tag = body.tag ?? body.ref
  const campaignId = typeof tag === 'number' ? tag : /^\d+$/.test(String(tag ?? '')) ? Number(tag) : null
  let product: string | null = null
  let companyId: number | null = null
  let cooldown = 3600
  let jitter = 2700
  if (campaignId !== null) {
    const { data: camp } = await admin
      .from('campaigns')
      .select('id, agent, company_id, retry_cooldown_seconds, retry_jitter_seconds')
      .eq('id', campaignId)
      .maybeSingle()
    if (camp) {
      product = (camp.agent as string) ?? null
      companyId = (camp.company_id as number) ?? null
      cooldown = (camp.retry_cooldown_seconds as number) ?? cooldown
      jitter = (camp.retry_jitter_seconds as number) ?? jitter
    }
  }

  // Resolve the contact (for product_consent + audit). Phones may be stored with or without the +.
  const bare = phone.slice(1)
  let contactQuery = admin.from('contacts').select('id').or(`phone.eq.${phone},phone.eq.${bare}`)
  if (campaignId !== null) contactQuery = contactQuery.eq('campaign_id', campaignId)
  const { data: contactRow } = await contactQuery.limit(1).maybeSingle()
  const contactId = (contactRow?.id as number) ?? null

  // 1) Per-number daily rollover (cross-campaign frequency state).
  const { error: rollErr } = await admin.rpc('record_dial_outcome', {
    p_phone: phone,
    p_reached: m.reached,
    p_cooldown_seconds: cooldown,
    p_jitter_seconds: jitter,
  })
  if (rollErr) console.error('record_dial_outcome failed:', rollErr)

  // 2) Consent writeback — the "can't contact again for the same thing" rule.
  let consentApplied = false
  if (m.consent === 'global_opt_out') {
    const { data: exists } = await admin
      .from('suppression_list')
      .select('id')
      .eq('phone', phone)
      .is('company_id', null)
      .limit(1)
      .maybeSingle()
    if (!exists) {
      const { error } = await admin
        .from('suppression_list')
        .insert({ phone, reason: 'opt_out', company_id: null })
      if (error) {
        console.error('suppression insert failed:', error)
        return NextResponse.json({ ok: false, reason: 'suppression write failed' }, { status: 500 })
      }
    }
    consentApplied = true
    await admin.from('compliance_events').insert({
      contact_id: contactId,
      campaign_id: campaignId,
      event_type: 'opt_out',
      reason: 'opt_out',
      phone_masked: maskPhone(phone),
    })
  } else if ((m.consent === 'product_opt_in' || m.consent === 'product_opt_out') && contactId && product) {
    const status = m.consent === 'product_opt_in' ? 'opted_in' : 'opted_out'
    const { error } = await admin.from('product_consent').upsert(
      {
        contact_id: contactId,
        product,
        consent_status: status,
        consent_source: 'in_call',
        consent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'contact_id,product' },
    )
    if (error) {
      console.error('product_consent upsert failed:', error)
      return NextResponse.json({ ok: false, reason: 'consent write failed' }, { status: 500 })
    }
    consentApplied = true
    await admin.from('compliance_events').insert({
      contact_id: contactId,
      campaign_id: campaignId,
      event_type: status === 'opted_in' ? 'opt_in' : 'opt_out',
      reason: `sts_${m.result.toLowerCase().replace(/\s+/g, '_')}`,
      phone_masked: maskPhone(phone),
    })
  }

  return NextResponse.json({
    ok: true,
    result: m.result,
    outcome: m.outcome,
    reached: m.reached,
    consent: m.consent,
    consentApplied,
    contactResolved: contactId !== null,
    product,
  })
}
