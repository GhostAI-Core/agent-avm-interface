# Agent AVM Interface — API Reference & Alignment Guide

This document describes the Next.js Route Handlers under `app/api/`, how they relate to **evra-callops**, and which Supabase tables they read or write.

---

## Executive Summary

| Layer | What it is | Role |
|-------|------------|------|
| `app/api/` (this repo) | Next.js Route Handlers | Browser-facing facade for CallOps, local dashboard utilities, TTS/script helpers, STS relay, LiveKit webhook, and reconciliation fallback |
| `utils/callops.ts` | Server-side CallOps bearer client | Forwards the user's Supabase access token to CallOps and normalizes upstream errors |
| `docs/openapi.json` | OpenAPI 3.1 for **evra-callops** | Operational API for companies, campaigns, contacts, products, SIP trunks, leads, calls, reports, settings, and script libraries |
| Supabase | PostgreSQL + Auth + Storage | Auth/session layer plus local tables for security logs, dashboard templates, and fallback webhook/reconciliation writes |

This app is no longer the production dialer or the owner of operational campaign data. Most dashboard CRUD/read routes proxy evra-callops with the user's bearer token. callops owns dispatch, pacing, retries, LiveKit SIP calls, agent outcome ingestion, and the operational tables behind companies, campaigns, contacts, products, SIP trunks, call records, reports, and intents.

```text
Browser
  │ authenticated fetch
  ▼
app/api/*
  ├─ CallOps bearer proxies: companies, campaigns, contacts, products, leads,
  │  sip-trunks, calls, reports, intents, settings, script libraries
  ├─ Supabase-local routes: dashboard templates, security logs
  ├─ POST /api/campaigns/{id}/start|pause|stop ──X-Webhook-Secret──► evra-callops
  ├─ GET  /api/campaigns/{id}/status            ──X-Webhook-Secret──► evra-callops
  ├─ /api/trunks/*                              ──X-Webhook-Secret──► callops LiveKit admin
  ├─ POST /api/flow-builder/generate            ──ANTHROPIC_API_KEY──► Claude tool call
  ├─ POST /api/sts/mark                         ──optional x-relay-secret──► STS SDP
  ├─ POST /api/livekit/webhook ◄──────────── signed LiveKit room events
  └─ POST /api/calls/result ◄─X-Webhook-Secret── callops reconciliation forward
```

---

## Authentication Model

| Auth type | Header / mechanism | Routes |
|-----------|--------------------|--------|
| Supabase bearer token | Access token from the server session; forwarded as `Authorization: Bearer ...` | CallOps-backed CRUD/read routes: companies, campaigns, contacts, products, leads, logs/reports/intents, SIP trunks, calls, settings, script libraries |
| Supabase session | Cookie from `createServerClient`; validated via `getAuthUser()` | Supabase-local dashboard utilities such as security logs and dashboard templates |
| `X-Webhook-Secret` | Sent server-side to `CALLOPS_URL`, or received from callops for reconciliation | lifecycle/status routes, LiveKit trunk-admin compatibility routes, and `POST /api/calls/result` |
| `x-relay-secret` | Optional shared secret checked when `STS_RELAY_SECRET` is set | `POST /api/sts/mark` |
| LiveKit webhook JWT | `Authorization` header; validated by `WebhookReceiver` | `POST /api/livekit/webhook` |
| Meta webhook signature | `hub.verify_token` on GET; `x-hub-signature-256` on POST | `GET/POST /api/whatsapp/webhook` |
| None | Public | `GET /api/health`, `POST /api/flow-builder/generate` when `ANTHROPIC_API_KEY` is configured; `POST /api/sts/mark` only when `STS_RELAY_SECRET` is unset |

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
| Purpose | List active campaigns visible to the user |
| Response | `{ campaigns: Campaign[] }`; each row includes flattened `company` name |
| Upstream | `GET /companies`, then `GET /companies/{id}/campaigns` per company through CallOps bearer auth |
| Filters | Excludes `deleted` and `archived` |
| Supabase tables | None directly; CallOps owns operational campaign data |

### `POST /api/campaigns`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Create a campaign under a company, optionally importing contacts |
| Body | `{ name, company_id, agent?, dialing_speed?, window_start?, window_end?, audio_path?, voice_id?, routing_mode?, product_id?, product_version_id?, network_provider?, transfer_key?, transfer_target?, max_concurrent?, max_retries?, retry_cooldown_seconds?, sip_trunk_id?, contacts?[] }` |
| Response | `{ campaign, contacts_imported?, contacts_rejected? }` with status **201** |
| Validation | `name` and `company_id` required locally; contact normalization/dedupe/rejection summary is owned by CallOps |
| Upstream | `POST /companies/{company_id}/campaigns` through CallOps bearer auth |
| Supabase tables | None directly |

Create-time details:

| Field | Behavior |
|-------|----------|
| `agent_name` | Always forwarded as `outbound-recorder`, the deployed LiveKit worker callops dispatches |
| `sip_trunk_id` | Integer CallOps/Supabase trunk id selected in the campaign wizard |
| `max_concurrent`, `max_retries`, `retry_cooldown_seconds` | Coerced to integers with defaults `5`, `2`, `3600` |
| `window_start`, `window_end` | Stored as `time_window_start`, `time_window_end` |
| `product_id`, `product_version_id` | Link the campaign to a product and optionally pin a script version |
| `network_provider` | Optional carrier gate used by callops when selecting contacts |
| `contacts` | Forwarded to CallOps for import; the response reports import/rejection counts |

### `GET /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Fetch one campaign plus CallOps summary for detail/edit screens |
| Response | `{ campaign, summary }`; `{ mode: 'unconfigured', summary: null }` when callops env is missing |
| Upstream | `GET $CALLOPS_URL/campaigns/{id}` with `X-Webhook-Secret` |
| Supabase tables | None directly |

### `PUT /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Partial campaign update for non-lifecycle fields |
| Allowed fields | `name`, `dialing_speed`, `time_window_start`, `time_window_end`, `voice_recording_url`, `audio_path`, `sip_trunk_id`, `agent`, `voice_id`, `routing_mode`, `product_id`, `product_version_id`, `network_provider`, `transfer_key`, `transfer_target`, `max_concurrent`, `max_retries`, `retry_cooldown_seconds` |
| Response | `{ campaign }` |
| Upstream | `PATCH /campaigns/{id}` through CallOps bearer auth |
| Supabase tables | None directly |

Lifecycle controls must use `/start`, `/pause`, and `/stop` so callops can own dispatch state. Direct `PUT { status }` is intentionally rejected by the field allow-list. `audio_path` is accepted for UI compatibility and mapped to `voice_recording_url` before forwarding.

### `DELETE /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Archive a campaign |
| Upstream | `POST /campaigns/{id}/archive` through CallOps bearer auth |
| Response | `{ success: true }` |
| Supabase tables | None directly |

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

### Campaign contact routes

| Route | Auth | Purpose | Upstream / behavior |
|-------|------|---------|---------------------|
| `GET /api/campaigns/[id]/contacts` | Supabase user | Paginated contact list for one campaign | `GET /campaigns/{id}/contacts` plus `GET /campaigns/{id}/contacts/network-breakdown` |
| `POST /api/campaigns/[id]/contacts/import` | Supabase user | Bulk import contacts into a campaign | `POST /campaigns/{id}/contacts/import` |
| `POST /api/contacts/[id]/archive` | Supabase user | Archive one contact | `POST /contacts/{id}/archive` |
| `POST /api/contacts/[id]/retry` | Supabase user | Return one contact to retry flow | `POST /contacts/{id}/retry` |
| `POST /api/contacts/[id]/do-not-call` | Supabase user | Mark one contact as do-not-call | `POST /contacts/{id}/do-not-call` |

`GET /api/campaigns/[id]/contacts` accepts `status`, `network`, `search`/`phone`, `page`, and `page_size` (max 200). The network breakdown is intentionally over the full campaign, not just the currently filtered page, so operators can choose a carrier gate before dialing.

### `GET /api/trunks`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Compatibility SIP trunk catalog for the campaign wizard |
| Response | `{ trunks: [{ id, name, from_number, live }] }` |
| Upstream | `GET /companies`, then `GET /companies/{id}/sip-trunks` per company through CallOps bearer auth |
| Supabase tables | None directly |

Rows are deduped by integer trunk id. This endpoint intentionally keeps the older `{ trunks }` response shape while sourcing data from CallOps-owned company trunks.

### `POST /api/trunks`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Create or update a LiveKit SIP outbound trunk through callops/LiveKit admin |
| Body | `{ name, address, numbers: string[], auth_username, auth_password }` |
| Response | callops trunk response; password is never returned |
| Upstream | `POST $CALLOPS_URL/livekit/trunks` with `X-Webhook-Secret` |
| Missing callops env | **503** `{ error: 'telephony not configured' }` |

All body fields are required. The route intentionally re-POSTs for both create and edit flows because the LiveKit-admin path needs the password on every write. Client validation errors from callops pass through as 4xx; upstream faults are normalized to **502**.

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

### Company-scoped SIP trunk routes

These routes use integer CallOps trunk ids and bearer auth. They back the newer production telephony admin surfaces; credentials are never returned to the browser.

| Route | Auth | Purpose | Upstream |
|-------|------|---------|----------|
| `GET /api/companies/[id]/sip-trunks` | Supabase user | List trunks for one company | `GET /companies/{id}/sip-trunks` |
| `POST /api/companies/[id]/sip-trunks` | Supabase user | Create a company trunk | `POST /companies/{id}/sip-trunks` |
| `GET /api/sip-trunks/[id]` | Supabase user | Fetch one trunk | `GET /sip-trunks/{id}` |
| `PATCH /api/sip-trunks/[id]` | Supabase user | Update one trunk | `PATCH /sip-trunks/{id}` |
| `GET /api/sip-trunks/[id]/health` | Supabase user | Read live trunk health | `GET /sip-trunks/{id}/health` |
| `POST /api/sip-trunks/[id]/archive` | Supabase user | Archive one trunk | `POST /sip-trunks/{id}/archive` |
| `POST /api/sip-trunks/[id]/test-call` | Supabase user | Place a trunk-scoped test call | `POST /sip-trunks/{id}/test-call` |

The compatibility `/api/trunks/[trunk_id]` routes use LiveKit trunk ids (`ST_...`) and `X-Webhook-Secret`; the `/api/sip-trunks/[id]` routes use CallOps integer ids and bearer auth.

### `POST /api/calls/result`

| | |
|---|---|
| Auth | `X-Webhook-Secret` matching `CALLOPS_WEBHOOK_SECRET` |
| Purpose | Secondary reconciliation check for callops outcome ingestion |
| Body | CallOps/agent outcome payload: `{ contact_id?, campaign_id, room_name, outcome, phone?, talk_seconds?, transferred?, business_disposition?, ended_at? }` |
| Response | `{ ok: true, action: 'inserted' | 'exists' | 'skipped' }` |
| Supabase tables | `call_records` via service-role client |

The primary path is still `POST $CALLOPS_URL/calls/outcome`; callops writes the `call_records` row first. callops may forward the same payload here so the dashboard can insert a missing row only when no record exists for `room_name`. Existing rows are never updated by this route. If `CALLOPS_WEBHOOK_SECRET` or the service-role key is missing, the route returns `action: 'skipped'` instead of trusting or writing the payload.

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
| Query | `campaignId?`; omit for a dashboard-wide 45-day company fan-out |
| Response | `{ logs: CallRecord[] }` |
| Upstream | `GET /campaigns/{id}/calls` when scoped; otherwise `GET /companies/{id}/calls?from_date=...` for every visible company |
| Supabase tables | None directly |

The route preserves the existing UI shape and adds `on_air_seconds` from CallOps `duration_seconds`. Campaign-scoped drill-down fetches full history up to the local cap; dashboard-wide feeds are capped and date-bounded to avoid polling multi-year call history every 15 seconds.

### `GET /api/reports`

| | |
|---|---|
| Auth | Supabase user |
| Query | `from?`, `to?`, `product_id?`, legacy `agent?` |
| Response | `{ reports: CampaignReport[] }` |
| Upstream | `GET /companies/{id}/dashboard/campaign-performance` for every visible company, plus campaign/product lookups for display fields |
| Supabase tables | None directly |

CallOps returns raw `by_outcome` counts. This route maps them into the legacy report columns the dashboard renders: `subscribed -> qualified`, `lead -> lead`, `opted_out -> opt_out`, `no_answer -> no_answer`, `voicemail -> voicemail`, and `failed -> failed`. `dialed` comes from CallOps `calls`, `total_spent` from real persisted `total_cost`, and CPL is calculated from `qualified + lead`.

### `GET /api/intents`

| | |
|---|---|
| Auth | Supabase user |
| Query | `campaignId?`, `date?` (default today) |
| Response | `{ day, connectedTotal?, intents[] }` |
| Upstream | `GET /campaigns/{id}/intent-stats?date=...` when scoped; otherwise `GET /companies/{id}/intent-stats?from_date=...&to_date=...` for every visible company |
| Supabase tables | None directly |

### `GET /api/companies`

| | |
|---|---|
| Auth | Supabase user |
| Response | `{ companies: { id, name, contact_name, contact_email, contact_phone }[] }` |
| Upstream | `GET /companies` through CallOps bearer auth |
| Supabase tables | None directly |

### `POST /api/companies`

| | |
|---|---|
| Auth | Supabase user |
| Body | `{ name, contact_name?, contact_email?, contact_phone? }` |
| Response | `{ company }` with status **201** |
| Upstream | `POST /companies` through CallOps bearer auth |
| Supabase tables | None directly |

### Product routes

Products are company-scoped CallOps entities that carry campaign product metadata and script-version history.

| Route | Auth | Purpose | Upstream |
|-------|------|---------|----------|
| `GET /api/products?company_id=...` | Supabase user | List products for one company | `GET /companies/{company_id}/products` |
| `POST /api/products` | Supabase user | Create a product under a company | `POST /companies/{company_id}/products` |
| `GET /api/products/[id]` | Supabase user | Fetch one product | `GET /products/{id}` |
| `PATCH /api/products/[id]` | Supabase user | Update one product | `PATCH /products/{id}` |
| `GET /api/products/[id]/versions` | Supabase user | List script versions | `GET /products/{id}/versions` |
| `POST /api/products/[id]/versions` | Supabase user | Create a script version | `POST /products/{id}/versions` |
| `POST /api/products/[id]/versions/[versionId]/activate` | Supabase user | Promote a version | `POST /products/{id}/versions/{versionId}/activate` |

`GET /api/products` requires `company_id`; the Products view is always scoped to one company at a time.

### `GET /api/leads`

| | |
|---|---|
| Auth | Supabase user |
| Query | `campaignId?` |
| Response | `{ leads, total, double_optin, single_optin }` |
| Upstream | `GET /companies/{id}/leads` for every visible company, optionally filtered by campaign |
| Supabase tables | None directly |

The route enriches lead rows best-effort with campaign/contact names from CallOps. It preserves the UI fields `optin`, `at`, `talk_seconds`, `on_air_seconds`, `disposition`, and real per-call `cost`.

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

When `text` is provided, the route best-effort saves reuse metadata through CallOps `POST /script-library`. Audio upload success is not rolled back if that library write fails.

### `GET /api/scripts`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | List generated campaign script MP3 objects for the campaign edit saved-script picker |
| Response | `{ scripts: [{ storageKey, publicUrl, name, lastModified }] }`; `{ scripts: [] }` when script storage is unconfigured |
| Storage | S3-compatible Supabase storage configured by `AVM_SCRIPT_AUDIO_STORAGE_*` |

### `/api/voice-scripts`

| Route | Auth | Purpose | Upstream |
|-------|------|---------|----------|
| `GET /api/voice-scripts` | Supabase user | List newest 50 reusable voice-script text/audio rows | `GET /script-library?page_size=50` |
| `POST /api/voice-scripts` | Supabase user | Save script reuse metadata after audio has been uploaded | `POST /script-library` |

The browser receives `{ scripts: [{ id, text, voice_id, audio_url, campaign_name, created_at }] }` from the GET route. Script text is required on POST; audio URL and campaign name are optional metadata.

### `/api/script-audio`

| Route | Auth | Purpose | Upstream |
|-------|------|---------|----------|
| `GET /api/script-audio?campaign_id=...` | Supabase user | Fetch the latest per-campaign script/audio record | `GET /script-audio?campaign_id=...&page_size=1` |
| `POST /api/script-audio` | Supabase user | Save generated script audio metadata for a specific campaign | `POST /script-audio` |

This is separate from the global reuse library: `script-audio` is campaign-scoped and requires `campaign_id`; `voice-scripts` is a global reuse list.

### Call detail routes

| Route | Auth | Purpose | Upstream |
|-------|------|---------|----------|
| `GET /api/calls/[id]` | Supabase user | Fetch one call with joined contact/campaign detail | `GET /calls/{id}` |
| `GET /api/calls/[id]/telemetry` | Supabase user | Fetch model-usage telemetry events | `GET /calls/{id}/telemetry` |
| `GET /api/calls/[id]/call-report` | Supabase user | Fetch telephony narrative: AMD, SIP, DTMF, playback, disconnect, transfer, talk time | `GET /calls/{id}/call-report` |
| `GET /api/calls/[id]/recording` | Supabase user | Fetch a signed recording URL | `GET /calls/{id}/recording` |

Empty telemetry is returned as `{ telemetry: [] }`. Recording and call-report 404s pass through so the UI can show unavailable states without inventing data.

### `GET/PATCH /api/settings`

| Route | Auth | Purpose | Upstream |
|-------|------|---------|----------|
| `GET /api/settings` | Supabase user | Read platform settings | `GET /system-settings` |
| `PATCH /api/settings` | Supabase user | Update positive `cost_per_minute_zar` | `PATCH /system-settings` |

CallOps enforces the write authorization policy for settings; this app validates only that `cost_per_minute_zar` is positive before forwarding.

### `GET /api/lookups/[type]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Fetch CallOps vocabulary lists for forms and filters |
| Allowed types | `call-outcomes`, `agent-outcomes`, `business-dispositions`, `contact-statuses`, `campaign-statuses`, `calling-windows`, `timezones` |
| Upstream | `GET /lookups/{type}` |

Unknown lookup types return **400** before any CallOps request is made.

### `POST /api/flow-builder/generate`

| | |
|---|---|
| Auth | None; enabled only when `ANTHROPIC_API_KEY` is set |
| Purpose | Generate a visual campaign flow from a natural-language prompt |
| Body | `{ prompt }` |
| Response | `{ nodes, edges }` using node keys and fields from `components/flow-builder/nodeSpecs.ts` |
| Upstream | Anthropic Messages API with a required `build_flow` tool call |

The route does not persist, execute, or deploy generated flows. It filters Claude's output to real node spec keys and edges that connect returned node ids; invalid or empty results return 502-style generation errors.

---

## Routes Documented Elsewhere But Not Implemented Here

| Route | Status |
|-------|--------|
| `/api/providers` | Not implemented; Settings is informational and telephony admin UI uses local mock data |
| `POST /api/security` | Not implemented |
| `POST /api/simulate` | Not implemented |

The direct LiveKit CLI (`npm run dial`) still exists for diagnostics through `scripts/dial-outbound.ts`. There is no checked-in `POST /api/campaigns/:id/dial` route; production lifecycle must use the CallOps `/start`, `/pause`, and `/stop` proxies.

---

## Supabase Schema Reference

Operational tables are CallOps-owned from this app's point of view. The dashboard usually reaches them through bearer-proxied CallOps routes, not direct Supabase queries.

```text
companies ──────────< products
     │                └──< product_script_versions
     ├──< campaigns ──────────< campaign_contacts >────────── contacts
     │       │
     │       ├──< call_records
     │       ├──< call_logs / campaign-performance
     │       ├──< intent_stats
     │       └──< script_audio
     ├──< sip_trunks
     └──< leads/reporting views

Local direct-Supabase exceptions:
security_logs          dashboard_templates
call_records           fallback writes from livekit/webhook and calls/result
profiles               auth roles/passkeys
storage.buckets        voice-recordings, avm-scripts
```

Direct writes from this repository should stay limited to the exceptions above. Campaigns, contacts, products, reports, intents, leads, SIP trunk records, and script-library metadata should flow through CallOps.

### `campaigns` (relevant columns)

| Column | Used by |
|--------|---------|
| `id`, `name`, `agent`, `status` | Campaign list/create/update, callops lifecycle status |
| `dialing_speed`, `time_window_start`, `time_window_end` | Create/update; scheduling inputs for callops |
| `max_retries`, `retry_cooldown_seconds`, `max_concurrent`, `auto_paused` | Create/update/read; callops owns runtime behavior |
| `sip_trunk_id` | Integer CallOps/Supabase trunk id selected by the campaign wizard |
| `agent_name` | Forwarded as `outbound-recorder` on create |
| `voice_recording_url`, `voice_path`, `audio_path` | Campaign voice prompt/script references |
| `transfer_key`, `transfer_target` | Campaign create metadata |
| `product_id`, `product_version_id`, `voice_id`, `routing_mode`, `network_provider` | Product/script pinning, voice, routing, and carrier-gate controls |
| `company_id` | List join and dashboard filters |

`CampaignStatus` values in TypeScript are `draft`, `running`, `paused`, `stopped`, `completed`, `archived`, `deleted`.

### `contacts` (relevant columns)

| Column | Used by |
|--------|---------|
| `campaign_id`, `phone`, `first_name`, `last_name` | Contact import and callops dispatch |
| `status` | Queue lifecycle: `pending`, `in_progress`, `dialed`, `failed`, `retry` |
| `retry_count`, `last_attempted_at` | Runtime retry state owned by callops |

`campaign_contacts` is the per-campaign membership/status join for reused contacts. Import, dedupe, and network-provider classification are CallOps responsibilities.

### `call_records` (relevant columns)

| Column | Set/read by |
|--------|-------------|
| `campaign_id`, `contact_id`, `phone`, `room` | callops, LiveKit webhook fallback, and reconciliation fallback |
| `outcome` | callops outcome ingestion; LiveKit webhook fallback for `connected`/`no_answer`; reconciliation map for missing rows |
| `talk_seconds`, `transferred`, `cost` | callops outcome ingestion; webhook fallback for talk time |
| `recording_url`, `egress_id` | LiveKit/callops recording flow |
| `called_at` | Dashboard sorting/filtering |

Known outcome values include legacy IVR values (`connected`, `qualified`, `voicemail`, `no_speech`, `hangup`, `ni`, `dnq`, `callback`, `no_answer`, `busy`, `failed`) and callops values added by migration (`answered`, `transferred`).

---

## OpenAPI (`docs/openapi.json`) Alignment

`docs/openapi.json` describes evra-callops, not this Next.js app. The current integration points are:

| callops concept | This app integration |
|-----------------|----------------------|
| `GET /companies`, `POST /companies` | `GET/POST /api/companies` and fan-out source for campaigns/logs/reports/intents/leads |
| `GET /companies/{id}/campaigns`, `POST /companies/{id}/campaigns`, `PATCH /campaigns/{id}`, `POST /campaigns/{id}/archive` | `GET/POST /api/campaigns`, `PUT/DELETE /api/campaigns/[id]` |
| `POST /campaigns/{id}/start` | `POST /api/campaigns/[id]/start` proxy |
| `POST /campaigns/{id}/pause` | `POST /api/campaigns/[id]/pause` proxy |
| `POST /campaigns/{id}/stop` | `POST /api/campaigns/[id]/stop` proxy |
| `GET /campaigns/{id}/status` | `GET /api/campaigns/[id]/status` proxy and UI live stats |
| `GET /campaigns/{id}/contacts`, `POST /campaigns/{id}/contacts/import`, `POST /contacts/{id}/{action}` | Campaign contact list/import/action routes |
| `GET /companies/{id}/dashboard/campaign-performance` | `GET /api/reports` |
| `GET /companies/{id}/calls`, `GET /campaigns/{id}/calls` | `GET /api/logs` |
| `GET /companies/{id}/intent-stats`, `GET /campaigns/{id}/intent-stats` | `GET /api/intents` |
| `GET /companies/{id}/products`, `/products/{id}/versions` | `/api/products/*` |
| `GET /companies/{id}/leads` | `GET /api/leads` |
| `GET /calls/{id}`, `/telemetry`, `/call-report`, `/recording` | `/api/calls/[id]/*` |
| `POST /calls/outcome` | Primary agent outcome endpoint; `POST /api/calls/result` is a secondary callops-forwarded reconciliation fallback |
| `GET /companies/{id}/sip-trunks`, `/sip-trunks/{id}` | `/api/companies/[id]/sip-trunks` and `/api/sip-trunks/*` bearer proxies |
| `GET /livekit/trunks` | LiveKit-admin compatibility surface behind `/api/trunks` |
| `POST /livekit/trunks` | `POST /api/trunks` browser-facing proxy |
| `PATCH /livekit/trunks/{trunk_id}` | `PATCH /api/trunks/[trunk_id]` browser-facing proxy |
| `DELETE /livekit/trunks/{trunk_id}` | `DELETE /api/trunks/[trunk_id]` browser-facing proxy |
| `POST /livekit/test-call` | `POST /api/trunks/test-call` browser-facing proxy and `npm run callops -- test-call ...` diagnostic CLI |
| `GET/PATCH /system-settings` | `GET/PATCH /api/settings` |
| `GET /lookups/{type}` | `GET /api/lookups/[type]` |
| `GET/POST /script-library` | `GET/POST /api/voice-scripts`; best-effort metadata save from `/api/tts/save` |
| `GET/POST /script-audio` | `GET/POST /api/script-audio` campaign-scoped script history |

OpenAPI endpoints for dispatch jobs and rooms are not surfaced directly by this app today.

---

## Environment Variables By Route

| Variable | Routes affected |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | All authenticated Supabase routes |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/livekit/webhook`, `/api/calls/result`, diagnostic scripts, voice signing |
| `CALLOPS_URL` | All CallOps bearer proxies plus lifecycle/status/trunk-admin routes |
| `CALLOPS_WEBHOOK_SECRET` | `/api/campaigns/[id]/start|pause|stop|status`, `GET /api/campaigns/[id]`, `/api/trunks`, `/api/trunks/[trunk_id]`, `/api/trunks/test-call`, `/api/calls/result` |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | `/api/livekit/webhook`, direct diagnostic CLI |
| `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`, `LIVEKIT_AGENT_NAME` | Direct diagnostic CLI |
| `LIVEKIT_RECORD_*` | Direct diagnostic CLI egress path |
| `INWORLD_API_KEY` | `/api/tts/generate` |
| `AVM_SCRIPT_AUDIO_STORAGE_*` | `/api/tts/save`, `/api/scripts` |
| `STS_RELAY_SECRET`, `STS_SDP_BASE_URL`, `STS_GUID_<PRODUCT>` | `/api/sts/mark` |
| `ANTHROPIC_API_KEY` | `/api/flow-builder/generate` |
| `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | `/api/whatsapp/webhook` |

---

## Related Files

| Path | Role |
|------|------|
| `utils/callops.ts` | shared bearer-auth CallOps client and error normalizer |
| `app/api/campaigns/route.ts` | CallOps-backed campaign list/create fan-out |
| `app/api/campaigns/[id]/route.ts` | campaign detail/update/archive proxy |
| `app/api/campaigns/[id]/[action]/route.ts` | callops lifecycle/status proxy |
| `app/api/campaigns/[id]/contacts/route.ts` | campaign contact list and network breakdown proxy |
| `app/api/campaigns/[id]/contacts/import/route.ts` | CallOps contact import proxy |
| `app/api/contacts/[id]/[action]/route.ts` | contact archive/retry/do-not-call proxy |
| `app/api/products/**/*.ts` | company products and script-version proxies |
| `app/api/leads/route.ts` | CallOps lead reporting fan-out |
| `app/api/logs/route.ts` | CallOps call-history proxy with `on_air_seconds` compatibility field |
| `app/api/reports/route.ts` | CallOps campaign-performance fan-out and outcome mapping |
| `app/api/intents/route.ts` | CallOps intent-stats proxy |
| `app/api/trunks/route.ts` | compatibility LiveKit-admin trunk catalog/create proxy |
| `app/api/trunks/[trunk_id]/route.ts` | LiveKit trunk update/delete proxy through callops |
| `app/api/trunks/test-call/route.ts` | one-off SIP test-call proxy through callops |
| `app/api/companies/[id]/sip-trunks/route.ts` | company-scoped SIP trunk list/create proxy |
| `app/api/sip-trunks/[id]/*` | CallOps integer-id trunk detail, health, archive, and test-call routes |
| `app/api/scripts/route.ts` | saved script audio object listing |
| `app/api/voice-scripts/route.ts` | CallOps script-library reuse proxy |
| `app/api/script-audio/route.ts` | campaign-scoped generated script-audio history |
| `app/api/sts/mark/route.ts` | STS subscribe/opt-out relay |
| `app/api/calls/[id]/*` | call detail, telemetry, call-report, and recording proxies |
| `app/api/calls/result/route.ts` | CallOps-forwarded reconciliation fallback |
| `app/api/livekit/webhook/route.ts` | signed LiveKit webhook fallback updates |
| `app/api/flow-builder/generate/route.ts` | Claude flow-builder generation endpoint |
| `app/api/whatsapp/webhook/route.ts` | Meta WhatsApp webhook verification/signature handling |
| `scripts/callops-test.ts` | callops smoke/integration test harness |
| `scripts/dial-outbound.ts` | direct LiveKit diagnostic dial script |
| `lib/outbound-call.ts` | direct LiveKit SDK helpers |
| `lib/voice.ts` | voice URL resolution/signing helpers |
| `utils/supabase/auth.ts` | session auth helper |
| `utils/supabase/admin.ts` | service-role client |
| `supabase/migrations/*.sql` | schema source of truth |
| `docs/openapi.json` | evra-callops API contract |
