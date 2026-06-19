#!/usr/bin/env npx tsx
import './preload-env'

/**
 * evra-callops integration test harness (issue #34).
 *
 * Drives the callops orchestrator and verifies that Supabase populates as calls progress.
 * callops creds come from CALLOPS_URL / CALLOPS_WEBHOOK_SECRET; Supabase verification needs
 * SUPABASE_SERVICE_ROLE_KEY (read-only here). Commands that don't touch Supabase work without it.
 *
 * Usage:
 *   npm run callops -- status <campaignId>                     # GET live stats from callops
 *   npm run callops -- start|pause|stop <campaignId>           # lifecycle command
 *   npm run callops -- test-call <+E164> [--from +E164] [--trunk ST_…]
 *                                                              # place a one-off call to yourself
 *   npm run callops -- outcome <campaignId> <contactId> <outcome> [--talk 90] [--room name]
 *                                                              # simulate an agent /calls/outcome post
 *   npm run callops -- snapshot <campaignId>                   # dump Supabase state for a campaign
 *   npm run callops -- watch <campaignId> [--secs 120]         # poll Supabase + callops, print diffs
 *
 * Outcomes for `outcome`: answered | no_answer | busy | failed | transferred | voicemail
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const CALLOPS_URL = process.env.CALLOPS_URL?.replace(/\/+$/, '')
const SECRET = process.env.CALLOPS_WEBHOOK_SECRET
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const args = process.argv.slice(2)
const cmd = args[0]
const positional = args.slice(1).filter(a => !a.startsWith('--'))
function flag(name: string, fallback?: string): string | undefined {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

function requireCallops() {
  if (!CALLOPS_URL || !SECRET) {
    console.error('✗ CALLOPS_URL / CALLOPS_WEBHOOK_SECRET not set in .env')
    process.exit(1)
  }
}

function supabase(): SupabaseClient {
  if (!SB_URL || !SB_KEY) {
    console.error('✗ Supabase verification needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.')
    console.error('  Both are currently blank — ask for the service_role key (Supabase → Settings → API).')
    process.exit(1)
  }
  return createClient(SB_URL, SB_KEY)
}

async function callops(path: string, init?: RequestInit) {
  requireCallops()
  const res = await fetch(`${CALLOPS_URL}${path}`, {
    ...init,
    headers: { 'X-Webhook-Secret': SECRET!, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const text = await res.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { json = text }
  console.log(`${init?.method ?? 'GET'} ${path} → ${res.status}`)
  console.log(JSON.stringify(json, null, 2))
  if (!res.ok) process.exitCode = 1
  return { res, json }
}

async function snapshot(campaignId: number) {
  const sb = supabase()
  const { data: camp } = await sb.from('campaigns')
    .select('id,name,status,auto_paused,max_concurrent,max_retries,retry_cooldown_seconds,time_window_start,time_window_end')
    .eq('id', campaignId).single()
  console.log('campaign:', JSON.stringify(camp))

  const statuses = ['pending', 'in_progress', 'dialed', 'failed', 'retry']
  const contactCounts: Record<string, number> = {}
  for (const s of statuses) {
    const { count } = await sb.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('status', s)
    contactCounts[s] = count ?? 0
  }
  console.log('contacts by status:', JSON.stringify(contactCounts))

  const { data: records } = await sb.from('call_records')
    .select('id,contact_id,phone,outcome,talk_seconds,transferred,cost,recording_url,room,called_at')
    .eq('campaign_id', campaignId).order('id', { ascending: false }).limit(10)
  console.log(`call_records (latest ${records?.length ?? 0}):`)
  for (const r of records ?? []) console.log('  ', JSON.stringify(r))

  return { camp, contactCounts, records: records ?? [] }
}

async function main() {
  switch (cmd) {
    case 'status':
      await callops(`/campaigns/${positional[0]}/status`)
      break
    case 'start': case 'pause': case 'stop':
      await callops(`/campaigns/${positional[0]}/${cmd}`, { method: 'POST' })
      break
    case 'test-call': {
      const phone = positional[0]
      if (!phone) { console.error('usage: test-call <+E164>'); process.exit(1) }
      const body: Record<string, unknown> = {
        phone,
        sip_trunk_id: flag('trunk', process.env.LIVEKIT_SIP_OUTBOUND_TRUNK_ID),
        from_number: flag('from'),
        wait_until_answered: true,
        timeout_seconds: Number(flag('timeout', '45')),
      }
      console.log('⚠ placing a REAL outbound call to', phone)
      await callops('/livekit/test-call', { method: 'POST', body: JSON.stringify(body) })
      break
    }
    case 'outcome': {
      const [campaignId, contactId, outcome] = positional
      if (!campaignId || !contactId || !outcome) {
        console.error('usage: outcome <campaignId> <contactId> <outcome>'); process.exit(1)
      }
      const body = {
        campaign_id: Number(campaignId),
        contact_id: Number(contactId),
        room_name: flag('room', `test-${campaignId}-${contactId}`),
        outcome,
        phone: flag('phone', ''),
        talk_seconds: Number(flag('talk', '0')),
        transferred: outcome === 'transferred',
        attempt: Number(flag('attempt', '1')),
      }
      await callops('/calls/outcome', { method: 'POST', body: JSON.stringify(body) })
      break
    }
    case 'snapshot':
      await snapshot(Number(positional[0]))
      break
    case 'watch': {
      const id = Number(positional[0])
      const until = Date.now() + Number(flag('secs', '120')) * 1000
      let prev = ''
      while (Date.now() < until) {
        const snap = JSON.stringify((await snapshot(id)).contactCounts)
        if (CALLOPS_URL && SECRET) {
          const r = await fetch(`${CALLOPS_URL}/campaigns/${id}/status`, { headers: { 'X-Webhook-Secret': SECRET } })
          console.log('callops status:', r.ok ? await r.text() : `HTTP ${r.status}`)
        }
        if (snap !== prev) { console.log('— change detected —'); prev = snap }
        console.log('—'.repeat(20))
        await new Promise(r => setTimeout(r, 5000))
      }
      break
    }
    default:
      console.log('commands: status | start | pause | stop | test-call | outcome | snapshot | watch')
      console.log('see header of scripts/callops-test.ts for usage')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
