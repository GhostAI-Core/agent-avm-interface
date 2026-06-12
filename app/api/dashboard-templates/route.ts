import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { supabase, user } = await getAuthUser()
  if (!user) return unauthorized()

  const { data, error } = await supabase
    .from('dashboard_templates')
    .select('id, name, layout, created_at')
    .order('created_at', { ascending: false })

  // Degrade gracefully until the migration is applied (missing table → empty list)
  if (error || !data) return NextResponse.json({ templates: [] })
  return NextResponse.json({ templates: data })
}

export async function POST(req: Request) {
  const { supabase, user } = await getAuthUser()
  if (!user) return unauthorized()

  const { name, layout } = await req.json().catch(() => ({}))
  if (!name || !String(name).trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!layout || typeof layout !== 'object') return NextResponse.json({ error: 'layout required' }, { status: 400 })

  const { data, error } = await supabase
    .from('dashboard_templates')
    .insert({ name: String(name).trim().slice(0, 80), layout, created_by: user.id })
    .select('id, name, layout, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data }, { status: 201 })
}

export async function DELETE(req: Request) {
  const { supabase, user } = await getAuthUser()
  if (!user) return unauthorized()

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('dashboard_templates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
