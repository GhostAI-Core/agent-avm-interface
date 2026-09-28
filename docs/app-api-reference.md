# Agent AVM Interface — API Reference & Alignment Guide

This document describes the Next.js Route Handlers under `app/api/`, how they relate to **evra-callops**, and which local Supabase/storage paths remain in this app.

---

## Executive Summary

| Layer | What it is | Role |
|-------|------------|------|
| `app/api/` (this repo) | Next.js Route Handlers | Browser-facing control plane: Supabase session auth, CallOps bearer proxies, telephony admin proxies, TTS/upload helpers, STS relay, and reconciliation webhooks |
| **evra-callops** | Operational API | Source of truth for companies, products, campaigns, contacts, leads, call history/reports, SIP trunks, script metadata, lookups, settings, dispatch, LiveKit SIP calls, and agent outcome ingestion |
| Supabase | Auth + selected local storage/tables | Operator auth/session cookies, generated/uploaded voice file storage, `dashboard_templates`, `security_logs`, LiveKit fallback updates, and `/api/calls/result` reconciliation inserts |

This app is no longer the production dialer. `app/api/campaigns/[id]/[action]/route.ts` proxies lifecycle actions to evra-callops, and callops owns dispatch, pacing, retries, LiveKit SIP calls, and agent outcome ingestion.

```text
Browser
  │ authenticated fetch
  ▼
app/api/*
  ├─ CallOps bearer proxies: companies, campaigns, contacts/import/actions, products, leads,
  │  logs, reports, call detail/recording/telemetry, SIP trunks, settings, lookups, scripts
  ├─ POST /api/campaigns/{id}/start|pause|stop ──X-Webhook-Secret──► evra-callops
  ├─ GET  /api/campaigns/{id}/status            ──X-Webhook-Secret──► evra-callops
  ├─ /api/trunks/*                              ──X-Webhook-Secret──► callops LiveKit admin
  ├─ POST /api/sts/mark                         ──optional x-relay-secret──► STS SDP
  ├─ POST /api/livekit/webhook ◄──────────── signed LiveKit room events
  └─ POST /api/calls/result ◄──X-Webhook-Secret── callops reconciliation forward
```

---

## Authentication Model

| Auth type | Header / mechanism | Routes |
|-----------|--------------------|--------|
| Supabase session | Cookie from `createServerClient`; validated via `getAuthUser()` or converted to a bearer token via `getAccessToken()` | All browser-facing dashboard routes except public health/webhooks |
| Supabase bearer to CallOps | `Authorization: Bearer <user access token>` sent server-side by `utils/callops.ts` | CallOps-owned CRUD/read routes: companies, campaigns, contacts, products, leads, calls, reports, settings, lookups, script library/history, and newer SIP trunk routes |
| `X-Webhook-Secret` outbound | Sent server-side from this app to `CALLOPS_URL` | lifecycle/status routes and legacy LiveKit trunk admin/test-call proxies |
| `X-Webhook-Secret` inbound | Checked on incoming requests | `POST /api/calls/result` reconciliation forward from CallOps |
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
| Upstream | Fans out over `GET /companies`, then `GET /companies/{id}/campaigns` in CallOps |
| Notes | Sorted newest-first by `created_at`; CallOps enforces the user's company access |

### `POST /api/campaigns`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Create a campaign and optional contacts |
| Body | `{ name, company_id, product_id?, product_version_id?, agent?, sip_trunk_id?, audio_path?, voice_recording_url?, voice_id?, dialing_speed?, window_start?, window_end?, max_concurrent?, max_retries?, retry_cooldown_seconds?, transfer_key?, transfer_target?, network_provider?, contacts?[] }` |
| Response | CallOps response, currently `{ campaign, contacts_imported?, contacts_rejected? }` with status **201** |
| Validation | `name` and `company_id` required locally; contact normalization, dedupe, rejection reporting, and `contacts.campaign_id` are owned by CallOps |
| Upstream | `POST /companies/{company_id}/campaigns` in CallOps |

Create-time details:

| Field | Behavior |
|-------|----------|
| `agent_name` | Always stored as `outbound-recorder`, the deployed LiveKit worker callops dispatches |
| `sip_trunk_id` | Integer CallOps/Supabase `sip_trunks.id`; CallOps resolves it to the underlying LiveKit trunk |
| `max_concurrent`, `max_retries`, `retry_cooldown_seconds` | Coerced to integers with defaults `5`, `2`, `3600` if present |
| `window_start`, `window_end` | Stored as `time_window_start`, `time_window_end` |
| `audio_path` / `voice_recording_url` | Both are accepted from the UI; the route forwards the resolved script URL as `voice_recording_url` |
| `voice_id` | Forwarded for generated scripts so the worker can select the matching Inworld voice when CallOps supports/persists it |
| `product_id`, `product_version_id` | Product pointers let CallOps derive routing mode, STS product, agent, script URL, and voice; `product_version_id` pins a specific script version |
| `contacts` | Forwarded verbatim after dropping rows without `phone`; CallOps owns E.164 normalization and import summaries |

### `PUT /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Partial campaign update for non-lifecycle fields |
| Allowed fields | `name`, `agent`, `dialing_speed`, `time_window_start`, `time_window_end`, `max_concurrent`, `max_retries`, `retry_cooldown_seconds`, `sip_trunk_id`, `voice_recording_url`, `audio_path`, `voice_path`, `transfer_key`, `transfer_target`, `network_provider`, `voice_id`, `routing_mode`, `product_id`, `product_version_id` |
| Response | `{ campaign }` |
| Upstream | `PATCH /campaigns/{id}` in CallOps |

Lifecycle controls must use `/start`, `/pause`, and `/stop` so callops can own dispatch state. Direct `PUT { status }` is intentionally rejected by the field allow-list.

### `DELETE /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Soft archive |
| Behavior | Calls CallOps `POST /campaigns/{id}/archive`; there is no hard delete in this app |
| Response | `{ success: true }` |

### `GET /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Read a campaign summary for detail views |
| Response | `{ summary, campaign }`; `{ mode: 'unconfigured', summary: null }` when CallOps env is missing |
| Upstream | `GET $CALLOPS_URL/campaigns/{id}` with `X-Webhook-Secret` |
| Notes | Uses the webhook-secret channel because the handler needs CallOps' embedded `summary` block |

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

The UI polls this route for running/paused campaigns and expects counters such as `active_calls`, `queued`, `pending`, `in_progress`, `dialed`, `failed`, `retry`, `completed_today`, and optional `auto_paused`.

### Removed: `POST /api/campaigns/[id]/dial`

| | |
|---|---|
| Status | Not implemented in `app/api/` |
| Replacement | Production and operator workflows use `POST /api/campaigns/{id}/start|pause|stop`, which proxy to CallOps |
| Diagnostic path | The direct LiveKit CLI remains available as `npm run dial` (`scripts/dial-outbound.ts`) |

Do not build UI or agent integrations against this route. If bounded direct LiveKit diagnostics are needed, use the CLI path so the production API surface stays CallOps-owned.

### `GET /api/campaigns/[id]/contacts`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Paginated campaign contact list and campaign-wide network breakdown |
| Query | `status?`, `network?`, `search?`/`phone?`, `page?`, `page_size?` (capped at 200) |
| Response | `{ items, page, page_size, total, breakdown }` |
| Upstream | `GET /campaigns/{id}/contacts` and best-effort `GET /campaigns/{id}/contacts/network-breakdown` in CallOps |

`network` is forwarded as `network_provider`; the breakdown is independent of the status/search/network filters so operators can see the full campaign mix before applying a gate.

### `POST /api/campaigns/[id]/contacts/import`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Bulk-import parsed contacts into a campaign |
| Body | `{ contacts: [{ phone, first_name?, last_name?, external_id? }], dedupe?, source? }` |
| Response | CallOps import summary |
| Upstream | `POST /campaigns/{id}/contacts/import` in CallOps |

The route rejects empty imports locally. Normalization, dedupe, invalid-row reporting, and persistence are CallOps responsibilities.

### `POST /api/contacts/[id]/archive|retry|do-not-call`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Per-contact dashboard actions |
| Response | CallOps action response, or `{ ok: true }` for an empty response |
| Upstream | `POST /contacts/{id}/{action}` in CallOps |

Only `archive`, `retry`, and `do-not-call` are allowlisted before forwarding so arbitrary paths are never proxied.

### `GET /api/trunks`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | SIP trunk catalog for the campaign wizard |
| Response | `{ trunks: [{ id, name, from_number, live }] }` |
| Upstream | Fans out over `GET /companies/{id}/sip-trunks` in CallOps and dedupes by `id` |

The `id` returned here is the persisted trunk row id used as `campaigns.sip_trunk_id`, not the LiveKit `ST_...` id. A trunk can be shared by multiple companies; the route lists every trunk available to at least one of the user's companies.

### `POST /api/trunks`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Create a SIP outbound trunk through callops/LiveKit |
| Body | `{ name, address, numbers: string[], auth_username, auth_password }` |
| Response | callops trunk response; password is never returned |
| Upstream | `POST $CALLOPS_URL/livekit/trunks` with `X-Webhook-Secret` |
| Missing callops env | **503** `{ error: 'telephony not configured' }` |

All body fields are required. Client validation errors from callops pass through as 4xx; upstream faults are normalized to **502**. This is the LiveKit admin path; the newer `/api/sip-trunks/*` routes below operate on persisted CallOps trunk rows with the user's bearer token.

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

### `/api/sip-trunks/[id]` and nested actions

| Route | Auth | Purpose | Upstream |
|-------|------|---------|----------|
| `GET /api/sip-trunks/{id}` | User | Fetch one persisted SIP trunk row | `GET /sip-trunks/{id}` |
| `PATCH /api/sip-trunks/{id}` | User | Update supplied trunk fields; credentials are not returned by CallOps | `PATCH /sip-trunks/{id}` |
| `POST /api/sip-trunks/{id}/archive` | User | Archive a persisted trunk | `POST /sip-trunks/{id}/archive` |
| `GET /api/sip-trunks/{id}/health` | User | Fetch `{ live, status, ... }` health data | `GET /sip-trunks/{id}/health` |
| `POST /api/sip-trunks/{id}/test-call` | User | Place a one-off test call through that persisted trunk row | `POST /sip-trunks/{id}/test-call` |

These routes use `Authorization: Bearer <Supabase access token>` through `utils/callops.ts`. `POST /api/sip-trunks/{id}/test-call` requires `phone` locally; a failed SIP attempt can still return HTTP 200 with `ok: false`.

### `POST /api/calls/result`

| | |
|---|---|
| Auth | `X-Webhook-Secret: $CALLOPS_WEBHOOK_SECRET` from CallOps |
| Purpose | Secondary reconciliation for call outcomes |
| Body | CallOps/agent outcome shape including `room_name`, `campaign_id`, `outcome`, optional `contact_id`, `phone`, `talk_seconds`, `transferred`, `business_disposition`, `ended_at` |
| Behavior | Checks `call_records` by `room`; inserts only when the primary CallOps write is missing |
| Response | `{ ok: true, action: 'inserted' | 'exists' | 'skipped' }` |
| Supabase tables | `call_records` via service-role client, only for missing-row backfills |

Agents should not call this route directly. The primary contract remains `POST $CALLOPS_URL/calls/outcome`; CallOps may forward the same payload here as a safety net.

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
| Upstream | `campaignId` -> `GET /campaigns/{id}/calls`; otherwise fans out over `GET /companies/{id}/calls` in CallOps |

Without `campaignId`, the route asks CallOps for each accessible company's recent calls from the last 45 days and caps the merged response at 5000 rows. It renames CallOps `duration_seconds` to `on_air_seconds` for existing widgets.

### `GET /api/reports`

| | |
|---|---|
| Auth | Supabase user |
| Query | `agent?`, `product_id?`, `from?`, `to?` |
| Response | `{ reports: CampaignReport[] }` |
| Upstream | Fans out over `GET /companies/{id}/dashboard/campaign-performance`; also reads company campaigns/products to attach `product_id` and product names |

`from` and `to` are forwarded as CallOps `from_date` and `to_date`. Outcome tallies are mapped into the UI's report columns (`subscribed` -> `qualified`, `lead` -> `lead`, `opted_out` -> `opt_out`, etc.); columns CallOps does not produce remain zero rather than being inferred.

### `GET /api/intents`

| | |
|---|---|
| Auth | Supabase user |
| Query | `campaignId?`, `date?` (default today) |
| Response | `{ day, connectedTotal?, intents[] }` |
| Upstream | `campaignId` -> `GET /campaigns/{id}/intent-stats`; otherwise fans out over `GET /companies/{id}/intent-stats` in CallOps |

Per-campaign responses include `connectedTotal`; dashboard-wide responses preserve the legacy `{ day, intents }` shape and include only intent rows tagged with `campaign_id`.

### `/api/calls/[id]` detail routes

| Route | Auth | Purpose | Upstream |
|-------|------|---------|----------|
| `GET /api/calls/{id}` | User | Call detail plus related contact/campaign data | `GET /calls/{id}` |
| `GET /api/calls/{id}/call-report` | User | Telephony narrative: AMD/SIP/DTMF/playback/disconnect/transfer/talk-time details | `GET /calls/{id}/call-report` |
| `GET /api/calls/{id}/recording` | User | Signed recording URL and expiry | `GET /calls/{id}/recording` |
| `GET /api/calls/{id}/telemetry` | User | Model-usage telemetry; returns `{ telemetry: [] }` when empty | `GET /calls/{id}/telemetry` |

404s from CallOps are passed through for missing call reports or recordings so the UI can show unavailable states cleanly.

### `GET /api/companies`

| | |
|---|---|
| Auth | Supabase user |
| Response | `{ companies: { id, name, contact_name, contact_email, contact_phone }[] }` |
| Upstream | `GET /companies` in CallOps |

### `POST /api/companies`

| | |
|---|---|
| Auth | Supabase user |
| Body | `{ name, contact_name?, contact_email?, contact_phone? }` |
| Response | `{ company }` with status **201** |
| Upstream | `POST /companies` in CallOps |

### `/api/products` and product script versions

| Route | Auth | Purpose | Upstream |
|-------|------|---------|----------|
| `GET /api/products?company_id=...` | User | List products for one company | `GET /companies/{company_id}/products` |
| `POST /api/products` | User | Create a company-scoped product | `POST /companies/{company_id}/products` |
| `GET /api/products/{id}` | User | Fetch one product | `GET /products/{id}` |
| `PATCH /api/products/{id}` | User | Update supplied product fields | `PATCH /products/{id}` |
| `GET /api/products/{id}/versions` | User | List product script-version history | `GET /products/{id}/versions` |
| `POST /api/products/{id}/versions` | User | Save a new product script version | `POST /products/{id}/versions` |
| `POST /api/products/{id}/versions/{versionId}/activate` | User | Promote/roll back current product script | `POST /products/{id}/versions/{versionId}/activate` |

Products are the current script + consent-flow unit for campaigns. The campaign wizard lists products for the selected company and, when a product has a current version, preloads its text/audio/voice into the Voice step. Campaign create sends `product_id` and optional `product_version_id`; CallOps derives routing mode, STS product, agent, script URL, and voice from that product/version.

### `GET /api/leads`

| | |
|---|---|
| Auth | Supabase user |
| Query | `campaignId?` |
| Purpose | Lead-generation report rows across accessible companies |
| Response | `{ leads, total, double_optin, single_optin }` |
| Upstream | Fans out over `GET /companies/{id}/leads`, then enriches names from `GET /campaigns/{id}` and `GET /campaigns/{id}/contacts` |

Lead rows include both double opt-in (`optin: 'double'`, `outcome=lead`) and single opt-in (`optin: 'single'`, `business_disposition=single_opt_in`). Cost is the persisted per-call CallOps cost, not a local estimate.

### `GET/PATCH /api/settings`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Global CallOps platform settings |
| `GET` upstream | `GET /system-settings` |
| `PATCH` body | `{ cost_per_minute_zar: positive number }` |
| `PATCH` upstream | `PATCH /system-settings` |

CallOps enforces read/write permissions. This app performs only local positive-number validation for `cost_per_minute_zar` before forwarding.

### `GET /api/lookups/[type]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Enumerations used by filters/forms |
| Allowed types | `call-outcomes`, `agent-outcomes`, `business-dispositions`, `contact-statuses`, `campaign-statuses`, `calling-windows`, `timezones` |
| Upstream | `GET /lookups/{type}` in CallOps |

Unknown lookup types return **400** before any upstream request.

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

This route only uploads audio and returns a public URL. Script reuse metadata is persisted separately through `/api/voice-scripts`, and per-campaign history is persisted through `/api/script-audio`.

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
| Upstream | `GET /script-library?page_size=50` in CallOps |

### `POST /api/voice-scripts`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Save script text and optional voice/audio metadata to the global reuse library |
| Body | `{ text, voice_id?, audio_url?, campaign_name? }` |
| Response | CallOps script-library response with status **201** |
| Upstream | `POST /script-library` in CallOps |

The reuse library is global across companies by current product decision. `text` is required; audio must already have been uploaded (for example by `/api/tts/save`).

### `GET/POST /api/script-audio`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Per-campaign generated script/audio history |
| `GET` query | `campaign_id` required; fetches only the latest item with `page_size=1` |
| `GET` response | `{ items: [{ id, campaign_id, audio_url, text, voice, duration_seconds, created_at }] }` |
| `POST` body | `{ campaign_id, audio_url, text?, voice?, duration_seconds? }` |
| Upstream | `GET /script-audio?campaign_id=...&page_size=1`, `POST /script-audio` in CallOps |

Campaign creation uses this as a best-effort follow-up after a generated recording is saved and the campaign exists. Failure to write history does not roll back campaign creation.

---

## Routes Documented Elsewhere But Not Implemented Here

| Route | Status |
|-------|--------|
| `/api/providers` | Not implemented; Telephony admin UI uses local mock data, while cost settings use `/api/settings` |
| `POST /api/security` | Not implemented |
| `POST /api/simulate` | Not implemented |

The direct LiveKit CLI (`npm run dial`) still exists for diagnostics through `scripts/dial-outbound.ts`. The legacy authenticated `POST /api/campaigns/:id/dial` API route is not implemented in this checkout.

---

## Data Ownership Reference

Most operational records are reached through CallOps, not local Supabase table access from this app:

```text
CallOps-owned operational data:
companies ──< products ──< product_script_versions
companies ──< campaigns ──< campaign contacts/imports
companies/campaigns ──< calls, call reports, recordings, telemetry, reports, leads, intent stats
companies ──< sip trunks
script-library, script-audio, lookups, system-settings

Local Supabase/storage exceptions in this app:
profiles/auth sessions
dashboard_templates
security_logs
call_records       # only LiveKit fallback updates and /api/calls/result reconciliation inserts
storage.buckets: voice-recordings, avm-scripts
```

### `campaigns` (relevant columns)

| Column | Used by |
|--------|---------|
| `id`, `name`, `agent`, `status` | Read/write through CallOps campaign routes |
| `dialing_speed`, `time_window_start`, `time_window_end` | Scheduling inputs sent to CallOps |
| `max_retries`, `retry_cooldown_seconds`, `max_concurrent`, `auto_paused` | Runtime behavior owned by CallOps |
| `sip_trunk_id` | Persisted trunk row selected by the campaign wizard |
| `agent_name` | Set to `outbound-recorder` on create |
| `voice_recording_url`, `voice_path`, `audio_path`, `voice_id` | Script/audio references used by CallOps workers |
| `transfer_key`, `transfer_target`, `network_provider` | Campaign routing/gating metadata sent to CallOps |
| `company_id`, `product_id`, `product_version_id` | Company/product scoping and script-version selection |

`CampaignStatus` values in TypeScript are `draft`, `running`, `paused`, `stopped`, `completed`, `archived`, `deleted`.

### `contacts` (relevant columns)

| Column | Used by |
|--------|---------|
| `campaign_id`, `phone`, `first_name`, `last_name` | Contact import/listing through CallOps |
| `status` | Queue lifecycle surfaced by CallOps: `pending`, `in_progress`, `dialed`, `failed`, `retry`, etc. |
| `retry_count`, `last_attempted_at`, `network_provider` | Runtime retry/gating state owned by CallOps |

The dashboard no longer creates canonical contacts or `campaign_contacts` rows directly. `/api/campaigns` and `/api/campaigns/{id}/contacts/import` forward rows to CallOps, which owns normalization, dedupe, status transitions, and rejection summaries.

### `call_records` (relevant columns)

| Column | Set/read by |
|--------|-------------|
| `campaign_id`, `contact_id`, `phone`, `room` | CallOps primary writes; local reconciliation inserts only when missing |
| `outcome` | CallOps outcome ingestion; local LiveKit webhook fallback for `connected`/`no_answer`; `/api/calls/result` maps raw fallback outcomes |
| `talk_seconds`, `transferred`, `cost`, `business_disposition` | CallOps outcome ingestion; local reconciliation can backfill a subset |
| `recording_url`, `egress_id` | LiveKit/callops recording flow |
| `called_at` | Dashboard sorting/filtering |

Known outcome values include legacy IVR values (`connected`, `qualified`, `voicemail`, `no_speech`, `hangup`, `ni`, `dnq`, `callback`, `no_answer`, `busy`, `failed`) and CallOps values (`subscribed`, `opted_out`, `lead`, `transferred`). Reporting maps these into the UI's `CampaignReport` columns.

---

## OpenAPI (`docs/openapi.json`) Alignment

`docs/openapi.json` describes evra-callops, not this Next.js app. The current integration points are:

| callops concept | This app integration |
|-----------------|----------------------|
| `GET /companies`, `POST /companies` | `/api/companies` |
| `GET /companies/{id}/campaigns`, `POST /companies/{id}/campaigns` | `/api/campaigns` list/create |
| `GET/PATCH /campaigns/{id}` | `/api/campaigns/[id]` read/update |
| `POST /campaigns/{id}/start` | `POST /api/campaigns/[id]/start` proxy |
| `POST /campaigns/{id}/pause` | `POST /api/campaigns/[id]/pause` proxy |
| `POST /campaigns/{id}/stop` | `POST /api/campaigns/[id]/stop` proxy |
| `GET /campaigns/{id}/status` | `GET /api/campaigns/[id]/status` proxy and UI live stats |
| `GET /campaigns/{id}/contacts`, `POST /campaigns/{id}/contacts/import` | `/api/campaigns/[id]/contacts*` |
| `GET /companies/{id}/dashboard/campaign-performance` | `/api/reports` |
| `GET /companies/{id}/calls`, `GET /campaigns/{id}/calls` | `/api/logs` |
| `GET /calls/{id}/*` | `/api/calls/[id]/*` detail routes |
| `GET /companies/{id}/products`, `GET/POST /products/{id}/versions` | `/api/products*` |
| `GET/POST /script-library`, `GET/POST /script-audio` | `/api/voice-scripts`, `/api/script-audio` |
| `GET /system-settings`, `PATCH /system-settings` | `/api/settings` |
| `POST /calls/outcome` | Agent primary outcome endpoint; CallOps may forward to `/api/calls/result` for reconciliation |
| `GET /companies/{id}/sip-trunks` | `GET /api/trunks` campaign picker |
| `GET/PATCH/POST /sip-trunks/{id}/*` | `/api/sip-trunks/[id]/*` persisted trunk management |
| `POST /livekit/trunks` | `POST /api/trunks` browser-facing proxy |
| `PATCH /livekit/trunks/{trunk_id}` | `PATCH /api/trunks/[trunk_id]` browser-facing proxy |
| `DELETE /livekit/trunks/{trunk_id}` | `DELETE /api/trunks/[trunk_id]` browser-facing proxy |
| `POST /livekit/test-call` | `POST /api/trunks/test-call` browser-facing proxy and `npm run callops -- test-call ...` diagnostic CLI |

Dispatch jobs and rooms remain CallOps internals; this app surfaces operational status through lifecycle/status, reports, logs, and call detail routes.

---

## Environment Variables By Route

| Variable | Routes affected |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | All authenticated Supabase routes |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/livekit/webhook`, diagnostic scripts, voice signing |
| `CALLOPS_URL` | All CallOps bearer proxies through `utils/callops.ts` |
| `CALLOPS_WEBHOOK_SECRET` | `/api/campaigns/[id]/start|pause|stop|status`, `/api/campaigns/[id]` summary read, `/api/trunks`, `/api/trunks/[trunk_id]`, `/api/trunks/test-call`, inbound `/api/calls/result` reconciliation |
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
| `app/api/campaigns/[id]/[action]/route.ts` | callops lifecycle/status proxy |
| `app/api/campaigns/route.ts` | CallOps-backed campaign list/create proxy |
| `app/api/campaigns/[id]/route.ts` | CallOps-backed campaign summary/update/archive proxy |
| `app/api/campaigns/[id]/contacts*/route.ts` | CallOps-backed contact list/import proxies |
| `app/api/products*/route.ts` | CallOps-backed product and script-version proxies |
| `app/api/trunks/route.ts` | SIP trunk catalog plus legacy LiveKit admin create proxy |
| `app/api/trunks/[trunk_id]/route.ts` | LiveKit trunk update/delete proxy through callops |
| `app/api/trunks/test-call/route.ts` | one-off SIP test-call proxy through callops |
| `app/api/sip-trunks/[id]/*` | CallOps persisted trunk detail/update/archive/health/test-call proxies |
| `app/api/scripts/route.ts` | saved script audio object listing |
| `app/api/voice-scripts/route.ts` | CallOps global script text/audio reuse library |
| `app/api/script-audio/route.ts` | CallOps per-campaign generated script history |
| `app/api/logs`, `app/api/reports`, `app/api/intents` | CallOps-backed analytics/read model proxies |
| `app/api/calls/[id]/*` | CallOps-backed call detail/report/recording/telemetry proxies |
| `app/api/sts/mark/route.ts` | STS subscribe/opt-out relay |
| `app/api/calls/result/route.ts` | authenticated reconciliation endpoint for missing CallOps outcome writes |
| `app/api/livekit/webhook/route.ts` | signed LiveKit webhook fallback updates |
| `scripts/callops-test.ts` | callops smoke/integration test harness |
| `scripts/dial-outbound.ts` | direct LiveKit diagnostic dial script |
| `lib/outbound-call.ts` | direct LiveKit SDK helpers |
| `lib/voice.ts` | voice URL resolution/signing helpers |
| `utils/supabase/auth.ts` | session auth helper |
| `utils/supabase/admin.ts` | service-role client |
| `supabase/migrations/*.sql` | schema source of truth |
| `docs/openapi.json` | evra-callops API contract |
