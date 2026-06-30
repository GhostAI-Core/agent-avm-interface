import { NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsPost, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

// Per-contact row actions, proxied to CallOps. The dashboard never mutates the
// Supabase `contacts` table directly — CallOps owns status transitions (and the
// DNC compliance flag). Allowlist the actions so we never forward an arbitrary path.
const ACTIONS = new Set(['archive', 'retry', 'do-not-call'])

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params
  if (!ACTIONS.has(action)) return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 })

  const { token } = await getAccessToken()
  if (!token) return unauthorized()

  try {
    const res = await callopsPost(`/contacts/${id}/${action}`, token)
    return NextResponse.json(res ?? { ok: true })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
