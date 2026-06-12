import {
  SipClient, AgentDispatchClient, TwirpError,
  EgressClient, EncodedFileOutput, EncodedFileType, S3Upload,
} from 'livekit-server-sdk'
import { normalizePhone } from '@/lib/phone'

/** Server SDK expects https:// host; agents often use wss:// in .env. */
function livekitHost(): string {
  const url = process.env.LIVEKIT_URL ?? ''
  return url.replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://')
}

function lkKey() { return process.env.LIVEKIT_API_KEY }
function lkSecret() { return process.env.LIVEKIT_API_SECRET }
function defaultTrunkId() { return process.env.LIVEKIT_SIP_OUTBOUND_TRUNK_ID }
function defaultAgentName() { return process.env.LIVEKIT_AGENT_NAME || 'outbound-agent' }

function recBucket() { return process.env.LIVEKIT_RECORD_BUCKET }
function recRegion() { return process.env.LIVEKIT_RECORD_REGION || 'us-east-1' }
function recAccessKey() { return process.env.LIVEKIT_RECORD_ACCESS_KEY }
function recSecret() { return process.env.LIVEKIT_RECORD_SECRET }
function recEndpoint() { return process.env.LIVEKIT_RECORD_ENDPOINT }
function recPrefix() { return process.env.LIVEKIT_RECORD_PREFIX || 'recordings' }

export function isLivekitAuthConfigured(): boolean {
  return Boolean(livekitHost() && lkKey() && lkSecret())
}

export function isLivekitConfigured(trunkId?: string | null): boolean {
  return isLivekitAuthConfigured() && Boolean(trunkId || defaultTrunkId())
}

export function isEgressConfigured(): boolean {
  return isLivekitAuthConfigured() && Boolean(recBucket() && recAccessKey() && recSecret())
}

let _sip: SipClient | null = null
let _dispatch: AgentDispatchClient | null = null
let _egress: EgressClient | null = null

function sipClient(): SipClient {
  if (!_sip) _sip = new SipClient(livekitHost(), lkKey()!, lkSecret()!)
  return _sip
}
function dispatchClient(): AgentDispatchClient {
  if (!_dispatch) _dispatch = new AgentDispatchClient(livekitHost(), lkKey()!, lkSecret()!)
  return _dispatch
}
function egressClient(): EgressClient {
  if (!_egress) _egress = new EgressClient(livekitHost(), lkKey()!, lkSecret()!)
  return _egress
}

/** Room names are `avm_<campaignId>_<contactId>_<rand>` — pull the ids back out. */
export function parseRoomName(room: string): { campaignId: number; contactId: number } | null {
  const m = /^avm_(\d+)_(\d+)_/.exec(room)
  if (!m) return null
  return { campaignId: Number(m[1]), contactId: Number(m[2]) }
}

/**
 * Resolve LiveKit trunk id (ST_…) from campaign.sip_trunk_id:
 * - string starting with ST_ → use directly
 * - numeric id → lookup sip_trunks.livekit_trunk_id
 * - else → LIVEKIT_SIP_OUTBOUND_TRUNK_ID env
 */
export async function resolveTrunkId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (t: string) => any } | null,
  campaign: { sip_trunk_id?: string | number | null },
): Promise<string | null> {
  const raw = campaign.sip_trunk_id
  if (typeof raw === 'string' && raw.startsWith('ST_')) return raw
  if (raw != null && String(raw).match(/^\d+$/) && supabase) {
    const { data: trunkRow } = await supabase
      .from('sip_trunks')
      .select('livekit_trunk_id')
      .eq('id', Number(raw))
      .maybeSingle()
    const tid = (trunkRow as { livekit_trunk_id?: string } | null)?.livekit_trunk_id
    if (tid) return tid
  }
  return defaultTrunkId() ?? null
}

export async function startRoomRecording(room: string): Promise<{ egressId: string } | null> {
  if (!isEgressConfigured()) return null
  try {
    const output = new EncodedFileOutput({
      fileType: EncodedFileType.OGG,
      filepath: `${recPrefix()}/${room}.ogg`,
      output: {
        case: 's3',
        value: new S3Upload({
          accessKey: recAccessKey()!,
          secret: recSecret()!,
          bucket: recBucket()!,
          region: recRegion(),
          ...(recEndpoint() ? { endpoint: recEndpoint(), forcePathStyle: true } : {}),
        }),
      },
    })
    const info = await egressClient().startRoomCompositeEgress(room, output, { audioOnly: true })
    return info.egressId ? { egressId: info.egressId } : null
  } catch (err) {
    console.error('startRoomRecording failed for', room, err)
    return null
  }
}

export interface DialTarget {
  phone: string
  campaignId: number | string
  contactId: number | string
  agentName?: string | null
  trunkId?: string | null
  metadata?: Record<string, unknown>
}

export interface DialResult {
  room: string
  phone: string
  contactId: number | string
  ok: boolean
  error?: string
}

export async function placeOutboundCall(target: DialTarget): Promise<DialResult> {
  const phone = normalizePhone(target.phone)
  const room = `avm_${target.campaignId}_${target.contactId}_${crypto.randomUUID().slice(0, 8)}`
  const agentName = target.agentName || defaultAgentName()
  const trunkId = target.trunkId || defaultTrunkId()
  if (!trunkId) {
    return {
      room,
      phone,
      contactId: target.contactId,
      ok: false,
      error: 'No SIP trunk id (set LIVEKIT_SIP_OUTBOUND_TRUNK_ID or campaigns.sip_trunk_id)',
    }
  }
  const metadata = JSON.stringify({
    campaignId: target.campaignId,
    contactId: target.contactId,
    phone,
    ...target.metadata,
  })

  try {
    await dispatchClient().createDispatch(room, agentName, { metadata })
    await sipClient().createSipParticipant(trunkId, phone, room, {
      participantIdentity: `caller_${target.contactId}`,
      participantName: phone,
      participantMetadata: metadata,
      waitUntilAnswered: false,
      krispEnabled: true,
    })
    return { room, phone, contactId: target.contactId, ok: true }
  } catch (err) {
    let error = err instanceof Error ? err.message : String(err)
    if (err instanceof TwirpError) {
      const sipCode = err.metadata?.['sip_status_code']
      const sipStatus = err.metadata?.['sip_status']
      error = [error, sipCode && `SIP ${sipCode}`, sipStatus].filter(Boolean).join(' — ')
    }
    return { room, phone, contactId: target.contactId, ok: false, error }
  }
}
