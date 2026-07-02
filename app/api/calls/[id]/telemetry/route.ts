import { NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsGet, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

// Model-usage telemetry events for a call (llm_metrics, tts_metrics, …).
// CallOps returns { call_id, telemetry: [...] } (NOT {items}). An empty list means no
// model-usage section, not an error (e.g. a script-only call). We pass the {telemetry: []}
// shape straight through — CallDetailDialog reads `.telemetry`.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { token } = await getAccessToken()
  if (!token) return unauthorized()
  try {
    const res = await callopsGet<{ telemetry?: unknown[] }>(`/calls/${id}/telemetry`, token)
    return NextResponse.json({ telemetry: res?.telemetry ?? [] })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
