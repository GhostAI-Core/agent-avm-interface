import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAllowedNetwork, networkProvider } from './networks'

test('networkProvider labels original ZA allocations and rejects others', () => {
  assert.equal(networkProvider('+27821234567'), 'Vodacom')
  assert.equal(networkProvider('+27731234567'), 'MTN')
  assert.equal(networkProvider('+27841234567'), 'Cell C')
  assert.equal(networkProvider('+27810234567'), 'MTN')
  assert.equal(networkProvider('+27665234567'), 'Vodacom')
  assert.equal(networkProvider('+27811234567'), null) // Telkom 0811
  assert.equal(networkProvider('+27666234567'), null) // Telkom 0666
  assert.equal(networkProvider('+14155550123'), null)
})

test('isAllowedNetwork follows the provider map while the gate is on', () => {
  assert.equal(isAllowedNetwork('+27821234567'), true)
  assert.equal(isAllowedNetwork('+27111234567'), false)
})
