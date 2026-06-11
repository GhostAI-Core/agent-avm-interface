import 'server-only'
import { SipClient, AgentDispatchClient, WebhookReceiver } from 'livekit-server-sdk'

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

/** Auth creds present — enough to validate webhooks. */
export function isLivekitAuthConfigured(): boolean {
  return Boolean(LK_URL && LK_KEY && LK_SECRET)
}

/** Auth + an outbound SIP trunk — enough to actually place calls. */
export function isLivekitConfigured(): boolean {
  return isLivekitAuthConfigured() && Boolean(DEFAULT_TRUNK_ID)
}

let _sip: SipClient | null = null
let _dispatch: AgentDispatchClient | null = null

function sipClient(): SipClient {
  if (!_sip) _sip = new SipClient(LK_URL!, LK_KEY!, LK_SECRET!)
  return _sip
}
function dispatchClient(): AgentDispatchClient {
  if (!_dispatch) _dispatch = new AgentDispatchClient(LK_URL!, LK_KEY!, LK_SECRET!)
  return _dispatch
}

export function webhookReceiver(): WebhookReceiver {
  return new WebhookReceiver(LK_KEY!, LK_SECRET!)
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
