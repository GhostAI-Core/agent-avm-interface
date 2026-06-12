#!/usr/bin/env npx tsx
import './preload-env'

/**
 * Manual outbound dial script for frontend / gateway testing.
 *
 * Usage:
 *   npm run dial -- --campaign-id 9                    # next 3 pending contacts (parallel)
 *   npm run dial -- --campaign-id 9 --batch 5         # next 5 pending contacts
 *   npm run dial -- --campaign-id 9 --contact-id 112 # single contact
 *   npm run dial -- --campaign-id 9 --phone +2782…     # single ad-hoc number
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { TwirpError } from 'livekit-server-sdk'
import {
  isLivekitAuthConfigured,
  isLivekitConfigured,
  placeOutboundCall,
  resolveTrunkId,
  startRoomRecording,
  isEgressConfigured,
  type DialResult,
} from '../lib/outbound-call'
import { normalizePhone } from '../lib/phone'

const DEFAULT_BATCH = 3

type ContactRow = {
  id: number
  phone: string
  first_name?: string | null
  last_name?: string | null
}

type CampaignRow = {
  name: string
  agent?: string | null
  agent_name?: string | null
  voice_recording_url?: string | null
  transfer_key?: string | null
  transfer_target?: string | null
  sip_trunk_id?: string | number | null
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function requireEnv(keys: string[]): void {
  const missing = keys.filter(k => !process.env[k])
  if (missing.length) {
    console.error('Missing required environment variables:')
    missing.forEach(k => console.error(`  - ${k}`))
    process.exit(1)
  }
}

function agentName(campaign: CampaignRow): string | null {
  return campaign.agent_name ?? process.env.LIVEKIT_AGENT_NAME ?? campaign.agent ?? null
}

async function dialContact(
  supabase: SupabaseClient,
  campaignId: string,
  campaign: CampaignRow,
  contact: ContactRow,
  trunkId: string,
): Promise<{ contactId: number; phone: string; result: DialResult; callRecordId: number | null }> {
  const phone = normalizePhone(contact.phone)
  const voiceUrl = campaign.voice_recording_url ?? null
  const now = new Date().toISOString()

  await supabase
    .from('contacts')
    .update({ status: 'in_progress', last_attempted_at: now })
    .eq('id', contact.id)

  const result = await placeOutboundCall({
    phone,
    campaignId,
    contactId: contact.id,
    agentName: agentName(campaign),
    trunkId,
    metadata: {
      campaignName: campaign.name,
      firstName: contact.first_name,
      lastName: contact.last_name,
      voiceRecordingUrl: voiceUrl,
      transferKey: campaign.transfer_key,
      transferTarget: campaign.transfer_target,
    },
  })

  const egress = result.ok && isEgressConfigured() ? await startRoomRecording(result.room) : null
  let callRecordId: number | null = null

  if (result.ok) {
    const { data: rec, error: recErr } = await supabase
      .from('call_records')
      .insert({
        campaign_id: Number(campaignId),
        contact_id: contact.id,
        phone,
        room: result.room,
        egress_id: egress?.egressId ?? null,
        outcome: 'pending',
        called_at: now,
      })
      .select('id')
      .single()
    if (recErr) console.error(`call_records insert failed (contact ${contact.id}):`, recErr.message)
    else callRecordId = rec?.id ?? null
    await supabase.from('contacts').update({ status: 'dialed' }).eq('id', contact.id)
  } else {
    await supabase.from('contacts').update({ status: 'failed' }).eq('id', contact.id)
    await supabase.from('call_records').insert({
      campaign_id: Number(campaignId),
      contact_id: contact.id,
      phone,
      room: result.room,
      outcome: 'failed',
      called_at: now,
    })
  }

  return { contactId: contact.id, phone, result, callRecordId }
}

async function dialManualPhone(
  supabase: SupabaseClient,
  campaignId: string,
  campaign: CampaignRow,
  phoneRaw: string,
  trunkId: string,
): Promise<void> {
  const phone = normalizePhone(phoneRaw)
  const voiceUrl = campaign.voice_recording_url ?? null
  const cid = `m${Date.now()}`

  const result = await placeOutboundCall({
    phone,
    campaignId,
    contactId: cid,
    agentName: agentName(campaign),
    trunkId,
    metadata: {
      campaignName: campaign.name,
      voiceRecordingUrl: voiceUrl,
      transferKey: campaign.transfer_key,
      transferTarget: campaign.transfer_target,
    },
  })

  const egress = result.ok && isEgressConfigured() ? await startRoomRecording(result.room) : null
  const now = new Date().toISOString()
  let callRecordId: number | null = null

  if (result.ok) {
    const { data: rec } = await supabase
      .from('call_records')
      .insert({
        campaign_id: Number(campaignId),
        phone,
        room: result.room,
        egress_id: egress?.egressId ?? null,
        outcome: 'pending',
        called_at: now,
      })
      .select('id')
      .single()
    callRecordId = rec?.id ?? null
  }

  printSummary([{ contactId: cid, phone, result, callRecordId }], trunkId, campaign)
  process.exit(result.ok ? 0 : 1)
}

function printSummary(
  rows: { contactId: number | string; phone: string; result: DialResult; callRecordId: number | null }[],
  trunkId: string,
  campaign: CampaignRow,
) {
  console.log(`\n── Dial summary (${rows.length} call${rows.length === 1 ? '' : 's'}) ──`)
  console.log('  trunk: ', trunkId)
  console.log('  agent: ', agentName(campaign) ?? '(default)')
  for (const row of rows) {
    console.log('  ─────────────────────────')
    console.log('  contact:       ', row.contactId)
    console.log('  phone:         ', row.phone)
    console.log('  room:          ', row.result.room)
    console.log('  call_record_id:', row.callRecordId ?? '(none)')
    console.log('  ok:            ', row.result.ok)
    if (row.result.error) console.log('  error:         ', row.result.error)
  }
  const ok = rows.filter(r => r.result.ok).length
  console.log(`\n  ${ok}/${rows.length} succeeded`)
}

async function main() {
  const campaignId = arg('campaign-id')
  const contactId = arg('contact-id')
  const phoneArg = arg('phone')
  const batchSize = Math.max(1, Number(arg('batch') ?? DEFAULT_BATCH) || DEFAULT_BATCH)

  if (!campaignId) {
    console.error('Usage: npm run dial -- --campaign-id <id> [--batch 3] [--contact-id <id>] [--phone <e164>]')
    process.exit(1)
  }

  requireEnv([
    'LIVEKIT_URL',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ])

  if (!isLivekitAuthConfigured()) {
    console.error('LiveKit auth not configured (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).')
    process.exit(1)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: campaign, error: cErr } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single()
  if (cErr || !campaign) {
    console.error('Campaign not found:', cErr?.message ?? campaignId)
    process.exit(1)
  }

  const trunkId = await resolveTrunkId(supabase, campaign)
  if (!isLivekitConfigured(trunkId)) {
    console.error('No SIP trunk: set campaigns.sip_trunk_id → sip_trunks, or LIVEKIT_SIP_OUTBOUND_TRUNK_ID in .env')
    process.exit(1)
  }

  // Single ad-hoc phone
  if (phoneArg) {
    await dialManualPhone(supabase, campaignId, campaign, phoneArg, trunkId!)
    return
  }

  // Single contact
  if (contactId) {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, phone, first_name, last_name')
      .eq('id', contactId)
      .eq('campaign_id', campaignId)
      .single()
    if (error || !data) {
      console.error('Contact not found:', error?.message ?? contactId)
      process.exit(1)
    }
    const row = await dialContact(supabase, campaignId, campaign, data, trunkId!)
    printSummary([row], trunkId!, campaign)
    process.exit(row.result.ok ? 0 : 1)
  }

  // Batch: next N pending/retry contacts
  const { data: contacts, error: cntErr } = await supabase
    .from('contacts')
    .select('id, phone, first_name, last_name')
    .eq('campaign_id', campaignId)
    .in('status', ['pending', 'retry'])
    .order('id', { ascending: true })
    .limit(batchSize)

  if (cntErr) {
    console.error('Failed to load contacts:', cntErr.message)
    process.exit(1)
  }
  if (!contacts?.length) {
    console.log('No pending contacts for campaign', campaignId)
    process.exit(0)
  }

  console.log(`Dialing ${contacts.length} contact(s) in parallel (batch=${batchSize})…`)
  const rows = await Promise.all(
    contacts.map(c => dialContact(supabase, campaignId, campaign, c, trunkId!)),
  )

  printSummary(rows, trunkId!, campaign)
  const allOk = rows.every(r => r.result.ok)
  process.exit(allOk ? 0 : 1)
}

main().catch(err => {
  if (err instanceof TwirpError) {
    const sipCode = err.metadata?.['sip_status_code']
    console.error(`SIP error: ${err.message} (code ${sipCode})`)
  } else {
    console.error(err)
  }
  process.exit(1)
})
