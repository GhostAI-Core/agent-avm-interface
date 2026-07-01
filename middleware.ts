import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Refreshes the Supabase session on every request so the access-token cookie is rotated before
// it expires. Without this, server routes (getAuthUser/getAccessToken) 401 once the ~1h access
// token lapses — which is exactly what was happening on reload after a long session.
// Standard @supabase/ssr middleware pattern.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  // Touch the session — rotates the token cookie when it's expired. Never throws the request.
  try {
    await supabase.auth.getUser()
  } catch {
    /* auth server unreachable — let the request through; the route's own auth guard handles it */
  }

  return response
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|mp3|woff2?)$).*)'],
}
