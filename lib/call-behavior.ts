/**
 * In-call behavior knobs handed to the LiveKit agent worker (Cale's). The worker reads these
 * (by campaign_id from the room, or from the dispatch metadata we attach at dial time) and
 * enforces them inside the call — this control plane never touches the audio.
 *
 *   answerDelaySec   — wait this long after the callee answers before speaking
 *   amdEnabled       — run answering-machine detection
 *   voicemailAction  — what to do when AMD says it's a machine ('hangup' to stop wasting spend)
 *   silenceTimeoutSec— if no response for this long, drop the call from our side
 *
 * Defaults match the EOB ask (2026-06-18); columns on `campaigns` override per-campaign.
 */
export type VoicemailAction = 'hangup' | 'leave_message' | 'continue'

export interface CallBehavior {
  answerDelaySec: number
  amdEnabled: boolean
  voicemailAction: VoicemailAction
  silenceTimeoutSec: number
}

export const DEFAULT_CALL_BEHAVIOR: CallBehavior = {
  answerDelaySec: 2,
  amdEnabled: true,
  voicemailAction: 'hangup',
  silenceTimeoutSec: 4,
}

/** Build the behavior for a campaign, falling back to the defaults for any unset column. */
export function resolveCallBehavior(campaign: {
  answer_delay_sec?: number | null
  amd_enabled?: boolean | null
  voicemail_action?: VoicemailAction | null
  silence_timeout_sec?: number | null
} | null | undefined): CallBehavior {
  return {
    answerDelaySec: campaign?.answer_delay_sec ?? DEFAULT_CALL_BEHAVIOR.answerDelaySec,
    amdEnabled: campaign?.amd_enabled ?? DEFAULT_CALL_BEHAVIOR.amdEnabled,
    voicemailAction: campaign?.voicemail_action ?? DEFAULT_CALL_BEHAVIOR.voicemailAction,
    silenceTimeoutSec: campaign?.silence_timeout_sec ?? DEFAULT_CALL_BEHAVIOR.silenceTimeoutSec,
  }
}
