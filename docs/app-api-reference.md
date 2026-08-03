# Agent AVM Interface — API Reference & Alignment Guide

This document describes the Next.js Route Handlers under `app/api/`, how they relate to **evra-callops**, and which Supabase tables they read or write.

---

## Executive Summary

| Layer | What it is | Role |
|-------|------------|------|
| `app/api/` (this repo) | Next.js Route Handlers | Dashboard facade, user-token CallOps proxies, lifecycle proxy, telephony trunk proxies, TTS/script reuse, STS relay, LiveKit webhook, flow-builder generation |
| `docs/openapi.json` | OpenAPI 3.1 for **evra-callops** | Campaign dispatcher, queue stats, contacts/products/leads/trunks, call outcome/telemetry ingestion, LiveKit admin API |
| Supabase | PostgreSQL + Auth + Storage | Source of truth for campaigns, contacts, call records, intents, audit logs |

This app is no longer the production dialer. `app/api/campaigns/[id]/[action]/route.ts` proxies lifecycle actions to evra-callops, and callops owns dispatch, pacing, retries, LiveKit SIP calls, and agent outcome ingestion.

```text
Browser
  │ authenticated fetch
  ▼
app/api/*
  ├─ CallOps bearer-token proxies: campaigns, companies, contacts, products, leads, reports, settings, SIP trunks
  ├─ POST /api/campaigns/{id}/start|pause|stop ──X-Webhook-Secret──► evra-callops
  ├─ GET  /api/campaigns/{id}/status            ──X-Webhook-Secret──► evra-callops
  ├─ /api/trunks/*                              ──X-Webhook-Secret──► callops LiveKit admin
  ├─ /api/sip-trunks/*                          ──Authorization: Bearer user-token──► evra-callops
  ├─ POST /api/sts/mark                         ──optional x-relay-secret──► STS SDP
  ├─ POST /api/flow-builder/generate            ──server-side Anthropic SDK──► Claude flow generation
  ├─ POST /api/livekit/webhook ◄──────────── signed LiveKit room events
  └─ POST /api/calls/result ◄─────────────── X-Webhook-Secret reconciliation from callops
```

---

## Authentication Model

| Auth type | Header / mechanism | Routes |
|-----------|--------------------|--------|
| Supabase session | Cookie from `createServerClient`; validated via `getAuthUser()` | Lifecycle/status proxy, Supabase-backed dashboard templates/scripts/security, LiveKit webhook helpers |
| User bearer token | Supabase access token from `getAccessToken()` forwarded as `Authorization: Bearer ...` | CallOps-backed campaigns, companies, contacts, products, leads, reports, settings, SIP trunk, per-call detail, script-audio routes |
| `X-Webhook-Secret` | Sent server-side from this app to `CALLOPS_URL`, or checked on inbound reconciliation | Lifecycle/status/trunk legacy proxies; inbound `POST /api/calls/result` |
| `x-relay-secret` | Optional shared secret checked when `STS_RELAY_SECRET` is set | `POST /api/sts/mark` |
| LiveKit webhook JWT | `Authorization` header; validated by `WebhookReceiver` | `POST /api/livekit/webhook` |
| None | Public | `GET /api/health`; `POST /api/sts/mark` only when `STS_RELAY_SECRET` is unset; `POST /api/flow-builder/generate` currently does not validate a Supabase session |

The browser never receives `CALLOPS_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, LiveKit API secrets, Inworld credentials, Anthropic credentials, or STS relay/GUID secrets.

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
| Auth | User bearer token |
| Purpose | List campaigns across the user's CallOps companies |
| Response | `{ campaigns: Campaign[] }`; each row is flattened with the company name as `company` |
| Upstream | `GET $CALLOPS_URL/companies`, then `GET $CALLOPS_URL/companies/{id}/campaigns` for each company |
| Supabase tables | None directly |

### `POST /api/campaigns`

| | |
|---|---|
| Auth | User bearer token |
| Purpose | Create a campaign and optional contacts through CallOps |
| Body | `{ name, company_id, agent?, dialing_speed?, window_start?, window_end?, audio_path?, voice_recording_url?, transfer_key?, transfer_target?, max_concurrent?, max_retries?, retry_cooldown_seconds?, sip_trunk_id?, network_provider?, voice_id?, routing_mode?, product_id?, product_version_id?, contacts?[] }` |
| Response | CallOps create response with status **201**; currently `{ campaign, contacts_imported?, contacts_rejected? }` |
| Validation | `name` and `company_id` required; contacts must have `phone` before forwarding |
| Upstream | `POST $CALLOPS_URL/companies/{company_id}/campaigns` with user bearer token |
| Supabase tables | None directly; CallOps owns campaign/contact writes |

Create-time details:

| Field | Behavior |
|-------|----------|
| `agent_name` | Always stored as `outbound-recorder`, the deployed LiveKit worker callops dispatches |
| `sip_trunk_id` | Forwarded as a number when present; CallOps resolves trunk details |
| `max_concurrent`, `max_retries`, `retry_cooldown_seconds` | Coerced to integers with defaults `5`, `2`, `3600` |
| `window_start`, `window_end` | Stored as `time_window_start`, `time_window_end` |
| `audio_path` / `voice_recording_url` | `audio_path` from the UI maps to `voice_recording_url` because the dispatcher reads that field |
| `product_id`, `product_version_id` | Optional product pointer; CallOps derives product fields when supported and can pin an exact script version |
| `contacts` | Forwarded to CallOps; CallOps owns E.164 normalization, dedupe, campaign linking, and rejection reporting |

### `GET /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Fetch CallOps campaign detail/summary for a single campaign |
| Response | `{ summary, campaign }`; `{ mode: 'unconfigured', summary: null }` when CallOps env is missing |
| Upstream | `GET $CALLOPS_URL/campaigns/{id}` with `X-Webhook-Secret` |
| Supabase tables | None directly |

The `summary` block supplies aggregates such as `connected`, `opt_out`, and `calls_total` that the frontend cannot always derive from list data.

### `PUT /api/campaigns/[id]`

| | |
|---|---|
| Auth | User bearer token |
| Purpose | Partial campaign update for non-lifecycle fields through CallOps |
| Allowed fields | `name`, `agent`, `dialing_speed`, `time_window_start`, `time_window_end`, `max_concurrent`, `max_retries`, `retry_cooldown_seconds`, `sip_trunk_id`, `voice_recording_url`, `voice_path`, `audio_path`, `transfer_key`, `transfer_target`, `network_provider`, `voice_id`, `routing_mode`, `product_id`, `product_version_id` |
| Response | `{ campaign }` |
| Upstream | `PATCH $CALLOPS_URL/campaigns/{id}` with user bearer token |
| Supabase tables | None directly |

Lifecycle controls must use `/start`, `/pause`, and `/stop` so callops can own dispatch state. Direct `PUT { status }` is intentionally rejected by the field allow-list.

### `DELETE /api/campaigns/[id]`

| | |
|---|---|
| Auth | User bearer token |
| Purpose | Soft archive |
| Behavior | Calls CallOps archive; no hard delete in this app |
| Response | `{ success: true }` |
| Upstream | `POST $CALLOPS_URL/campaigns/{id}/archive` with user bearer token |

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
| Auth | User bearer token |
| Purpose | List contacts for one campaign and return whole-campaign network counts |
| Query | `status?`, `network?`, `search?`/`phone?`, `page?`, `page_size?` (capped at 200) |
| Response | `{ items, page, page_size, total, breakdown }` |
| Upstream | `GET $CALLOPS_URL/campaigns/{id}/contacts`, plus best-effort `GET /campaigns/{id}/contacts/network-breakdown` |

`network` is translated to CallOps `network_provider`. The `breakdown` is independent of the visible filters so operators can see the campaign's network mix before setting a dial gate.

### `POST /api/campaigns/[id]/contacts/import`

| | |
|---|---|
| Auth | User bearer token |
| Purpose | Bulk import contacts into a campaign |
| Body | `{ contacts: [{ phone, first_name?, last_name?, external_id? }], dedupe?, source? }` |
| Response | CallOps import summary |
| Upstream | `POST $CALLOPS_URL/campaigns/{id}/contacts/import` |

The browser parses CSV rows before calling this route. CallOps owns dedupe, E.164 normalization, campaign linking, and rejection reporting.

### `POST /api/contacts/[id]/archive|retry|do-not-call`

| | |
|---|---|
| Auth | User bearer token |
| Purpose | Per-contact row actions from ContactsView |
| Response | CallOps action result, or `{ ok: true }` when upstream returns no body |
| Upstream | `POST $CALLOPS_URL/contacts/{id}/{action}` |

The action segment is allowlisted before proxying; arbitrary contact paths are rejected with **400**.

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

### `/api/companies/[id]/sip-trunks` and `/api/sip-trunks/[id]`

These routes back the live **Outbound Trunks** tab in `TelephonyView`. They are distinct from the older `/api/trunks` compatibility routes above.

| Route | Auth | Purpose | Upstream |
|-------|------|---------|----------|
| `GET /api/companies/[id]/sip-trunks` | User bearer token | List company trunks with `page`, `page_size`, `sort`, `search` passthrough | `GET /companies/{id}/sip-trunks` |
| `POST /api/companies/[id]/sip-trunks` | User bearer token | Create a company-scoped SIP trunk | `POST /companies/{id}/sip-trunks` |
| `GET /api/sip-trunks/[id]` | User bearer token | Fetch one trunk; credentials are not returned by CallOps | `GET /sip-trunks/{id}` |
| `PATCH /api/sip-trunks/[id]` | User bearer token | Partially update supplied trunk fields | `PATCH /sip-trunks/{id}` |
| `GET /api/sip-trunks/[id]/health` | User bearer token | Fetch trunk health/live status | `GET /sip-trunks/{id}/health` |
| `POST /api/sip-trunks/[id]/test-call` | User bearer token | Place a trunk-specific test call; requires `{ phone }` | `POST /sip-trunks/{id}/test-call` |
| `POST /api/sip-trunks/[id]/archive` | User bearer token | Archive one trunk | `POST /sip-trunks/{id}/archive` |

As with CallOps trunk creation, authentication secrets are not returned to the browser. A failed test call can still be a successful HTTP response with an `ok: false` payload.

### `POST /api/calls/result`

| | |
|---|---|
| Auth | Inbound `X-Webhook-Secret` matching `CALLOPS_WEBHOOK_SECRET` |
| Purpose | Secondary reconciliation backfill for call outcomes already handled by CallOps |
| Body | CallOps/agent outcome shape: `{ contact_id?, campaign_id, room_name, outcome, phone?, talk_seconds?, transferred?, business_disposition?, ended_at? }` |
| Response | `{ ok: true, action: 'inserted' \| 'exists' \| 'skipped' }` or validation/auth errors |
| Supabase tables | `call_records` via service-role client |

CallOps remains the primary writer. This route checks for an existing `call_records.room` and inserts only when the primary write is missing. It returns `skipped` when `CALLOPS_WEBHOOK_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` is unavailable, and it maps legacy raw outcomes (`answered`, `ivr`, `opt_out`, `subscribe`) to the stored dashboard vocabulary before backfilling.

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

### `/api/calls/[id]` detail routes

| Route | Auth | Purpose | Upstream |
|-------|------|---------|----------|
| `GET /api/calls/[id]` | User bearer token | Fetch a single call detail envelope (`{ call, contact, campaign }`) | `GET /calls/{id}` |
| `GET /api/calls/[id]/telemetry` | User bearer token | Fetch model-usage telemetry (`{ telemetry: [...] }`) | `GET /calls/{id}/telemetry` |
| `GET /api/calls/[id]/call-report` | User bearer token | Fetch telephony narrative: AMD, SIP, DTMF, playback, transfer, disconnect/talk data | `GET /calls/{id}/call-report` |
| `GET /api/calls/[id]/recording` | User bearer token | Fetch a signed recording URL (`{ recording_url, expires_at }`) | `GET /calls/{id}/recording` |

These routes pass CallOps errors through the shared `callopsErrorResponse()` normalizer. A missing recording can pass through as 404 so the UI can show an unavailable state rather than a crash.

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
| Auth | User bearer token |
| Query | `agent?` (legacy), `product_id?`, `from?`, `to?`; `date?` is accepted by the frontend builder but current CallOps range scoping uses `from`/`to` |
| Response | `{ reports: CampaignReport[] }` with campaign/product display fields |
| Upstream | For each company: `GET /companies/{id}/dashboard/campaign-performance`, `GET /companies/{id}/campaigns`, `GET /companies/{id}/products` |

The route maps CallOps `by_outcome` into the dashboard report columns: `subscribed -> qualified`, `lead -> lead`, `opted_out -> opt_out`, plus `connected`, `no_answer`, `voicemail`, and `failed`. `dialed` is CallOps `calls`, and `total_spent` is CallOps `total_cost`.

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
| Auth | User bearer token |
| Response | `{ companies: { id, name, contact_name, contact_email, contact_phone }[] }` |
| Upstream | `GET $CALLOPS_URL/companies` |

### `POST /api/companies`

| | |
|---|---|
| Auth | User bearer token |
| Body | `{ name, contact_name?, contact_email?, contact_phone? }` |
| Response | `{ company }` with status **201** |
| Upstream | `POST $CALLOPS_URL/companies` |

### `/api/products`

| Route | Auth | Purpose | Upstream |
|-------|------|---------|----------|
| `GET /api/products?company_id=...` | User bearer token | List products for one company | `GET /companies/{company_id}/products` |
| `POST /api/products` | User bearer token | Create a company product; `company_id` and `name` required | `POST /companies/{company_id}/products` |
| `GET /api/products/[id]` | User bearer token | Fetch one product | `GET /products/{id}` |
| `PATCH /api/products/[id]` | User bearer token | Partially update one product | `PATCH /products/{id}` |
| `GET /api/products/[id]/versions` | User bearer token | List script versions | `GET /products/{id}/versions` |
| `POST /api/products/[id]/versions` | User bearer token | Create a script version; defaults `set_current` to true | `POST /products/{id}/versions` |
| `POST /api/products/[id]/versions/[versionId]/activate` | User bearer token | Promote/roll back the active product script version | `POST /products/{id}/versions/{versionId}/activate` |

Products are company-scoped CallOps entities. `integration_type` distinguishes Lead Gen from STS Subscription products, and `sts_product_key` is only meaningful for STS Subscription.

### `GET /api/leads`

| | |
|---|---|
| Auth | User bearer token |
| Query | `campaignId?` |
| Purpose | List Lead-Gen contacts who pressed 1, including single and double opt-ins |
| Response | `{ leads, total, double_optin, single_optin }` |
| Upstream | For each company: `GET /companies/{id}/leads`; best-effort enrichment from `GET /campaigns/{id}` and `GET /campaigns/{id}/contacts` |

Rows are sorted newest-first. `cost` is the persisted per-call cost from CallOps, not a frontend estimate.

### `GET /api/lookups/[type]`

| | |
|---|---|
| Auth | User bearer token |
| Purpose | Fetch allowlisted lookup values from CallOps |
| Allowlist | `call-outcomes`, `agent-outcomes`, `business-dispositions`, `contact-statuses`, `campaign-statuses`, `calling-windows`, `timezones` |
| Upstream | `GET $CALLOPS_URL/lookups/{type}` |

Unknown lookup types are rejected locally with **400** before proxying.

### `/api/settings`

| Route | Auth | Purpose | Upstream |
|-------|------|---------|----------|
| `GET /api/settings` | User bearer token | Read global platform settings, currently carrier cost-per-minute | `GET /system-settings` |
| `PATCH /api/settings` | User bearer token | Update `cost_per_minute_zar`; must be a positive number | `PATCH /system-settings` |

CallOps enforces read/write authorization for settings.

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
| `GET /api/script-audio?campaign_id=...` | User bearer token | Fetch the latest campaign-scoped script/audio history row | `GET /script-audio?campaign_id=...&page_size=1` |
| `POST /api/script-audio` | User bearer token | Record saved script audio/text metadata for one campaign | `POST /script-audio` |

`POST` requires `campaign_id` and `audio_url`; optional fields are `text`, `voice`, and `duration_seconds`. This history is separate from the global reuse library at `/api/voice-scripts`.

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
| Auth | None in this route today |
| Purpose | Convert a natural-language campaign flow prompt into React Flow-compatible nodes and edges |
| Body | `{ prompt: string }` |
| Response | `{ nodes, edges }` suitable for the flow-builder preview |
| Env | `ANTHROPIC_API_KEY` |
| Model/tooling | Anthropic SDK, model `claude-opus-4-8`, forced `build_flow` tool |

The system prompt is generated from `components/flow-builder/nodeSpecs.ts`, so Claude can only choose registered `specKey`s and listed fields. The route filters returned nodes to valid specs and filters edges to known node IDs; the client then lays out the graph and shows a read-only proof-check preview before applying it to the canvas. It does not persist or execute the flow.

---

## Routes Documented Elsewhere But Not Implemented Here

| Route | Status |
|-------|--------|
| `POST /api/campaigns/:id/dial` | Removed; production lifecycle uses `POST /api/campaigns/:id/start|pause|stop`, and direct LiveKit diagnostics use scripts |
| `/api/providers` | Not implemented; Telephony uses CallOps SIP-trunk routes for trunks and local mock data for non-trunk tabs |
| `POST /api/security` | Not implemented |
| `POST /api/simulate` | Not implemented |

The direct LiveKit CLI (`npm run dial`) still exists for diagnostics through `scripts/dial-outbound.ts`; it is not the production UI lifecycle path.

---

## Supabase Schema Reference

Operational campaign data is now normally read/written through CallOps using the user's Supabase bearer token. The tables below are either touched directly by `app/api/` fallback/reconciliation routes, or are the underlying CallOps-owned tables that the dashboard shapes around.

```text
companies ──────────< campaigns ──────────< contacts
                         │
                         ├──< call_records
                         └──< intent_stats

products ───────────< product_script_versions
voice_scripts          dashboard_templates     security_logs
profiles               storage.buckets: voice-recordings, avm-scripts
```

### `campaigns` (relevant columns)

| Column | Used by |
|--------|---------|
| `id`, `name`, `agent`, `status` | Campaign list/create/update, callops lifecycle status |
| `dialing_speed`, `time_window_start`, `time_window_end` | Create/update; scheduling inputs for callops |
| `max_retries`, `retry_cooldown_seconds`, `max_concurrent`, `auto_paused` | Create/update/read; callops owns runtime behavior |
| `sip_trunk_id` | Selected by the campaign wizard / CallOps trunk model |
| `agent_name` | Set to `outbound-recorder` on create |
| `voice_recording_url`, `voice_path`, `audio_path` | Campaign voice prompt/script references |
| `transfer_key`, `transfer_target` | Campaign create metadata |
| `company_id` | List join and dashboard filters |
| `network_provider` | Contacts view network gate; CallOps skips contacts outside the selected network |
| `product_id`, `product_version_id` | Product/script selection; product version may be pinned |

`CampaignStatus` values in TypeScript are `draft`, `running`, `paused`, `stopped`, `completed`, `archived`, `deleted`.

### `contacts` (relevant columns)

| Column | Used by |
|--------|---------|
| `campaign_id`, `phone`, `first_name`, `last_name`, `network_provider` | Campaign contacts, filtering, network-gated dispatch |
| `status` | Queue lifecycle: `pending`, `in_progress`, `dialed`, `failed`, `retry` |
| `retry_count`, `last_attempted_at` | Runtime retry state owned by callops |

Contact dedupe, normalization, status transitions, and DNC/archive/retry actions are owned by CallOps for the active UI paths.

### `call_records` (relevant columns)

| Column | Set/read by |
|--------|-------------|
| `campaign_id`, `contact_id`, `phone`, `room` | callops and reconciliation fallback |
| `outcome`, `business_disposition` | callops outcome ingestion; `/api/calls/result` reconciliation fallback |
| `talk_seconds`, `transferred`, `cost` | callops outcome ingestion; webhook/reconciliation fallback for selected fields |
| `recording_url`, `egress_id` | LiveKit/callops recording flow |
| `called_at` | Dashboard sorting/filtering |

Known displayed outcome buckets include `connected`, `qualified`/`subscribed`, `lead`, `opt_out`/`opted_out`, `voicemail`, `no_answer`, and `failed`. Legacy columns such as `no_speech`, `hangup`, `ni`, `dnq`, `callback`, and `busy_line` remain in TypeScript/report shapes but may be zero when CallOps does not emit them.

---

## OpenAPI (`docs/openapi.json`) Alignment

`docs/openapi.json` describes evra-callops, not this Next.js app. The current integration points are:

| callops concept | This app integration |
|-----------------|----------------------|
| `POST /campaigns/{id}/start` | `POST /api/campaigns/[id]/start` proxy |
| `POST /campaigns/{id}/pause` | `POST /api/campaigns/[id]/pause` proxy |
| `POST /campaigns/{id}/stop` | `POST /api/campaigns/[id]/stop` proxy |
| `GET /campaigns/{id}/status` | `GET /api/campaigns/[id]/status` proxy and UI live stats |
| `GET /companies`, `/companies/{id}/campaigns` | `GET /api/companies`, `GET /api/campaigns` fan-out |
| `POST /companies/{id}/campaigns`, `PATCH /campaigns/{id}`, `POST /campaigns/{id}/archive` | Campaign create/edit/archive routes |
| `GET /campaigns/{id}/contacts`, `POST /campaigns/{id}/contacts/import`, `POST /contacts/{id}/{action}` | Contacts view and CSV import |
| `/companies/{id}/products`, `/products/{id}/versions` | Products view and product script version manager |
| `/companies/{id}/leads` | `GET /api/leads` |
| `/companies/{id}/dashboard/campaign-performance` | `GET /api/reports` |
| `POST /calls/outcome` | Primary CallOps/agent outcome ingestion; `/api/calls/result` is a secondary reconciliation safety net |
| `/calls/{id}`, `/calls/{id}/telemetry`, `/calls/{id}/call-report`, `/calls/{id}/recording` | Per-call detail dialog routes |
| `GET /livekit/trunks` | Optional cross-check in `GET /api/trunks` |
| `POST /livekit/trunks` | `POST /api/trunks` browser-facing proxy |
| `PATCH /livekit/trunks/{trunk_id}` | `PATCH /api/trunks/[trunk_id]` browser-facing proxy |
| `DELETE /livekit/trunks/{trunk_id}` | `DELETE /api/trunks/[trunk_id]` browser-facing proxy |
| `POST /livekit/test-call` | `POST /api/trunks/test-call` browser-facing proxy and `npm run callops -- test-call ...` diagnostic CLI |
| `/companies/{id}/sip-trunks`, `/sip-trunks/{id}` | Telephony Outbound Trunks tab routes |

Dispatch jobs and room-admin endpoints are not surfaced directly by this app today.

---

## Environment Variables By Route

| Variable | Routes affected |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | All authenticated Supabase routes |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/livekit/webhook`, `/api/calls/result`, diagnostic scripts, voice signing |
| `CALLOPS_URL` | All CallOps bearer-token proxies plus lifecycle/trunk legacy proxies |
| `CALLOPS_WEBHOOK_SECRET` | `/api/campaigns/[id]/start|pause|stop|status`, `/api/campaigns/[id]` summary, `/api/trunks`, `/api/trunks/[trunk_id]`, `/api/trunks/test-call`, inbound `/api/calls/result` |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | `/api/livekit/webhook`, direct diagnostic CLI |
| `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`, `LIVEKIT_AGENT_NAME` | Direct diagnostic CLI |
| `LIVEKIT_RECORD_*` | Direct diagnostic CLI egress path |
| `INWORLD_API_KEY` | `/api/tts/generate` |
| `AVM_SCRIPT_AUDIO_STORAGE_*` | `/api/tts/save`, `/api/scripts` |
| `STS_RELAY_SECRET`, `STS_SDP_BASE_URL`, `STS_GUID_<PRODUCT>` | `/api/sts/mark` |
| `ANTHROPIC_API_KEY` | `/api/flow-builder/generate` |

---

## Related Files

| Path | Role |
|------|------|
| `app/api/campaigns/[id]/[action]/route.ts` | callops lifecycle/status proxy |
| `app/api/campaigns/route.ts` | CallOps-backed campaign list/create facade |
| `app/api/campaigns/[id]/route.ts` | single campaign summary, update, archive facade |
| `app/api/campaigns/[id]/contacts/route.ts` | CallOps-backed campaign contacts + network breakdown |
| `app/api/campaigns/[id]/contacts/import/route.ts` | CallOps-backed campaign contact import |
| `app/api/contacts/[id]/[action]/route.ts` | allowlisted contact action proxy |
| `app/api/products/**/route.ts` | product and product script version proxies |
| `app/api/leads/route.ts` | CallOps-backed lead report facade |
| `app/api/settings/route.ts` | CallOps-backed system settings facade |
| `app/api/lookups/[type]/route.ts` | allowlisted CallOps lookup proxy |
| `app/api/trunks/route.ts` | SIP trunk catalog and create proxy for campaign wizard/telephony admin |
| `app/api/trunks/[trunk_id]/route.ts` | LiveKit trunk update/delete proxy through callops |
| `app/api/trunks/test-call/route.ts` | one-off SIP test-call proxy through callops |
| `app/api/companies/[id]/sip-trunks/route.ts` | company-scoped SIP trunk list/create proxy |
| `app/api/sip-trunks/[id]/**/route.ts` | SIP trunk detail/update/health/test/archive proxies |
| `app/api/calls/[id]/**/route.ts` | per-call detail, telemetry, call-report, and recording proxies |
| `app/api/script-audio/route.ts` | campaign-scoped script/audio history proxy |
| `app/api/scripts/route.ts` | saved script audio object listing |
| `app/api/voice-scripts/route.ts` | saved script text/audio reuse library |
| `app/api/sts/mark/route.ts` | STS subscribe/opt-out relay |
| `app/api/flow-builder/generate/route.ts` | Anthropic-backed flow-builder generation endpoint |
| `app/api/calls/result/route.ts` | secret-protected call outcome reconciliation fallback |
| `app/api/livekit/webhook/route.ts` | signed LiveKit webhook fallback updates |
| `scripts/callops-test.ts` | callops smoke/integration test harness |
| `scripts/dial-outbound.ts` | direct LiveKit diagnostic dial script |
| `lib/outbound-call.ts` | direct LiveKit SDK helpers |
| `lib/voice.ts` | voice URL resolution/signing helpers |
| `utils/supabase/auth.ts` | session auth helper |
| `utils/supabase/admin.ts` | service-role client |
| `supabase/migrations/*.sql` | schema source of truth |
| `docs/openapi.json` | evra-callops API contract |
