import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePhone } from './phone'

test('normalizePhone returns empty for blank / non-digit input', () => {
  assert.equal(normalizePhone(''), '')
  assert.equal(normalizePhone('   '), '')
  assert.equal(normalizePhone('abc'), '')
})

test('normalizePhone unwraps quoted Excel/CSV cells', () => {
  assert.equal(normalizePhone('"+27 86 656 7784"'), '+27866567784')
  assert.equal(normalizePhone('"+27866567784"'), '+27866567784')
  assert.equal(normalizePhone("'+27866567784'"), '+27866567784')
})

test('normalizePhone converts local SA 0-prefix to +27', () => {
  assert.equal(normalizePhone('0866567784'), '+27866567784')
  assert.equal(normalizePhone('082 123 4567'), '+27821234567')
})

test('normalizePhone keeps an existing + and strips separators', () => {
  assert.equal(normalizePhone('+27 86 656 7784'), '+27866567784')
  assert.equal(normalizePhone('+1-415-555-0123'), '+14155550123')
})

test('normalizePhone prefixes digits that already include the country code', () => {
  assert.equal(normalizePhone('27866567784'), '+27866567784')
})
