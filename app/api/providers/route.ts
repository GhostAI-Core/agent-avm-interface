import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'
import { maskProviderForClient, normalizeProvider } from '@/lib/voip-provider'
import { slugifyName, validateCarrierInput } from '@/lib/validate-carrier'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase, user } = await getAuthUser()
    if (!user) return unauthorized()

    const { data, error } = await supabase
      .from('voip_providers')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[api/providers] GET error:', error.message)
      return NextResponse.json({ providers: [], error: error.message }, { status: 200 })
    }

    const providers = (data ?? []).map((row) => maskProviderForClient(normalizeProvider(row)))
    return NextResponse.json({ providers })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/providers] GET exception:', message)
    return NextResponse.json({ providers: [], error: message }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  const { requireAdmin } = await import('@/lib/auth-admin')
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await req.json()
  const validated = validateCarrierInput(body)
  if (validated.error || !validated.data) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const { data: fields } = validated
  const { data: row, error } = await auth.supabase
    .from('voip_providers')
    .insert({
      name: fields.name,
      slug: fields.slug || slugifyName(fields.name),
      provider_type: fields.provider_type,
      sip_host: fields.sip_host,
      sip_port: fields.sip_port,
      sip_username: fields.sip_username,
      sip_password: fields.sip_password,
      send_register: fields.send_register,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(
    { provider: maskProviderForClient(normalizeProvider(row)) },
    { status: 201 },
  )
}
