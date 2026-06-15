import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveContactAddr, CONTACT_ADDR_MAX_LEN } from '../../../lib/routr/resolve-contact-addr'
import { buildTrunkPayload } from '../../../lib/routr/sync-carrier'

describe('resolveContactAddr', () => {
  it('returns short values unchanged', async () => {
    const result = await resolveContactAddr('10.0.0.1:5060')
    assert.equal(result, '10.0.0.1:5060')
  })

  it('returns undefined for empty input', async () => {
    assert.equal(await resolveContactAddr(''), undefined)
    assert.equal(await resolveContactAddr(null), undefined)
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
    assert.equal(payload.uris[0].transport, 'UDP')
    assert.equal(payload.uris[0].host, 'evra-routr.pstn.twilio.com')
    assert.equal(payload.outboundCredentialsRef, 'cred-1')
    assert.equal((payload.extended as { evraProviderId: number }).evraProviderId, 1)
  })
})
