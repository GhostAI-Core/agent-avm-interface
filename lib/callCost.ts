// Estimated per-call telephony cost.
//
// `call_records.cost` is always 0 — CallOps doesn't write a real billed cost yet
// (evra_callops Issue #11). Until it does, we ESTIMATE cost from `talk_seconds`
// (100% populated) using researched 2026 unit rates. This is a labelled ESTIMATE,
// not a billed figure. When the real Converged Group rate/invoice arrives, update
// the single `COST_MODEL` block below — nothing else changes.
//
// Rates (ZAR, ~R18/USD), sourced 2026-07-02:
//   - Carrier SA SIP→mobile: batches use the `utility_connect` trunk (Converged Group SBC,
//     sbc.convergedgroup.co.za, CID +27104760561) — a private wholesale route, rate not public.
//     Best public proxies for a direct wholesale SA-mobile route: Switch Telecom ~R0.287/min,
//     Abacus ~R0.50/min → we use ~R0.35/min. This reconciles the felt ~12c "carrier-only" on a
//     19s call (0.317min × R0.35 ≈ R0.11). Local SIP bills PER-SECOND (increment 1s) — the big
//     lever on <30s calls. (Twilio SA-mobile is $0.0499≈R0.90/min but 60/60 — 3× on short calls.)
//   - LiveKit Cloud: agent session $0.010/min + third-party SIP $0.004/min ≈ R0.25/min.
//   - AI per answered call: AMD gpt-4.1-mini (~$0.001) + ~5s AssemblyAI STT (~$0.0002)
//     ≈ $0.0012 ≈ R0.02. TTS is pre-generated (not per-call). Recordings not running.

export interface CostModel {
  currency: string
  carrierPerMin: number        // SA mobile outbound SIP (Converged Group — proxy estimate)
  livekitPerMin: number        // LiveKit agent-session + third-party SIP minutes
  aiPerAnsweredCall: number    // AMD LLM + short STT, once per call that talks
  billingIncrementSec: number  // 1 = per-second (local SIP), 60 = per-minute (Twilio 60/60)
}

// EDIT THESE when the real carrier rate is known. Defaults = research "typical".
export const COST_MODEL: CostModel = {
  currency: 'ZAR',
  carrierPerMin: 0.35,   // utility_connect wholesale proxy (Switch R0.29 / Abacus R0.50)
  livekitPerMin: 0.25,   // LiveKit agent-session $0.010 + third-party SIP $0.004 ≈ R0.25
  aiPerAnsweredCall: 0.02,
  billingIncrementSec: 1,
}

/** Billed minutes for a talk duration under a given billing increment. */
export function billedMinutes(talkSeconds: number, incrementSec = COST_MODEL.billingIncrementSec): number {
  if (!(talkSeconds > 0)) return 0
  const inc = Math.max(1, incrementSec)
  return (Math.ceil(talkSeconds / inc) * inc) / 60
}

/**
 * Estimated cost of a single call.
 *  - Carrier (utility_connect) bills the ANSWERED leg (~talk time); an unanswered call's
 *    ring is normally free, so carrier cost uses talkSeconds.
 *  - LiveKit bills the whole SESSION (on-air = ended_at − started_at), which is ~5.5× talk
 *    and applies even to no-answers (the SIP/room leg exists during ring). So LiveKit cost
 *    uses onAirSeconds. If on-air is missing, fall back to talk.
 *  - AMD AI runs once per ANSWERED call.
 */
export function estimateCallCost(talkSeconds: number, onAirSeconds = 0, m: CostModel = COST_MODEL): number {
  const talk = Math.max(0, talkSeconds || 0)
  const air = Math.max(talk, onAirSeconds || 0) // on-air ≥ talk; fall back to talk if unknown
  const carrier = billedMinutes(talk, m.billingIncrementSec) * m.carrierPerMin
  const livekit = billedMinutes(air, m.billingIncrementSec) * m.livekitPerMin
  const ai = talk > 0 ? m.aiPerAnsweredCall : 0
  return carrier + livekit + ai
}
