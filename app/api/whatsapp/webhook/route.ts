import { NextResponse } from 'next/server'
import { verifyWebhookSignature, isOptOutMessage } from '@/lib/whatsapp/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * WhatsApp Cloud API webhook — point Meta at this URL in
 * App Dashboard → WhatsApp → Configuration → Webhook, and subscribe to the
 * `messages` field.
 *
 *   GET   Meta's one-time verification handshake (echo hub.challenge)
 *   POST  inbound messages and delivery/read statuses
 *
 * Meta retries any non-2xx for up to ~7 days and will disable the webhook if it keeps
 * failing, so this ACKs fast and unconditionally once the signature checks out. Anything
 * that goes wrong downstream is logged, never surfaced as a non-2xx.
 */

// ── GET: verification handshake ────────────────────────────────────────────
// Meta calls this once when you save the callback URL. Echo hub.challenge back as
// PLAIN TEXT (not JSON) when the token matches, otherwise 403.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim()
  if (!expected) {
    console.warn('WhatsApp webhook: WHATSAPP_WEBHOOK_VERIFY_TOKEN not set; refusing verification')
    return new Response('not configured', { status: 503 })
  }

  if (mode === 'subscribe' && token === expected && challenge) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return new Response('forbidden', { status: 403 })
}

// ── POST: events ───────────────────────────────────────────────────────────

type InboundMessage = {
  from?: string
  id?: string
  type?: string
  text?: { body?: string }
  button?: { text?: string }
}

type StatusUpdate = {
  id?: string
  status?: string
  recipient_id?: string
  errors?: { code?: number; title?: string }[]
}

type WebhookBody = {
  entry?: {
    changes?: {
      field?: string
      value?: {
        metadata?: { phone_number_id?: string }
        messages?: InboundMessage[]
        statuses?: StatusUpdate[]
      }
    }[]
  }[]
}

export async function POST(req: Request) {
  // Signature is computed over the raw bytes — read as text, never re-serialise.
  const raw = await req.text()

  if (!process.env.WHATSAPP_APP_SECRET?.trim()) {
    console.warn('WhatsApp webhook: WHATSAPP_APP_SECRET not set; rejecting unverifiable delivery')
    return NextResponse.json({ ok: false, reason: 'not configured' }, { status: 503 })
  }

  if (!verifyWebhookSignature(raw, req.headers.get('x-hub-signature-256'))) {
    console.error('WhatsApp webhook: signature verification failed')
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let body: WebhookBody
  try {
    body = JSON.parse(raw) as WebhookBody
  } catch {
    // Signed but unparseable — ACK so Meta stops retrying a payload we can never read.
    console.error('WhatsApp webhook: signed payload was not valid JSON')
    return NextResponse.json({ ok: true, parsed: false })
  }

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      if (!value) continue

      for (const message of value.messages ?? []) {
        const from = message.from ?? 'unknown'
        // Quick-reply buttons carry their label in `button.text`, not `text.body`.
        const text = message.text?.body ?? message.button?.text ?? ''

        if (text && isOptOutMessage(text)) {
          // Suppression is owned by callops/STS, not this app — see docs/sts-sdp-integration.md.
          // Logged loudly and deliberately NOT written here: wiring it to the wrong store would
          // create a second, divergent opt-out path. Route this to the STS opt_out relay once we
          // can resolve which product/campaign the number belongs to.
          console.warn(`WhatsApp OPT-OUT from ${from}: "${text}" — not yet relayed to suppression`)
        } else {
          console.info(`WhatsApp inbound from ${from} (${message.type ?? 'unknown'}): ${text.slice(0, 200)}`)
        }
      }

      for (const status of value.statuses ?? []) {
        if (status.errors?.length) {
          const first = status.errors[0]
          console.error(
            `WhatsApp delivery error for ${status.recipient_id}: ${first?.title ?? 'unknown'} (${first?.code ?? '-'})`,
          )
        } else {
          console.info(`WhatsApp status ${status.status} for ${status.recipient_id} (${status.id})`)
        }
      }
    }
  }

  return NextResponse.json({ ok: true })
}
