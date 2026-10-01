import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRoomName } from './outbound-call'

test('parseRoomName extracts campaign and contact ids from avm rooms', () => {
  assert.deepEqual(parseRoomName('avm_12_34_ab9f'), { campaignId: 12, contactId: 34 })
  assert.deepEqual(parseRoomName('avm_1_2_x'), { campaignId: 1, contactId: 2 })
})

test('parseRoomName rejects non-avm or truncated names', () => {
  assert.equal(parseRoomName('room-12-34'), null)
  assert.equal(parseRoomName('avm_12_34'), null)
  assert.equal(parseRoomName('avm_x_1_zz'), null)
})
