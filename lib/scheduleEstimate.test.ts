import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DTMF_RESPONSE_SECONDS, estimateRunSeconds, formatDuration } from './scheduleEstimate'

test('formatDuration never goes negative and picks h/m/s buckets', () => {
  assert.equal(formatDuration(-3), '0s')
  assert.equal(formatDuration(9), '9s')
  assert.equal(formatDuration(75), '1m 15s')
  assert.equal(formatDuration(3661), '1h 1m')
})

test('estimateRunSeconds is bound by the slower of rate vs concurrency', () => {
  const rateBound = estimateRunSeconds({
    contactCount: 60,
    scriptSeconds: 2,
    dialingSpeed: 30,
    maxConcurrent: 100,
  })
  assert.equal(rateBound.perCallSeconds, 2 + DTMF_RESPONSE_SECONDS)
  assert.equal(rateBound.rateLimitedSeconds, 120)
  assert.ok(rateBound.estimateSeconds === rateBound.rateLimitedSeconds)

  const concurrencyBound = estimateRunSeconds({
    contactCount: 10,
    scriptSeconds: 52,
    dialingSpeed: 600,
    maxConcurrent: 2,
  })
  assert.equal(concurrencyBound.perCallSeconds, 60)
  assert.equal(concurrencyBound.concurrencyLimitedSeconds, 300)
  assert.equal(concurrencyBound.estimateSeconds, 300)
})

test('estimateRunSeconds treats missing script length as DTMF-only and floors zeros', () => {
  const r = estimateRunSeconds({
    contactCount: 10,
    scriptSeconds: null,
    dialingSpeed: 0,
    maxConcurrent: 0,
  })
  assert.equal(r.perCallSeconds, DTMF_RESPONSE_SECONDS)
  assert.equal(r.rateLimitedSeconds, 10 * 60)
  assert.equal(r.concurrencyLimitedSeconds, 10 * DTMF_RESPONSE_SECONDS)
})
