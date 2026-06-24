import { NextResponse } from 'next/server'
import { relayToSts, guidForProduct, type StsAction } from '@/lib/sts/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Relay a keypress decision to STS (outbound only — STS is the system of record).
 *
 * The AI agent worker (or callops) calls this when a call captures a DTMF press:
 *   press 1 → action "subscribe"   → STS POST /avm/{productGUID}/{msisdn} (+ result body)
 *   press 9 → action "opt_out"      → STS POST /cancel/{productGUID}/{msisdn}
 * The GUID is resolved per PRODUCT (bible/psychic/…) from STS_GUID_<PRODUCT> env. We store no consent
 * locally — STS handles whether to contact the number.
 *
 * POST /api/sts/mark  { product, msisdn, action: "subscribe" | "opt_out", durationSeconds? }
 * Guard: if STS_RELAY_SECRET is set, callers must send it as the x-relay-secret header.
 */
export async function POST(req: Request) {
  const secret = process.env.STS_RELAY_SECRET?.trim()
  if (secret && req.headers.get('x-relay-secret') !== secret) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid JSON body' }, { status: 400 })
  }

  const product = String(body.product ?? body.agent ?? '').trim()
  const msisdn = String(body.number ?? body.msisdn ?? '').trim()
  const rawAction = String(body.action ?? '').trim()
  const durationSeconds = Number(body.durationSeconds ?? body.CallDuration ?? 0) || 0
  const action: StsAction | null =
    rawAction === 'subscribe' || rawAction === '1'
      ? 'subscribe'
      : rawAction === 'opt_out' || rawAction === 'optout' || rawAction === '9'
        ? 'opt_out'
        : null

  if (!product) return NextResponse.json({ ok: false, reason: 'missing product' }, { status: 400 })
  if (!msisdn) return NextResponse.json({ ok: false, reason: 'missing number' }, { status: 400 })
  if (!action) return NextResponse.json({ ok: false, reason: `unknown action: ${rawAction}` }, { status: 400 })

  if (!guidForProduct(product)) {
    return NextResponse.json(
      { ok: false, reason: `no STS GUID for product "${product}" (set STS_GUID_${product.toUpperCase()})` },
      { status: 503 },
    )
  }

  try {
    const result = await relayToSts(product, msisdn, action, { durationSeconds })
    return NextResponse.json(result, { status: result.ok ? 200 : 502 })
  } catch (err) {
    console.error('STS relay failed:', err)
    return NextResponse.json({ ok: false, reason: 'STS relay failed' }, { status: 502 })
  }
}
