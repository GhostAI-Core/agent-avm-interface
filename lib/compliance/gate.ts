/**
 * Pre-dial compliance gate (plan.md §5).
 *
 * Pure, side-effect-free decision function: given candidate contacts, their campaign, the
 * current suppression set, and "now", decide which contacts may be dialed. The dial route
 * owns all I/O (loading suppression, writing audit rows, bumping counters) — this module
 * does no network or DB work so it is trivially unit-testable.
 *
 * Decision order (first failure wins):
 *   region → network → dead → consent/DNC → calling window → already-reached-today → retry cap → spacing.
 *
 * Frequency is keyed on the PHONE NUMBER (via `numberState`), not the per-campaign contact row,
 * so a number can't be dialed twice across two campaigns in a day. One live answer ends the day
 * for that number; unanswered attempts are capped and spaced (plan.md §5).
 */

import { isAllowedNetwork } from '@/lib/networks'

// Markets approved to dial. ZA-only for now (plan.md §3); extend with counsel sign-off.
const ALLOWED_REGIONS = new Set(['ZA'])

// Applied only when a campaign has no calling window set (plan.md §5.3, DECIDED 2026-06-18).
const DEFAULT_WINDOW = { start: '08:00', end: '20:00' }

// A contact whose master-sheet score has hit this floor is DEAD — never dial it (any product).
const DEAD_THRESHOLD = -10

export type ConsentStatus = 'opted_in' | 'opted_out' | 'unknown'

export type GateReason =
  | 'region_not_approved'
  | 'network_not_allowed'
  | 'dead'
  | 'no_consent'
  | 'suppressed'
  | 'outside_window'
  | 'already_reached'
  | 'retry_cap'
  | 'spacing'

export interface GateContact {
  id: number
  phone: string // normalized +E.164
  consent_status: ConsentStatus
  timezone: string
  score: number // master-sheet score; ≤ DEAD_THRESHOLD → never dial
}

export interface GateCampaign {
  region: string
  require_consent: boolean
  time_window_start: string | null // 'HH:MM' | 'HH:MM:SS'
  time_window_end: string | null
  max_attempts_per_day: number // retryable (no-answer/vm/busy) attempts per number per day
}

/** Per-phone daily rollover state (from dial_number_state). */
export interface NumberState {
  state_date: string // 'YYYY-MM-DD'
  reached: boolean
  attempts: number
  next_eligible_at: string | null
}

export interface GateDecision {
  contact: GateContact
  allow: boolean
  reason?: GateReason
}

/** Map an +E.164 number to a coarse region code. Only the markets we care about are named. */
export function phoneRegion(phone: string): string {
  if (phone.startsWith('+27')) return 'ZA'
  if (phone.startsWith('+1')) return 'US'
  if (phone.startsWith('+44')) return 'UK'
  return 'OTHER'
}

/** 'HH:MM' / 'HH:MM:SS' → minutes since midnight, or null if unparseable. */
function toMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** Local minutes-since-midnight for `now` in an IANA timezone. Throws on invalid tz. */
function localMinutes(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const h = Number(parts.find((p) => p.type === 'hour')?.value)
  const min = Number(parts.find((p) => p.type === 'minute')?.value)
  return h * 60 + min
}

/** Local calendar date ('YYYY-MM-DD') for `now` in an IANA timezone. */
function localDate(now: Date, timezone: string): string {
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Is `t` (minutes) within [start, end)? Handles windows that wrap past midnight. */
function withinWindow(t: number, start: number, end: number): boolean {
  if (start === end) return false // empty window
  if (start < end) return t >= start && t < end
  return t >= start || t < end // wraps midnight
}

function decide(
  contact: GateContact,
  campaign: GateCampaign,
  suppressed: Set<string>,
  numberState: Map<string, NumberState>,
  now: Date,
): GateReason | null {
  // 1. Region guard — campaign market must be approved AND the number must match it.
  if (!ALLOWED_REGIONS.has(campaign.region)) return 'region_not_approved'
  if (phoneRegion(contact.phone) !== campaign.region) return 'region_not_approved'

  // 1b. Network allow-list — we may only dial Vodacom / MTN / Cell C prefixes.
  if (!isAllowedNetwork(contact.phone)) return 'network_not_allowed'

  // 1c. Dead number — repeated bad outcomes drove the global score to the floor. Stop wasting spend.
  if (contact.score <= DEAD_THRESHOLD) return 'dead'

  // 2. Consent / DNC.
  if (contact.consent_status === 'opted_out') return 'no_consent'
  if (suppressed.has(contact.phone)) return 'suppressed'
  if (campaign.require_consent && contact.consent_status !== 'opted_in') return 'no_consent'

  // 3. Calling window (contact-local; default 08:00–20:00 when campaign window unset).
  let startStr = campaign.time_window_start
  let endStr = campaign.time_window_end
  if (!startStr || !endStr) {
    startStr = DEFAULT_WINDOW.start
    endStr = DEFAULT_WINDOW.end
  }
  const start = toMinutes(startStr)
  const end = toMinutes(endStr)
  let nowLocal: number
  try {
    nowLocal = localMinutes(now, contact.timezone)
  } catch {
    return 'outside_window' // invalid tz → fail closed
  }
  if (start === null || end === null || !withinWindow(nowLocal, start, end)) {
    return 'outside_window'
  }

  // 4–6. Per-NUMBER daily rollover (cross-campaign). State only counts if it's for today's
  // local date — a stale row means the number is fresh again. `next_eligible_at` (with its
  // random jitter) is stamped on the write side, so spacing here is a pure comparison.
  const today = localDate(now, contact.timezone)
  const ns = numberState.get(contact.phone)
  if (ns && ns.state_date === today) {
    if (ns.reached) return 'already_reached' // got a live answer today → done on every campaign
    if (ns.attempts >= campaign.max_attempts_per_day) return 'retry_cap'
    if (ns.next_eligible_at && now.getTime() < new Date(ns.next_eligible_at).getTime()) return 'spacing'
  }

  return null
}

export function gateContacts(args: {
  contacts: GateContact[]
  campaign: GateCampaign
  suppressed: Set<string>
  numberState: Map<string, NumberState>
  now: Date
}): GateDecision[] {
  const { contacts, campaign, suppressed, numberState, now } = args
  return contacts.map((contact) => {
    const reason = decide(contact, campaign, suppressed, numberState, now)
    return reason ? { contact, allow: false, reason } : { contact, allow: true }
  })
}
