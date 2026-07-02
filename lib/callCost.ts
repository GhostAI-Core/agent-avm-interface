// Estimated per-call telephony cost.
//
// `call_records.cost` is always 0 — CallOps doesn't write a real billed cost yet
// (evra_callops Issue #11). Until it does, we ESTIMATE cost from `talk_seconds`
// (100% populated) using researched 2026 unit rates. This is a labelled ESTIMATE,
// not a billed figure. When the real Converged Group rate/invoice arrives, update
// the single `COST_MODEL` block below — nothing else changes.
//
// Rates (ZAR, ~R18/USD), sourced 2026-07-02:
//   - Carrier SA SIP→mobile: Converged Group is not public. Proxy: SA wholesale/retail
//     SIP-to-mobile ~R0.30–0.90/min (typical ~R0.50); ICASA MTR floor R0.05/min.
//     Local SIP typically bills PER-SECOND (increment 1s) — the big lever on <30s calls.
//     Twilio SA-mobile is $0.0499≈R0.90/min but 60/60 (1-min minimum).
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
  carrierPerMin: 0.50,
  livekitPerMin: 0.25,
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
 * Estimated cost of a single call from its talk time. No-answer/failed calls (talk=0)
 * cost 0 here — any per-attempt/ring charge is not modelled (unknown; add if confirmed).
 */
export function estimateCallCost(talkSeconds: number, m: CostModel = COST_MODEL): number {
  if (!(talkSeconds > 0)) return 0
  return billedMinutes(talkSeconds, m.billingIncrementSec) * (m.carrierPerMin + m.livekitPerMin) + m.aiPerAnsweredCall
}
