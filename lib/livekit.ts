import 'server-only'
import {
  SipClient, AgentDispatchClient, WebhookReceiver,
  EgressClient, EncodedFileOutput, EncodedFileType, S3Upload,
} from 'livekit-server-sdk'

/**
 * LiveKit gateway — the same telephony path Seeker/Grace use.
 *
 * Outbound flow: this app dispatches the AI agent into a fresh room, then places a
 * PSTN call through a LiveKit **SIP outbound trunk** (Twilio/Telnyx sit *behind* LiveKit
 * as the trunk). When the callee answers, agent + callee meet in the room. Call results
 * come back via the LiveKit webhook (`/api/livekit/webhook`).
 *
 * Everything is env-gated: with no LiveKit config the app falls back to the simulator,
 * so nothing breaks until Cale drops in the real credentials + trunk ID.
 */

const LK_URL = process.env.LIVEKIT_URL
const LK_KEY = process.env.LIVEKIT_API_KEY
const LK_SECRET = process.env.LIVEKIT_API_SECRET
const DEFAULT_TRUNK_ID = process.env.LIVEKIT_SIP_OUTBOUND_TRUNK_ID
const DEFAULT_AGENT_NAME = process.env.LIVEKIT_AGENT_NAME || 'outbound-agent'

// Recording (LiveKit Egress → S3-compatible storage). Optional: when unset, calls still
// place; the per-call recording_url just stays null. The same egress also fires the
// `egress_ended` webhook, so a recording started anywhere (agent / auto-egress) still lands.
const REC_BUCKET = process.env.LIVEKIT_RECORD_BUCKET
const REC_REGION = process.env.LIVEKIT_RECORD_REGION || 'us-east-1'
const REC_ACCESS_KEY = process.env.LIVEKIT_RECORD_ACCESS_KEY
const REC_SECRET = process.env.LIVEKIT_RECORD_SECRET
const REC_ENDPOINT = process.env.LIVEKIT_RECORD_ENDPOINT // optional (S3-compatible: R2/MinIO/etc.)
const REC_PREFIX = process.env.LIVEKIT_RECORD_PREFIX || 'recordings'

/** Auth creds present — enough to validate webhooks. */
export function isLivekitAuthConfigured(): boolean {
  return Boolean(LK_URL && LK_KEY && LK_SECRET)
}

/** Auth + an outbound SIP trunk — enough to actually place calls. */
export function isLivekitConfigured(): boolean {
  return isLivekitAuthConfigured() && Boolean(DEFAULT_TRUNK_ID)
}

/** Auth + an S3 destination — enough to start app-initiated call recording. */
export function isEgressConfigured(): boolean {
  return isLivekitAuthConfigured() && Boolean(REC_BUCKET && REC_ACCESS_KEY && REC_SECRET)
}

let _sip: SipClient | null = null
let _dispatch: AgentDispatchClient | null = null
let _egress: EgressClient | null = null

function sipClient(): SipClient {
  if (!_sip) _sip = new SipClient(LK_URL!, LK_KEY!, LK_SECRET!)
  return _sip
}
function dispatchClient(): AgentDispatchClient {
  if (!_dispatch) _dispatch = new AgentDispatchClient(LK_URL!, LK_KEY!, LK_SECRET!)
  return _dispatch
}
function egressClient(): EgressClient {
  if (!_egress) _egress = new EgressClient(LK_URL!, LK_KEY!, LK_SECRET!)
  return _egress
}

export function webhookReceiver(): WebhookReceiver {
  return new WebhookReceiver(LK_KEY!, LK_SECRET!)
}

/** Room names are `avm_<campaignId>_<contactId>_<rand>` — pull the ids back out. */
export function parseRoomName(room: string): { campaignId: number; contactId: number } | null {
  const m = /^avm_(\d+)_(\d+)_/.exec(room)
  if (!m) return null
  return { campaignId: Number(m[1]), contactId: Number(m[2]) }
}

/**
 * Start an audio-only recording of the room to S3-compatible storage. Best-effort:
 * returns the egress id (correlate the file via the `egress_ended` webhook) or null —
 * never throws, so a recording failure can't sink the call.
 */
export async function startRoomRecording(room: string): Promise<{ egressId: string } | null> {
  if (!isEgressConfigured()) return null
  try {
    const output = new EncodedFileOutput({
      fileType: EncodedFileType.OGG,
      filepath: `${REC_PREFIX}/${room}.ogg`,
      output: {
        case: 's3',
        value: new S3Upload({
          accessKey: REC_ACCESS_KEY!,
          secret: REC_SECRET!,
          bucket: REC_BUCKET!,
          region: REC_REGION,
          ...(REC_ENDPOINT ? { endpoint: REC_ENDPOINT, forcePathStyle: true } : {}),
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
  /** Per-campaign overrides; fall back to env defaults when null/undefined. */
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

/**
 * Place one outbound call: pre-dispatch the agent into a room, then dial the number
 * into that same room over the SIP trunk. Never throws — failures come back on `ok:false`.
 */
export async function placeOutboundCall(target: DialTarget): Promise<DialResult> {
  const room = `avm_${target.campaignId}_${target.contactId}_${crypto.randomUUID().slice(0, 8)}`
  const agentName = target.agentName || DEFAULT_AGENT_NAME
  const trunkId = target.trunkId || DEFAULT_TRUNK_ID!
  const metadata = JSON.stringify({
    campaignId: target.campaignId,
    contactId: target.contactId,
    phone: target.phone,
    ...target.metadata,
  })

  try {
    // 1. Pre-dispatch the AI agent so it's waiting in the room when the callee picks up.
    await dispatchClient().createDispatch(room, agentName, { metadata })

    // 2. Place the PSTN call via the SIP outbound trunk (Twilio/Telnyx behind LiveKit).
    await sipClient().createSipParticipant(trunkId, target.phone, room, {
      participantIdentity: `caller_${target.contactId}`,
      participantName: target.phone,
      participantMetadata: metadata,
      waitUntilAnswered: false,
      krispEnabled: true,
    })

    return { room, phone: target.phone, contactId: target.contactId, ok: true }
  } catch (err) {
    return {
      room,
      phone: target.phone,
      contactId: target.contactId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
