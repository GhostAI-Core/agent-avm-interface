import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'

export async function getAuthUser(): Promise<{ supabase: ReturnType<typeof createClient>; user: User | null }> {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { supabase, user: null }
  return { supabase, user }
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// Resolve the user's Supabase access token server-side, to forward to CallOps as
// `Authorization: Bearer`. CallOps validates the JWT itself (ES256 via JWKS), so the
// session token is exactly what it expects; getSession() is what exposes access_token.
export async function getAccessToken(): Promise<{
  supabase: ReturnType<typeof createClient>
  token: string | null
}> {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: { session } } = await supabase.auth.getSession()
  return { supabase, token: session?.access_token ?? null }
}
