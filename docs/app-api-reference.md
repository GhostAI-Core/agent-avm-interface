# Agent AVM Interface — API Reference & Alignment Guide

This document describes every route under `app/api/` in this repository, how it differs from `docs/openapi.json` (which documents **evra-callops**, a separate orchestration service), and how both relate to the Supabase schema in `supabase/migrations/`.

---

## Executive summary

| Layer | What it is | Role |
|-------|------------|------|
| **`app/api/`** (this repo) | Next.js Route Handlers | Dashboard CRUD, batch dial gateway, LiveKit webhook, agent callbacks, TTS |
| **`docs/openapi.json`** | OpenAPI 3.1 for **evra-callops** | Campaign dispatcher, queue stats, call outcome/telemetry ingestion, LiveKit admin API |
| **Supabase** | PostgreSQL + Auth + Storage | Source of truth for campaigns, contacts, call records, intents, audit logs |

These three are **not the same API**. Only `/health` and the LiveKit webhook concept overlap in spirit. The OpenAPI spec was generated from a FastAPI/Python backend (`HTTPValidationError`, `operationId` naming) and does not describe this Next.js app.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         REQUEST FLOW (this app)                              │
└──────────────────────────────────────────────────────────────────────────────┘

  Browser (authenticated)                Agent worker (secret)    LiveKit (JWT)
         │                                        │                      │
         ▼                                        ▼                      ▼
  ┌─────────────┐   POST /api/calls/result   ┌─────────────┐   POST /api/livekit/webhook
  │  app/api/*  │◄───────────────────────────│ LiveKit     │──────────────────►
  │  (14 routes)│                            │ agent       │
  └──────┬──────┘                            └─────────────┘
         │
         │  user session (RLS)          service role (bypass RLS)
         ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ Supabase: campaigns, contacts, call_records, intent_stats │
  │           companies, security_logs, dashboard_templates │
  └─────────────────────────────────────────────────────────────┘
         │
         ▼
  ┌─────────────┐
  │ LiveKit SDK │  placeOutboundCall → AgentDispatch + SipParticipant
  └─────────────┘

  docs/openapi.json describes a DIFFERENT box (evra-callops) that would sit
  between agent and DB with its own dispatcher, queue, and LiveKit CRUD API.
```

---

## Authentication model

| Auth type | Header / mechanism | Routes |
|-----------|-------------------|--------|
| **Supabase session** | Cookie from `createServerClient`; validated via `getAuthUser()` | All dashboard routes |
| **`x-agent-secret`** | Must match `AGENT_RESULT_SECRET` | `POST /api/calls/result` |
| **LiveKit webhook JWT** | `Authorization` header; validated by `WebhookReceiver` | `POST /api/livekit/webhook` |
| **None** | Public | `GET /api/health` |

OpenAPI (callops) uses **`X-Webhook-Secret`** for agent-facing endpoints. This app uses a different header name and only on `/api/calls/result`.

**Supabase clients used:**

| ClientRect | Client | Why |
|-----------|--------|-----|
| Dashboard CRUD | Server client (user session) | Respects RLS; user must be logged in |
| Webhook, agent result | Admin client (service role) | LiveKit/agent have no user session; must write past RLS |

---

## Route inventory

All paths are prefixed with `/api` by Next.js App Router convention. OpenAPI paths omit this prefix and describe a different host (callops).

### `GET /api/health`

| | |
|---|---|
| **Auth** | None |
| **Purpose** | Deploy/load-balancer probe |
| **Response** | `{ "status": "ok" }` |
| **Supabase** | None |
| **OpenAPI equivalent** | `GET /health` — **only exact behavioral match** |

---

### `GET /api/campaigns`

| | |
|---|---|
| **Auth** | Supabase user |
| **Purpose** | List active campaigns for the dashboard |
| **Query** | None |
| **Response** | `{ campaigns: Campaign[] }` — joins `companies.name` as flattened `company` string |
| **Filters** | Excludes `status IN ('deleted', 'archived')` |
| **Supabase tables** | `campaigns`, `companies` (join) |

**Not in OpenAPI.** Callops exposes lifecycle actions (`/start`, `/pause`, `/stop`, `/status`) but not a list/create CRUD API for the UI.

---

### `POST /api/campaigns`

| | |
|---|---|
| **Auth** | Supabase user |
| **Purpose** | Create campaign + optional contact list in one request |
| **Body** | `{ name, agent?, dialing_speed?, window_start?, window_end?, voice_recording_url?, voice_path?, transfer_key?, transfer_target?, contacts?[] }` |
| **Response** | `{ campaign }` — **201** |
| **Validation** | `name` required; `agent` optional (NULL allowed) |
| **Supabase tables** | `campaigns` (insert), `contacts` (bulk insert if provided) |

**Field mapping to DB:**

| Request field | DB column |
|---------------|-----------|
| `window_start` | `time_window_start` |
| `window_end` | `time_window_end` |
| `voice_path` | `voice_path` (Storage object key) |

**Not in OpenAPI.**

---

### `PUT /api/campaigns/[id]`

| | |
|---|---|
| **Auth** | Supabase user |
| **Purpose** | Partial campaign update (status changes, dialing settings) |
| **Allowed fields** | `status`, `dialing_speed`, `time_window_start`, `time_window_end`, `voice_recording_url` |
| **Response** | `{ campaign }` |
| **Supabase tables** | `campaigns` |

**Differs from OpenAPI:**

| This app | OpenAPI (callops) |
|----------|-------------------|
| Generic `PUT { status: 'paused' }` | Dedicated `POST /campaigns/{id}/pause` with 409 conflict rules |
| No state-machine validation in API | Explicit transitions; 409 if wrong state |
| No `stopped` status in Supabase CHECK | OpenAPI uses `stopped` as terminal state |

Supabase `campaigns.status` allows: `draft`, `running`, `paused`, `completed`, `deleted`, `archived`. There is **no `stopped`** — the app uses `completed` or soft `deleted` instead.

---

### `DELETE /api/campaigns/[id]`

| | |
|---|---|
| **Auth** | Supabase user |
| **Purpose** | Soft delete |
| **Behavior** | Sets `status = 'deleted'` (does not remove row) |
| **Response** | `{ success: true }` |
| **Supabase tables** | `campaigns` |

**Not in OpenAPI** (callops has `POST /stop` for halting dispatch, not UI delete).

---

### `POST /api/campaigns/[id]/dial`

| | |
|---|---|
| **Auth** | Supabase user |
| **Purpose** | Dispatch up to **25** pending contacts via LiveKit |
| **Body** | None (campaign id from path) |
| **Response (configured)** | `{ mode: 'live', dispatched, attempted, errors[] }` |
| **Response (unconfigured)** | `{ mode: 'unconfigured' }` — UI may fall back to simulator |
| **Response (no contacts)** | `{ mode: 'live', dispatched: 0, status: 'completed' }` |

**Execution steps:**

1. Load campaign from `campaigns`.
2. Resolve SIP trunk: `campaigns.sip_trunk_id` → `sip_trunks.livekit_trunk_id` → `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`.
3. Select `contacts` where `status = 'pending'`, limit 25.
4. Sign voice URL from `voice_path` / `voice_recording_url`.
5. For each contact: `placeOutboundCall()` — creates room `avm_<campaignId>_<contactId>_<rand>`, dispatches agent, creates SIP participant.
6. Update contacts: `in_progress` → then `dialed` or `failed`.
7. Insert `call_records` rows (`outcome: 'pending'`, keyed by `room`).
8. Optionally start egress recording.
9. Insert `security_logs` audit row.

**Supabase tables:** `campaigns`, `contacts`, `call_records`, `security_logs`, `sip_trunks` (lookup)

**Differs from OpenAPI:**

| This app | OpenAPI (callops) |
|----------|-------------------|
| `POST /api/campaigns/[id]/dial` — synchronous batch | `POST /campaigns/{id}/start` — starts dispatcher worker |
| No queue metrics endpoint | `GET /campaigns/{id}/status` — live queue stats |
| Batch size hardcoded (25) | Dispatcher pulls at `dialing_speed` / concurrency |
| Does not use `max_concurrent`, `max_retries`, `retry_cooldown_seconds` columns | Implied full pacing/retry engine |
| Does not set `auto_paused` | OpenAPI stats expose `auto_paused` from scheduling enforcer |

DB columns `max_retries`, `retry_cooldown_seconds`, `max_concurrent`, `auto_paused` exist (migration `20260612140000`) but **the dial route does not read or update them yet**.

---

### `POST /api/calls/result`

| | |
|---|---|
| **Auth** | `x-agent-secret: AGENT_RESULT_SECRET` |
| **Purpose** | Agent reports rich call outcome + intent waterfall |
| **Body** | `{ room, outcome?, talkSeconds?, transferred?, cost?, intents?[] }` |
| **Response** | `{ ok: true }` |
| **Supabase tables** | `call_records` (update by `room`), `intent_stats` (via `bump_intent` RPC) |

**Valid outcomes:** `pending`, `connected`, `qualified`, `voicemail`, `no_speech`, `hangup`, `ni`, `dnq`, `callback`, `no_answer`, `busy`, `failed`

**Intent payload:** `{ name: string, step?: number }[]` — increments `intent_stats.reached` for campaign/day parsed from room name.

**OpenAPI equivalent:** `POST /calls/outcome` — **related domain, different contract**

| Field | This app | OpenAPI `CallOutcomeRequest` |
|-------|----------|------------------------------|
| Auth header | `x-agent-secret` | `X-Webhook-Secret` |
| Room identifier | `room` | `room_name` |
| Contact | Implicit via room name parse | `contact_id` (required) |
| Campaign | Implicit via room name parse | `campaign_id` (required) |
| Outcome values | IVR-specific set above | `answered`, `no_answer`, `busy`, `failed`, `transferred`, `voicemail` |
| SIP metadata | Not accepted | `sip_attributes`, `sip_call_status_history`, `sip_participant_sid`, etc. |
| AMD / DTMF | Not accepted | `amd_category`, `dtmf_digits` |
| Retry logic | Not in this endpoint | Callops applies retry + releases concurrency slot |
| Response | `{ ok: true }` | `{ status: "ok" }` |

**OpenAPI also has** `POST /calls/telemetry` for SDK metric batches (`CallTelemetryRequest`). **Not implemented** in this app — no telemetry table in Supabase.

---

### `POST /api/livekit/webhook`

| | |
|---|---|
| **Auth** | LiveKit JWT in `Authorization` |
| **Purpose** | Update `call_records` from room lifecycle events |
| **Response** | `{ ok: true }` or `{ ok: true, persisted: false }` if no service role key |

**Handled events:**

| Event | DB update |
|-------|-----------|
| `participant_joined` | If participant identity starts with `caller_` → `call_records.outcome = 'connected'` where `outcome = 'pending'` |
| `egress_ended` | Set `recording_url` from file location |
| `room_finished` | Set `talk_seconds` for connected calls; set `outcome = 'no_answer'` for still-pending |

**OpenAPI equivalent:** `POST /livekit/webhook` — partial overlap

| | This app | OpenAPI |
|---|----------|---------|
| Events handled | 3 event types | Many: `room_started`, `room_finished`, participant join/leave, tracks, ingress |
| Side effect | Updates `call_records` | Updates "call session" fields (`room_id`, `started_at`, `ended_at`, SIP leg state) |
| Session concept | Row per room in `call_records` | Separate call session abstraction (not a Supabase table here) |

---

### `GET /api/logs`

| | |
|---|---|
| **Auth** | Supabase user |
| **Query** | `campaignId?` — omit for last 2000 calls across all campaigns |
| **Response** | `{ logs: CallRecord[] }` |
| **Columns returned** | `id, campaign_id, phone, outcome, talk_seconds, cost, transferred, recording_url, called_at` |
| **Supabase tables** | `call_records` |

**Not in OpenAPI.**

---

### `GET /api/reports`

| | |
|---|---|
| **Auth** | Supabase user |
| **Query** | `agent?`, `date?` |
| **Response** | `{ reports: CallLog[] }` with joined `campaign(name, agent)` |
| **Supabase tables** | `call_logs` (legacy aggregate table) |

**Not in OpenAPI.** This reads pre-aggregated counters, not live dispatcher stats.

---

### `GET /api/intents`

| | |
|---|---|
| **Auth** | Supabase user |
| **Query** | `campaignId?`, `date?` (default today) |
| **Response** | `{ day, connectedTotal?, intents[] }` |
| **Supabase tables** | `intent_stats`, `call_records` (count connected for denominator) |

**Not in OpenAPI.**

---

### `GET /api/companies`

| | |
|---|---|
| **Auth** | Supabase user |
| **Response** | `{ companies: { id, name, contact_name, contact_email, contact_phone }[] }` |
| **Supabase tables** | `companies` |

---

### `POST /api/companies`

| | |
|---|---|
| **Auth** | Supabase user |
| **Body** | `{ name, contact_name?, contact_email?, contact_phone? }` |
| **Response** | `{ company }` — **201** |
| **Supabase tables** | `companies` |

**Not in OpenAPI.**

---

### `GET /api/security`

| | |
|---|---|
| **Auth** | Supabase user |
| **Response** | `{ logs: SecurityLog[] }` — last 100 rows |
| **Supabase tables** | `security_logs` |

README mentions `POST` for IP whitelist; **no POST handler exists** in the current codebase.

---

### `GET /api/dashboard-templates`

| | |
|---|---|
| **Auth** | Supabase user |
| **Response** | `{ templates: { id, name, layout, created_at }[] }` |
| **Supabase tables** | `dashboard_templates` |
| **Degradation** | Returns `{ templates: [] }` if table missing |

---

### `POST /api/dashboard-templates`

| | |
|---|---|
| **Auth** | Supabase user |
| **Body** | `{ name, layout }` — `layout` is JSONB `{ order, pinned, hidden }` |
| **Response** | `{ template }` — **201** |
| **Supabase tables** | `dashboard_templates` |

---

### `DELETE /api/dashboard-templates`

| | |
|---|---|
| **Auth** | Supabase user |
| **Query** | `id` (required) |
| **Response** | `{ ok: true }` |
| **Supabase tables** | `dashboard_templates` |

---

### `POST /api/tts/generate`

| | |
|---|---|
| **Auth** | Supabase user |
| **Purpose** | Proxy to Inworld TTS for campaign script preview |
| **Body** | `{ text, voiceId }` — max 2000 chars |
| **Response** | `{ audioBase64, contentType: 'audio/mpeg' }` |
| **Supabase** | None |
| **Env** | `INWORLD_API_KEY` |

**Not in OpenAPI.**

---

### `POST /api/tts/save`

| | |
|---|---|
| **Auth** | Supabase user |
| **Purpose** | Upload generated MP3 to external script storage |
| **Body** | `{ campaignName, audioBase64, voiceId? }` |
| **Response** | `{ storageKey, publicUrl, campaignName }` |
| **Supabase** | None (uses `AVM_SCRIPT_AUDIO_STORAGE_*` S3-compatible storage) |

**Not in OpenAPI.**

---

## Routes documented in README but missing from `app/api/`

| Route | README status | Actual |
|-------|---------------|--------|
| `GET /api/campaigns/:id` | Listed | **Not implemented** |
| `/api/providers` | Listed | **Not implemented** |
| `POST /api/security` | Listed | **Not implemented** |
| `POST /api/simulate` | Listed | **Not implemented** |

---

## Supabase schema reference

Tables touched by `app/api/`:

```
companies ──────────< campaigns ──────────< contacts
                         │                      │
                         │                      └── contact_id (nullable FK)
                         │
                         ├──< call_records (room UNIQUE when set)
                         ├──< call_logs (legacy aggregates)
                         └──< intent_stats

dashboard_templates     security_logs     sip_trunks (lookup only)
profiles, voip_providers, system_settings — not used by current API routes
storage.buckets: voice-recordings — used at dial time via lib/voice, not direct API
```

### `campaigns` (relevant columns)

| Column | Used by API |
|--------|-------------|
| `id`, `name`, `agent`, `status` | CRUD, dial |
| `dialing_speed`, `time_window_start`, `time_window_end` | CRUD |
| `voice_recording_url`, `voice_path` | Create, dial |
| `transfer_key`, `transfer_target` | Create, dial metadata |
| `sip_trunk_id`, `agent_name` | Dial (LiveKit overrides) |
| `company_id` | List join |
| `max_retries`, `retry_cooldown_seconds`, `max_concurrent`, `auto_paused` | **In DB, not used by dial route** |

### `contacts` (relevant columns)

| Column | Used by API |
|--------|-------------|
| `campaign_id`, `phone`, `first_name`, `last_name` | Create, dial |
| `status` | `pending` → `in_progress` → `dialed`/`failed`/`retry` |
| `retry_count`, `last_attempted_at` | Set on dial; retry logic not implemented in API |

### `call_records` (relevant columns)

| Column | Set by |
|--------|--------|
| `campaign_id`, `contact_id`, `phone`, `room` | Dial route (insert) |
| `outcome` | Dial (`pending`), webhook, agent result |
| `talk_seconds`, `transferred`, `cost` | Agent result, webhook |
| `recording_url`, `egress_id` | Dial + webhook |
| `called_at` | Dial route |

---

## OpenAPI (`docs/openapi.json`) vs Supabase alignment

The OpenAPI spec describes **evra-callops** data concepts. Below is how those concepts map (or don't) to this project's Supabase schema.

### Alignment scorecard

| OpenAPI concept | Supabase equivalent | Alignment |
|-----------------|---------------------|-----------|
| Campaign lifecycle (`draft/running/paused/stopped/completed/archived/deleted`) | `campaigns.status` | **Partial** — no `stopped`; `auto_paused` column exists but not driven by API |
| Campaign live stats (`queued`, `pending`, `in_progress`, `dialed`, `failed`, `retry`, `active_calls`, `completed_today`) | Computable from `contacts` + `call_records` | **Possible but no API** — stats endpoint not implemented |
| Contact dial state | `contacts.status` + `retry_count` | **Good schema match** — values align after `20260612140000` migration |
| Call outcome ingestion | `call_records` | **Partial** — different field names and outcome enums |
| Call telemetry (`CallTelemetryRequest`, `TelemetryEvent[]`) | No table | **None** — would need new table or external observability store |
| Call session (`room_id`, `started_at`, `ended_at`, SIP leg tracking) | `call_records.room`, `called_at`, partial webhook updates | **Partial** — no dedicated sessions table |
| Dispatch job (`DispatchJobRequest`) | Implicit in dial route batch | **Behavioral only** — no job queue table |
| SIP trunk CRUD (`/livekit/trunks`) | `sip_trunks` catalog + `campaigns.sip_trunk_id` | **Partial** — DB catalog exists; no REST CRUD in this app; LiveKit is source of truth for `ST_*` ids |
| LiveKit room CRUD | Ephemeral rooms created by dial | **None in app** — rooms not persisted in Supabase |
| Retry / concurrency / scheduling | `max_retries`, `max_concurrent`, `retry_cooldown_seconds`, `auto_paused`, time windows | **Schema ready, logic not wired** in `app/api/` |

### Field-level: `CallOutcomeRequest` → Supabase

| OpenAPI field | Supabase target | Notes |
|---------------|-----------------|-------|
| `contact_id` | `call_records.contact_id` | Set at dial time; not required on agent POST in this app |
| `campaign_id` | `call_records.campaign_id` | Same |
| `room_name` | `call_records.room` | This app uses `room` in JSON |
| `outcome` | `call_records.outcome` | **Different enum values** (see table above) |
| `phone` | `call_records.phone` | Already set at dial |
| `talk_seconds` | `call_records.talk_seconds` | ✓ |
| `transferred` | `call_records.transferred` | ✓ |
| `retry_count` | `contacts.retry_count` | OpenAPI updates contact; this app doesn't via `/calls/result` |
| `attempt` | No column | Not stored |
| `job_id`, `room_sid` | No columns | Not stored |
| `sip_*`, `amd_category`, `dtmf_digits` | No columns | Not stored |
| `started_at`, `ended_at` | No columns on `call_records` | Only `called_at`; duration via `talk_seconds` |

### Field-level: `CampaignLiveStats` → Supabase (computable)

| OpenAPI stat | SQL source (conceptual) |
|--------------|-------------------------|
| `queued` | `COUNT(contacts WHERE status IN ('pending','retry'))` |
| `pending` | `COUNT(contacts WHERE status = 'pending')` |
| `in_progress` | `COUNT(contacts WHERE status = 'in_progress')` |
| `dialed` | `COUNT(contacts WHERE status = 'dialed')` OR `call_records` with terminal outcomes |
| `failed` | `COUNT(contacts WHERE status = 'failed')` |
| `retry` | `COUNT(contacts WHERE status = 'retry')` |
| `active_calls` | `COUNT(call_records WHERE outcome IN ('pending','connected'))` |
| `completed_today` | `COUNT(call_records WHERE called_at >= today)` |
| `auto_paused` | `campaigns.auto_paused` |

The **schema can support** callops-style stats, but neither `app/api/` nor the OpenAPI host writes to this database directly today.

### Tables in Supabase with no OpenAPI equivalent

| Table | Purpose |
|-------|---------|
| `companies` | Client/org dimension |
| `call_logs` | Legacy aggregate report rows |
| `dashboard_templates` | Saved UI layouts |
| `security_logs` | Audit trail |
| `voip_providers` | Settings UI (no API route yet) |
| `profiles` | Auth roles |
| `system_settings` | IP whitelist etc. (no API route yet) |

### OpenAPI endpoints with no Supabase backing in this project

| Endpoint | Gap |
|----------|-----|
| `POST /calls/telemetry` | No `telemetry_events` or similar table |
| `POST /dispatch/job` | No job/outbox table |
| `GET/POST/DELETE /livekit/rooms` | Rooms not persisted |
| `GET/POST/PATCH/DELETE /livekit/trunks` | LiveKit API is external; `sip_trunks` is optional catalog only |
| `POST /livekit/test-call` | No test call log table |

---

## Side-by-side: path coverage

### Documented in OpenAPI, absent from `app/api/`

| Path | Method |
|------|--------|
| `/campaigns/{id}/start` | POST |
| `/campaigns/{id}/pause` | POST |
| `/campaigns/{id}/stop` | POST |
| `/campaigns/{id}/status` | GET |
| `/calls/outcome` | POST |
| `/calls/telemetry` | POST |
| `/dispatch/job` | POST |
| `/livekit/health` | GET |
| `/livekit/rooms` | GET, POST |
| `/livekit/rooms/{name}` | DELETE |
| `/livekit/trunks` | GET, POST |
| `/livekit/trunks/{id}` | PATCH, DELETE |
| `/livekit/test-call` | POST |

### Present in `app/api/`, absent from OpenAPI

| Path | Methods |
|------|---------|
| `/api/campaigns` | GET, POST |
| `/api/campaigns/[id]` | PUT, DELETE |
| `/api/campaigns/[id]/dial` | POST |
| `/api/calls/result` | POST |
| `/api/companies` | GET, POST |
| `/api/dashboard-templates` | GET, POST, DELETE |
| `/api/intents` | GET |
| `/api/logs` | GET |
| `/api/reports` | GET |
| `/api/security` | GET |
| `/api/tts/generate` | POST |
| `/api/tts/save` | POST |

### Shared concept (different path/shape)

| Concept | This app | OpenAPI |
|---------|----------|---------|
| Health | `GET /api/health` | `GET /health` |
| LiveKit webhook | `POST /api/livekit/webhook` | `POST /livekit/webhook` |
| Agent call report | `POST /api/calls/result` | `POST /calls/outcome` |

---

## Architectural interpretation

Three plausible relationships between these artifacts:

1. **Sibling services (most likely today)** — callops is the future orchestration layer; this app is the operator dashboard + thin dial gateway. The OpenAPI spec belongs to callops, not this repo.

2. **Convergence path** — This app's dial/outcome/webhook logic could shrink to proxies toward callops, with Supabase remaining the UI's read model.

3. **Schema foreshadowing** — Migrations added `auto_paused`, `max_concurrent`, contact `retry` states, and `sip_trunks` in anticipation of callops-like behavior; `app/api/` has not caught up.

---

## Environment variables by route

| Variable | Routes affected |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | All authenticated routes |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/livekit/webhook`, `/api/calls/result` |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | `/api/campaigns/[id]/dial`, webhook |
| `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`, `LIVEKIT_AGENT_NAME` | Dial |
| `LIVEKIT_RECORD_*` | Dial (optional egress) |
| `AGENT_RESULT_SECRET` | `/api/calls/result` |
| `INWORLD_API_KEY` | `/api/tts/generate` |
| `AVM_SCRIPT_AUDIO_STORAGE_*` | `/api/tts/save` |

---

## Related files

| Path | Role |
|------|------|
| `lib/outbound-call.ts` | LiveKit dial, trunk resolution, webhook receiver |
| `lib/voice.ts` | Signed voice URL at dial time |
| `lib/avm-script-storage.ts` | TTS save upload |
| `utils/supabase/auth.ts` | Session auth helper |
| `utils/supabase/admin.ts` | Service role client |
| `supabase/migrations/*.sql` | Schema source of truth |
| `docs/openapi.json` | evra-callops API (external to this app's routes) |
| `docs/livekit-outbound-integration.md` | Dial/webhook/agent flow deep dive |
