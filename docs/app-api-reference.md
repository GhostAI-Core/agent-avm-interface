# Agent AVM Interface — API Reference & Alignment Guide

This document describes the Next.js Route Handlers under `app/api/`, how they relate to **evra-callops**, and which Supabase tables they read or write.

---

## Executive Summary

| Layer | What it is | Role |
|-------|------------|------|
| `app/api/` (this repo) | Next.js Route Handlers | Browser-facing control plane: bearer-forwarded callops proxies, app-owned read routes, lifecycle proxy, telephony trunk proxies, TTS/script reuse, STS relay, LiveKit/WhatsApp webhooks |
| `docs/openapi.json` | OpenAPI 3.1 for **evra-callops** | Campaign dispatcher, queue stats, call outcome/telemetry ingestion, LiveKit admin API |
| Supabase | PostgreSQL + Auth + Storage | Auth/session store plus dashboard-owned read tables; operational campaign/contact/product writes are mediated by callops |

This app is no longer the production dialer. `app/api/campaigns/[id]/[action]/route.ts` proxies lifecycle actions to evra-callops, and callops owns dispatch, pacing, retries, LiveKit SIP calls, and agent outcome ingestion.

```text
Browser
  │ authenticated fetch
  ▼
app/api/*
  ├─ Bearer-forwarded callops routes: companies, campaigns, contacts, products, leads, settings, lookups
  ├─ App-owned Supabase routes: logs, intents, templates, scripts, security
  ├─ POST /api/campaigns/{id}/start|pause|stop ──X-Webhook-Secret──► evra-callops
  ├─ GET  /api/campaigns/{id}/status            ──X-Webhook-Secret──► evra-callops
  ├─ /api/trunks/*                              ──X-Webhook-Secret──► callops LiveKit admin
  ├─ POST /api/sts/mark                         ──optional x-relay-secret──► STS SDP
  ├─ POST /api/livekit/webhook ◄──────────── signed LiveKit room events
  ├─ GET/POST /api/whatsapp/webhook ◄─────── Meta verify token / signed WhatsApp events
  └─ POST /api/calls/result ── deprecated no-op; use callops /calls/outcome
```

---

## Authentication Model

| Auth type | Header / mechanism | Routes |
|-----------|--------------------|--------|
| Supabase session | Cookie from `createServerClient`; validated via `getAuthUser()` | Dashboard CRUD/read routes, lifecycle proxy, trunk catalog/admin proxies, script library |
| `X-Webhook-Secret` | Sent server-side from this app to `CALLOPS_URL` | callops lifecycle/status/trunk admin/test-call cross-checks |
| Supabase bearer token | Forwarded server-side as `Authorization: Bearer ...` | callops CRUD/list proxies where callops enforces company scoping |
| `x-relay-secret` | Optional shared secret checked when `STS_RELAY_SECRET` is set | `POST /api/sts/mark` |
| LiveKit webhook JWT | `Authorization` header; validated by `WebhookReceiver` | `POST /api/livekit/webhook` |
| Meta verify token / HMAC | `hub.verify_token` for setup; `x-hub-signature-256` over the raw POST body | `GET/POST /api/whatsapp/webhook` |
| None | Public | `GET /api/health`, deprecated `POST /api/calls/result` no-op; `POST /api/sts/mark` only when `STS_RELAY_SECRET` is unset |

The browser never receives `CALLOPS_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, LiveKit API secrets, Inworld credentials, WhatsApp credentials, or STS relay/GUID secrets.

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
| Purpose | List campaigns visible to the current user |
| Response | `{ campaigns: Campaign[] }`; each item includes flattened `company` from the owning company |
| Upstream | `GET $CALLOPS_URL/companies`, then `GET /companies/{id}/campaigns` for each company, with forwarded bearer token |
| Supabase tables | None in this app route |

The route tolerates paginated `{ items }`, legacy `{ companies }` / `{ campaigns }`, and bare array envelopes via `utils/callops.ts`, then sorts campaigns by `created_at` descending.

### `POST /api/campaigns`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Create a campaign and optional contacts through callops |
| Body | `{ name, company_id, agent?, dialing_speed?, window_start?, window_end?, audio_path?, voice_recording_url?, transfer_key?, transfer_target?, max_concurrent?, max_retries?, retry_cooldown_seconds?, sip_trunk_id?, network_provider?, voice_id?, routing_mode?, product_id?, product_version_id?, contacts?[] }` |
| Response | callops response with status **201**; commonly `{ campaign, contacts_imported, contacts_rejected }` |
| Validation | `name` and `company_id` required locally; contact rows without `phone` are filtered before forwarding |
| Upstream | `POST $CALLOPS_URL/companies/{company_id}/campaigns` with forwarded bearer token |
| Supabase tables | None in this app route |

Create-time details:

| Field | Behavior |
|-------|----------|
| `agent_name` | Always stored as `outbound-recorder`, the deployed LiveKit worker callops dispatches |
| `sip_trunk_id` | Integer FK to `sip_trunks.id`; callops resolves it to `sip_trunks.livekit_trunk_id` |
| `max_concurrent`, `max_retries`, `retry_cooldown_seconds` | Coerced to integers with defaults `5`, `2`, `3600` |
| `window_start`, `window_end` | Stored as `time_window_start`, `time_window_end` |
| `audio_path` / `voice_recording_url` | The wizard may send the script URL as `audio_path`; this route forwards it as `voice_recording_url` so the worker can fetch it |
| `contacts` | Forwarded to callops, which owns E.164 normalization, dedupe, persistence, and rejected-row reporting |
| `product_id`, `product_version_id` | Forwarded so callops can derive product script/consent metadata; omit `product_version_id` to use the current product version |

### `GET /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Fetch callops campaign detail/summary for detail views |
| Response | `{ summary, campaign }`; `{ mode: 'unconfigured', summary: null }` when callops env is missing |
| Upstream | `GET $CALLOPS_URL/campaigns/{id}` with `X-Webhook-Secret` |
| Supabase tables | None in this app route |

### `PUT /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Partial campaign update through callops for non-lifecycle fields |
| Allowed fields | `name`, `agent`, `dialing_speed`, `time_window_start`, `time_window_end`, `max_concurrent`, `max_retries`, `retry_cooldown_seconds`, `sip_trunk_id`, `voice_recording_url`, `voice_path`, `transfer_key`, `transfer_target`, `network_provider`, `voice_id`, `routing_mode`, `product_id`, `product_version_id` |
| Response | `{ campaign }` |
| Upstream | `PATCH $CALLOPS_URL/campaigns/{id}` with forwarded bearer token |
| Supabase tables | None in this app route |

Lifecycle controls must use `/start`, `/pause`, and `/stop` so callops can own dispatch state. Direct `PUT { status }` is intentionally rejected by the field allow-list.

### `DELETE /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Archive a campaign through callops |
| Behavior | Calls callops archive endpoint; no hard delete in the dashboard route |
| Response | `{ success: true }` |
| Upstream | `POST $CALLOPS_URL/campaigns/{id}/archive` with forwarded bearer token |
| Supabase tables | None in this app route |

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
| Purpose | List campaign contacts and network mix for the Contacts view |
| Query | `status?`, `network?`, `search?` / `phone?`, `page?`, `page_size?` (capped at 200) |
| Response | `{ items, page, page_size, total, breakdown }` |
| Upstream | `GET $CALLOPS_URL/campaigns/{id}/contacts` and `GET /campaigns/{id}/contacts/network-breakdown` with forwarded bearer token |
| Supabase tables | None in this app route |

The network breakdown is fetched for the whole campaign and is tolerated if unavailable; the contact list still renders with an empty `breakdown`.

### `POST /api/campaigns/[id]/contacts/import`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Bulk-import contacts for a campaign |
| Body | `{ contacts: [{ phone, first_name?, last_name?, external_id? }], dedupe?, source? }` |
| Response | callops import summary |
| Upstream | `POST $CALLOPS_URL/campaigns/{id}/contacts/import` with forwarded bearer token |
| Supabase tables | None in this app route |

Callops owns dedupe, E.164 normalization, persistence, and rejected-row reporting. An empty contact array returns **400** `{ error: 'no contacts to import' }`.

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

### `GET /api/whatsapp/webhook`

| | |
|---|---|
| Auth | Meta verification token in `hub.verify_token` |
| Purpose | WhatsApp Cloud API webhook setup handshake |
| Query | `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge` |
| Response | Plain-text `hub.challenge` on success; **503** if `WHATSAPP_WEBHOOK_VERIFY_TOKEN` is unset; **403** on token mismatch |

### `POST /api/whatsapp/webhook`

| | |
|---|---|
| Auth | Meta `x-hub-signature-256` HMAC over the raw request body |
| Purpose | Fast-ACK inbound WhatsApp messages and delivery/read statuses |
| Response | `{ ok: true }` after signature verification and logging |
| Supabase tables | None |

The handler reads the raw body as text before parsing JSON because the HMAC must match Meta's original bytes. Signed but unparseable JSON is acknowledged with `{ ok: true, parsed: false }` so Meta does not retry a permanently unreadable payload. Opt-out words (`stop`, `unsubscribe`, `cancel`, `end`, `quit`, `opt out`, `optout`) are logged but not relayed to suppression yet; suppression remains owned by callops/STS until the webhook can resolve the product/campaign for the sender.

### `POST /api/flow-builder/generate`

| | |
|---|---|
| Auth | None in this route |
| Purpose | Generate a visual campaign-flow graph for the standalone `/flow-builder` POC |
| Body | `{ prompt }` |
| Response | `{ nodes, edges }` using only node types from `components/flow-builder/nodeSpecs.ts` |
| Env | `ANTHROPIC_API_KEY` |

The route asks Anthropic for a tool response, filters out unknown node types and edges pointing at missing nodes, then returns the graph for proof-check preview in the browser. It does not persist flows or wire them into campaign execution.

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
| Response | `{ companies }` |
| Upstream | `GET $CALLOPS_URL/companies` with forwarded bearer token |
| Supabase tables | None in this app route |

### `POST /api/companies`

| | |
|---|---|
| Auth | Supabase user |
| Body | `{ name, contact_name?, contact_email?, contact_phone? }` |
| Response | `{ company }` with status **201** |
| Upstream | `POST $CALLOPS_URL/companies` with forwarded bearer token |
| Supabase tables | None in this app route |

### `POST /api/contacts/[id]/archive|retry|do-not-call`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Per-contact row action from the Contacts view |
| Body | None |
| Response | callops response or `{ ok: true }` |
| Upstream | `POST $CALLOPS_URL/contacts/{id}/{action}` with forwarded bearer token |
| Supabase tables | None in this app route |

Only `archive`, `retry`, and `do-not-call` are allow-listed; any other action returns **400**.

### `GET /api/leads`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Lead-gen reporting across companies visible to the user |
| Query | `campaignId?` |
| Response | `{ leads, total, double_optin, single_optin }` |
| Upstream | Fans out over `GET /companies`, `GET /companies/{id}/leads`, and best-effort campaign/contact lookups |
| Supabase tables | None in this app route |

Lead rows come from callops records where the contact pressed 1 at least once: double opt-in rows (`optin: 'double'`, `outcome=lead`) or single opt-in rows (`optin: 'single'`, `business_disposition=single_opt_in`). Campaign/contact names are enriched best-effort; missing joins fall back to blank or `—`.

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

---

## Routes Documented Elsewhere But Not Implemented Here

| Route | Status |
|-------|--------|
| `/api/providers` | Not implemented; Settings is informational and telephony admin UI uses local mock data |
| `POST /api/security` | Not implemented |
| `POST /api/simulate` | Not implemented |
| `POST /api/campaigns/:id/dial` | Retired; use callops lifecycle/test-call routes or `npm run dial` from an ops shell |

The direct LiveKit CLI (`npm run dial`) still exists for diagnostics through `scripts/dial-outbound.ts`, but there is no authenticated dashboard `/dial` route in the current `app/api/campaigns/[id]/` tree.

---

## Supabase Schema Reference

Operational entities are owned by callops and exposed through this app's bearer-forwarding proxies. The same Supabase database still backs the system, but `app/api/companies`, `app/api/campaigns`, contact imports/actions, products, and leads do not mutate those tables directly.

```text
callops-owned operational model:
companies ──────────< campaigns ──────────< contacts
                         │
                         ├──< call_records
                         ├──< call_logs
                         └──< intent_stats

app-owned/direct routes:
voice_scripts
sip_trunks              dashboard_templates     security_logs
profiles               storage.buckets: voice-recordings, avm-scripts
```

### `campaigns` (relevant columns)

| Column | Used by |
|--------|---------|
| `id`, `name`, `agent`, `status` | Campaign list/create/update proxies and callops lifecycle status |
| `dialing_speed`, `time_window_start`, `time_window_end` | Create/update payloads; scheduling inputs for callops |
| `max_retries`, `retry_cooldown_seconds`, `max_concurrent`, `auto_paused` | Create/update/read payloads; callops owns runtime behavior |
| `sip_trunk_id` | Integer FK to `sip_trunks.id`; selected by the campaign wizard |
| `agent_name` | Forwarded as `outbound-recorder` on create |
| `voice_recording_url`, `voice_path`, `audio_path` | Campaign voice prompt/script references |
| `transfer_key`, `transfer_target`, `network_provider`, `voice_id`, `routing_mode`, `product_id`, `product_version_id` | Forwarded create/update metadata |
| `company_id` | List join and dashboard filters |

`CampaignStatus` values in TypeScript are `draft`, `running`, `paused`, `stopped`, `completed`, `archived`, `deleted`.

### `contacts` (relevant columns)

| Column | Used by |
|--------|---------|
| `campaign_id`, `phone`, `first_name`, `last_name` | Campaign create and callops dispatch |
| `status` | Queue lifecycle: `pending`, `in_progress`, `dialed`, `failed`, `retry` |
| `retry_count`, `last_attempted_at` | Runtime retry state owned by callops |

Contact import/list/action routes forward to callops. Callops owns E.164 normalization, dedupe, campaign membership, network labels, DNC state, and status transitions.

### `call_records` (relevant columns)

| Column | Set/read by |
|--------|-------------|
| `campaign_id`, `contact_id`, `phone`, `room` | callops outcome/recording flow and direct diagnostic CLI |
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
| `GET /companies` | `GET /api/companies` proxy and campaign/leads fan-out seed |
| `POST /companies` | `POST /api/companies` proxy |
| `GET /companies/{id}/campaigns` | `GET /api/campaigns` fan-out proxy |
| `POST /companies/{id}/campaigns` | `POST /api/campaigns` proxy |
| `GET /campaigns/{id}` | `GET /api/campaigns/[id]` summary/detail proxy |
| `PATCH /campaigns/{id}` | `PUT /api/campaigns/[id]` proxy |
| `POST /campaigns/{id}/archive` | `DELETE /api/campaigns/[id]` archive proxy |
| `POST /campaigns/{id}/start` | `POST /api/campaigns/[id]/start` proxy |
| `POST /campaigns/{id}/pause` | `POST /api/campaigns/[id]/pause` proxy |
| `POST /campaigns/{id}/stop` | `POST /api/campaigns/[id]/stop` proxy |
| `GET /campaigns/{id}/status` | `GET /api/campaigns/[id]/status` proxy and UI live stats |
| `GET /campaigns/{id}/contacts` | `GET /api/campaigns/[id]/contacts` proxy |
| `GET /campaigns/{id}/contacts/network-breakdown` | Best-effort breakdown in `GET /api/campaigns/[id]/contacts` |
| `POST /campaigns/{id}/contacts/import` | `POST /api/campaigns/[id]/contacts/import` proxy |
| `POST /contacts/{id}/archive|retry|do-not-call` | `POST /api/contacts/[id]/[action]` proxy |
| `GET /companies/{id}/leads` | `GET /api/leads` fan-out proxy |
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
| `CALLOPS_URL` | Bearer-forwarded callops CRUD/list proxies (`/api/companies`, `/api/campaigns`, contacts, products, leads, settings, lookups) |
| `CALLOPS_URL`, `CALLOPS_WEBHOOK_SECRET` | Secret-authenticated callops proxies (`/api/campaigns/[id]/start|pause|stop|status`, `/api/trunks`, `/api/trunks/[trunk_id]`, `/api/trunks/test-call`) |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | `/api/livekit/webhook`, direct diagnostic CLI |
| `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`, `LIVEKIT_AGENT_NAME` | Direct diagnostic CLI |
| `LIVEKIT_RECORD_*` | Direct diagnostic CLI egress path |
| `INWORLD_API_KEY` | `/api/tts/generate` |
| `AVM_SCRIPT_AUDIO_STORAGE_*` | `/api/tts/save`, `/api/scripts` |
| `STS_RELAY_SECRET`, `STS_SDP_BASE_URL`, `STS_GUID_<PRODUCT>` | `/api/sts/mark` |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` | Server-side WhatsApp sends through `lib/whatsapp/client.ts` |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_GRAPH_VERSION` | `/api/whatsapp/webhook` and WhatsApp client helpers |
| `ANTHROPIC_API_KEY` | `/api/flow-builder/generate` |

---

## Related Files

| Path | Role |
|------|------|
| `utils/callops.ts` | bearer-forwarding CallOps client and error mapper |
| `app/api/campaigns/route.ts` | callops-backed campaign list/create proxy |
| `app/api/campaigns/[id]/route.ts` | callops-backed campaign detail/update/archive proxy |
| `app/api/campaigns/[id]/[action]/route.ts` | callops lifecycle/status proxy |
| `app/api/campaigns/[id]/contacts/route.ts` | callops-backed campaign contact list and network breakdown |
| `app/api/campaigns/[id]/contacts/import/route.ts` | callops-backed bulk contact import |
| `app/api/contacts/[id]/[action]/route.ts` | callops-backed contact row actions |
| `app/api/trunks/route.ts` | SIP trunk catalog and create proxy for campaign wizard/telephony admin |
| `app/api/trunks/[trunk_id]/route.ts` | LiveKit trunk update/delete proxy through callops |
| `app/api/trunks/test-call/route.ts` | one-off SIP test-call proxy through callops |
| `app/api/leads/route.ts` | callops-backed lead-gen reporting fan-out |
| `app/api/flow-builder/generate/route.ts` | Anthropic-backed visual flow generator POC |
| `app/api/whatsapp/webhook/route.ts` | WhatsApp Cloud API verification and signed webhook handler |
| `lib/whatsapp/client.ts` | WhatsApp Cloud API send/signature helpers |
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
