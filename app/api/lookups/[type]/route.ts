import { NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsGet, callopsErrorResponse } from '@/utils/callops'

// Allowlisted lookup types — reject anything else before calling CallOps.
const ALLOWED = new Set([
  'call-outcomes',
  'agent-outcomes',
  'business-dispositions',
  'contact-statuses',
  'campaign-statuses',
  'calling-windows',
  'timezones',
])

export async function GET(_req: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params
  if (!ALLOWED.has(type)) {
    return NextResponse.json({ error: `Unknown lookup type: ${type}` }, { status: 400 })
  }
  const { token } = await getAccessToken()
  if (!token) return unauthorized()
  try {
    const data = await callopsGet(`/lookups/${type}`, token)
    return NextResponse.json(data)
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
