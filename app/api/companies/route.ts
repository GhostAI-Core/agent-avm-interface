import { NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsItems, callopsPost, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

// Companies are sourced from CallOps (the authoritative API), not the Supabase
// `companies` table. CallOps returns only companies the user may access.
export async function GET() {
  const { token } = await getAccessToken()
  if (!token) return unauthorized()
  try {
    const companies = await callopsItems('/companies', token)
    return NextResponse.json({ companies })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}

export async function POST(req: Request) {
  const { token } = await getAccessToken()
  if (!token) return unauthorized()

  const { name, contact_name, contact_email, contact_phone } = await req.json().catch(() => ({}))
  if (!name || !String(name).trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const clean = (v: unknown) => { const s = String(v ?? '').trim(); return s ? s : undefined }
  try {
    const data = await callopsPost<{ company: unknown }>('/companies', token, {
      name: String(name).trim(),
      contact_name: clean(contact_name),
      contact_email: clean(contact_email),
      contact_phone: clean(contact_phone),
    })
    return NextResponse.json({ company: data.company ?? data }, { status: 201 })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
