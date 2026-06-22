import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * DEPRECATED (issue #34). The LiveKit agent now posts call outcomes directly to
 * evra-callops at `POST $CALLOPS_URL/calls/outcome`, which writes the call_records row.
 * This endpoint is kept for one transition sprint so any not-yet-updated agent stops
 * cleanly instead of erroring. It performs no writes. Delete after the cutover is confirmed.
 */
export async function POST() {
  console.warn('[deprecated] /api/calls/result was called — agents should POST to evra-callops /calls/outcome. This endpoint is a no-op.')
  return NextResponse.json({ ok: true, deprecated: true })
}
