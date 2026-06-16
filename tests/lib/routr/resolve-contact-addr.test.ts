import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveContactAddr,
  enforceContactAddrLimit,
  CONTACT_ADDR_MAX_LEN,
} from '../../../lib/routr/resolve-contact-addr'
import { buildTrunkPayload } from '../../../lib/routr/sync-carrier'

describe('enforceContactAddrLimit', () => {
  it('accepts short IP:port', () => {
    assert.equal(enforceContactAddrLimit('10.0.0.1:5060'), '10.0.0.1:5060')
  })

  it('rejects 255.255.255.255:65535 (21 chars)', () => {
    const long = '255.255.255.255:65535'
    assert.ok(long.length > CONTACT_ADDR_MAX_LEN)
    assert.equal(enforceContactAddrLimit(long), undefined)
  })
})

describe('resolveContactAddr', () => {
  it('returns short values unchanged', async () => {
    const result = await resolveContactAddr('10.0.0.1:5060')
    assert.equal(result, '10.0.0.1:5060')
  })

  it('returns undefined for empty input', async () => {
    assert.equal(await resolveContactAddr(''), undefined)
    assert.equal(await resolveContactAddr(null), undefined)
  })

  it('strips sip: prefix before processing', async () => {
    const result = await resolveContactAddr('sip:10.0.0.1:5060')
    assert.equal(result, '10.0.0.1:5060')
  })

  it('omits contactAddr when IP:port exceeds Routr limit', async () => {
    const long = '255.255.255.255:65535'
    assert.ok(long.length > CONTACT_ADDR_MAX_LEN)
    assert.equal(await resolveContactAddr(long), undefined)
  })
})

describe('buildTrunkPayload', () => {
  it('uses UDP transport and slug-based inboundUri', () => {
    const payload = buildTrunkPayload(
      {
        id: 1,
        name: 'Twilio',
        slug: 'twilio',
        provider_type: 'twilio',
        sip_host: 'evra-routr.pstn.twilio.com',
        sip_port: 5060,
        sip_username: 'evra',
        sip_password: 'secret',
        send_register: false,
      },
      'cred-1',
    )

    assert.equal(payload.inboundUri, 'twilio.evra.local')
    assert.ok(payload.uris)
    assert.equal(payload.uris[0].transport, 'UDP')
    assert.equal(payload.uris[0].host, 'evra-routr.pstn.twilio.com')
    assert.equal(payload.outboundCredentialsRef, 'cred-1')
    assert.equal((payload.extended as { evraProviderId: number }).evraProviderId, 1)
  })

  it('sanitizes underscores in slug for Routr FQDN inboundUri', () => {
    const payload = buildTrunkPayload(
      {
        id: 0,
        name: 'utility_connect',
        slug: 'utility_connect',
        provider_type: 'utility_connect',
        sip_host: 'sbc.convergedgroup.co.za',
        sip_port: 5060,
        sip_username: 'uc-jono',
        sip_password: 'secret',
        send_register: false,
      },
      'cred-uc',
    )
    assert.equal(payload.inboundUri, 'utility-connect.evra.local')
  })
})
