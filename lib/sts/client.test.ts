import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toE164 } from './phone'

test('toE164 normalizes STS msisdn formats to +E.164', () => {
  assert.equal(toE164('27820010201'), '+27820010201') // STS bare form
  assert.equal(toE164('+27820010201'), '+27820010201') // already E.164
  assert.equal(toE164('0027820010201'), '+27820010201') // intl 00 prefix
  assert.equal(toE164('27 82 001 0201'), '+27820010201') // spaced
  assert.equal(toE164('+27-82-001-0201'), '+27820010201') // dashed
})

test('toE164 strips stray non-digits but keeps a single leading +', () => {
  assert.equal(toE164(' 27820010201 '), '+27820010201')
  assert.equal(toE164('27820010201'), '+27820010201')
})
