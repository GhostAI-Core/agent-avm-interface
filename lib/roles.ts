import type { SupabaseClient } from '@supabase/supabase-js'

export type AppRole = 'admin' | 'engineer'

type UserMeta = {
  role?: string
  full_name?: string
  email?: string
}

export async function resolveUserRole(
  supabase: SupabaseClient,
  userId: string,
  metadata?: UserMeta,
): Promise<AppRole> {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  if (data?.role === 'admin' || data?.role === 'engineer') return data.role

  const role: AppRole = metadata?.role === 'admin' ? 'admin' : 'engineer'

  await supabase.from('profiles').upsert({
    id: userId,
    role,
    full_name: metadata?.full_name ?? metadata?.email ?? null,
    updated_at: new Date().toISOString(),
  })

  return role
}

export function userMetaFromSession(user: {
  id: string
  email?: string
  user_metadata?: Record<string, unknown>
}): UserMeta {
  return {
    role: typeof user.user_metadata?.role === 'string' ? user.user_metadata.role : undefined,
    full_name: typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : undefined,
    email: user.email,
  }
}
