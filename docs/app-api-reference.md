# Agent AVM Interface — API Reference & Alignment Guide

This document describes the Next.js Route Handlers under `app/api/`, how they relate to **evra-callops**, and which Supabase tables they read or write.

---

## Executive Summary

| Layer | What it is | Role |
|-------|------------|------|
| `app/api/` (this repo) | Next.js Route Handlers | Auth-gated browser facade; forwards operational reads/writes to CallOps; keeps secrets server-side |
| `utils/callops.ts` | Server-side CallOps bearer client | Sends the user's Supabase access token to `CALLOPS_URL`; normalizes CallOps errors for the UI |
| `docs/openapi.json` | OpenAPI 3.1 for **evra-callops** | Campaign dispatcher, queue stats, contacts, reports, products, script audio/library, call outcome/telemetry, LiveKit admin API |
| Supabase | Auth + PostgreSQL + Storage | Browser auth/session; shared persistence behind CallOps; direct dashboard writes only for the exception routes below |

This app is no longer the production dialer or the operational database client. CallOps owns campaign/contact/trunk/product/report data access, dispatch, pacing, retries, LiveKit SIP calls, and agent outcome ingestion. Supabase remains directly used by this repo for authentication, dashboard templates, security logs, voice/script storage helpers, LiveKit webhook fallback updates, and `POST /api/calls/result` reconciliation.

```text
Browser
  │ authenticated fetch
  ▼
app/api/*
  ├─ Bearer token ──► utils/callops.ts ──► evra-callops operational API
  ├─ POST /api/campaigns/{id}/start|pause|stop ──X-Webhook-Secret──► evra-callops
  ├─ GET  /api/campaigns/{id}/status            ──X-Webhook-Secret──► evra-callops
  ├─ /api/trunks/*                              ──X-Webhook-Secret──► callops LiveKit admin
  ├─ POST /api/sts/mark                         ──optional x-relay-secret──► STS SDP
  ├─ POST /api/livekit/webhook ◄──────────── signed LiveKit room events
  └─ POST /api/calls/result ◄─────────────── CallOps reconciliation forward
```

---

## Authentication Model

| Auth type | Header / mechanism | Routes |
|-----------|--------------------|--------|
| Supabase session | Cookie from `createServerClient`; validated via `getAuthUser()` | Dashboard CRUD/read routes, lifecycle proxy, trunk catalog/admin proxies, script library |
| `X-Webhook-Secret` | Sent server-side from this app to `CALLOPS_URL` | callops lifecycle/status/trunk admin/test-call cross-checks |
| `x-relay-secret` | Optional shared secret checked when `STS_RELAY_SECRET` is set | `POST /api/sts/mark` |
| LiveKit webhook JWT | `Authorization` header; validated by `WebhookReceiver` | `POST /api/livekit/webhook` |
| None | Public | `GET /api/health`; `POST /api/sts/mark` only when `STS_RELAY_SECRET` is unset |

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
| Purpose | List active campaigns for the dashboard |
| Response | `{ campaigns: Campaign[] }`; joins `companies.name` as flattened `company` |
| Upstream | `GET /companies`, then `GET /companies/{id}/campaigns` for each company via bearer token |
| Supabase tables | None in this app |

### `POST /api/campaigns`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Create a campaign and optional contacts |
| Body | `{ name, company_id, agent?, sip_trunk_id?, audio_path?, voice_recording_url?, voice_id?, dialing_speed?, window_start?, window_end?, transfer_key?, transfer_target?, max_concurrent?, max_retries?, retry_cooldown_seconds?, network_provider?, routing_mode?, product_id?, product_version_id?, contacts?[] }` |
| Response | CallOps create response, usually `{ campaign, contacts_imported, contacts_rejected }`, with status **201** |
| Validation | `name` and `company_id` required by this route; CallOps owns phone normalization, dedupe, contact linking, and product/campaign validation |
| Upstream | `POST /companies/{company_id}/campaigns` via bearer token |
| Supabase tables | None in this app |

Create-time details:

| Field | Behavior |
|-------|----------|
| `agent_name` | Always stored as `outbound-recorder`, the deployed LiveKit worker callops dispatches |
| `sip_trunk_id` | Integer trunk row id; CallOps resolves it to a LiveKit `ST_...` trunk |
| `max_concurrent`, `max_retries`, `retry_cooldown_seconds` | Coerced to integers with defaults `5`, `2`, `3600` |
| `window_start`, `window_end` | Stored as `time_window_start`, `time_window_end` |
| `audio_path` / `voice_recording_url` | The wizard may send `audio_path`; this route forwards it as `voice_recording_url`, the dispatcher-read column |
| `voice_id` | Forwarded for CallOps to persist when supported; used by the agent for voice-matched consent confirmation audio |
| `network_provider` | Optional dial gate (`Vodacom`, `MTN`, `Cell C`); CallOps only enqueues matching contacts |
| `product_id`, `product_version_id` | Optional product/script pointer. CallOps resolves product fields at save time; `product_version_id` pins a version, while omission tracks the product's current version at save time |
| `contacts` | Forwarded verbatim after dropping entries without `phone`; no local `campaign_contacts` write remains |

### `GET /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Read campaign detail summary aggregates for Campaign Detail |
| Response | `{ summary, campaign }`; `{ mode: 'unconfigured', summary: null }` when CallOps env is missing |
| Upstream | `GET $CALLOPS_URL/campaigns/{id}` with `X-Webhook-Secret` |
| Supabase tables | None in this app |

The `summary` block is the authoritative source for detail counters such as `contacts_total`, `connected`, `opt_out`, and `calls_total`.

### `PUT /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Partial campaign update for non-lifecycle fields |
| Allowed fields | `name`, `agent`, `dialing_speed`, `time_window_start`, `time_window_end`, `max_concurrent`, `max_retries`, `retry_cooldown_seconds`, `sip_trunk_id`, `voice_recording_url`, `voice_path`, `audio_path`, `transfer_key`, `transfer_target`, `network_provider`, `voice_id`, `routing_mode`, `product_id`, `product_version_id` |
| Response | `{ campaign }` |
| Upstream | `PATCH /campaigns/{id}` via bearer token |
| Supabase tables | None in this app |

Lifecycle controls must use `/start`, `/pause`, and `/stop` so callops can own dispatch state. Direct `PUT { status }` is intentionally rejected by the field allow-list.

### `DELETE /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Soft archive |
| Behavior | Proxies archive to CallOps |
| Response | `{ success: true }` |
| Upstream | `POST /campaigns/{id}/archive` via bearer token |
| Supabase tables | None in this app |

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

### `GET /api/campaigns/[id]/contacts`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Paginated campaign contact list plus whole-campaign network breakdown |
| Query | `status?`, `network?`, `search?`/`phone?`, `page?` (default 1), `page_size?` (default 100, max 200) |
| Response | `{ items, page, page_size, total, breakdown }` where `breakdown` maps network label to count |
| Upstream | `GET /campaigns/{id}/contacts` and `GET /campaigns/{id}/contacts/network-breakdown` via bearer token |
| Supabase tables | None in this app |

The `network` query is forwarded as `network_provider`. The breakdown is intentionally not filtered by status/search/network so operators can see the full campaign mix before setting a dial gate.

### `POST /api/campaigns/[id]/contacts/import`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Import contacts into a campaign |
| Upstream | `POST /campaigns/{id}/contacts/import` via bearer token |
| Supabase tables | None in this app |

### `POST /api/contacts/[id]/archive|retry|do-not-call`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Contact row actions from Contacts view |
| Upstream | `POST /contacts/{id}/{action}` via bearer token |
| Supabase tables | None in this app |

### `GET /api/trunks`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | SIP trunk catalog for the campaign wizard |
| Response | `{ trunks: [{ id, name, from_number, live }] }` |
| Upstream | `GET /companies`, then `GET /companies/{id}/sip-trunks` for each company via bearer token |
| Supabase tables | None in this app |

The route deduplicates trunks by integer id after fanning out over the user's companies. Campaigns store this integer id; CallOps resolves it to LiveKit trunk credentials.

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
| Auth | `X-Webhook-Secret: $CALLOPS_WEBHOOK_SECRET` |
| Purpose | Secondary reconciliation for missed CallOps primary outcome writes |
| Behavior | Checks `call_records` by `room_name`; inserts only if no row exists; never updates an existing row |
| Response | `{ ok, action: 'inserted' | 'exists' | 'skipped' }` |
| Supabase tables | `call_records` through the service-role client |

Agents should still report outcomes to `POST $CALLOPS_URL/calls/outcome`. This route is a safety net for a CallOps forward after the primary write path, not a public or browser-facing API.

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
| Query | `campaignId?`; omit for dashboard-wide recent calls |
| Response | `{ logs: CallRecord[] }` |
| Upstream | `GET /campaigns/{id}/calls` when `campaignId` is set; otherwise `GET /companies/{id}/calls?from_date=...` for each company via bearer token |
| Supabase tables | None in this app |

Dashboard-wide reads are bounded to the last 45 days and up to 5000 rows to avoid polling multi-year call history every refresh. Campaign drill-down reads the campaign's full call history.

### `GET /api/reports`

| | |
|---|---|
| Auth | Supabase user |
| Query | `product_id?` preferred; `agent?` legacy fallback |
| Ignored query | `date` is not consumed today; CallOps `campaign-performance` is an all-time roll-up |
| Response | `{ reports: CampaignReport[] }` with product enrichment under `campaign.product_id` and `campaign.product_name` |
| Upstream | For each company: `GET /dashboard/campaign-performance`, `GET /campaigns`, and `GET /products` via bearer token |
| Supabase tables | None in this app |

The route maps CallOps `by_outcome` into the dashboard's legacy report columns (`connected`, `qualified`, `opt_out`, `no_answer`, `voicemail`, `failed`, `lead`) and uses CallOps `total_cost` for spend/CPL. Rows with `dialed = 0` are omitted.

### `GET /api/intents`

| | |
|---|---|
| Auth | Supabase user |
| Query | `campaignId?`, `date?` (default today) |
| Response | `{ day, connectedTotal?, intents[] }` |
| Upstream | CallOps intent-stats endpoints via bearer token |
| Supabase tables | None in this app |

### `GET /api/companies`

| | |
|---|---|
| Auth | Supabase user |
| Response | `{ companies: { id, name, contact_name, contact_email, contact_phone }[] }` |
| Upstream | `GET /companies` via bearer token |
| Supabase tables | None in this app |

### `POST /api/companies`

| | |
|---|---|
| Auth | Supabase user |
| Body | `{ name, contact_name?, contact_email?, contact_phone? }` |
| Response | `{ company }` with status **201** |
| Upstream | `POST /companies` via bearer token |
| Supabase tables | None in this app |

### `GET /api/products`

| | |
|---|---|
| Auth | Supabase user |
| Query | `company_id` required |
| Purpose | List products for one company |
| Response | `{ products }` |
| Upstream | `GET /companies/{company_id}/products` via bearer token |
| Supabase tables | None in this app |

### `POST /api/products`

| | |
|---|---|
| Auth | Supabase user |
| Body | `{ company_id, name, integration_type?, sts_product_key?, active? }` |
| Purpose | Create a company-scoped product |
| Response | CallOps product response with status **201** |
| Upstream | `POST /companies/{company_id}/products` via bearer token |
| Supabase tables | None in this app |

### `GET /api/products/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Fetch one product |
| Upstream | `GET /products/{id}` via bearer token |
| Supabase tables | None in this app |

### `PATCH /api/products/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Update product metadata such as name, integration type, STS key, or active flag |
| Upstream | `PATCH /products/{id}` via bearer token |
| Supabase tables | None in this app |

### `GET /api/products/[id]/versions`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | List a product's script versions |
| Response | `{ versions }` |
| Upstream | `GET /products/{id}/versions` via bearer token |
| Supabase tables | None in this app |

### `POST /api/products/[id]/versions`

| | |
|---|---|
| Auth | Supabase user |
| Body | `{ text?, voice_id?, audio_url?, duration_seconds?, set_current? }` |
| Purpose | Create a new script version; `set_current` defaults to `true` |
| Upstream | `POST /products/{id}/versions` via bearer token |
| Supabase tables | None in this app |

### `POST /api/products/[id]/versions/[versionId]/activate`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Promote or roll back a product to an existing script version |
| Upstream | `POST /products/{id}/versions/{versionId}/activate` via bearer token |
| Supabase tables | None in this app |

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

When `text` is provided, the route best-effort persists metadata through CallOps `POST /script-library` so the voice generator can offer the script for reuse. Audio upload success is not rolled back if that library save fails.

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
| Upstream | `GET /script-library?page_size=50` via bearer token |
| Supabase tables | None in this app |

### `POST /api/voice-scripts`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Save script text/voice/audio metadata to the global reuse library |
| Body | `{ text, voice_id?, audio_url?, campaign_name? }` |
| Upstream | `POST /script-library` via bearer token |
| Supabase tables | None in this app |

### `GET /api/script-audio`

| | |
|---|---|
| Auth | Supabase user |
| Query | `campaign_id` required |
| Purpose | Load the latest per-campaign script/audio history row for edit/reuse dialogs |
| Response | `{ items }` |
| Upstream | `GET /script-audio?campaign_id=...&page_size=1` via bearer token |
| Supabase tables | None in this app |

### `POST /api/script-audio`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Record generated script audio/text against one campaign |
| Body | `{ campaign_id, audio_url, text?, voice?, duration_seconds? }` |
| Upstream | `POST /script-audio` via bearer token |
| Supabase tables | None in this app |

---

## Routes Documented Elsewhere But Not Implemented Here

| Route | Status |
|-------|--------|
| `/api/providers` | Not implemented; Settings is informational and telephony admin UI uses local mock data |
| `POST /api/security` | Not implemented |
| `POST /api/simulate` | Not implemented |

The direct LiveKit CLI (`npm run dial`) still exists for diagnostics through `scripts/dial-outbound.ts`. The former authenticated `POST /api/campaigns/:id/dial` route was removed during the schema cleanup; production dialing is through CallOps lifecycle routes.

---

## Data Store Reference

Most tables below live in the shared CallOps database, but this Next.js app reaches them through CallOps APIs rather than direct Supabase queries. Direct Supabase access from `app/api/` is limited to `security_logs`, `dashboard_templates`, LiveKit webhook fallback writes, and `calls/result` reconciliation.

```text
companies ──────────< products ──────────< product_script_versions
    │
    ├──────────────< campaigns ──────────< contacts
    │                    │
    │                    ├──< call_records
    │                    ├──< intent_stats
    │                    └──< script_audio
    │
    └──────────────< sip_trunks

script_library          dashboard_templates     security_logs
profiles               storage.buckets: voice-recordings, avm-scripts
```

### `campaigns` (CallOps-owned; relevant fields)

| Column | Used by |
|--------|---------|
| `id`, `name`, `agent`, `status` | Campaign list/create/update, callops lifecycle status |
| `dialing_speed`, `time_window_start`, `time_window_end` | Create/update; scheduling inputs for callops |
| `max_retries`, `retry_cooldown_seconds`, `max_concurrent`, `auto_paused` | Create/update/read; callops owns runtime behavior |
| `sip_trunk_id` | Integer trunk id selected by the campaign wizard |
| `agent_name` | Set to `outbound-recorder` on create |
| `voice_recording_url`, `voice_path`, `audio_path`, `voice_id` | Campaign voice prompt/script references |
| `transfer_key`, `transfer_target` | Campaign create metadata |
| `network_provider` | Optional dial gate; CallOps enqueues only contacts with matching `contacts.network_provider` |
| `product_id`, `product_version_id`, `sts_product`, `routing_mode` | Product/script and consent-flow model materialized at campaign save time |
| `company_id` | Company fan-out and dashboard filters |

`CampaignStatus` values in TypeScript are `draft`, `running`, `paused`, `stopped`, `completed`, `archived`, `deleted`.

### `products` and `product_script_versions` (CallOps-owned)

| Table | Important fields |
|-------|------------------|
| `products` | `company_id`, `name`, `integration_type` (`sts_subscription` or `lead_gen`), `sts_product_key`, `active`, `current_version_id` |
| `product_script_versions` | `product_id`, `version`, `text`, `voice_id`, `audio_url`, `duration_seconds` |

Campaigns reference `products.id`. CallOps resolves product routing fields and script audio once when a campaign is created or updated. The current UI sends `product_id` but does not expose a version-pinning control; API callers may send `product_version_id`.

### `contacts` (CallOps-owned; relevant fields)

| Column | Used by |
|--------|---------|
| `campaign_id`, `phone`, `first_name`, `last_name` | Campaign create and callops dispatch |
| `status` | Queue lifecycle: `pending`, `in_progress`, `dialed`, `failed`, `retry` |
| `network_provider` | ICASA-prefix mobile network label used by the network dial gate and contacts breakdown |
| `retry_count`, `last_attempted_at` | Runtime retry state owned by callops |

The former `campaign_contacts` join table was dropped by `supabase/migrations/20260703090000_drop_dial_tables.sql`; this dashboard no longer writes contact membership directly.

### `call_records` (CallOps-owned; fallback-written by this app)

| Column | Set/read by |
|--------|-------------|
| `campaign_id`, `contact_id`, `phone`, `room` | CallOps outcome ingestion and this app's reconciliation route |
| `outcome` | callops outcome ingestion; LiveKit webhook fallback for `connected`/`no_answer` |
| `talk_seconds`, `transferred`, `cost` | callops outcome ingestion; webhook fallback for talk time |
| `recording_url`, `egress_id` | LiveKit/callops recording flow |
| `called_at` | Dashboard sorting/filtering |

Known outcome values include legacy IVR values (`connected`, `qualified`, `voicemail`, `no_speech`, `hangup`, `ni`, `dnq`, `callback`, `no_answer`, `busy`, `failed`) and callops values added by migration (`answered`, `transferred`).

### Script persistence

| Table / store | Used by |
|---------------|---------|
| `script_library` | Global script reuse bubbles in `VoiceGenerator`; proxied by `/api/voice-scripts` |
| `script_audio` | Per-campaign script/audio history used when reopening edit/reuse dialogs; proxied by `/api/script-audio` |
| Supabase S3-compatible script storage | Generated MP3 object storage for `/api/tts/save` and `/api/scripts` |

The older direct `voice_scripts` table path has been replaced by CallOps `script_library`.

---

## OpenAPI (`docs/openapi.json`) Alignment

`docs/openapi.json` describes evra-callops, not this Next.js app. The current integration points are:

| callops concept | This app integration |
|-----------------|----------------------|
| `GET /companies`, `POST /companies` | `/api/companies` proxies |
| `GET /companies/{id}/campaigns`, `POST /companies/{id}/campaigns` | `/api/campaigns` list/create proxies |
| `GET /campaigns/{id}`, `PATCH /campaigns/{id}`, archive action | `/api/campaigns/[id]` detail/update/archive proxies |
| `POST /campaigns/{id}/start` | `POST /api/campaigns/[id]/start` proxy |
| `POST /campaigns/{id}/pause` | `POST /api/campaigns/[id]/pause` proxy |
| `POST /campaigns/{id}/stop` | `POST /api/campaigns/[id]/stop` proxy |
| `GET /campaigns/{id}/status` | `GET /api/campaigns/[id]/status` proxy and UI live stats |
| `GET /campaigns/{id}/contacts`, `/contacts/network-breakdown` | `GET /api/campaigns/[id]/contacts` proxy |
| `GET /companies/{id}/dashboard/campaign-performance` | `GET /api/reports` source |
| `GET /companies/{id}/calls`, `GET /campaigns/{id}/calls` | `GET /api/logs` source |
| Product and version endpoints | `/api/products*` proxies |
| `/script-library`, `/script-audio` | `/api/voice-scripts` and `/api/script-audio` proxies |
| `POST /calls/outcome` | Authoritative agent outcome write; `/api/calls/result` is only reconciliation |
| `GET /companies/{id}/sip-trunks` | `GET /api/trunks` catalog source |
| `POST /livekit/trunks` | `POST /api/trunks` browser-facing proxy |
| `PATCH /livekit/trunks/{trunk_id}` | `PATCH /api/trunks/[trunk_id]` browser-facing proxy |
| `DELETE /livekit/trunks/{trunk_id}` | `DELETE /api/trunks/[trunk_id]` browser-facing proxy |
| `POST /livekit/test-call` | `POST /api/trunks/test-call` browser-facing proxy and `npm run callops -- test-call ...` diagnostic CLI |

OpenAPI endpoints for dispatch jobs and rooms are not surfaced directly by this app today. Call detail/report/recording/telemetry routes exist under `/api/calls/[id]/*`.

---

## Environment Variables By Route

| Variable | Routes affected |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Auth/session and server route auth helpers |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/livekit/webhook`, `/api/calls/result`, diagnostic scripts, voice signing |
| `CALLOPS_URL` | Bearer-proxied operational routes using `utils/callops.ts`; lifecycle/status/trunk admin routes |
| `CALLOPS_WEBHOOK_SECRET` | Lifecycle/status/trunk admin proxies and `/api/calls/result` reconciliation auth |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | `/api/livekit/webhook`, direct diagnostic CLI |
| `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`, `LIVEKIT_AGENT_NAME` | Direct diagnostic CLI |
| `LIVEKIT_RECORD_*` | Direct diagnostic CLI egress path |
| `INWORLD_API_KEY` | `/api/tts/generate` |
| `AVM_SCRIPT_AUDIO_STORAGE_*` | `/api/tts/save`, `/api/scripts` |
| `STS_RELAY_SECRET`, `STS_SDP_BASE_URL`, `STS_GUID_<PRODUCT>` | `/api/sts/mark` |

---

## Related Files

| Path | Role |
|------|------|
| `utils/callops.ts` | Bearer-token CallOps client for operational route proxies |
| `app/api/campaigns/route.ts` | CallOps-backed campaign list/create |
| `app/api/campaigns/[id]/route.ts` | CallOps-backed campaign detail/update/archive |
| `app/api/campaigns/[id]/[action]/route.ts` | callops lifecycle/status proxy |
| `app/api/campaigns/[id]/contacts/route.ts` | CallOps-backed contact list and network breakdown |
| `app/api/products/*` | CallOps-backed product and product script version proxies |
| `app/api/trunks/route.ts` | SIP trunk catalog and create proxy for campaign wizard/telephony admin |
| `app/api/trunks/[trunk_id]/route.ts` | LiveKit trunk update/delete proxy through callops |
| `app/api/trunks/test-call/route.ts` | one-off SIP test-call proxy through callops |
| `app/api/scripts/route.ts` | saved script audio object listing |
| `app/api/voice-scripts/route.ts` | CallOps script-library proxy |
| `app/api/script-audio/route.ts` | CallOps per-campaign script-audio proxy |
| `app/api/sts/mark/route.ts` | STS subscribe/opt-out relay |
| `app/api/calls/result/route.ts` | secondary call_records reconciliation endpoint |
| `app/api/livekit/webhook/route.ts` | signed LiveKit webhook fallback updates |
| `scripts/callops-test.ts` | callops smoke/integration test harness |
| `scripts/dial-outbound.ts` | direct LiveKit diagnostic dial script |
| `lib/outbound-call.ts` | direct LiveKit SDK helpers |
| `lib/voice.ts` | voice URL resolution/signing helpers |
| `utils/supabase/auth.ts` | session auth helper |
| `utils/supabase/admin.ts` | service-role client |
| `supabase/migrations/*.sql` | schema source of truth |
| `docs/openapi.json` | evra-callops API contract |
