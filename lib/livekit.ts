import 'server-only'
import { WebhookReceiver } from 'livekit-server-sdk'

export {
  isLivekitAuthConfigured,
  isLivekitConfigured,
  isEgressConfigured,
  parseRoomName,
  resolveTrunkId,
  resolveTrunkWithSource,
  startRoomRecording,
  placeOutboundCall,
  type DialTarget,
  type DialResult,
  type TrunkSource,
  type ResolveTrunkResult,
} from '@/lib/outbound-call'

const LK_KEY = process.env.LIVEKIT_API_KEY
const LK_SECRET = process.env.LIVEKIT_API_SECRET

export function webhookReceiver(): WebhookReceiver {
  return new WebhookReceiver(LK_KEY!, LK_SECRET!)
}
