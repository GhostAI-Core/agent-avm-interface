## 1. Environment Configuration

- [x] 1.1 Update `.env` with new `NEXT_PUBLIC_SUPABASE_URL` (`https://ytozpjohaphinlsqrxlc.supabase.co`) and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- [x] 1.2 Update `.env.local.example` to use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` instead of `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [x] 1.3 Add `.env` to `.gitignore` to prevent committing credentials

## 2. Database Schema

- [x] 2.1 Run `schema.sql` in the new Supabase project's SQL editor
- [x] 2.2 Verify all seven tables exist in the Supabase Table Editor
- [x] 2.3 Confirm seed row in `system_settings` (`global_config`) was created

## 3. Session Middleware

- [x] 3.1 Create root `middleware.ts` that imports and calls `updateSession` from `utils/supabase/middleware`
- [x] 3.2 Add matcher config excluding static assets (`_next/static`, images, favicon)

## 4. Client Consistency

- [x] 4.1 Migrate `app/api/campaigns/[id]/route.ts` from `lib/supabase.ts` to `createClient` from `utils/supabase/server` with `cookies()`
- [x] 4.2 Preserve `DEMO_MODE` guard behavior using env-var check (from `lib/supabase.ts` or inline)

## 5. Verification

- [x] 5.1 Restart dev server and confirm no Supabase connection errors in console
- [x] 5.2 Set `NEXT_PUBLIC_DEV_AUTH_BYPASS=false`, sign up a test user, and sign in
- [x] 5.3 Create a campaign via the UI and confirm it appears in Supabase `campaigns` table
- [x] 5.4 Confirm `GET /api/campaigns` returns real data (not `{ demo: true }`)
