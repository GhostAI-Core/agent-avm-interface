## ADDED Requirements

### Requirement: Server-side CallOps proxy client
The dashboard SHALL provide a server-side CallOps client module (`utils/callops.ts`) exposing `callopsGet`, `callopsPost`, and `callopsPatch` helpers that target `process.env.CALLOPS_URL`. Each helper SHALL accept the caller's bearer token and send it as an `Authorization: Bearer <token>` header. Non-2xx responses SHALL throw an error carrying the upstream status and body so calling routes can surface CallOps' error shape.

#### Scenario: Authenticated GET forwards the bearer token
- **WHEN** a Next.js API route calls `callopsGet('/companies', token)`
- **THEN** the request goes to `${CALLOPS_URL}/companies` with header `Authorization: Bearer <token>`
- **AND** on a 2xx response the parsed JSON body is returned

#### Scenario: Upstream error is propagated, not swallowed
- **WHEN** CallOps responds with a non-2xx status
- **THEN** the helper throws an error containing the status code and the response body text
- **AND** the calling route maps it to an equivalent HTTP response for the client

### Requirement: Bearer token resolved server-side from the Supabase session
API routes SHALL resolve the authenticated user's Supabase access token on the server (from the request's Supabase session) and pass it to the CallOps client. The user token SHALL be used only as the CallOps bearer credential and SHALL NOT be exposed to the browser beyond the normal Supabase session.

#### Scenario: Missing session is rejected before calling CallOps
- **WHEN** an API route runs without a valid Supabase session
- **THEN** the route returns HTTP 401 and does not call CallOps

#### Scenario: Valid session yields a forwarded token
- **WHEN** an API route runs with a valid Supabase session
- **THEN** the route extracts the access token server-side and forwards it to CallOps as the bearer credential

### Requirement: Secrets remain server-side only
`CALLOPS_WEBHOOK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` SHALL only be referenced in server-side code (API routes / server modules) and SHALL NOT be sent to or readable by the browser.

#### Scenario: No server secret reaches the client bundle
- **WHEN** the client bundle is built
- **THEN** neither `CALLOPS_WEBHOOK_SECRET` nor `SUPABASE_SERVICE_ROLE_KEY` appears in client-delivered code

### Requirement: No direct operational-table access from the dashboard
The dashboard SHALL NOT read from or write to CallOps operational tables (`campaigns`, `contacts`, `call_records`, `call_logs`, `sip_trunks`, `companies`) via the Supabase client. All operational data access SHALL go through the CallOps proxy client. The Supabase client SHALL be used only for authentication/session.

#### Scenario: Operational read is proxied, not queried directly
- **WHEN** the dashboard needs campaign, contact, call, or trunk data
- **THEN** it requests the data through a Next.js API route that calls CallOps
- **AND** no `supabase.from('<operational table>')` query is used for that data
