import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'crypto'
import {
  isOptOutMessage,
  isWhatsappConfigured,
  normaliseMsisdn,
  verifyWebhookSignature,
} from './client'

test('normaliseMsisdn emits Graph digits-only international form', () => {
  assert.equal(normaliseMsisdn('+27821234567'), '27821234567')
  assert.equal(normaliseMsisdn('0821234567'), '27821234567')
  assert.equal(normaliseMsisdn('27 82 123 4567'), '27821234567')
  assert.equal(normaliseMsisdn('14155550123'), '14155550123')
})

test('isOptOutMessage matches the stop-words set, ignoring trailing punctuation', () => {
  for (const w of ['STOP', 'unsubscribe', 'Cancel!', 'opt out', 'optout.']) {
    assert.equal(isOptOutMessage(w), true, w)
  }
  assert.equal(isOptOutMessage('please stop calling'), false)
  assert.equal(isOptOutMessage('hello'), false)
})

test('verifyWebhookSignature requires a matching sha256 HMAC of the raw body', () => {
  const prev = process.env.WHATSAPP_APP_SECRET
  process.env.WHATSAPP_APP_SECRET = 'test-secret'
  const raw = '{"object":"whatsapp_business_account"}'
  const digest = createHmac('sha256', 'test-secret').update(raw, 'utf8').digest('hex')
  assert.equal(verifyWebhookSignature(raw, `sha256=${digest}`), true)
  assert.equal(verifyWebhookSignature(raw, `sha256=${digest.slice(0, -1)}0`), false)
  assert.equal(verifyWebhookSignature(raw, digest), false)
  assert.equal(verifyWebhookSignature(raw, null), false)
  delete process.env.WHATSAPP_APP_SECRET
  assert.equal(verifyWebhookSignature(raw, `sha256=${digest}`), false)
  if (prev === undefined) delete process.env.WHATSAPP_APP_SECRET
  else process.env.WHATSAPP_APP_SECRET = prev
})

test('isWhatsappConfigured requires both phone number id and token', () => {
  const prevId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const prevTok = process.env.WHATSAPP_ACCESS_TOKEN
  delete process.env.WHATSAPP_PHONE_NUMBER_ID
  delete process.env.WHATSAPP_ACCESS_TOKEN
  assert.equal(isWhatsappConfigured(), false)
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123'
  assert.equal(isWhatsappConfigured(), false)
  process.env.WHATSAPP_ACCESS_TOKEN = 'tok'
  assert.equal(isWhatsappConfigured(), true)
  if (prevId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID
  else process.env.WHATSAPP_PHONE_NUMBER_ID = prevId
  if (prevTok === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN
  else process.env.WHATSAPP_ACCESS_TOKEN = prevTok
})
