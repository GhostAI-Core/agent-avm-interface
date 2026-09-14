# Agent AVM Interface — API Reference & Alignment Guide

This document describes the Next.js Route Handlers under `app/api/`, how they relate to **evra-callops**, and which persistence or upstream systems they touch.

---

## Executive Summary

| Layer | What it is | Role |
|-------|------------|------|
| `app/api/` (this repo) | Next.js Route Handlers | Dashboard facade, auth-gated callops proxies, lifecycle proxy, TTS/script reuse, STS relay, WhatsApp webhook, LiveKit webhook fallback |
| `docs/openapi.json` | OpenAPI 3.1 for **evra-callops** | Campaign dispatcher, queue stats, call outcome/telemetry ingestion, LiveKit admin API |
| Supabase | PostgreSQL + Auth + Storage | Auth/session source plus selected app-owned tables/storage; callops owns most operational campaign/contact/call data |

This app is no longer the production dialer. `app/api/campaigns/[id]/[action]/route.ts` proxies lifecycle actions to evra-callops, and callops owns dispatch, pacing, retries, LiveKit SIP calls, products, contacts, call history, reports, leads, SIP trunk administration, and agent outcome ingestion.

```text
Browser
  │ authenticated fetch
  ▼
app/api/*
  ├─ Bearer-token callops routes: companies, campaigns, products, contacts, leads, reports, logs, calls, SIP trunks, settings, scripts
  ├─ Supabase session/storage routes: dashboard templates, security logs, generated TTS upload helpers
  ├─ POST /api/campaigns/{id}/start|pause|stop ──X-Webhook-Secret──► evra-callops
  ├─ GET  /api/campaigns/{id}/status            ──X-Webhook-Secret──► evra-callops
  ├─ /api/trunks/*                              ──X-Webhook-Secret──► callops LiveKit admin compatibility routes
  ├─ POST /api/sts/mark                         ──optional x-relay-secret──► STS SDP
  ├─ GET/POST /api/whatsapp/webhook             ──Meta verify token / HMAC signature
  ├─ POST /api/livekit/webhook ◄──────────── signed LiveKit room events
  └─ POST /api/calls/result ◄──X-Webhook-Secret── callops reconciliation backfill
```

---

## Authentication Model

| Auth type | Header / mechanism | Routes |
|-----------|--------------------|--------|
| Supabase session | Cookie from `createServerClient`; validated via `getAuthUser()` | Browser-facing app routes |
| Supabase access token | Session token read server-side via `getAccessToken()` and forwarded as `Authorization: Bearer` | Most callops CRUD/read proxy routes; callops enforces company scope |
| `X-Webhook-Secret` | Sent server-side from this app to `CALLOPS_URL` | callops lifecycle/status/trunk admin/test-call cross-checks |
| `X-Webhook-Secret` | Received from callops | `POST /api/calls/result` reconciliation |
| `x-relay-secret` | Optional shared secret checked when `STS_RELAY_SECRET` is set | `POST /api/sts/mark` |
| LiveKit webhook JWT | `Authorization` header; validated by `WebhookReceiver` | `POST /api/livekit/webhook` |
| Meta verify token / HMAC | `hub.verify_token` for GET; `x-hub-signature-256` for POST | `GET/POST /api/whatsapp/webhook` |
| None | Public | `GET /api/health`, `POST /api/flow-builder/generate`; `POST /api/sts/mark` only when `STS_RELAY_SECRET` is unset |

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
| Purpose | List campaigns the user can access |
| Response | `{ campaigns: Campaign[] }`; joins `companies.name` as flattened `company` |
| Upstream | Fans out over callops `GET /companies` then `GET /companies/{id}/campaigns` |
| Persistence | callops-owned campaign/company data |

### `POST /api/campaigns`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Create a campaign and optional contacts |
| Body | `{ name, company_id, agent?, dialing_speed?, window_start?, window_end?, audio_path?, voice_recording_url?, transfer_key?, transfer_target?, max_concurrent?, max_retries?, retry_cooldown_seconds?, sip_trunk_id?, network_provider?, voice_id?, routing_mode?, product_id?, product_version_id?, contacts?[] }` |
| Response | callops create response with status **201**; includes contact import counts when callops returns them |
| Validation | `name` and `company_id` required; local route drops contact rows without `phone`, then callops owns normalization/dedupe/rejection reporting |
| Upstream | `POST /companies/{company_id}/campaigns` with user bearer token |

Create-time details:

| Field | Behavior |
|-------|----------|
| `agent_name` | Always stored as `outbound-recorder`, the deployed LiveKit worker callops dispatches |
| `sip_trunk_id` | Callops trunk identifier selected in the campaign wizard |
| `max_concurrent`, `max_retries`, `retry_cooldown_seconds` | Coerced to integers with defaults `5`, `2`, `3600` |
| `window_start`, `window_end` | Stored as `time_window_start`, `time_window_end` |
| `audio_path` | Treated as `voice_recording_url` so the dispatcher can fetch generated script audio |
| `product_id`, `product_version_id` | Allow callops to derive product script, consent flow, STS key, agent, voice recording, and voice ID |
| `contacts` | Forwarded to callops; callops owns E.164 normalization, dedupe, and campaign contact storage |

### `GET /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Read campaign detail/summary from callops for drill-down UI |
| Response | `{ summary, campaign }`; returns `{ mode: 'unconfigured', summary: null }` when callops env is missing |
| Upstream | `GET $CALLOPS_URL/campaigns/{id}` with `X-Webhook-Secret` |
| Notes | The `summary` block carries aggregates such as `contacts_total`, `pending`, `in_progress`, `dialed`, `failed`, `retry`, `calls_total`, `connected`, and `opt_out` |

### `PUT /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Partial campaign update for non-lifecycle fields through callops |
| Allowed fields | `name`, `agent`, `dialing_speed`, `time_window_start`, `time_window_end`, `max_concurrent`, `max_retries`, `retry_cooldown_seconds`, `sip_trunk_id`, `voice_recording_url`, `voice_path`, `transfer_key`, `transfer_target`, `network_provider`, `voice_id`, `routing_mode`, `product_id`, `product_version_id`; `audio_path` maps to `voice_recording_url` |
| Response | `{ campaign }` |
| Upstream | `PATCH /campaigns/{id}` with user bearer token |

Lifecycle controls must use `/start`, `/pause`, and `/stop` so callops can own dispatch state. Direct `PUT { status }` is intentionally rejected by the field allow-list.

### `DELETE /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Soft archive |
| Behavior | Calls callops archive endpoint; there is no hard delete in v1 |
| Response | `{ success: true }` |
| Upstream | `POST /campaigns/{id}/archive` with user bearer token |

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
| Persistence | Fallback only: updates local `campaigns.status`; `start` also clears `auto_paused` |

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
| Persistence | None in this app |

The UI polls this route for running/paused campaigns and expects counters such as `active_calls`, `queued`, `pending`, `in_progress`, `dialed`, `failed`, `retry`, `completed_today`, and optional `auto_paused`.

There is no `POST /api/campaigns/[id]/dial` route in the current app. The direct LiveKit CLI (`npm run dial`) remains available for diagnostics through `scripts/dial-outbound.ts`, but production operators should use `/start`, `/pause`, and `/stop`.

### `GET /api/campaigns/[id]/contacts`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | List contacts for one campaign |
| Query | `status?`, `search?`, `network_provider?`, paging params forwarded to callops |
| Response | callops contact list envelope plus best-effort network breakdown |
| Upstream | `GET /campaigns/{id}/contacts` and `GET /campaigns/{id}/contacts/network-breakdown` with user bearer token |

### `POST /api/campaigns/[id]/contacts/import`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Bulk import contacts for one campaign |
| Body | `{ contacts: [{ phone, first_name?, last_name?, external_id? }], dedupe?, source? }` |
| Response | callops import summary |
| Validation | Rejects an empty contact list with **400** |
| Upstream | `POST /campaigns/{id}/contacts/import` with user bearer token |

### `POST /api/contacts/[id]/archive|retry|do-not-call`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Per-contact row action from the Contacts view |
| Allowed actions | `archive`, `retry`, `do-not-call` |
| Upstream | `POST /contacts/{id}/{action}` with user bearer token |

### Product routes

Products are company-scoped callops entities. They bundle campaign script/version metadata with the consent-flow configuration that callops can apply during campaign create/update.

| Route | Auth | Purpose | Upstream |
|-------|------|---------|----------|
| `GET /api/products?company_id=...` | User | List products for one company | `GET /companies/{company_id}/products` |
| `POST /api/products` | User | Create a product; requires `company_id` and `name` | `POST /companies/{company_id}/products` |
| `GET /api/products/[id]` | User | Product detail | `GET /products/{id}` |
| `PATCH /api/products/[id]` | User | Product update | `PATCH /products/{id}` |
| `GET /api/products/[id]/versions` | User | Product script version history | `GET /products/{id}/versions` |
| `POST /api/products/[id]/versions` | User | Create a product script version | `POST /products/{id}/versions` |
| `POST /api/products/[id]/versions/[versionId]/activate` | User | Promote or roll back to one version | `POST /products/{id}/versions/{versionId}/activate` |

### `GET /api/trunks`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | SIP trunk catalog for the campaign wizard |
| Response | `{ trunks: [{ id, name, from_number, live }] }` |
| Supabase tables | `sip_trunks` |
| Upstream | Optional `GET $CALLOPS_URL/livekit/trunks` cross-check |

If callops is configured and reachable, only Supabase rows backed by a live LiveKit trunk are returned. If callops is unconfigured or unreachable, the full Supabase catalog is returned so campaign creation is not blocked.

`/api/trunks/*` are compatibility routes for the older campaign wizard and local telephony helpers. New company-scoped trunk management in `SipTrunksPanel` uses `/api/companies/[id]/sip-trunks` and `/api/sip-trunks/[id]/*`.

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

### Company-scoped SIP trunk routes

| Route | Auth | Purpose | Upstream |
|-------|------|---------|----------|
| `GET /api/companies/[id]/sip-trunks` | User | List/search/paginate one company's SIP trunks | `GET /companies/{id}/sip-trunks` |
| `POST /api/companies/[id]/sip-trunks` | User | Create a SIP trunk; credentials are create-only and never returned | `POST /companies/{id}/sip-trunks` |
| `GET /api/sip-trunks/[id]` | User | SIP trunk detail | `GET /sip-trunks/{id}` |
| `PATCH /api/sip-trunks/[id]` | User | Partial SIP trunk update | `PATCH /sip-trunks/{id}` |
| `POST /api/sip-trunks/[id]/archive` | User | Archive one SIP trunk | `POST /sip-trunks/{id}/archive` |
| `GET /api/sip-trunks/[id]/health` | User | Live trunk health/status | `GET /sip-trunks/{id}/health` |
| `POST /api/sip-trunks/[id]/test-call` | User | Place a test call through a configured trunk | `POST /sip-trunks/{id}/test-call` |

### `POST /api/calls/result`

| | |
|---|---|
| Auth | `X-Webhook-Secret` matching `CALLOPS_WEBHOOK_SECRET` |
| Purpose | Secondary reconciliation endpoint for callops outcome forwards |
| Body | callops/agent outcome shape: `{ contact_id?, campaign_id, room_name, outcome, phone?, talk_seconds?, transferred?, business_disposition?, ended_at? }` |
| Behavior | Checks for an existing `call_records` row by `room`; inserts a backfill only when callops' primary write is missing |
| Response | `{ ok: true, action: 'inserted' | 'exists' | 'skipped' }` |
| Replacement | LiveKit agents should POST outcomes to `POST $CALLOPS_URL/calls/outcome` |

This is a safety net for callops-to-dashboard forwarding, not a public agent contract. If `CALLOPS_WEBHOOK_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` is missing, the route acknowledges with `action: 'skipped'` rather than trusting or writing the payload.

### Call detail routes

| Route | Auth | Purpose | Upstream |
|-------|------|---------|----------|
| `GET /api/calls/[id]` | User | Single call detail with contact/campaign context | `GET /calls/{id}` |
| `GET /api/calls/[id]/call-report` | User | Call report, disconnect reason, transfer target, and timing detail | `GET /calls/{id}/call-report` |
| `GET /api/calls/[id]/recording` | User | Signed recording URL and expiry | `GET /calls/{id}/recording` |
| `GET /api/calls/[id]/telemetry` | User | Per-call model/tool telemetry array | `GET /calls/{id}/telemetry` |

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
| Query | `campaignId?`; omit for dashboard-wide feed |
| Response | `{ logs: CallRecord[] }`; maps callops `duration_seconds` to `on_air_seconds` |
| Upstream | `campaignId` -> `GET /campaigns/{id}/calls`; otherwise fans out over `GET /companies/{id}/calls` for each user company |
| Constraints | Dashboard-wide feed asks callops for the last 45 days and caps the merged response at 5000 rows |

### `GET /api/reports`

| | |
|---|---|
| Auth | Supabase user |
| Query | `agent?`, `product_id?`, `from?`, `to?` |
| Response | `{ reports: CampaignReport[] }`; maps callops `by_outcome` counts into dashboard columns |
| Upstream | Fans out over `GET /companies/{id}/dashboard/campaign-performance`, `GET /companies/{id}/campaigns`, and `GET /companies/{id}/products` |
| Notes | `from`/`to` become callops `from_date`/`to_date`; rows with zero `dialed` calls are omitted |

### `GET /api/intents`

| | |
|---|---|
| Auth | Supabase user |
| Query | `campaignId?`, `date?` (default today) |
| Response | `{ day, connectedTotal?, intents[] }` |
| Upstream | `campaignId` -> `GET /campaigns/{id}/intent-stats`; otherwise fans out over `GET /companies/{id}/intent-stats` |

### `GET /api/leads`

| | |
|---|---|
| Auth | Supabase user |
| Query | `campaignId?` |
| Response | `{ leads, total, double_optin, single_optin }`; each lead includes phone, optional contact/campaign names, opt-in type, timestamp, talk duration, disposition, and cost |
| Upstream | Fans out over callops `GET /companies/{id}/leads`; enriches campaign/contact names via callops campaign/contact reads |
| Constraints | Caps merged leads at 5000 rows |

### `GET /api/companies`

| | |
|---|---|
| Auth | Supabase user |
| Response | `{ companies: { id, name, contact_name, contact_email, contact_phone }[] }` |
| Upstream | `GET /companies` with user bearer token |

### `POST /api/companies`

| | |
|---|---|
| Auth | Supabase user |
| Body | `{ name, contact_name?, contact_email?, contact_phone? }` |
| Response | `{ company }` with status **201** |
| Upstream | `POST /companies` with user bearer token |

### `GET/PATCH /api/settings`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Read or update global platform settings currently used for call cost estimation |
| GET upstream | `GET /system-settings` |
| PATCH body | `{ cost_per_minute_zar }`; must be a positive number |
| PATCH upstream | `PATCH /system-settings` |

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

### `/api/script-audio`

| Route | Auth | Purpose | Upstream |
|-------|------|---------|----------|
| `GET /api/script-audio?campaign_id=...` | User | Fetch the newest per-campaign script/audio history item | `GET /script-audio?campaign_id=...&page_size=1` |
| `POST /api/script-audio` | User | Record generated script audio/text against a campaign | `POST /script-audio` |

POST requires `campaign_id` and `audio_url`; optional fields are `text`, `voice`, and `duration_seconds`.

### `GET /api/scripts`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | List generated campaign script MP3 objects for the campaign edit saved-script picker |
| Response | `{ scripts: [{ storageKey, publicUrl, name, lastModified }] }`; `{ scripts: [] }` when script storage is unconfigured |
| Storage | S3-compatible Supabase storage configured by `AVM_SCRIPT_AUDIO_STORAGE_*` |

### `GET/POST /api/voice-scripts`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | List or create saved voice script metadata for voice-generator reuse |
| GET upstream | callops script-library route; returns reusable script rows |
| POST upstream | callops script-library route; audio bytes are already uploaded by `/api/tts/save` |

### `GET/POST /api/whatsapp/webhook`

| | |
|---|---|
| Auth | Meta verification token for GET; `x-hub-signature-256` HMAC using `WHATSAPP_APP_SECRET` for POST |
| Purpose | WhatsApp Cloud API webhook verification plus inbound message/status logging |
| GET behavior | Echoes `hub.challenge` as `text/plain` when `hub.mode=subscribe` and `hub.verify_token` matches `WHATSAPP_WEBHOOK_VERIFY_TOKEN` |
| POST behavior | Verifies the raw request body signature, ACKs signed malformed JSON, logs inbound messages and delivery errors |
| Constraint | Opt-out-like messages are logged but not yet relayed to callops/STS suppression because the route cannot currently resolve product/campaign context from the sender alone |

### `POST /api/flow-builder/generate`

| | |
|---|---|
| Auth | None |
| Purpose | Generate visual-only flow-builder nodes/edges from a natural-language prompt |
| Env | `ANTHROPIC_API_KEY` required; missing key returns **400** |
| Constraint | Claude is constrained to the node specs from `components/flow-builder/nodeSpecs.ts`; returned edges must reference returned node IDs |

---

## Routes Documented Elsewhere But Not Implemented Here

| Route | Status |
|-------|--------|
| `POST /api/campaigns/:id/dial` | Removed; use callops lifecycle routes or `npm run dial` for direct LiveKit diagnostics |
| `/api/providers` | Not implemented; provider/admin tabs outside SIP trunks remain local mock UI |
| `POST /api/security` | Not implemented |
| `POST /api/simulate` | Not implemented |

The direct LiveKit CLI (`npm run dial`) still exists for diagnostics through `scripts/dial-outbound.ts`, but the browser no longer has a direct batch-dial route.

---

## Persistence Model Reference

Most operational routes now read or write through callops. Supabase remains visible in this repository because it provides authentication/session cookies, dashboard template persistence, generated audio storage helpers, security logs, and fallback webhook/reconciliation writes. Callops still persists much of this data in Supabase behind its API, but browser-facing routes should treat callops as the owner unless the route source explicitly uses a Supabase client.

Representative operational entities:

```text
companies ──────────< products ──────────< product_script_versions
     │
     ├──────────────< campaigns ─────────< campaign_contacts >──────── contacts
                         │
                         ├──< call_records
                         ├──< call_logs
                         └──< intent_stats

script_library          script_audio
sip_trunks              dashboard_templates     security_logs
profiles               storage.buckets: voice-recordings, avm-scripts
```

### `campaigns` (relevant columns)

| Column | Used by |
|--------|---------|
| `id`, `name`, `agent`, `status` | Campaign list/create/update, callops lifecycle status |
| `dialing_speed`, `time_window_start`, `time_window_end` | Create/update; scheduling inputs for callops |
| `max_retries`, `retry_cooldown_seconds`, `max_concurrent`, `auto_paused` | Create/update/read; callops owns runtime behavior |
| `sip_trunk_id` | Selected by the campaign wizard; callops resolves/validates the trunk |
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

`campaign_contacts` is the per-campaign membership/status join for reused contacts. Contact creation, status transitions, dedupe, and do-not-call handling are callops-owned from the dashboard's point of view.

### `call_records` (relevant columns)

| Column | Set/read by |
|--------|-------------|
| `campaign_id`, `contact_id`, `phone`, `room` | callops outcome ingestion and `/api/calls/result` reconciliation |
| `outcome` | callops outcome ingestion; LiveKit webhook fallback for `connected`/`no_answer` |
| `talk_seconds`, `transferred`, `cost` | callops outcome ingestion; webhook fallback for talk time |
| `recording_url`, `egress_id` | LiveKit/callops recording flow |
| `called_at` | Dashboard sorting/filtering |

Known outcome values include `connected`, `subscribed`, `lead`, `voicemail`, `no_answer`, `failed`, `hangup`, `no_speech`, `callback`, `opted_out`, and `transferred`; UI mappings normalize only the buckets each report currently renders.

---

## OpenAPI (`docs/openapi.json`) Alignment

`docs/openapi.json` describes evra-callops, not this Next.js app. The current integration points are:

| callops concept | This app integration |
|-----------------|----------------------|
| `POST /campaigns/{id}/start` | `POST /api/campaigns/[id]/start` proxy |
| `POST /campaigns/{id}/pause` | `POST /api/campaigns/[id]/pause` proxy |
| `POST /campaigns/{id}/stop` | `POST /api/campaigns/[id]/stop` proxy |
| `GET /campaigns/{id}/status` | `GET /api/campaigns/[id]/status` proxy and UI live stats |
| `GET/PATCH /campaigns/{id}` | `GET/PUT /api/campaigns/[id]` campaign detail/summary and edit proxy |
| `GET /campaigns/{id}/contacts` | `GET /api/campaigns/[id]/contacts` contact list proxy |
| `POST /campaigns/{id}/contacts/import` | `POST /api/campaigns/[id]/contacts/import` bulk import proxy |
| `GET /companies/{id}/products`, `/products/{id}` | `/api/products*` product/script-version proxies |
| `GET /companies/{id}/dashboard/campaign-performance` | `GET /api/reports` fan-out proxy |
| `GET /companies/{id}/calls`, `GET /campaigns/{id}/calls` | `GET /api/logs` fan-out or campaign detail proxy |
| `GET /companies/{id}/leads` | `GET /api/leads` fan-out proxy |
| `GET /calls/{id}` and call report/recording/telemetry subroutes | `/api/calls/[id]*` detail proxies |
| `POST /calls/outcome` | Primary agent outcome contract; `/api/calls/result` is only callops-forwarded reconciliation |
| `GET /livekit/trunks` | Optional cross-check in `GET /api/trunks` |
| `POST /livekit/trunks` | `POST /api/trunks` browser-facing proxy |
| `PATCH /livekit/trunks/{trunk_id}` | `PATCH /api/trunks/[trunk_id]` browser-facing proxy |
| `DELETE /livekit/trunks/{trunk_id}` | `DELETE /api/trunks/[trunk_id]` browser-facing proxy |
| `POST /livekit/test-call` | `POST /api/trunks/test-call` browser-facing proxy and `npm run callops -- test-call ...` diagnostic CLI |
| `GET/POST /companies/{id}/sip-trunks`, `/sip-trunks/{id}/*` | Company-scoped SIP trunk management used by `SipTrunksPanel` |
| `GET/PATCH /system-settings` | `GET/PATCH /api/settings` cost-per-minute setting |

Dispatch jobs and rooms are not surfaced directly by this app today.

---

## Environment Variables By Route

| Variable | Routes affected |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | All authenticated Supabase routes |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/livekit/webhook`, diagnostic scripts, voice signing |
| `CALLOPS_URL` | All bearer-token callops proxy routes |
| `CALLOPS_WEBHOOK_SECRET` | `/api/campaigns/[id]/start|pause|stop|status`, `/api/trunks`, `/api/trunks/[trunk_id]`, `/api/trunks/test-call`, `/api/calls/result` |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | `/api/livekit/webhook`, direct diagnostic CLI |
| `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`, `LIVEKIT_AGENT_NAME` | Direct diagnostic CLI |
| `LIVEKIT_RECORD_*` | Direct diagnostic CLI egress path |
| `INWORLD_API_KEY` | `/api/tts/generate` |
| `AVM_SCRIPT_AUDIO_STORAGE_*` | `/api/tts/save`, `/api/scripts` |
| `STS_RELAY_SECRET`, `STS_SDP_BASE_URL`, `STS_GUID_<PRODUCT>` | `/api/sts/mark` |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | `/api/whatsapp/webhook` |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_GRAPH_VERSION` | WhatsApp send client in `lib/whatsapp/client.ts` |
| `ANTHROPIC_API_KEY` | `/api/flow-builder/generate` |

---

## Related Files

| Path | Role |
|------|------|
| `app/api/campaigns/[id]/[action]/route.ts` | callops lifecycle/status proxy |
| `app/api/campaigns/route.ts` | campaign list/create fan-out and create proxy |
| `app/api/campaigns/[id]/route.ts` | campaign summary, edit, and archive proxy |
| `app/api/campaigns/[id]/contacts/route.ts` | campaign contact list proxy |
| `app/api/campaigns/[id]/contacts/import/route.ts` | bulk contact import proxy |
| `app/api/products/**/route.ts` | product and product script-version proxies |
| `app/api/trunks/route.ts` | SIP trunk catalog and create proxy for campaign wizard/telephony admin |
| `app/api/trunks/[trunk_id]/route.ts` | LiveKit trunk update/delete proxy through callops |
| `app/api/trunks/test-call/route.ts` | one-off SIP test-call proxy through callops |
| `app/api/companies/[id]/sip-trunks/route.ts` | company-scoped SIP trunk list/create proxy |
| `app/api/sip-trunks/[id]/**/route.ts` | company-scoped trunk detail/update/archive/health/test-call proxies |
| `app/api/calls/[id]/**/route.ts` | call detail, report, recording, and telemetry proxies |
| `app/api/logs/route.ts` | call history proxy and dashboard feed windowing |
| `app/api/reports/route.ts` | campaign-performance fan-out and outcome mapping |
| `app/api/leads/route.ts` | lead-gen report fan-out and enrichment |
| `app/api/script-audio/route.ts` | per-campaign generated script/audio history proxy |
| `app/api/scripts/route.ts` | saved script audio object listing |
| `app/api/voice-scripts/route.ts` | saved script text/audio reuse library proxy |
| `app/api/sts/mark/route.ts` | STS subscribe/opt-out relay |
| `app/api/calls/result/route.ts` | callops-forwarded reconciliation endpoint |
| `app/api/whatsapp/webhook/route.ts` | WhatsApp Cloud API verification and event ACK |
| `app/api/flow-builder/generate/route.ts` | visual-only AI flow generation |
| `app/api/livekit/webhook/route.ts` | signed LiveKit webhook fallback updates |
| `scripts/callops-test.ts` | callops smoke/integration test harness |
| `scripts/dial-outbound.ts` | direct LiveKit diagnostic dial script |
| `lib/outbound-call.ts` | direct LiveKit SDK helpers |
| `lib/voice.ts` | voice URL resolution/signing helpers |
| `utils/supabase/auth.ts` | session auth helper |
| `utils/supabase/admin.ts` | service-role client |
| `supabase/migrations/*.sql` | schema source of truth |
| `docs/openapi.json` | evra-callops API contract |
