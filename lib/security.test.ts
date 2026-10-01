import { test } from 'node:test'
import assert from 'node:assert/strict'
import { maskPhone } from './security'

test('maskPhone hides the middle four digits', () => {
  assert.equal(maskPhone(''), '')
  assert.equal(maskPhone('+27821234567'), '+278****4567')
  assert.equal(maskPhone('0821234567'), '082****567')
})
