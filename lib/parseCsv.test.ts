import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseContacts } from './parseCsv'

test('parseContacts returns [] for empty, header-only, or missing phone column', () => {
  assert.deepEqual(parseContacts(''), [])
  assert.deepEqual(parseContacts('   '), [])
  assert.deepEqual(parseContacts('phone,first_name,last_name'), [])
  assert.deepEqual(parseContacts('name,email\nAda,ada@example.com'), [])
})

test('parseContacts reads a standard comma CSV', () => {
  const rows = parseContacts('phone,first_name,last_name\n+27821234567,Ada,Lovelace\n+27829876543,Alan,Turing')
  assert.deepEqual(rows, [
    { phone: '+27821234567', first_name: 'Ada', last_name: 'Lovelace' },
    { phone: '+27829876543', first_name: 'Alan', last_name: 'Turing' },
  ])
})

test('parseContacts strips a UTF-8 BOM and accepts ; delimiter', () => {
  const rows = parseContacts('\uFEFFphone;first_name;last_name\n0821234567;Ada;Lovelace')
  assert.deepEqual(rows, [{ phone: '0821234567', first_name: 'Ada', last_name: 'Lovelace' }])
})

test('parseContacts keeps quoted commas and escaped quotes', () => {
  const rows = parseContacts('phone,last_name\n+27820000000,"Smith, Jr"\n+27821111111,"O""Brien"')
  assert.equal(rows[0].last_name, 'Smith, Jr')
  assert.equal(rows[1].last_name, 'O"Brien')
})

test('parseContacts drops rows without a phone and keeps short rows', () => {
  const rows = parseContacts('phone,first_name,last_name\n+27820000000,Ada\n,Missing,Phone\n+27821111111,Alan,Turing')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].first_name, 'Ada')
  assert.equal(rows[0].last_name, '')
  assert.equal(rows[1].phone, '+27821111111')
})

test('parseContacts is case-insensitive on headers and accepts tab / pipe', () => {
  assert.equal(parseContacts('Phone\tFirst_Name\n0821\tAda')[0].first_name, 'Ada')
  assert.equal(parseContacts('PHONE|last_name\n0821|Lovelace')[0].last_name, 'Lovelace')
})
