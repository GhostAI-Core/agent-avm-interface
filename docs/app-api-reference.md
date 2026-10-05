# Agent AVM Interface — API Reference & Alignment Guide

This document describes the Next.js Route Handlers under `app/api/`, how they relate to **evra-callops**, and which Supabase tables they read or write.

---

## Executive Summary

| Layer | What it is | Role |
|-------|------------|------|
| `app/api/` (this repo) | Next.js Route Handlers | Dashboard CRUD, auth-gated read model, lifecycle proxy to callops, telephony trunk proxies, TTS/script reuse, STS relay, LiveKit webhook |
| `docs/openapi.json` | OpenAPI 3.1 for **evra-callops** | Campaign dispatcher, queue stats, call outcome/telemetry ingestion, LiveKit admin API |
| Supabase | PostgreSQL + Auth + Storage | Source of truth for campaigns, contacts, call records, intents, audit logs |

This app is no longer the production dialer. `app/api/campaigns/[id]/[action]/route.ts` proxies lifecycle actions to evra-callops, and callops owns dispatch, pacing, retries, LiveKit SIP calls, and agent outcome ingestion.

```text
Browser
  │ authenticated fetch
  ▼
app/api/*
  ├─ Supabase session routes: campaigns, companies, logs, reports, intents, templates, trunks, scripts
  ├─ POST /api/campaigns/{id}/start|pause|stop ──X-Webhook-Secret──► evra-callops
  ├─ GET  /api/campaigns/{id}/status            ──X-Webhook-Secret──► evra-callops
  ├─ /api/trunks/*                              ──X-Webhook-Secret──► callops LiveKit admin
  ├─ POST /api/flow-builder/generate ──Anthropic SDK──► Claude tool-constrained draft flow
  ├─ POST /api/sts/mark                         ──optional x-relay-secret──► STS SDP
  ├─ POST /api/livekit/webhook ◄──────────── signed LiveKit room events
  └─ POST /api/calls/result ── deprecated no-op; use callops /calls/outcome
```

---

## Authentication Model

| Auth type | Header / mechanism | Routes |
|-----------|--------------------|--------|
| Supabase session | Cookie from `createServerClient`; validated via `getAuthUser()` | Dashboard CRUD/read routes, lifecycle proxy, trunk catalog/admin proxies, script library |
| `X-Webhook-Secret` | Sent server-side from this app to `CALLOPS_URL` | callops lifecycle/status/trunk admin/test-call cross-checks |
| `x-relay-secret` | Optional shared secret checked when `STS_RELAY_SECRET` is set | `POST /api/sts/mark` |
| LiveKit webhook JWT | `Authorization` header; validated by `WebhookReceiver` | `POST /api/livekit/webhook` |
| None | Public | `GET /api/health`, `POST /api/flow-builder/generate`, deprecated `POST /api/calls/result` no-op; `POST /api/sts/mark` only when `STS_RELAY_SECRET` is unset |

The browser never receives `CALLOPS_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, LiveKit API secrets, Inworld credentials, or STS relay/GUID secrets.

---

## Route Inventory

All paths are prefixed with `/api` by Next.js App Router convention.

### `GET /api/health`

| | |
|---|---|
| Auth | None |
| Purpose | Deploy/load-balancer probe |
| Response | `{ "status": "ok" }` |
| Supabase | None |

### `GET /api/campaigns`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | List campaigns for the dashboard from CallOps |
| Response | `{ campaigns: Campaign[] }`; each item includes flattened `company` from the parent company list |
| Upstream | Fans out over `GET $CALLOPS_URL/companies`, then `GET $CALLOPS_URL/companies/{id}/campaigns`, with the user's bearer token |

CallOps lists campaigns per company, so this route merges each company result and sorts newest first by `created_at`.

### `POST /api/campaigns`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Create a CallOps campaign and optional contacts under a company |
| Body | `{ name, company_id, agent?, dialing_speed?, window_start?, window_end?, start_date?, end_date?, audio_path?, transfer_key?, transfer_target?, max_concurrent?, max_retries?, retry_cooldown_seconds?, sip_trunk_id?, contacts?[] }` |
| Response | CallOps response, usually `{ campaign, contacts_imported, contacts_rejected }`, with status **201** |
| Validation | `name` and `company_id` required; contacts without `phone` are dropped before forwarding |
| Upstream | `POST $CALLOPS_URL/companies/{company_id}/campaigns` with the user's bearer token |

Create-time details:

| Field | Behavior |
|-------|----------|
| `agent_name` | Always stored as `outbound-recorder`, the deployed LiveKit worker callops dispatches |
| `sip_trunk_id` | Integer FK to `sip_trunks.id`; callops resolves it to `sip_trunks.livekit_trunk_id` |
| `max_concurrent`, `max_retries`, `retry_cooldown_seconds` | Coerced to integers with defaults `5`, `2`, `3600` |
| `window_start`, `window_end` | Stored as `time_window_start`, `time_window_end` |
| `audio_path` | If `voice_recording_url` is absent, forwarded as `voice_recording_url` because the dispatcher reads that field |
| `contacts` | Forwarded to CallOps as `{ phone, first_name?, last_name? }`; CallOps owns normalization, dedupe, and import accounting |
| `product_id`, `product_version_id` | Optional product/script pointers; CallOps resolves product fields when present |

### `GET /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Read one CallOps campaign plus its summary block |
| Configured response | `{ summary, campaign }` |
| Unconfigured response | `{ mode: 'unconfigured', summary: null }` when `CALLOPS_URL` or `CALLOPS_WEBHOOK_SECRET` is missing |
| Upstream | `GET $CALLOPS_URL/campaigns/{id}` with `X-Webhook-Secret` |

This route exists mainly for aggregate summary values the browser cannot re-derive from list data, such as `opt_out` counters.

### `PUT /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Partial campaign update for non-lifecycle fields through CallOps |
| Allowed fields | `name`, `agent`, `dialing_speed`, `time_window_start`, `time_window_end`, `max_concurrent`, `max_retries`, `retry_cooldown_seconds`, `sip_trunk_id`, `voice_recording_url`, `voice_path`, `transfer_key`, `transfer_target`, `network_provider`, `voice_id`, `routing_mode`, `product_id`, `product_version_id`; `audio_path` maps to `voice_recording_url` when needed |
| Response | `{ campaign }` |
| Upstream | `PATCH $CALLOPS_URL/campaigns/{id}` with the user's bearer token |

Lifecycle controls must use `/start`, `/pause`, and `/stop` so callops can own dispatch state. Direct `PUT { status }` is intentionally rejected by the field allow-list.

### `DELETE /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Archive a campaign through CallOps |
| Behavior | Calls CallOps archive endpoint; there is no hard delete in v1 |
| Response | `{ success: true }` |
| Upstream | `POST $CALLOPS_URL/campaigns/{id}/archive` with the user's bearer token |

### `POST /api/campaigns/[id]/start|pause|stop`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Proxy campaign lifecycle commands to evra-callops |
| Body | None |
| Configured response | `{ mode: 'callops', ...callopsResponse }` |
| Local fallback | `{ mode: 'local', campaign_id, status }` when `CALLOPS_URL` or `CALLOPS_WEBHOOK_SECRET` is unset outside production |
| Production without callops env | **503** `{ error: 'callops not configured' }` |
| Upstream | `POST $CALLOPS_URL/campaigns/{id}/{action}` with `X-Webhook-Secret` |
| Supabase tables | Fallback only: updates `campaigns.status`; `start` also clears `auto_paused` |

Allowed actions and fallback status:

| Action | Local status |
|--------|--------------|
| `start` | `running` |
| `pause` | `paused` |
| `stop` | `stopped` |

If callops returns a client error, this app preserves the upstream 4xx status and normalized detail. Upstream 5xx responses or network failures are returned as **502**.

### `GET /api/campaigns/[id]/status`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Fetch live queue/call stats from callops |
| Response | callops `CampaignLiveStatus` shape, or `{ mode: 'unconfigured' }` when callops env is missing |
| Upstream | `GET $CALLOPS_URL/campaigns/{id}/status` with `X-Webhook-Secret` |
| Supabase tables | None in this app |

The UI polls this route for running/paused campaigns and expects counters such as `active_calls`, `queued`, `pending`, `in_progress`, `dialed`, `failed`, `retry`, `completed_today`, and optional `auto_paused`.

### `GET /api/trunks`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | SIP trunk catalog for the campaign wizard |
| Response | `{ trunks: [{ id, name, from_number, live }] }` |
| Supabase tables | `sip_trunks` |
| Upstream | Optional `GET $CALLOPS_URL/livekit/trunks` cross-check |

If callops is configured and reachable, only Supabase rows backed by a live LiveKit trunk are returned. If callops is unconfigured or unreachable, the full Supabase catalog is returned so campaign creation is not blocked.

### `POST /api/trunks`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Create a SIP outbound trunk through callops/LiveKit |
| Body | `{ name, address, numbers: string[], auth_username, auth_password }` |
| Response | callops trunk response; password is never returned |
| Upstream | `POST $CALLOPS_URL/livekit/trunks` with `X-Webhook-Secret` |
| Missing callops env | **503** `{ error: 'telephony not configured' }` |

All body fields are required. Client validation errors from callops pass through as 4xx; upstream faults are normalized to **502**.

### `PATCH /api/trunks/[trunk_id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Partially update a LiveKit SIP outbound trunk through callops |
| Path parameter | `trunk_id` is the LiveKit trunk id (`ST_...`), not `sip_trunks.id` |
| Body | Any non-empty subset of `name`, `address`, `numbers`, `auth_username`, `auth_password` |
| Upstream | `PATCH $CALLOPS_URL/livekit/trunks/{trunk_id}` with `X-Webhook-Secret` |
| Missing callops env | **503** `{ error: 'telephony not configured' }` |

The route forwards only recognized, non-empty fields. An empty patch returns **400** `{ error: 'no fields to update' }`.

### `DELETE /api/trunks/[trunk_id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Delete a LiveKit SIP outbound trunk through callops |
| Path parameter | LiveKit trunk id (`ST_...`) |
| Upstream | `DELETE $CALLOPS_URL/livekit/trunks/{trunk_id}` with `X-Webhook-Secret` |
| Missing callops env | **503** `{ error: 'telephony not configured' }` |

### `POST /api/trunks/test-call`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Place a one-off SIP test call through callops/LiveKit |
| Required body | `{ phone, sip_trunk_id }` |
| Optional body | `room_name`, `participant_identity`, `participant_name`, `from_number`, `wait_until_answered`, `krisp_enabled`, `timeout_seconds` |
| Upstream | `POST $CALLOPS_URL/livekit/test-call` with `X-Webhook-Secret` |
| Missing callops env | **503** `{ error: 'telephony not configured' }` |

A failed call attempt can still return HTTP 200 with `{ ok: false, ... }`; non-2xx responses mean request validation or upstream failure.

### `POST /api/calls/result`

| | |
|---|---|
| Auth | None |
| Purpose | Deprecated transition endpoint |
| Behavior | Logs a warning, performs no writes, returns `{ ok: true, deprecated: true }` |
| Replacement | LiveKit agents should POST outcomes to `POST $CALLOPS_URL/calls/outcome` |

This route is intentionally a no-op so not-yet-updated agents stop cleanly during the cutover. Do not build new integrations against it.

### `POST /api/sts/mark`

| | |
|---|---|
| Auth | Optional `x-relay-secret` header when `STS_RELAY_SECRET` is configured |
| Purpose | Relay an AI-agent keypress decision to STS SDP; STS remains the subscription/opt-out system of record |
| Body | `{ product, msisdn, action, durationSeconds? }` |
| Aliases | `agent` for `product`, `number` for `msisdn`, `1` for `subscribe`, `9`/`optout` for `opt_out`, `CallDuration` for `durationSeconds` |
| Response | STS relay result, or **503** when no `STS_GUID_<PRODUCT>` env exists |
| Upstream | `subscribe` -> `POST $STS_SDP_BASE_URL/avm/{GUID}/{MSISDN}`; `opt_out` -> `POST $STS_SDP_BASE_URL/cancel/{GUID}/{MSISDN}` |

`product` is normalized to `STS_GUID_<PRODUCT>` (for example `product: "seeker"` reads `STS_GUID_SEEKER`). The route does not write consent state locally.

### `POST /api/livekit/webhook`

| | |
|---|---|
| Auth | LiveKit webhook JWT in `Authorization` |
| Purpose | Persist LiveKit room lifecycle fallback updates |
| Response | `{ ok: true }`, or `{ ok: true, persisted: false }` if service-role key is missing |
| Supabase tables | `call_records` |

Handled events:

| Event | DB update |
|-------|-----------|
| `participant_joined` | If participant identity starts with `caller_`, set pending row outcome to `connected` |
| `egress_ended` | Set `recording_url` from first file result location |
| `room_finished` | Backfill `talk_seconds` for connected calls; set still-pending rows to `no_answer` |

The webhook updates rows by `call_records.room`. Under the callops model, callops is expected to create or maintain those rows.

### `GET /api/logs`

| | |
|---|---|
| Auth | Supabase user |
| Query | `campaignId?`; omit for last 2000 calls across all campaigns |
| Response | `{ logs: CallRecord[] }` |
| Supabase tables | `call_records` |

### `GET /api/reports`

| | |
|---|---|
| Auth | Supabase user |
| Query | `agent?`, `date?` |
| Response | `{ reports: CallLog[] }` with joined `campaign(name, agent)` |
| Supabase tables | `call_logs`, `campaigns` |

### `GET /api/intents`

| | |
|---|---|
| Auth | Supabase user |
| Query | `campaignId?`, `date?` (default today) |
| Response | `{ day, connectedTotal?, intents[] }` |
| Supabase tables | `intent_stats`, `call_records` for denominator when `campaignId` is present |

### `GET /api/companies`

| | |
|---|---|
| Auth | Supabase user |
| Response | `{ companies: { id, name, contact_name, contact_email, contact_phone }[] }` |
| Supabase tables | `companies` |

### `POST /api/companies`

| | |
|---|---|
| Auth | Supabase user |
| Body | `{ name, contact_name?, contact_email?, contact_phone? }` |
| Response | `{ company }` with status **201** |
| Supabase tables | `companies` |

### `GET /api/security`

| | |
|---|---|
| Auth | Supabase user |
| Response | `{ logs: SecurityLog[] }`; last 100 rows |
| Supabase tables | `security_logs` |

There is no `POST /api/security` handler in the current codebase.

### `/api/dashboard-templates`

| Route | Auth | Purpose | Supabase tables |
|-------|------|---------|-----------------|
| `GET /api/dashboard-templates` | User | List saved dashboard layouts | `dashboard_templates` |
| `POST /api/dashboard-templates` | User | Save `{ name, layout }`; layout is JSONB `{ order, pinned, hidden }` | `dashboard_templates` |
| `DELETE /api/dashboard-templates?id=...` | User | Delete one template | `dashboard_templates` |

The GET route degrades to `{ templates: [] }` if the table is missing.

### `POST /api/tts/generate`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Proxy to Inworld TTS for campaign script preview |
| Body | `{ text, voiceId }`; max 2000 chars |
| Response | `{ audioBase64, contentType: 'audio/mpeg' }` |
| Env | `INWORLD_API_KEY` |

### `POST /api/tts/save`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Upload generated MP3 to external script storage |
| Body | `{ campaignName, audioBase64, voiceId?, text? }` |
| Response | `{ storageKey, publicUrl, campaignName }` |
| Env | `AVM_SCRIPT_AUDIO_STORAGE_*` |

When `text` is provided, the route best-effort inserts a `voice_scripts` row so the voice generator can offer the script for reuse. Audio upload success is not rolled back if that library insert fails.

### `GET /api/scripts`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | List generated campaign script MP3 objects for the campaign edit saved-script picker |
| Response | `{ scripts: [{ storageKey, publicUrl, name, lastModified }] }`; `{ scripts: [] }` when script storage is unconfigured |
| Storage | S3-compatible Supabase storage configured by `AVM_SCRIPT_AUDIO_STORAGE_*` |

### `GET /api/voice-scripts`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | List previously saved voice script text/audio rows for voice-generator reuse |
| Response | `{ scripts: [{ id, text, voice_id, audio_url, campaign_name, created_at }] }` |
| Supabase tables | `voice_scripts`; newest 50 rows |

### `POST /api/flow-builder/generate`

| | |
|---|---|
| Auth | None in the current route |
| Purpose | Generate a visual campaign-flow draft for `/flow-builder` |
| Body | `{ prompt: string }` |
| Response | `{ nodes, edges }`, where each node uses a valid `specKey` from `components/flow-builder/nodeSpecs.ts` |
| Env | `ANTHROPIC_API_KEY`; missing key returns **400** |
| Upstream | Anthropic SDK, model `claude-opus-4-8`, forced `build_flow` tool |

The route is a **visual POC helper**, not a campaign execution or persistence API. The prompt is sent to Anthropic, but the server constrains generation by listing the local node catalog in the system prompt, forcing a `build_flow` tool call, filtering nodes to known `SPECS` keys, and dropping edges whose source or target IDs are not present in the returned node set. The browser shows a proof-check preview before applying the generated graph to the canvas.

---

## Routes Documented Elsewhere But Not Implemented Here

| Route | Status |
|-------|--------|
| `POST /api/campaigns/:id/dial` | Not implemented; use `npm run dial` for direct LiveKit diagnostics or `/start`, `/pause`, `/stop` for production lifecycle |
| `/api/providers` | Not implemented; Settings is informational and telephony admin UI uses local mock data |
| `POST /api/security` | Not implemented |
| `POST /api/simulate` | Not implemented |

The direct LiveKit CLI (`npm run dial`) still exists for diagnostics through `scripts/dial-outbound.ts`, but there is no browser-facing diagnostic dial route in the current app. The production dashboard lifecycle path is `/api/campaigns/:id/start|pause|stop`, proxied to evra-callops.

---

## Supabase Schema Reference

Tables touched by `app/api/`:

```text
companies ──────────< campaigns ──────────< campaign_contacts >────────── contacts
                         │
                         ├──< call_records
                         ├──< call_logs
                         └──< intent_stats

voice_scripts
sip_trunks              dashboard_templates     security_logs
profiles               storage.buckets: voice-recordings, avm-scripts
```

### `campaigns` (relevant columns)

| Column | Used by |
|--------|---------|
| `id`, `name`, `agent`, `status` | Campaign list/create/update, callops lifecycle status |
| `dialing_speed`, `time_window_start`, `time_window_end` | Create/update; scheduling inputs for callops |
| `max_retries`, `retry_cooldown_seconds`, `max_concurrent`, `auto_paused` | Create/update/read; callops owns runtime behavior |
| `sip_trunk_id` | Integer FK to `sip_trunks.id`; selected by the campaign wizard |
| `agent_name` | Set to `outbound-recorder` on create |
| `voice_recording_url`, `voice_path`, `audio_path` | Campaign voice prompt/script references |
| `transfer_key`, `transfer_target` | Campaign create metadata |
| `company_id` | List join and dashboard filters |

`CampaignStatus` values in TypeScript are `draft`, `running`, `paused`, `stopped`, `completed`, `archived`, `deleted`.

### `contacts` (relevant columns)

| Column | Used by |
|--------|---------|
| `campaign_id`, `phone`, `first_name`, `last_name` | Campaign create and callops dispatch |
| `status` | Queue lifecycle: `pending`, `in_progress`, `dialed`, `failed`, `retry` |
| `retry_count`, `last_attempted_at` | Runtime retry state owned by callops |

`campaign_contacts` is the per-campaign membership/status join for reused contacts. Current callops enumeration also depends on `contacts.campaign_id`, so campaign create points linked contacts at the newly created campaign for callops visibility.

### `call_records` (relevant columns)

| Column | Set/read by |
|--------|-------------|
| `campaign_id`, `contact_id`, `phone`, `room` | callops and diagnostic dial path |
| `outcome` | callops outcome ingestion; LiveKit webhook fallback for `connected`/`no_answer` |
| `talk_seconds`, `transferred`, `cost` | callops outcome ingestion; webhook fallback for talk time |
| `recording_url`, `egress_id` | LiveKit/callops recording flow |
| `called_at` | Dashboard sorting/filtering |

Known outcome values include legacy IVR values (`connected`, `qualified`, `voicemail`, `no_speech`, `hangup`, `ni`, `dnq`, `callback`, `no_answer`, `busy`, `failed`) and callops values added by migration (`answered`, `transferred`).

---

## OpenAPI (`docs/openapi.json`) Alignment

`docs/openapi.json` describes evra-callops, not this Next.js app. The current integration points are:

| callops concept | This app integration |
|-----------------|----------------------|
| `GET /campaigns/{id}` | `GET /api/campaigns/[id]` read-through for summary details |
| `POST /campaigns/{id}/start` | `POST /api/campaigns/[id]/start` proxy |
| `POST /campaigns/{id}/pause` | `POST /api/campaigns/[id]/pause` proxy |
| `POST /campaigns/{id}/stop` | `POST /api/campaigns/[id]/stop` proxy |
| `GET /campaigns/{id}/status` | `GET /api/campaigns/[id]/status` proxy and UI live stats |
| `POST /calls/outcome` | Agent replacement for deprecated `/api/calls/result` |
| `GET /livekit/trunks` | Optional cross-check in `GET /api/trunks` |
| `POST /livekit/trunks` | `POST /api/trunks` browser-facing proxy |
| `PATCH /livekit/trunks/{trunk_id}` | `PATCH /api/trunks/[trunk_id]` browser-facing proxy |
| `DELETE /livekit/trunks/{trunk_id}` | `DELETE /api/trunks/[trunk_id]` browser-facing proxy |
| `POST /livekit/test-call` | `POST /api/trunks/test-call` browser-facing proxy and `npm run callops -- test-call ...` diagnostic CLI |

OpenAPI endpoints for telemetry, dispatch jobs, and rooms are not surfaced directly by this app today.

---

## Environment Variables By Route

| Variable | Routes affected |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | All authenticated Supabase routes |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/livekit/webhook`, diagnostic scripts, voice signing |
| `CALLOPS_URL`, `CALLOPS_WEBHOOK_SECRET` | `/api/campaigns/[id]`, `/api/campaigns/[id]/start|pause|stop|status`, `/api/trunks`, `/api/trunks/[trunk_id]`, `/api/trunks/test-call` |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | `/api/livekit/webhook`, direct diagnostic CLI |
| `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`, `LIVEKIT_AGENT_NAME` | Direct diagnostic CLI |
| `LIVEKIT_RECORD_*` | Direct diagnostic CLI egress path |
| `INWORLD_API_KEY` | `/api/tts/generate` |
| `AVM_SCRIPT_AUDIO_STORAGE_*` | `/api/tts/save`, `/api/scripts` |
| `ANTHROPIC_API_KEY` | `/api/flow-builder/generate` |
| `STS_RELAY_SECRET`, `STS_SDP_BASE_URL`, `STS_GUID_<PRODUCT>` | `/api/sts/mark` |

---

## Related Files

| Path | Role |
|------|------|
| `app/api/campaigns/[id]/route.ts` | CallOps campaign read/update/archive proxy |
| `app/api/campaigns/[id]/[action]/route.ts` | callops lifecycle/status proxy |
| `app/api/trunks/route.ts` | SIP trunk catalog and create proxy for campaign wizard/telephony admin |
| `app/api/trunks/[trunk_id]/route.ts` | LiveKit trunk update/delete proxy through callops |
| `app/api/trunks/test-call/route.ts` | one-off SIP test-call proxy through callops |
| `app/api/flow-builder/generate/route.ts` | Anthropic-backed visual flow draft generator |
| `app/api/scripts/route.ts` | saved script audio object listing |
| `app/api/voice-scripts/route.ts` | saved script text/audio reuse library |
| `app/api/sts/mark/route.ts` | STS subscribe/opt-out relay |
| `app/api/calls/result/route.ts` | deprecated no-op result endpoint |
| `app/api/livekit/webhook/route.ts` | signed LiveKit webhook fallback updates |
| `scripts/callops-test.ts` | callops smoke/integration test harness |
| `scripts/dial-outbound.ts` | direct LiveKit diagnostic dial script |
| `lib/outbound-call.ts` | direct LiveKit SDK helpers |
| `lib/voice.ts` | voice URL resolution/signing helpers |
| `utils/supabase/auth.ts` | session auth helper |
| `utils/supabase/admin.ts` | service-role client |
| `supabase/migrations/*.sql` | schema source of truth |
| `docs/openapi.json` | evra-callops API contract |
