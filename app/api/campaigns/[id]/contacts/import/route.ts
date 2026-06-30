import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsPost, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

type ImportContact = { phone: string; first_name?: string; last_name?: string; external_id?: string }

// Bulk contact import for a campaign. CallOps owns dedupe, E.164 normalisation, and
// rejection reporting; we forward the parsed rows and pass its summary straight back.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { token } = await getAccessToken()
  if (!token) return unauthorized()

  const body = await req.json().catch(() => null) as { contacts?: ImportContact[]; dedupe?: boolean; source?: string } | null
  const contacts = Array.isArray(body?.contacts) ? body!.contacts : []
  if (!contacts.length) return NextResponse.json({ error: 'no contacts to import' }, { status: 400 })

  try {
    const res = await callopsPost(`/campaigns/${id}/contacts/import`, token, {
      source: body?.source ?? 'dashboard-csv',
      dedupe: body?.dedupe ?? true,
      contacts,
    })
    return NextResponse.json(res ?? {})
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
