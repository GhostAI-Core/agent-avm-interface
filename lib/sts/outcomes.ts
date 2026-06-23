/**
 * STS SmartCall SDP — AVM outcome edge mapping.
 *
 * STS is the carrier platform (step 1); this app is the AI-AVM layer (step 2). STS reports AVM
 * call results in its own vocabulary, and — unlike a plain disposition — some of those results are
 * *consent events* (a subscriber opting in, unsubscribing from a product, or opting out of all
 * marketing). We keep our internal lowercase outcome vocabulary as canonical and normalize STS at
 * this boundary, so the rest of the app (rollover, reporting, the compliance gate) never has to know
 * STS exists.
 *
 * STS Result vocabulary (SDP spec, "Subscription via AVM" → Post Data):
 *   DIALED, ANSWERED, HANGUP, VOICEMAIL, SUBSCRIBE, DECLINE, UNSUBSCRIBE, OPT OUT
 *
 * See docs/compliance-gate-callops-spec.md and docs/sts-sdp-integration.md.
 */

/** Canonical internal outcome stored in call_records.outcome (see the CHECK constraint migration). */
export type InternalOutcome =
  | 'answered'
  | 'hangup'
  | 'voicemail'
  | 'no_answer'
  | 'ni'
  | 'subscribed' // STS SUBSCRIBE — a billing conversion
  | 'unsubscribed' // STS UNSUBSCRIBE — product churn
  | 'opted_out' // STS OPT OUT — global DNC

/**
 * What an outcome does to consent/suppression state. `none` for plain dispositions.
 * - product_opt_in   → upsert product_consent (contact, product) = opted_in
 * - product_opt_out  → upsert product_consent (contact, product) = opted_out
 * - global_opt_out   → add phone to suppression_list (blocks every channel, every product)
 */
export type ConsentEffect = 'none' | 'product_opt_in' | 'product_opt_out' | 'global_opt_out'

export interface StsMapping {
  /** The raw STS result, normalized (uppercased, single-spaced). */
  result: StsResult
  /**
   * Is this a terminal outcome we persist? `DIALED` is a transient in-progress ack — false.
   * When false, `outcome`/`reached` carry no meaning; wait for the real result.
   */
  terminal: boolean
  /** call_records.outcome to store, or null when non-terminal. */
  outcome: InternalOutcome | null
  /** True when a live person was reached (ends the per-number day in the rollover). */
  reached: boolean
  /** Consent/suppression side-effect to apply. */
  consent: ConsentEffect
}

export const STS_RESULTS = [
  'DIALED',
  'ANSWERED',
  'HANGUP',
  'VOICEMAIL',
  'SUBSCRIBE',
  'DECLINE',
  'UNSUBSCRIBE',
  'OPT OUT',
] as const

export type StsResult = (typeof STS_RESULTS)[number]

const MAPPING: Record<StsResult, Omit<StsMapping, 'result'>> = {
  // Transient: STS sends this when the call is placed but not yet resolved. Not stored, not counted.
  DIALED: { terminal: false, outcome: null, reached: false, consent: 'none' },
  ANSWERED: { terminal: true, outcome: 'answered', reached: true, consent: 'none' },
  HANGUP: { terminal: true, outcome: 'hangup', reached: true, consent: 'none' },
  // Machine pickup — not reached, eligible for a spaced retry.
  VOICEMAIL: { terminal: true, outcome: 'voicemail', reached: false, consent: 'none' },
  // Answered + converted: the billing opt-in. The whole point of the AVM product.
  SUBSCRIBE: { terminal: true, outcome: 'subscribed', reached: true, consent: 'product_opt_in' },
  // Answered + said no to the offer. No consent change — they may still want other products.
  DECLINE: { terminal: true, outcome: 'ni', reached: true, consent: 'none' },
  // Answered + churned off this product (one agent value), still reachable for others.
  UNSUBSCRIBE: { terminal: true, outcome: 'unsubscribed', reached: true, consent: 'product_opt_out' },
  // Answered + global DNC — never contact again on any channel/product.
  'OPT OUT': { terminal: true, outcome: 'opted_out', reached: true, consent: 'global_opt_out' },
}

/** Normalize an STS result string: uppercase, trim, collapse internal whitespace ("OptOut" stays distinct). */
export function normalizeStsResult(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, ' ')
}

/** True when `raw` is a recognized STS AVM result. */
export function isStsResult(raw: string): raw is StsResult {
  const n = normalizeStsResult(raw)
  // Accept the spaced and unspaced forms of OPT OUT.
  return (STS_RESULTS as readonly string[]).includes(n) || n === 'OPTOUT'
}

/**
 * Map an STS AVM result to our internal model. Throws on an unrecognized result so a contract
 * drift at STS surfaces loudly rather than silently dropping a consent event.
 */
export function mapStsResult(raw: string): StsMapping {
  const n = normalizeStsResult(raw)
  const key = (n === 'OPTOUT' ? 'OPT OUT' : n) as StsResult
  const m = MAPPING[key]
  if (!m) throw new Error(`Unrecognized STS AVM result: ${JSON.stringify(raw)}`)
  return { result: key, ...m }
}

/** Convenience: the consent side-effect for an STS result (or 'none' if it isn't a consent event). */
export function stsConsentEffect(raw: string): ConsentEffect {
  return mapStsResult(raw).consent
}
