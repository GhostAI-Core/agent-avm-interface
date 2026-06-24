## Why

The application currently points at a stale Supabase project and has gaps in session middleware wiring, causing silent fallback to demo data when database queries fail. A new Supabase project is ready and must be connected so campaigns, auth, call logs, and security features operate against real persisted data.

## What Changes

- Update `.env` with the new Supabase project URL and publishable key (user preference over `.env.local`)
- Apply `schema.sql` to the new Supabase project (tables, triggers, RLS policies, seed data)
- Add root `middleware.ts` that calls `updateSession()` from `utils/supabase/middleware.ts` to refresh auth cookies
- Align `.env.local.example` env var names with the codebase (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
- Consolidate the legacy `lib/supabase.ts` singleton usage in API routes to the cookie-aware `utils/supabase/server` client
- Document verification steps so demo-data fallback is not mistaken for a successful DB connection

## Capabilities

### New Capabilities

- `supabase-database`: Environment configuration, schema deployment, session middleware, and consistent Supabase client usage across the app

### Modified Capabilities

<!-- None — no existing main specs to modify -->

## Impact

- **Config**: `.env`, `.env.local.example`
- **Middleware**: new root `middleware.ts`
- **API routes**: `app/api/campaigns/[id]/route.ts` (migrate off `lib/supabase.ts`)
- **Library**: `lib/supabase.ts` (retain `DEMO_MODE` export or relocate; remove duplicate client where possible)
- **Database**: new Supabase project `ytozpjohaphinlsqrxlc` — schema must be run in SQL editor
- **Auth/RLS**: authenticated users required for most tables; dev auth bypass behavior unchanged unless explicitly toggled
- **Dependencies**: no new packages (`@supabase/supabase-js`, `@supabase/ssr` already installed)
