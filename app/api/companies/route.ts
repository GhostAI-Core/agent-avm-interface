import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'
import { DEMO_CAMPAIGNS } from '@/lib/demo-data'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { supabase, user } = await getAuthUser()
  if (!user) return unauthorized()

  const { data, error } = await supabase.from('companies').select('id, name').order('name')
  if (error || !data || data.length === 0) {
    const names = Array.from(new Set(DEMO_CAMPAIGNS.map(c => c.company).filter(Boolean))) as string[]
    return NextResponse.json({ companies: names.map((name, i) => ({ id: i + 1, name })), demo: true })
  }
  return NextResponse.json({ companies: data })
}

export async function POST(req: Request) {
  const { supabase, user } = await getAuthUser()
  if (!user) return unauthorized()

  const { name } = await req.json().catch(() => ({}))
  if (!name || !String(name).trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data, error } = await supabase.from('companies').insert({ name: String(name).trim() }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ company: data }, { status: 201 })
}
