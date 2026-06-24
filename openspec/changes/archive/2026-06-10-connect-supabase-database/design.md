## Context

Agent AVM already has Supabase packages installed and client helpers at `utils/supabase/{client,server,middleware}.ts`. API routes mostly use the cookie-aware server client, but `app/api/campaigns/[id]/route.ts` and `lib/simulator.ts` still use a legacy singleton in `lib/supabase.ts`. The `.env` file points at an old project (`flaonbqsnnzntgiuowmu`); the new project is `ytozpjohaphinlsqrxlc`. `utils/supabase/middleware.ts` exports `updateSession()` but no root `middleware.ts` invokes it. `schema.sql` defines the full data model with RLS requiring authenticated users.

The user explicitly wants credentials stored in `.env` (not `.env.local`).

## Goals / Non-Goals

**Goals:**

- Point the app at the new Supabase project via `.env`
- Ensure auth sessions refresh on every request via Next.js middleware
- Deploy `schema.sql` to the new Supabase project
- Use the cookie-aware server client consistently in API routes that mutate/read protected tables
- Update `.env.local.example` to match actual env var names

**Non-Goals:**

- Migrating data from the old Supabase project
- Changing RLS policy semantics or adding new tables
- Enabling passkeys in the Supabase dashboard (manual dashboard step; document only)
- Removing `NEXT_PUBLIC_DEV_AUTH_BYPASS` (leave as-is in `.env`)
- Adding a `profiles` auto-provisioning trigger on signup (future work)
- Reinstalling `@supabase/supabase-js` / `@supabase/ssr` (already present)

## Decisions

### 1. Use `.env` for Supabase credentials

**Choice:** Update the existing `.env` file with the new URL and publishable key.

**Rationale:** User preference. Next.js loads `.env` in all environments; `.env.local` would override it but is not desired here.

**Alternative considered:** `.env.local` — rejected per user request. Standard practice for secrets in local dev, but `.env` is already gitignored for publishable keys in this project setup.

### 2. Root `middleware.ts` calling `updateSession()`

**Choice:** Create `middleware.ts` at project root:

```ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

**Rationale:** Matches Supabase SSR docs. `updateSession` already calls `supabase.auth.getUser()` to refresh expired tokens and includes passkey experimental config.

**Alternative considered:** Next.js 16 `proxy.ts` mentioned in README — not present in codebase; standard `middleware.ts` is the correct pattern for this Next.js version.

### 3. Migrate `campaigns/[id]` route to server client

**Choice:** Replace `lib/supabase.ts` import with `createClient` from `utils/supabase/server` + `cookies()`, matching other API routes.

**Rationale:** Server API routes must forward the user's session cookie for RLS. The singleton browser client does not carry session context on the server.

**Keep `lib/supabase.ts` for:** `lib/simulator.ts` (background simulation) and `DEMO_MODE` flag — simulator may need a service-role client later; out of scope for now.

### 4. Schema applied manually in Supabase SQL editor

**Choice:** Run `schema.sql` via Supabase dashboard SQL editor (or CLI migration). Document as a manual verification task, not automated in app code.

**Rationale:** Schema is idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`). No migration tooling exists in the repo yet.

### 5. Demo fallback behavior unchanged

**Choice:** Leave `DEMO_CAMPAIGNS` fallback in `GET /api/campaigns` on Supabase error.

**Rationale:** Pre-existing behavior; changing it is out of scope. Verification task will confirm real data loads to distinguish demo vs live.

## Risks / Trade-offs

- **[RLS blocks unauthenticated requests]** → User must sign up/login via Supabase Auth; dev bypass skips UI login but does not create a Supabase session. Mitigation: document that real DB access requires auth; optionally set `NEXT_PUBLIC_DEV_AUTH_BYPASS=false` when testing DB.
- **[`.env` committed accidentally]** → Publishable key is public by design, but project URL exposure is a concern. Mitigation: confirm `.env` is in `.gitignore` (it is not currently — verify during implementation).
- **[Silent demo fallback masks failures]** → Mitigation: verification checklist in tasks; check server logs for `Supabase error:`.
- **[No profiles trigger on signup]** → Passkey/profile features may fail until user row exists. Mitigation: AuthView already upserts profile on passkey creation; password signup may need manual profile row — note in verification.
- **[voip_providers has no RLS]** → Pre-existing schema gap; out of scope.

## Migration Plan

1. Update `.env` with new Supabase credentials
2. Run `schema.sql` in new Supabase SQL editor
3. Add root `middleware.ts`
4. Migrate `campaigns/[id]` route to server client
5. Update `.env.local.example`
6. Restart dev server; create test user; verify campaign CRUD in Supabase Table Editor

**Rollback:** Revert `.env` to old project URL/key; remove `middleware.ts` if it causes issues.

## Open Questions

- Should `.env` be added to `.gitignore` if not already? (Recommended — check during apply.)
- Is passkey auth enabled on the new Supabase project dashboard?
