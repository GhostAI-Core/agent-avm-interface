# Agent AVM Interface — API Reference & Alignment Guide

This document describes the Next.js Route Handlers under `app/api/`, how they relate to **evra-callops**, and which Supabase tables they read or write.

---

## Executive Summary

| Layer | What it is | Role |
|-------|------------|------|
| `app/api/` (this repo) | Next.js Route Handlers | Dashboard CRUD, auth-gated read model, lifecycle proxy to callops, TTS, LiveKit webhook |
| `docs/openapi.json` | OpenAPI 3.1 for **evra-callops** | Campaign dispatcher, queue stats, call outcome/telemetry ingestion, LiveKit admin API |
| Supabase | PostgreSQL + Auth + Storage | Source of truth for campaigns, contacts, call records, intents, audit logs |

This app is no longer the production dialer. `app/api/campaigns/[id]/[action]/route.ts` proxies lifecycle actions to evra-callops, and callops owns dispatch, pacing, retries, LiveKit SIP calls, and agent outcome ingestion.

```text
Browser
  │ authenticated fetch
  ▼
app/api/*
  ├─ Supabase session routes: campaigns, companies, logs, reports, intents, templates, trunks
  ├─ POST /api/campaigns/{id}/start|pause|stop ──X-Webhook-Secret──► evra-callops
  ├─ GET  /api/campaigns/{id}/status            ──X-Webhook-Secret──► evra-callops
  ├─ POST /api/livekit/webhook ◄──────────── signed LiveKit room events
  └─ POST /api/calls/result ── deprecated no-op; use callops /calls/outcome
```

---

## Authentication Model

| Auth type | Header / mechanism | Routes |
|-----------|--------------------|--------|
| Supabase session | Cookie from `createServerClient`; validated via `getAuthUser()` | Dashboard CRUD/read routes, lifecycle proxy, trunk catalog |
| `X-Webhook-Secret` | Sent server-side from this app to `CALLOPS_URL` | callops lifecycle/status/trunk cross-checks |
| LiveKit webhook JWT | `Authorization` header; validated by `WebhookReceiver` | `POST /api/livekit/webhook` |
| None | Public | `GET /api/health`, deprecated `POST /api/calls/result` no-op |

The browser never receives `CALLOPS_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, LiveKit API secrets, or Inworld credentials.

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
| Filters | Excludes `deleted` and `archived` |
| Supabase tables | `campaigns`, `companies` |

### `POST /api/campaigns`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Create a campaign and optional contacts |
| Body | `{ name, agent?, dialing_speed?, window_start?, window_end?, voice_recording_url?, voice_path?, transfer_key?, transfer_target?, max_concurrent?, max_retries?, retry_cooldown_seconds?, sip_trunk_id?, contacts?[] }` |
| Response | `{ campaign }` with status **201** |
| Validation | `name` required; contacts with invalid phone numbers are dropped after `normalizePhone()` |
| Supabase tables | `campaigns`, `contacts` |

Create-time details:

| Field | Behavior |
|-------|----------|
| `agent_name` | Always stored as `outbound-recorder`, the deployed LiveKit worker callops dispatches |
| `sip_trunk_id` | Integer FK to `sip_trunks.id`; callops resolves it to `sip_trunks.livekit_trunk_id` |
| `max_concurrent`, `max_retries`, `retry_cooldown_seconds` | Coerced to integers with defaults `5`, `2`, `3600` |
| `window_start`, `window_end` | Stored as `time_window_start`, `time_window_end` |

### `PUT /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Partial campaign update for non-lifecycle fields |
| Allowed fields | `status`, `dialing_speed`, `time_window_start`, `time_window_end`, `voice_recording_url`, `max_concurrent`, `max_retries`, `retry_cooldown_seconds` |
| Response | `{ campaign }` |
| Supabase tables | `campaigns` |

Lifecycle controls should use `/start`, `/pause`, and `/stop` so callops can own dispatch state. Direct `PUT { status }` remains available for other UI flows.

### `DELETE /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Soft delete |
| Behavior | Sets `status = 'deleted'` |
| Response | `{ success: true }` |
| Supabase tables | `campaigns` |

### `POST /api/campaigns/[id]/start|pause|stop`

| | |
|---|---|
| Auth | Supabase user |
| Purpose | Proxy campaign lifecycle commands to evra-callops |
| Body | None |
| Configured response | `{ mode: 'callops', ...callopsResponse }` |
| Local fallback | `{ mode: 'local', campaign_id, status }` when `CALLOPS_URL` or `CALLOPS_WEBHOOK_SECRET` is unset |
| Upstream | `POST $CALLOPS_URL/campaigns/{id}/{action}` with `X-Webhook-Secret` |
| Supabase tables | Fallback only: updates `campaigns.status`; `start` also clears `auto_paused` |

Allowed actions and fallback status:

| Action | Local status |
|--------|--------------|
| `start` | `running` |
| `pause` | `paused` |
| `stop` | `stopped` |

If callops returns a non-2xx response or is unreachable, this app returns **502** with a normalized error message.

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

### `POST /api/calls/result`

| | |
|---|---|
| Auth | None |
| Purpose | Deprecated transition endpoint |
| Behavior | Logs a warning, performs no writes, returns `{ ok: true, deprecated: true }` |
| Replacement | LiveKit agents should POST outcomes to `POST $CALLOPS_URL/calls/outcome` |

This route is intentionally a no-op so not-yet-updated agents stop cleanly during the cutover. Do not build new integrations against it.

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
| Body | `{ campaignName, audioBase64, voiceId? }` |
| Response | `{ storageKey, publicUrl, campaignName }` |
| Env | `AVM_SCRIPT_AUDIO_STORAGE_*` |

---

## Routes Documented Elsewhere But Not Implemented Here

| Route | Status |
|-------|--------|
| `GET /api/campaigns/:id` | Not implemented; only `PUT` and `DELETE` exist for this path |
| `/api/providers` | Not implemented; Settings is informational and telephony admin UI uses local mock data |
| `POST /api/security` | Not implemented |
| `POST /api/campaigns/:id/dial` | Removed from production UI path; use callops lifecycle proxy |
| `POST /api/simulate` | Not implemented |

The direct LiveKit CLI (`npm run dial`) still exists for diagnostics through `scripts/dial-outbound.ts`; it is not exposed as an API route.

---

## Supabase Schema Reference

Tables touched by `app/api/`:

```text
companies ──────────< campaigns ──────────< contacts
                         │
                         ├──< call_records
                         ├──< call_logs
                         └──< intent_stats

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
| `voice_recording_url`, `voice_path` | Campaign voice prompt references |
| `transfer_key`, `transfer_target` | Campaign create metadata |
| `company_id` | List join and dashboard filters |

`CampaignStatus` values in TypeScript are `draft`, `running`, `paused`, `stopped`, `completed`, `archived`, `deleted`.

### `contacts` (relevant columns)

| Column | Used by |
|--------|---------|
| `campaign_id`, `phone`, `first_name`, `last_name` | Campaign create and callops dispatch |
| `status` | Queue lifecycle: `pending`, `in_progress`, `dialed`, `failed`, `retry` |
| `retry_count`, `last_attempted_at` | Runtime retry state owned by callops |

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
| `POST /campaigns/{id}/start` | `POST /api/campaigns/[id]/start` proxy |
| `POST /campaigns/{id}/pause` | `POST /api/campaigns/[id]/pause` proxy |
| `POST /campaigns/{id}/stop` | `POST /api/campaigns/[id]/stop` proxy |
| `GET /campaigns/{id}/status` | `GET /api/campaigns/[id]/status` proxy and UI live stats |
| `POST /calls/outcome` | Agent replacement for deprecated `/api/calls/result` |
| `GET /livekit/trunks` | Optional cross-check in `GET /api/trunks` |
| `POST /livekit/test-call` | Exercised by `npm run callops -- test-call ...`, not proxied to the browser |

OpenAPI endpoints for telemetry, dispatch jobs, rooms, and trunk CRUD are not surfaced directly by this app today.

---

## Environment Variables By Route

| Variable | Routes affected |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | All authenticated Supabase routes |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/livekit/webhook`, diagnostic scripts, voice signing |
| `CALLOPS_URL`, `CALLOPS_WEBHOOK_SECRET` | `/api/campaigns/[id]/start|pause|stop|status`, `/api/trunks` cross-check |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | `/api/livekit/webhook`, direct diagnostic CLI |
| `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`, `LIVEKIT_AGENT_NAME` | Direct diagnostic CLI |
| `LIVEKIT_RECORD_*` | Direct diagnostic CLI egress path |
| `INWORLD_API_KEY` | `/api/tts/generate` |
| `AVM_SCRIPT_AUDIO_STORAGE_*` | `/api/tts/save` |

---

## Related Files

| Path | Role |
|------|------|
| `app/api/campaigns/[id]/[action]/route.ts` | callops lifecycle/status proxy |
| `app/api/trunks/route.ts` | SIP trunk catalog for campaign wizard |
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
