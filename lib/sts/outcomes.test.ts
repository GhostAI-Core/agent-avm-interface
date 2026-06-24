import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mapStsResult,
  stsConsentEffect,
  isStsResult,
  normalizeStsResult,
  STS_RESULTS,
} from './outcomes'
import { isReachedOutcome, isRetryableOutcome } from '../compliance/outcomes'

test('every STS result maps to a defined mapping', () => {
  for (const r of STS_RESULTS) {
    const m = mapStsResult(r)
    assert.equal(m.result, r)
  }
})

test('DIALED is transient — not terminal, not reached, no consent effect', () => {
  const m = mapStsResult('DIALED')
  assert.equal(m.terminal, false)
  assert.equal(m.outcome, null)
  assert.equal(m.reached, false)
  assert.equal(m.consent, 'none')
})

test('ANSWERED and HANGUP are reached dispositions with no consent effect', () => {
  for (const r of ['ANSWERED', 'HANGUP']) {
    const m = mapStsResult(r)
    assert.equal(m.terminal, true)
    assert.equal(m.reached, true)
    assert.equal(m.consent, 'none')
  }
})

test('VOICEMAIL is terminal but not reached (retryable)', () => {
  const m = mapStsResult('VOICEMAIL')
  assert.equal(m.terminal, true)
  assert.equal(m.reached, false)
  assert.equal(m.outcome, 'voicemail')
})

test('SUBSCRIBE is a reached conversion → product opt-in', () => {
  const m = mapStsResult('SUBSCRIBE')
  assert.equal(m.outcome, 'subscribed')
  assert.equal(m.reached, true)
  assert.equal(m.consent, 'product_opt_in')
})

test('DECLINE is answered-not-interested with NO consent change', () => {
  const m = mapStsResult('DECLINE')
  assert.equal(m.outcome, 'ni')
  assert.equal(m.reached, true)
  assert.equal(m.consent, 'none')
})

test('UNSUBSCRIBE churns the product only', () => {
  const m = mapStsResult('UNSUBSCRIBE')
  assert.equal(m.outcome, 'unsubscribed')
  assert.equal(m.consent, 'product_opt_out')
})

test('OPT OUT is a global DNC (suppression) — spaced and unspaced forms both parse', () => {
  for (const raw of ['OPT OUT', 'opt out', 'OptOut', ' optout ']) {
    const m = mapStsResult(raw)
    assert.equal(m.outcome, 'opted_out')
    assert.equal(m.consent, 'global_opt_out')
    assert.equal(m.reached, true)
  }
})

test('the three consent events are the only non-none effects', () => {
  const effects = STS_RESULTS.map((r) => [r, stsConsentEffect(r)] as const)
  const nonNone = effects.filter(([, e]) => e !== 'none').map(([r]) => r)
  assert.deepEqual(nonNone.sort(), ['OPT OUT', 'SUBSCRIBE', 'UNSUBSCRIBE'])
})

test('terminal STS outcomes agree with the compliance rollover classifier', () => {
  // Every terminal STS outcome must be classified by the rollover as exactly one of reached/retryable,
  // and the reached flag must agree. This is the contract that keeps dial_number_state correct.
  for (const r of STS_RESULTS) {
    const m = mapStsResult(r)
    if (!m.terminal || m.outcome === null) continue
    const reached = isReachedOutcome(m.outcome)
    const retryable = isRetryableOutcome(m.outcome)
    assert.equal(reached, m.reached, `${r} reached mismatch (outcome=${m.outcome})`)
    assert.equal(reached, !retryable, `${r} must be reached XOR retryable (outcome=${m.outcome})`)
  }
})

test('isStsResult / normalizeStsResult guard unknown values', () => {
  assert.equal(isStsResult('ANSWERED'), true)
  assert.equal(isStsResult('opt out'), true)
  assert.equal(isStsResult('BANANA'), false)
  assert.equal(normalizeStsResult('  opt   out '), 'OPT OUT')
  assert.throws(() => mapStsResult('BANANA'), /Unrecognized STS AVM result/)
})
