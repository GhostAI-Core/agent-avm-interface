import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gateContacts, phoneRegion, type GateContact, type GateCampaign, type NumberState } from './gate'

// Helpers ─────────────────────────────────────────────────────────────────
function contact(overrides: Partial<GateContact> = {}): GateContact {
  return {
    id: 1,
    phone: '+27821234567',
    consent_status: 'opted_in',
    timezone: 'Africa/Johannesburg',
    score: 0,
    ...overrides,
  }
}

function campaign(overrides: Partial<GateCampaign> = {}): GateCampaign {
  return {
    region: 'ZA',
    require_consent: true,
    time_window_start: '08:00',
    time_window_end: '20:00',
    max_attempts_per_day: 3,
    ...overrides,
  }
}

// A fixed instant: 2026-06-18 12:00 UTC → 14:00 in Africa/Johannesburg (UTC+2), inside 08:00–20:00.
const NOON_UTC = new Date('2026-06-18T12:00:00Z')

function gateOne(
  c: GateContact,
  camp: GateCampaign,
  opts: { suppressed?: string[]; numberState?: Record<string, NumberState>; now?: Date } = {},
) {
  const numberState = new Map(Object.entries(opts.numberState ?? {}))
  return gateContacts({
    contacts: [c],
    campaign: camp,
    suppressed: new Set(opts.suppressed ?? []),
    numberState,
    now: opts.now ?? NOON_UTC,
  })[0]
}

// Consent / DNC ─────────────────────────────────────────────────────────────
test('opted_out contact is blocked', () => {
  const d = gateOne(contact({ consent_status: 'opted_out' }), campaign())
  assert.equal(d.allow, false)
  assert.equal(d.reason, 'no_consent')
})

test('suppressed phone is blocked even when opted_in', () => {
  const c = contact({ consent_status: 'opted_in' })
  const d = gateOne(c, campaign(), { suppressed: [c.phone] })
  assert.equal(d.allow, false)
  assert.equal(d.reason, 'suppressed')
})

test('unknown consent blocked when require_consent, allowed when not', () => {
  const blocked = gateOne(contact({ consent_status: 'unknown' }), campaign({ require_consent: true }))
  assert.equal(blocked.reason, 'no_consent')
  const allowed = gateOne(contact({ consent_status: 'unknown' }), campaign({ require_consent: false }))
  assert.equal(allowed.allow, true)
})

// Calling window ────────────────────────────────────────────────────────────
test('inside window allowed, outside blocked', () => {
  // 14:00 local is inside 08:00–20:00.
  assert.equal(gateOne(contact(), campaign()).allow, true)
  // Window 08:00–13:00 → 14:00 local is outside.
  const d = gateOne(contact(), campaign({ time_window_end: '13:00' }))
  assert.equal(d.allow, false)
  assert.equal(d.reason, 'outside_window')
})

test('null window falls back to default 08:00-20:00', () => {
  const d = gateOne(contact(), campaign({ time_window_start: null, time_window_end: null }))
  assert.equal(d.allow, true) // 14:00 local is inside the default
  // At 06:00 UTC → 08:00 SAST exactly: inside (start inclusive). At 05:00 UTC → 07:00 SAST: outside.
  const early = gateOne(contact(), campaign({ time_window_start: null, time_window_end: null }), { now: new Date('2026-06-18T05:00:00Z') })
  assert.equal(early.reason, 'outside_window')
})

test('window that wraps past midnight', () => {
  // 22:00–06:00 window. 14:00 local is outside.
  const out = gateOne(contact(), campaign({ time_window_start: '22:00', time_window_end: '06:00' }))
  assert.equal(out.reason, 'outside_window')
  // 23:00 UTC → 01:00 SAST next day: inside the wrap window.
  const inWrap = gateOne(contact(), campaign({ time_window_start: '22:00', time_window_end: '06:00' }), { now: new Date('2026-06-18T23:00:00Z') })
  assert.equal(inWrap.allow, true)
})

test('invalid timezone fails closed', () => {
  const d = gateOne(contact({ timezone: 'Not/AZone' }), campaign())
  assert.equal(d.allow, false)
  assert.equal(d.reason, 'outside_window')
})

// Per-number rollover: reached ─────────────────────────────────────────────
const TODAY = '2026-06-18'
const PHONE = '+27821234567'

test('reached today blocks all further calls (cross-campaign one-answer-per-day)', () => {
  const d = gateOne(contact(), campaign(), {
    numberState: { [PHONE]: { state_date: TODAY, reached: true, attempts: 0, next_eligible_at: null } },
  })
  assert.equal(d.allow, false)
  assert.equal(d.reason, 'already_reached')
})

test('reached state from yesterday is stale → number is fresh again', () => {
  const d = gateOne(contact(), campaign(), {
    numberState: { [PHONE]: { state_date: '2026-06-17', reached: true, attempts: 9, next_eligible_at: null } },
  })
  assert.equal(d.allow, true)
})

// Per-number rollover: retry cap ────────────────────────────────────────────
test('retry cap blocks at/over max attempts for today', () => {
  const atCap = gateOne(contact(), campaign({ max_attempts_per_day: 3 }), {
    numberState: { [PHONE]: { state_date: TODAY, reached: false, attempts: 3, next_eligible_at: null } },
  })
  assert.equal(atCap.reason, 'retry_cap')
  const under = gateOne(contact(), campaign({ max_attempts_per_day: 3 }), {
    numberState: { [PHONE]: { state_date: TODAY, reached: false, attempts: 2, next_eligible_at: null } },
  })
  assert.equal(under.allow, true)
})

// Per-number rollover: spacing (randomized gap, enforced via next_eligible_at) ─
test('spacing blocks before next_eligible_at, allows after', () => {
  const future = new Date(NOON_UTC.getTime() + 30 * 60_000).toISOString() // eligible in 30 min
  const blocked = gateOne(contact(), campaign(), {
    numberState: { [PHONE]: { state_date: TODAY, reached: false, attempts: 1, next_eligible_at: future } },
  })
  assert.equal(blocked.reason, 'spacing')
  const past = new Date(NOON_UTC.getTime() - 5 * 60_000).toISOString() // eligible 5 min ago
  const allowed = gateOne(contact(), campaign(), {
    numberState: { [PHONE]: { state_date: TODAY, reached: false, attempts: 1, next_eligible_at: past } },
  })
  assert.equal(allowed.allow, true)
})

test('no number-state row → number is fresh, allowed', () => {
  assert.equal(gateOne(contact(), campaign()).allow, true)
})

// Region guard ──────────────────────────────────────────────────────────────
test('ZA number on ZA campaign allowed; US number blocked; unapproved region blocked', () => {
  assert.equal(gateOne(contact({ phone: '+27821234567' }), campaign({ region: 'ZA' })).allow, true)
  const us = gateOne(contact({ phone: '+14155550123' }), campaign({ region: 'ZA' }))
  assert.equal(us.reason, 'region_not_approved')
  const badRegion = gateOne(contact({ phone: '+27821234567' }), campaign({ region: 'US' }))
  assert.equal(badRegion.reason, 'region_not_approved')
})

// Network allow-list (Vodacom / MTN / Cell C prefixes) ──────────────────────
test('full-block prefixes pass', () => {
  assert.equal(gateOne(contact({ phone: '+27821234567' }), campaign()).allow, true) // 082 Vodacom
  assert.equal(gateOne(contact({ phone: '+27731234567' }), campaign()).allow, true) // 073 MTN
  assert.equal(gateOne(contact({ phone: '+27841234567' }), campaign()).allow, true) // 084 Cell C
})

test('split-block sub-ranges: allowed vs blocked at 4-digit granularity', () => {
  // 0810 is MTN → allowed; 0811 is Telkom → blocked.
  assert.equal(gateOne(contact({ phone: '+27810234567' }), campaign()).allow, true)
  assert.equal(gateOne(contact({ phone: '+27811234567' }), campaign()).reason, 'network_not_allowed')
  // 0606 Vodacom allowed; 0601 not allocated to the three → blocked.
  assert.equal(gateOne(contact({ phone: '+27606234567' }), campaign()).allow, true)
  assert.equal(gateOne(contact({ phone: '+27601234567' }), campaign()).reason, 'network_not_allowed')
  // 0650 Cell C allowed; 0638 (gap in 063) → blocked.
  assert.equal(gateOne(contact({ phone: '+27650234567' }), campaign()).allow, true)
  assert.equal(gateOne(contact({ phone: '+27638234567' }), campaign()).reason, 'network_not_allowed')
  // 066 split: 0665 Vodacom allowed; 0666 Telkom blocked.
  assert.equal(gateOne(contact({ phone: '+27665234567' }), campaign()).allow, true)
  assert.equal(gateOne(contact({ phone: '+27666234567' }), campaign()).reason, 'network_not_allowed')
})

test('landline is blocked', () => {
  assert.equal(gateOne(contact({ phone: '+27111234567' }), campaign()).reason, 'network_not_allowed')
})

// Master-sheet score: dead number ────────────────────────────────────────────
test('dead number (score at floor) is blocked everywhere', () => {
  assert.equal(gateOne(contact({ score: -10 }), campaign()).reason, 'dead')
  assert.equal(gateOne(contact({ score: -11 }), campaign()).reason, 'dead')
  // Not yet dead → still allowed.
  assert.equal(gateOne(contact({ score: -9 }), campaign()).allow, true)
})

test('phoneRegion maps known country codes', () => {
  assert.equal(phoneRegion('+27821234567'), 'ZA')
  assert.equal(phoneRegion('+14155550123'), 'US')
  assert.equal(phoneRegion('+447700900123'), 'UK')
  assert.equal(phoneRegion('+33123456789'), 'OTHER')
})

// Batch ─────────────────────────────────────────────────────────────────────
test('gateContacts returns one decision per contact, order preserved', () => {
  const decisions = gateContacts({
    contacts: [contact({ id: 1 }), contact({ id: 2, consent_status: 'opted_out' }), contact({ id: 3 })],
    campaign: campaign(),
    suppressed: new Set(),
    numberState: new Map(),
    now: NOON_UTC,
  })
  assert.equal(decisions.length, 3)
  assert.deepEqual(decisions.map((d) => d.contact.id), [1, 2, 3])
  assert.deepEqual(decisions.map((d) => d.allow), [true, false, true])
})
