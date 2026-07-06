import { NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsItems, callopsPost, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

// Products are company-scoped in CallOps (`/companies/{id}/products`). A `company_id` query
// param is required for GET — the Products view is always scoped to one company at a time,
// same as ContactsView's network filter.
export async function GET(req: Request) {
  const { token } = await getAccessToken()
  if (!token) return unauthorized()

  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id')
  if (!companyId) return NextResponse.json({ error: 'company_id required' }, { status: 400 })

  try {
    const items = await callopsItems(`/companies/${companyId}/products`, token)
    return NextResponse.json({ products: items })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}

export async function POST(req: Request) {
  const { token } = await getAccessToken()
  if (!token) return unauthorized()

  const body = await req.json().catch(() => ({}))
  const { company_id, name, integration_type, sts_product_key, active } = body
  if (!company_id) return NextResponse.json({ error: 'company_id required' }, { status: 400 })
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const payload = {
    name: String(name).trim(),
    integration_type: integration_type ? String(integration_type) : undefined,
    sts_product_key: sts_product_key ? String(sts_product_key) : undefined,
    active: typeof active === 'boolean' ? active : undefined,
  }

  try {
    const data = await callopsPost(`/companies/${company_id}/products`, token, payload)
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
