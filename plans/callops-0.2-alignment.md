# Plan — Align UI + Supabase to callops 0.2.0 (callops is the source of truth)

**Branch:** `fix/campaign-trunk-fk` (continues the callops integration line)
**Status:** Proposed. Spec refreshed; type alignment unblocked; route migration **blocked upstream** (see §0).
**Principle:** callops is the orchestrator and the contract of record. The dashboard's TypeScript
types and the Supabase read-models conform to callops — never the reverse. Where callops now owns
a surface, the dashboard proxies callops instead of reading Supabase directly.

## 0. Upstream blocker — bearer auth is not configured on callops (Cale's side)

The live API (`https://call-center.evra-ai.com`, **v0.2.0, 68 paths / 81 ops**) splits into two auth
regimes:

| Regime | Header | Surface | Status |
|---|---|---|---|
| Machine | `X-Webhook-Secret` | campaign `start/pause/stop/prefetch-audio`, `/calls/outcome`, `/calls/telemetry`, `/dispatch/job`, all `/livekit/*` | **healthy** — our existing proxies work |
| User | `Authorization: Bearer` (`HTTPBearer`) | the 62-endpoint management surface (companies, campaigns-mgmt, contacts, calls, sip-trunks, dashboard, intent-stats, templates, audit, script-audio, lookups, `/me`) | **500 `JWT secret not configured`** for every token |

Every bearer endpoint currently 500s because callops has no JWT-validation secret configured.
**Nothing the dashboard sends can fix this** — validation happens on callops; we can only forward the
right token. Our app and callops share the Supabase project `ytozpjohaphinlsqrxlc`.

**Critical detail — the project uses asymmetric ES256 JWTs, not a shared secret.** The JWKS endpoint
(`https://ytozpjohaphinlsqrxlc.supabase.co/auth/v1/.well-known/jwks.json`) serves an `ES256` EC public
key (`kid ee9f5cd5-…`), and the project has the new publishable key. User access tokens are signed
ES256 and verified via JWKS. callops' "JWT **secret** not configured" implies it expects a symmetric
HS256 secret — which can **never** validate our ES256 tokens. The fix is for callops to validate
against the **JWKS URL** (issuer `https://ytozpjohaphinlsqrxlc.supabase.co/auth/v1`, `aud=authenticated`,
`alg=ES256`), not a pasted secret. → precise write-up for Cale in `plans/callops-0.2-cale-note.md`.

**This is NOT a hard blocker for us.** The dashboard only forwards the user's Supabase access token as
`Authorization: Bearer …`. We build that forwarding + a Supabase fallback now (§3 helper): every
migrated proxy tries callops first and falls back to the current direct-Supabase read on 401/5xx. The
dashboard keeps working today and auto-upgrades to callops the moment Cale points it at JWKS — no
flag-day, no downtime. Type alignment (§2) also proceeds now.

A second limitation: callops documents request bodies precisely, but most GET **responses are untyped
(`{}`)** in the OpenAPI. Matching our *output* types exactly needs response shapes from Cale or live
calls (blocked by the same JWT issue). Output types in §2 are inferred and marked `// unverified`.

## 1. Surface map — our route → callops endpoint (what "match callops" means)

| Our route (reads Supabase today) | callops endpoint(s) (auth) | Migrate? |
|---|---|---|
| `app/api/campaigns/route.ts` | `GET/POST /companies/{id}/campaigns`, `GET /campaigns/{id}` (bearer) | yes |
| `app/api/campaigns/[id]/route.ts` (GET/PATCH/DELETE) | `GET/PATCH /campaigns/{id}`, `POST …/archive` (bearer) | yes |
| `app/api/companies/route.ts` | `GET/POST /companies`, `GET/PATCH /companies/{id}` (bearer) | yes |
| `app/api/dashboard-templates/route.ts` | `…/dashboard-templates` CRUD + `set-default` (bearer) | yes |
| `app/api/intents/route.ts` | `GET /campaigns/{id}/intent-stats`, `/companies/{id}/intent-stats` (bearer) | yes |
| `app/api/logs/route.ts` | `GET /companies/{id}/calls`, `/campaigns/{id}/calls`, `/calls/{id}` (+events/telemetry/recording) (bearer) | yes |
| `app/api/reports/route.ts` | `GET /companies/{id}/dashboard`, `…/dashboard/{live,outcomes,call-volume,campaign-performance}` (bearer) | yes |
| `app/api/security/route.ts` | `GET /companies/{id}/security-logs` (alias `/audit-events`) (bearer) | yes |
| `app/api/voice-scripts/route.ts` + `app/api/tts/save/route.ts` | `GET /script-audio`, `POST /script-audio/{generate,save}` (bearer) | yes |
| `app/api/trunks/route.ts` (GET catalog) | `GET /companies/{id}/sip-trunks`, `GET /sip-trunks/{id}` (bearer) | **decide** — DB-backed sip-trunks vs the LiveKit trunk surface we already proxy |
| `app/api/campaigns/[id]/dial/route.ts` | retired (callops dispatches) | confirm dead |
| `app/api/livekit/webhook/route.ts` | callops owns `/livekit/webhook`; ours is the recording ETL | keep (different concern) |

Two trunk surfaces are **not** the same thing and both stay:
- `/livekit/trunks` — webhook secret, string `ST_…` id, LiveKit registration → `app/api/trunks/*` (built).
- `/sip-trunks` — bearer, integer id, DB-backed (`from_number`, `livekit_trunk_id` link, health/archive/test-call) → the catalog source. callops' `TrunkCreate` links the two via `livekit_trunk_id`.

## 2. Type alignment (UNBLOCKED — do now)

callops request schemas are the contract. Changes to `types/index.ts` / `types/telephony.ts`:

- **Campaign** — rename `audio_path` → `voice_path` (callops `voice_path`); model `agent` as
  `string | null` + add `agent_name` (callops splits them; our `Agent` union becomes a UI hint, not
  the wire type). Keep `status`/`auto_paused`/timestamps as response fields. The in-call knobs
  (`answer_delay_sec`, `silence_timeout_sec`, `amd_enabled`, `voicemail_action`) are **not** in
  callops `CampaignCreate/Update` → confirm with Cale whether callops owns them or they remain
  Supabase-only worker columns; until then mark `// supabase-only, not in callops contract`.
- **Contact** (new) — `{ id, campaign_id, phone, first_name?, last_name?, status?, external_id? }`
  from `ContactCreate`/`ContactUpdate`/`BulkContactInput`. We have none today.
- **SipTrunk** (new, DB-backed) — `{ id:number, name, from_number, livekit_trunk_id?, address?, numbers?, auth_username? }` from `TrunkCreate/Update`; distinct from `OutboundTrunk` (LiveKit).
- **DashboardTemplate** — callops `id` is integer (ours `string`); our `layout{order,pinned,hidden}`
  nests under callops `config:object`; add `is_default`, `default_scope`.
- **Company** — already aligned to `CompanyCreate/Update`; add response fields callops returns
  (id, status, timestamps) once known.
- **Lookups** — replace hardcoded `CampaignStatus` union with values sourced from
  `/lookups/campaign-statuses`; same for contact-statuses, call-outcomes, agent-outcomes. Until the
  endpoint is reachable, keep the union but annotate it as "must equal `/lookups/*`".

Verification: `npx tsc --noEmit` + fix consumer fallout, lint clean on touched files.

## 3. Route migration (STAGED — blocked on §0)

For each row in §1: add a bearer-forwarding callops proxy, fall back to the current Supabase read on
callops 401/5xx (dev + graceful degrade), swap the UI data source. Order: lowest-risk reads first
(lookups → companies → campaigns list → dashboard/reports → logs/calls → intent-stats → templates →
security → script-audio), CRUD last. Each route migrates + verifies independently. Does not merge
until §0 is cleared and we can exercise it against live callops.

Bearer plumbing (one helper, written once §0 is unblocked): in the proxy, read the Supabase session
access token (`supabase.auth.getSession()` → `session.access_token`) and forward as
`Authorization: Bearer ${access_token}` to callops. No secret reaches the browser; per-user identity
is preserved end-to-end.

## 4. Done / in-flight

- [x] Refreshed `docs/openapi.json` to live 0.2.0 (was 0.1.0, 53 paths behind).
- [x] Trunk CRUD against `/livekit/trunks` (`app/api/trunks/*`, store, `TrunksPanel`) — verified earlier.
- [ ] §2 type alignment (unblocked).
- [ ] §0 blocker resolved by Cale (JWT secret on callops).
- [ ] §3 route migration (after §0).
