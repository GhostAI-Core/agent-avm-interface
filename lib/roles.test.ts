import { test } from 'node:test'
import assert from 'node:assert/strict'
import { userMetaFromSession } from './roles'

test('userMetaFromSession copies typed metadata and email', () => {
  assert.deepEqual(userMetaFromSession({
    id: 'u1',
    email: 'ops@evra.ai',
    user_metadata: { role: 'admin', full_name: 'Ops' },
  }), { role: 'admin', full_name: 'Ops', email: 'ops@evra.ai' })
})

test('userMetaFromSession ignores non-string metadata fields', () => {
  assert.deepEqual(userMetaFromSession({
    id: 'u2',
    user_metadata: { role: 1, full_name: { first: 'Ada' } },
  }), { role: undefined, full_name: undefined, email: undefined })
})
