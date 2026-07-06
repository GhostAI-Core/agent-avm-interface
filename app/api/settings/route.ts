import { NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsGet, callopsPatch, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

// Global platform settings — currently just the carrier cost-per-minute rate (ZAR) used by
// CallOps to price every call (app/services/cost_estimator.py). Proxied straight through;
// CallOps enforces read-for-anyone / write-for-admins.
export async function GET() {
  const { token } = await getAccessToken()
  if (!token) return unauthorized()
  try {
    const data = await callopsGet('/system-settings', token)
    return NextResponse.json(data)
  } catch (e) {
    return callopsErrorResponse(e)
  }
}

export async function PATCH(req: Request) {
  const { token } = await getAccessToken()
  if (!token) return unauthorized()

  const body = await req.json().catch(() => ({}))
  const rate = Number(body.cost_per_minute_zar)
  if (!Number.isFinite(rate) || rate <= 0) {
    return NextResponse.json({ error: 'cost_per_minute_zar must be a positive number' }, { status: 400 })
  }

  try {
    const data = await callopsPatch('/system-settings', token, { cost_per_minute_zar: rate })
    return NextResponse.json(data)
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
