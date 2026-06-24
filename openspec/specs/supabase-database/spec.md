# supabase-database

Supabase project connection, schema deployment, auth session handling, and server-side API integration.

## Requirements

### Requirement: Application connects to configured Supabase project

The application MUST read `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from `.env` and use them for all Supabase client initialization.

#### Scenario: Server client uses env credentials

- **WHEN** an API route creates a Supabase server client
- **THEN** the client connects to the URL and key defined in `.env`

#### Scenario: Browser client uses env credentials

- **WHEN** a client component creates a Supabase browser client
- **THEN** the client connects to the URL and key defined in `.env`

### Requirement: Database schema is deployed to Supabase

The Supabase project MUST have all tables, triggers, seed data, and RLS policies defined in `schema.sql` applied.

#### Scenario: Core tables exist

- **WHEN** the schema script is run in the Supabase SQL editor
- **THEN** tables `campaigns`, `call_logs`, `contacts`, `voip_providers`, `security_logs`, `system_settings`, and `profiles` exist

#### Scenario: RLS is enabled on protected tables

- **WHEN** the schema script completes
- **THEN** row-level security is enabled on `campaigns`, `call_logs`, `contacts`, `security_logs`, `system_settings`, and `profiles`

### Requirement: Auth sessions refresh on each request

The application MUST include Next.js middleware that refreshes the Supabase auth session on every matched request.

#### Scenario: Middleware invokes session refresh

- **WHEN** any non-static page or API request is received
- **THEN** `updateSession()` from `utils/supabase/middleware.ts` runs and calls `supabase.auth.getUser()` to refresh the session cookie

#### Scenario: Static assets are excluded

- **WHEN** a request targets `_next/static`, images, or favicon
- **THEN** middleware does not run

### Requirement: API routes use cookie-aware server client

All server-side API routes that read or write RLS-protected tables MUST use `createClient` from `utils/supabase/server` with the request cookie store.

#### Scenario: Campaign update uses session

- **WHEN** `PUT /api/campaigns/[id]` is called by an authenticated user
- **THEN** the route uses the cookie-aware server client and the update succeeds under RLS

#### Scenario: Campaign delete uses session

- **WHEN** `DELETE /api/campaigns/[id]` is called by an authenticated user
- **THEN** the route uses the cookie-aware server client and the soft-delete succeeds under RLS

### Requirement: Environment example documents correct variable names

The `.env.local.example` file MUST document `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not legacy `ANON_KEY` naming).

#### Scenario: Example file matches codebase

- **WHEN** a developer reads `.env.local.example`
- **THEN** variable names match those used in `utils/supabase/server.ts` and `utils/supabase/client.ts`
