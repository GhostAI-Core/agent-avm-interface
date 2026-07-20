import { createHmac, timingSafeEqual } from 'crypto'

/**
 * WhatsApp Business Platform (Meta Cloud API) client.
 *
 * Env (all server-only — never expose to the browser):
 *   WHATSAPP_PHONE_NUMBER_ID        the sender's Phone Number ID (not the phone number)
 *   WHATSAPP_ACCESS_TOKEN           system-user token; the 24h dev token also works
 *   WHATSAPP_APP_SECRET             app secret, used to verify X-Hub-Signature-256 on webhooks
 *   WHATSAPP_WEBHOOK_VERIFY_TOKEN   arbitrary string we choose; echoed back on webhook setup
 *   WHATSAPP_GRAPH_VERSION          optional, defaults to v21.0
 *
 * Leave these blank and the app behaves exactly as before: sends short-circuit and the
 * webhook returns 503 rather than throwing.
 */

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION?.trim() || 'v21.0'

export function isWhatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() && process.env.WHATSAPP_ACCESS_TOKEN?.trim())
}

/**
 * Verify Meta's X-Hub-Signature-256 header against the RAW request body.
 *
 * Must be the raw text — re-serialising the parsed JSON changes the bytes and the
 * HMAC will not match. Returns false (rather than throwing) on any malformed input.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim()
  if (!appSecret || !signatureHeader?.startsWith('sha256=')) return false

  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  const received = signatureHeader.slice('sha256='.length)

  // timingSafeEqual throws on length mismatch — check first.
  if (expected.length !== received.length) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'))
}

type SendResult = { ok: true; messageId: string } | { ok: false; reason: string; status?: number }

async function callGraph(payload: Record<string, unknown>): Promise<SendResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim()
  if (!phoneNumberId || !token) return { ok: false, reason: 'WhatsApp not configured' }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  })

  const body = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[]
    error?: { message?: string; code?: number }
  }

  if (!res.ok) {
    return { ok: false, reason: body.error?.message ?? `Graph API ${res.status}`, status: res.status }
  }
  const messageId = body.messages?.[0]?.id
  return messageId ? { ok: true, messageId } : { ok: false, reason: 'no message id in response' }
}

/**
 * Send an approved template. This is what campaign sends use: outside the 24-hour
 * customer service window — which is every message we initiate — only templates are allowed.
 *
 * `variables` fill the template's {{1}}, {{2}} … body placeholders, in order.
 */
export function sendTemplate(
  toMsisdn: string,
  templateName: string,
  variables: string[] = [],
  languageCode = 'en',
): Promise<SendResult> {
  return callGraph({
    to: normaliseMsisdn(toMsisdn),
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(variables.length
        ? { components: [{ type: 'body', parameters: variables.map((text) => ({ type: 'text', text })) }] }
        : {}),
    },
  })
}

/**
 * Send free-form text. Only valid inside the 24-hour window opened by the contact
 * messaging us first — Meta rejects it otherwise. Use for replies, not for campaign sends.
 */
export function sendText(toMsisdn: string, body: string): Promise<SendResult> {
  return callGraph({
    to: normaliseMsisdn(toMsisdn),
    type: 'text',
    text: { preview_url: false, body },
  })
}

/**
 * Graph wants digits only, full international, no plus and no leading zero.
 * Local SA input (0821234567) becomes 27821234567.
 */
export function normaliseMsisdn(input: string): string {
  const digits = input.replace(/\D/g, '')
  if (digits.startsWith('27')) return digits
  if (digits.startsWith('0')) return `27${digits.slice(1)}`
  return digits
}

/** Words that mean "stop messaging me", checked against the whole trimmed message. */
const OPT_OUT_WORDS = new Set(['stop', 'unsubscribe', 'cancel', 'end', 'quit', 'opt out', 'optout'])

export function isOptOutMessage(text: string): boolean {
  return OPT_OUT_WORDS.has(text.trim().toLowerCase().replace(/[.!]+$/, ''))
}
