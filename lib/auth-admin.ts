import { NextResponse } from 'next/server'
import { resolveUserRole, userMetaFromSession } from '@/lib/roles'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'

export async function requireAdmin() {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: unauthorized() as NextResponse }

  const role = await resolveUserRole(supabase, user.id, userMetaFromSession(user))
  if (role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { supabase, user, role }
}
