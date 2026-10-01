import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CALL_BEHAVIOR, resolveCallBehavior } from './call-behavior'

test('resolveCallBehavior falls back to defaults for null / unset campaigns', () => {
  assert.deepEqual(resolveCallBehavior(null), DEFAULT_CALL_BEHAVIOR)
  assert.deepEqual(resolveCallBehavior(undefined), DEFAULT_CALL_BEHAVIOR)
  assert.deepEqual(resolveCallBehavior({}), DEFAULT_CALL_BEHAVIOR)
})

test('resolveCallBehavior prefers campaign columns when set', () => {
  assert.deepEqual(resolveCallBehavior({
    answer_delay_sec: 5,
    amd_enabled: false,
    voicemail_action: 'leave_message',
    silence_timeout_sec: 9,
  }), {
    answerDelaySec: 5,
    amdEnabled: false,
    voicemailAction: 'leave_message',
    silenceTimeoutSec: 9,
  })
})

test('resolveCallBehavior treats null columns as unset', () => {
  assert.deepEqual(resolveCallBehavior({
    answer_delay_sec: null,
    amd_enabled: null,
    voicemail_action: null,
    silence_timeout_sec: null,
  }), DEFAULT_CALL_BEHAVIOR)
})
