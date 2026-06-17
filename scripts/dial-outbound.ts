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
  resolveTrunkWithSource,
  startRoomRecording,
  isEgressConfigured,
  type DialResult,
  type ResolveTrunkResult,
} from '../lib/outbound-call'
import { normalizePhone } from '../lib/phone'
import {
  arg,
  printDialPlan,
  printDialResult,
  pollCallRecordOutcome,
} from './dial-cli-shared'

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
  trunk: ResolveTrunkResult,
  waitUntilAnswered: boolean,
): Promise<{ contactId: number; phone: string; result: DialResult; callRecordId: number | null }> {
  const phone = normalizePhone(contact.phone)
  const trunkId = trunk.trunkId!
  const voiceUrl = campaign.voice_recording_url ?? null
  const now = new Date().toISOString()

  console.log('\n── Dial plan ──')
  printDialPlan(campaignId, String(contact.id), phone, agentName(campaign), trunk)

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
    waitUntilAnswered,
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

  console.log('\n── Dial result ──')
  printDialResult(result.room, result.ok, callRecordId, result.error, { waitedForAnswer: waitUntilAnswered })
  if (result.ok && !waitUntilAnswered) {
    const outcome = await pollCallRecordOutcome(supabase, result.room)
    if (outcome) {
      console.log('webhook_outcome: ', outcome)
    } else {
      console.log(
        'webhook_outcome: ',
        'still pending after 20s — SIP likely never connected (check carrier route, LiveKit trunk auth)',
      )
    }
  }

  return { contactId: contact.id, phone, result, callRecordId }
}

async function dialManualPhone(
  supabase: SupabaseClient,
  campaignId: string,
  campaign: CampaignRow,
  phoneRaw: string,
  trunk: ResolveTrunkResult,
  waitUntilAnswered: boolean,
): Promise<boolean> {
  const phone = normalizePhone(phoneRaw)
  const trunkId = trunk.trunkId!
  const voiceUrl = campaign.voice_recording_url ?? null
  const cid = `m${Date.now()}`

  console.log('\n── Dial plan ──')
  printDialPlan(campaignId, `(manual ${cid})`, phone, agentName(campaign), trunk)

  const result = await placeOutboundCall({
    phone,
    campaignId,
    contactId: cid,
    agentName: agentName(campaign),
    trunkId,
    waitUntilAnswered,
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

  console.log('\n── Dial result ──')
  printDialResult(result.room, result.ok, callRecordId, result.error, { waitedForAnswer: waitUntilAnswered })
  if (result.ok && !waitUntilAnswered) {
    const outcome = await pollCallRecordOutcome(supabase, result.room)
    if (outcome) {
      console.log('webhook_outcome: ', outcome)
    } else {
      console.log(
        'webhook_outcome: ',
        'still pending after 20s — SIP likely never connected (check carrier route, LiveKit trunk auth)',
      )
    }
  }
  return result.ok
}

async function main() {
  const campaignId = arg('campaign-id')
  const contactId = arg('contact-id')
  const phoneArg = arg('phone')
  const waitUntilAnswered = process.argv.includes('--wait')
  const batchSize = Math.max(1, Number(arg('batch') ?? DEFAULT_BATCH) || DEFAULT_BATCH)

  if (!campaignId) {
    console.error(
      'Usage: npm run dial -- --campaign-id <id> [--batch 3] [--contact-id <id>] [--phone <e164>] [--wait]',
    )
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

  const trunk = await resolveTrunkWithSource(supabase, campaign)

  if (!isLivekitConfigured(trunk.trunkId)) {
    console.error('No SIP trunk: set campaigns.sip_trunk_id → sip_trunks, or LIVEKIT_SIP_OUTBOUND_TRUNK_ID in .env')
    process.exit(1)
  }

  // Single ad-hoc phone
  if (phoneArg) {
    const ok = await dialManualPhone(supabase, campaignId, campaign, phoneArg, trunk, waitUntilAnswered)
    process.exit(ok ? 0 : 1)
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
    const row = await dialContact(supabase, campaignId, campaign, data, trunk, waitUntilAnswered)
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
    contacts.map(c => dialContact(supabase, campaignId, campaign, c, trunk, waitUntilAnswered)),
  )

  const ok = rows.filter(r => r.result.ok).length
  console.log(`\n── Batch summary: ${ok}/${rows.length} succeeded ──`)
  process.exit(ok === rows.length ? 0 : 1)
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
