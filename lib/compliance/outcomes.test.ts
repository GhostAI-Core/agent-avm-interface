import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isReachedOutcome, isRetryableOutcome } from './outcomes'

const REACHED = [
  'answered', 'subscribed', 'unsubscribed', 'opted_out',
  'connected', 'qualified', 'no_speech', 'hangup', 'ni', 'dnq', 'callback',
]
const RETRYABLE = ['voicemail', 'no_answer', 'busy', 'failed', 'dropped_no_response']

test('reached and retryable sets are disjoint and exhaustive for known outcomes', () => {
  for (const o of REACHED) {
    assert.equal(isReachedOutcome(o), true, o)
    assert.equal(isRetryableOutcome(o), false, o)
  }
  for (const o of RETRYABLE) {
    assert.equal(isRetryableOutcome(o), true, o)
    assert.equal(isReachedOutcome(o), false, o)
  }
})

test('unknown outcomes are neither reached nor retryable', () => {
  assert.equal(isReachedOutcome('banana'), false)
  assert.equal(isRetryableOutcome('banana'), false)
})
