## Context

The dashboard currently reads/writes operational data (campaigns, contacts, call_records, call_logs, sip_trunks) directly via the Supabase client, and maintains its own analytics roll-up. GitHub issue #42 (Cale's handover) makes CallOps the single authoritative API and forbids direct operational-table access from the frontend; Supabase is auth-only on the client. The CallOps API surface for this is implemented and specified in `evra_callops/openspec/specs/*` (companies, campaigns, contacts, calls-history, dashboard-analytics, intent-stats, sip-trunks, lookups, frontend-api-auth). Auth is `Authorization: Bearer <supabase access token>`; CallOps validates ES256 via JWKS (its `ffde3bd` fix) and uses its own service-role for DB.

Constraints: the dashboard already proxies through Next.js API routes (the correct place to hold secrets). The current `callops-outcome-contract-alignment` change is partly built (types, voice_id, a Supabase-direct per-call display); this change supersedes it, keeping the durable pieces and replacing the read path. CallOps prod is not yet on `ffde3bd`, so development and verification run against a local CallOps instance on the auth-fix branch.

## Goals / Non-Goals

**Goals:**
- One server-side channel (`utils/callops.ts`) for all operational reads/writes, forwarding the user's bearer token, secrets server-only.
- Move companies, campaigns (+ contact model fix), contacts (new view), analytics, call history/detail, and SIP trunks onto CallOps.
- Delete the local analytics roll-up and the `campaign_contacts` M:N write path.
- Be verifiable locally before any prod dependency on Cale.

**Non-Goals:**
- Backend changes (auth fix `ffde3bd`, the 3 migrations) — handled separately; migrations already applied.
- Campaign lifecycle control (start/pause/stop) — already proxied and unchanged ([[fe-zero-control]]).
- Replacing client Supabase auth/session.
- Reworking UI theme/layout beyond adding the contacts view + sidebar entry.

## Decisions

- **Server-side proxy via Next.js API routes, not client→CallOps direct.** Keeps `CALLOPS_URL`/secrets server-side and lets us attach the bearer token from the server session. Alternative (browser calls CallOps directly) rejected: leaks URL/secrets and complicates CORS/token handling.
- **Single `utils/callops.ts` helper** with `callopsGet/Post/Patch` taking `(path, token, body?)`. Alternative (per-route fetch) rejected: duplicates auth/error handling and drifts.
- **Token = user's Supabase access token, resolved server-side.** Per `frontend-api-auth`; CallOps does identity only, never forwards it to Postgres. Service-role stays for the few webhook-secret paths.
- **Incremental route-by-route cutover (M2-1…M2-6 order), each route fully switched (no dual-read).** Read+write for a resource move together to avoid split-brain. Alternative (big-bang) rejected: too risky to verify.
- **Reuse, don't rebuild, where possible:** extend the existing `app/api/intents` and any lookups proxy rather than duplicate; keep `types/index.ts` (`CallRecord`, `CampaignSummary`, `voice_id`) and the voice_id save from the superseded change.
- **Call detail uses the live 4-way split endpoints** (`/calls/{id}/call-report`, `/calls/{id}/telemetry`, plus model-usage/events as available), not the stale combined-telemetry spec the local backend openspec still shows.
- **Local CallOps for development:** run `evra_callops` on `stage/jwt-auth-and-migrations` (`uv sync && uvicorn app.main:app`) pointed at the shared Supabase; `CALLOPS_URL=http://localhost:8000`. Lets us build/verify the whole change without the prod deploy.

## Risks / Trade-offs

- [Prod CallOps not yet on `ffde3bd` → bearer auth 500s in prod] → Develop/verify against local CallOps; ship the dashboard behind the backend deploy; hand Cale the pre-staged PR; do not cut prod over until `GET /me` returns 200 in prod.
- [Local vs prod CallOps drift] → Pin local to a known branch; smoke `GET /me`, one campaign list, one dashboard summary against both before declaring done.
- [Removing the M:N write path could regress contact creation] → Verified by an import smoke test (created/updated/rejected counts) before deleting old code; the dispatcher reads `contacts.campaign_id`, which CallOps now owns.
- [Deleting the local roll-up could change displayed numbers] → Compare KPI/outcome/donut/Call-Quality figures against CallOps before/after; opt-out must be excluded from connected.
- [Backend openspec is stale on call reporting] → Trust the live split endpoints (#42 + live probe), not the local combined-telemetry spec.
- [Contacts view is net-new UI surface] → Keep it minimal (table + filter + import + row actions) and lookup-driven; defer polish.

## Migration Plan

1. Land `utils/callops.ts` + server token resolution; no behavior change yet.
2. Cut over per resource in M2 order: companies → campaigns(+contacts model) → analytics → contacts view → call history/detail → SIP trunks. Each: switch route to CallOps, update consumers, delete the dead Supabase-direct path.
3. Remove `lib/telephony-mock.ts` and the local analytics roll-up once their consumers are migrated.
4. Verify locally against CallOps (`GET /me`, campaign create/list, contact import, dashboard summary, call detail, trunk list/test-call).
5. Prod: only after Cale deploys `ffde3bd` and `GET /me` returns 200 in prod. Rollback = revert the dashboard change set (backend is additive; migrations are idempotent/additive).

## Open Questions

- Exact CALLOPS_URL/env for the prod cutover and the deploy ordering with Cale's `ffde3bd` deploy — confirm before prod.
- Whether any remaining webhook-secret server paths (e.g. prefetch-audio, lifecycle) stay as-is or also move to bearer — keep as-is unless #42 says otherwise.
- Page-size clamp vs reject behavior (backend api-conventions marks this undecided) — tolerate both on the client.
