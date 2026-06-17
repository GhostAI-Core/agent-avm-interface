import { NextRequest, NextResponse } from 'next/server'
import { maskProviderForClient, normalizeProvider } from '@/lib/voip-provider'
import { validateCarrierInput } from '@/lib/validate-carrier'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { requireAdmin } = await import('@/lib/auth-admin')
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { id } = await params
  const providerId = Number(id)
  if (!Number.isFinite(providerId)) {
    return NextResponse.json({ error: 'Invalid provider id' }, { status: 400 })
  }

  const { data: existing, error: fetchErr } = await auth.supabase
    .from('voip_providers')
    .select('*')
    .eq('id', providerId)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Provider not found' }, { status: 404 })

  const body = await req.json()
  if (body.keep_password && !body.sip_password) {
    body.sip_password = existing.sip_password
  }

  const validated = validateCarrierInput(body)
  if (validated.error || !validated.data) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const fields = validated.data
  const { data: row, error } = await auth.supabase
    .from('voip_providers')
    .update({
      name: fields.name,
      slug: fields.slug,
      provider_type: fields.provider_type,
      sip_host: fields.sip_host,
      sip_port: fields.sip_port,
      sip_username: fields.sip_username,
      sip_password: fields.sip_password,
      send_register: fields.send_register,
    })
    .eq('id', providerId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ provider: maskProviderForClient(normalizeProvider(row)) })
}
