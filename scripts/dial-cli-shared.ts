import type { ResolveTrunkResult } from '../lib/outbound-call'
import type { SupabaseClient } from '@supabase/supabase-js'

export type CampaignDialRow = {
  sip_trunk_id?: string | number | null
}

export async function fetchCampaignForDial(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<{ campaign: CampaignDialRow | null; error?: string }> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('sip_trunk_id')
    .eq('id', campaignId)
    .single()

  if (error || !data) {
    return { campaign: null, error: error?.message ?? 'not found' }
  }
  return { campaign: data }
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

export function printDialPlan(
  campaignId: string,
  contactLabel: string,
  phone: string,
  agent: string | null,
  trunk: ResolveTrunkResult,
): void {
  console.log('campaign_id:     ', campaignId)
  console.log('contact_id:      ', contactLabel)
  console.log('selected_trunk:  ', trunk.trunkId ?? '(none)')
  console.log('trunk_source:    ', trunk.source ?? '(none)')
  console.log('agent:           ', agent ?? '(default)')
  console.log('phone:           ', phone)
}

export function printDialResult(
  room: string,
  ok: boolean,
  callRecordId: number | null,
  error?: string,
  options?: { waitedForAnswer?: boolean },
): void {
  console.log('room:            ', room)
  console.log('result:          ', ok ? 'ok' : 'failed')
  if (ok && !options?.waitedForAnswer) {
    console.log(
      'note:            ',
      'ok = LiveKit accepted createDispatch + createSipParticipant only; phone may not have rung yet',
    )
  }
  if (error) console.log('error:           ', error)
  console.log('call_record_id:  ', callRecordId ?? '(none)')
}

export async function pollCallRecordOutcome(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  room: string,
  seconds = 20,
): Promise<string | null> {
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) {
    const { data } = await supabase
      .from('call_records')
      .select('outcome')
      .eq('room', room)
      .single()
    const outcome = data?.outcome
    if (outcome && outcome !== 'pending') return outcome
    await new Promise(r => setTimeout(r, 2000))
  }
  return null
}
