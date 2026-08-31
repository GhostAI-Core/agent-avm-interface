# Agent AVM Interface — API Reference & CallOps Alignment

This document describes the Next.js Route Handlers under `app/api/` and how they align with
`evra-callops`. The dashboard is not the production dialer: CallOps owns campaign dispatch,
queueing, pacing, LiveKit SIP calls, outcomes, contacts, products, leads, and most reporting.
This repo mostly provides browser-safe proxy routes plus the remaining Supabase-owned UI data.

```text
Browser
  -> app/api/* (Supabase session cookie)
  -> CallOps (Bearer user JWT or server-side X-Webhook-Secret)
  -> Supabase operational tables + LiveKit
```

## Authentication model

| Auth type | Mechanism | Routes |
|---|---|---|
| Supabase session | Cookie read by `utils/supabase/auth.ts` | All dashboard routes except public webhooks/health |
| Bearer forwarding | `getAccessToken()` sends the user's Supabase JWT to CallOps | Most operational proxies: companies, campaigns, products, contacts, reports, logs, leads, settings, SIP trunks |
| `X-Webhook-Secret` | Server-side secret sent to `$CALLOPS_URL`; never reaches the browser | Lifecycle/status routes and legacy `/api/trunks/*` LiveKit admin proxies |
| LiveKit webhook JWT | `Authorization` validated by `WebhookReceiver` | `POST /api/livekit/webhook` |
| Meta webhook verification/HMAC | Verify token on GET; app secret HMAC on POST | `/api/whatsapp/webhook` |
| Optional relay secret | `x-relay-secret` when `STS_RELAY_SECRET` is configured | `POST /api/sts/mark` |
| None | Public | `GET /api/health`, deprecated `POST /api/calls/result` no-op |

The browser never receives `CALLOPS_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, LiveKit API
secrets, Inworld credentials, WhatsApp app secrets, or STS relay/GUID secrets.

## Campaigns

### `GET /api/campaigns`

| | |
|---|---|
| Auth | Supabase user; Bearer JWT forwarded to CallOps |
| Purpose | List campaigns visible to the user |
| Upstream | `GET /companies`, then `GET /companies/{id}/campaigns` per company |
| Response | `{ campaigns }`, sorted newest first; each row gets a flattened `company` name |

### `POST /api/campaigns`

| | |
|---|---|
| Auth | Supabase user; Bearer JWT forwarded to CallOps |
| Purpose | Create a campaign under a company and optionally import contacts |
| Required body | `name`, `company_id` |
| Optional body | `agent`, `product_id`, `product_version_id`, `sip_trunk_id`, `audio_path`, `voice_recording_url`, `voice_id`, `routing_mode`, `dialing_speed`, `window_start`, `window_end`, `max_concurrent`, `max_retries`, `retry_cooldown_seconds`, `network_provider`, `transfer_key`, `transfer_target`, `contacts[]` |
| Upstream | `POST /companies/{company_id}/campaigns` |
| Response | CallOps create response with status **201** |

Create-time behavior verified in `app/api/campaigns/route.ts`:

- `agent_name` is forced to `outbound-recorder`, the deployed LiveKit worker.
- `audio_path` and `voice_recording_url` are normalized into CallOps' dispatcher-read
  `voice_recording_url`.
- `contacts` are filtered only for presence of `phone`, then forwarded. CallOps owns E.164
  normalization, dedupe, rejection reporting, `contacts.campaign_id`, and network population.
- `network_provider` is passed through as the optional single-network dial gate.

### `GET /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user; server sends `X-Webhook-Secret` |
| Purpose | Read campaign detail and CallOps summary aggregates |
| Upstream | `GET $CALLOPS_URL/campaigns/{id}` |
| Response | `{ campaign, summary }`; `{ mode: 'unconfigured', summary: null }` when CallOps env is missing |

### `PUT /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user; Bearer JWT forwarded to CallOps |
| Purpose | Partial campaign update for non-lifecycle fields |
| Upstream | `PATCH /campaigns/{id}` |
| Allowed fields | `name`, `agent`, `dialing_speed`, `time_window_start`, `time_window_end`, `max_concurrent`, `max_retries`, `retry_cooldown_seconds`, `sip_trunk_id`, `voice_recording_url`, `voice_path`, `audio_path`, `transfer_key`, `transfer_target`, `network_provider`, `voice_id`, `routing_mode`, `product_id`, `product_version_id` |
| Response | `{ campaign }` |

Lifecycle status is intentionally not accepted here. Use `/start`, `/pause`, and `/stop`.

### `DELETE /api/campaigns/[id]`

| | |
|---|---|
| Auth | Supabase user; Bearer JWT forwarded to CallOps |
| Purpose | Archive a campaign |
| Upstream | `POST /campaigns/{id}/archive` |
| Response | `{ success: true }` |

### `POST /api/campaigns/[id]/start|pause|stop`

| | |
|---|---|
| Auth | Supabase user; server sends `X-Webhook-Secret` |
| Purpose | Proxy lifecycle commands to CallOps |
| Body | None |
| Upstream | `POST $CALLOPS_URL/campaigns/{id}/{action}` |
| Configured response | `{ mode: 'callops', ...callopsResponse }` |
| Local dev fallback | Directly patches `campaigns.status` only outside production when CallOps env is missing |
| Production without CallOps env | **503** `{ error: 'callops not configured' }` |

Action map: `start -> running`, `pause -> paused`, `stop -> stopped` for local fallback only.
CallOps 4xx errors pass through; upstream/network failures become **502**.

### `GET /api/campaigns/[id]/status`

| | |
|---|---|
| Auth | Supabase user; server sends `X-Webhook-Secret` |
| Purpose | Live queue/call stats for running or paused campaigns |
| Upstream | `GET $CALLOPS_URL/campaigns/{id}/status` |
| Response | CallOps `CampaignLiveStatus`, or `{ mode: 'unconfigured' }` |

## Contacts

### `GET /api/campaigns/[id]/contacts`

| | |
|---|---|
| Auth | Supabase user; Bearer JWT forwarded to CallOps |
| Query | `page`, `page_size` (max 200), `status`, `network`, `search`/`phone` |
| Upstream | `GET /campaigns/{id}/contacts` and `GET /campaigns/{id}/contacts/network-breakdown` |
| Response | `{ items, page, page_size, total, breakdown }` |

`network` is translated to CallOps' `network_provider` query param. The breakdown is for the
whole campaign and is tolerated as empty if that secondary request fails.

### `POST /api/campaigns/[id]/contacts/import`

| | |
|---|---|
| Auth | Supabase user; Bearer JWT forwarded to CallOps |
| Body | `{ contacts: [{ phone, first_name?, last_name?, external_id? }], dedupe?, source? }` |
| Upstream | `POST /campaigns/{id}/contacts/import` |
| Response | CallOps import summary (`created`, `updated`, `duplicates`, `rejected`, `errors`, etc.) |

### `POST /api/contacts/[id]/archive|retry|do-not-call`

| | |
|---|---|
| Auth | Supabase user; Bearer JWT forwarded to CallOps |
| Purpose | Per-contact operational action |
| Upstream | `POST /contacts/{id}/{action}` |
| Allowed actions | `archive`, `retry`, `do-not-call` |

## Products and scripts

### `/api/products`

| Route | Auth | Purpose | Upstream |
|---|---|---|---|
| `GET /api/products?company_id=...` | User Bearer | List company-scoped products | `GET /companies/{company_id}/products` |
| `POST /api/products` | User Bearer | Create product | `POST /companies/{company_id}/products` |

`POST` requires `company_id` and `name`. Optional fields: `integration_type`, `sts_product_key`,
`active`. `sts_subscription` products need an STS key on the CallOps side.

### `/api/products/[id]`

| Route | Auth | Purpose | Upstream |
|---|---|---|---|
| `GET /api/products/{id}` | User Bearer | Product detail | `GET /products/{id}` |
| `PATCH /api/products/{id}` | User Bearer | Product update | `PATCH /products/{id}` |

### `/api/products/[id]/versions`

| Route | Auth | Purpose | Upstream |
|---|---|---|---|
| `GET /api/products/{id}/versions` | User Bearer | List script versions | `GET /products/{id}/versions` |
| `POST /api/products/{id}/versions` | User Bearer | Create script version | `POST /products/{id}/versions` |
| `POST /api/products/{id}/versions/{versionId}/activate` | User Bearer | Promote/roll back current version | `POST /products/{id}/versions/{versionId}/activate` |

Version create forwards `text`, `voice_id`, `audio_url`, `duration_seconds`, and `set_current`
(default true).

### Script audio/library routes

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/tts/generate` | User | Inworld TTS preview; body `{ text, voiceId }`, max 2000 chars. |
| `POST /api/tts/save` | User | Upload generated MP3 to `AVM_SCRIPT_AUDIO_STORAGE_*`; best-effort writes CallOps `/script-library` when text/voice are present. |
| `GET /api/scripts` | User | List generated script MP3 objects for saved-script pickers; returns empty list when storage is unconfigured. |
| `GET/POST /api/voice-scripts` | User Bearer | CallOps `/script-library` text/audio reuse library. |
| `GET/POST /api/script-audio` | User Bearer | Per-campaign script history via CallOps `/script-audio`. |

## Companies, reports, logs, leads, intents

| Route | Auth | Purpose | Upstream/source |
|---|---|---|---|
| `GET /api/companies` | User Bearer | List companies | CallOps `/companies` |
| `POST /api/companies` | User Bearer | Create company with contact fields | CallOps `/companies` |
| `GET /api/reports` | User Bearer | Campaign performance rollups | CallOps `/companies/{id}/dashboard/campaign-performance`, fanned out per company |
| `GET /api/logs` | User Bearer | Call history | CallOps `/companies/{id}/calls` or `/campaigns/{id}/calls` |
| `GET /api/leads` | User Bearer | Lead-Gen single/double opt-in report | CallOps `/companies/{id}/leads`, fanned out per company |
| `GET /api/intents` | User Bearer | Intent waterfall stats | CallOps campaign or company intent endpoints |
| `GET /api/settings` | User Bearer | Global system settings | CallOps `/system-settings` |
| `PATCH /api/settings` | User Bearer | Update positive `cost_per_minute_zar` | CallOps `/system-settings` |
| `GET /api/lookups/[type]` | User Bearer | Allowlisted vocabularies | CallOps `/lookups/{type}` |
| `GET /api/security` | User | Last security log rows | Direct Supabase `security_logs` |

`/api/reports` accepts `product_id` or legacy `agent`, plus `date`, `from`, and `to`.
`from`/`to` are forwarded to CallOps as `from_date`/`to_date`. Raw CallOps outcomes are mapped
into dashboard columns (`subscribed -> qualified`, `opted_out -> opt_out`, `lead -> lead`, etc.).

`/api/logs` renames CallOps `duration_seconds` to frontend `on_air_seconds`. Without
`campaignId`, it fans out over companies and limits the dashboard feed to recent history.

Allowed lookup types are `call-outcomes`, `agent-outcomes`, `business-dispositions`,
`contact-statuses`, `campaign-statuses`, `calling-windows`, and `timezones`.

## Calls and recordings

| Route | Auth | Purpose | Upstream |
|---|---|---|---|
| `GET /api/calls/[id]` | User Bearer | Single call detail with contact/campaign context | `GET /calls/{id}` |
| `GET /api/calls/[id]/recording` | User Bearer | Signed recording URL | `GET /calls/{id}/recording` |
| `GET /api/calls/[id]/call-report` | User Bearer | Telephony narrative: AMD, SIP, DTMF, playback, disconnect, transfer, talk time | `GET /calls/{id}/call-report` |
| `GET /api/calls/[id]/telemetry` | User Bearer | Model/SDK telemetry events | `GET /calls/{id}/telemetry` |
| `POST /api/calls/result` | None | Deprecated no-op transition endpoint | None; use CallOps `POST /calls/outcome` |

`/api/calls/[id]/telemetry` returns `{ telemetry: [] }` when no events exist; that is valid for
script-only calls. `/api/calls/result` logs a warning and returns `{ ok: true, deprecated: true }`.

## Telephony and SIP trunks

Two trunk route families exist:

- `/api/trunks/*`: legacy/compact routes used by the campaign wizard and older LiveKit admin UI.
- `/api/companies/:id/sip-trunks` and `/api/sip-trunks/:id/*`: company-scoped Telephony panel routes.

### Campaign wizard and legacy trunk admin

| Route | Auth | Purpose | Upstream |
|---|---|---|---|
| `GET /api/trunks` | User Bearer | Compact trunk picker; fans out over user's companies and dedupes by trunk id | `GET /companies/{id}/sip-trunks` |
| `POST /api/trunks` | User + `X-Webhook-Secret` upstream | Create/update LiveKit outbound trunk; requires name, address, numbers, auth username/password | `POST $CALLOPS_URL/livekit/trunks` |
| `PATCH /api/trunks/[trunk_id]` | User + `X-Webhook-Secret` upstream | Partial LiveKit trunk update by `ST_...` id | `PATCH $CALLOPS_URL/livekit/trunks/{trunk_id}` |
| `DELETE /api/trunks/[trunk_id]` | User + `X-Webhook-Secret` upstream | Delete LiveKit trunk by `ST_...` id | `DELETE $CALLOPS_URL/livekit/trunks/{trunk_id}` |
| `POST /api/trunks/test-call` | User + `X-Webhook-Secret` upstream | One-off LiveKit test call | `POST $CALLOPS_URL/livekit/test-call` |

When `CALLOPS_URL` or `CALLOPS_WEBHOOK_SECRET` is missing, write/test routes return **503**
`{ error: 'telephony not configured' }`.

### Company-scoped SIP trunk management

| Route | Auth | Purpose | Upstream |
|---|---|---|---|
| `GET /api/companies/[id]/sip-trunks` | User Bearer | Paginated/searchable trunk list for one company | `GET /companies/{id}/sip-trunks` |
| `POST /api/companies/[id]/sip-trunks` | User Bearer | Create trunk for one company | `POST /companies/{id}/sip-trunks` |
| `GET /api/sip-trunks/[id]` | User Bearer | Trunk detail; credentials are not returned | `GET /sip-trunks/{id}` |
| `PATCH /api/sip-trunks/[id]` | User Bearer | Update supplied trunk fields | `PATCH /sip-trunks/{id}` |
| `POST /api/sip-trunks/[id]/archive` | User Bearer | Archive a trunk | `POST /sip-trunks/{id}/archive` |
| `GET /api/sip-trunks/[id]/health` | User Bearer | LiveKit trunk health | `GET /sip-trunks/{id}/health` |
| `POST /api/sip-trunks/[id]/test-call` | User Bearer | One-off trunk test call; body requires `phone` | `POST /sip-trunks/{id}/test-call` |

A failed test call can still return HTTP 200 with `ok: false`; non-2xx means validation or
upstream failure.

## Webhooks and external relays

### `POST /api/livekit/webhook`

| | |
|---|---|
| Auth | LiveKit webhook JWT |
| Purpose | Signed fallback updates to `call_records` |
| Response | `{ ok: true }`, or `{ ok: true, persisted: false }` if service-role key is missing |

Handled events: `participant_joined` can mark pending rows connected, `egress_ended` can persist
`recording_url`, and `room_finished` can backfill talk time or no-answer. CallOps outcome
ingestion remains authoritative for production call results.

### `POST /api/sts/mark`

| | |
|---|---|
| Auth | Optional `x-relay-secret` when `STS_RELAY_SECRET` is set |
| Purpose | Relay product subscribe/opt-out decisions to STS SDP |
| Body | `{ product, msisdn, action, durationSeconds? }` |
| Aliases | `agent` for `product`, `number` for `msisdn`, `1` for `subscribe`, `9`/`optout` for `opt_out`, `CallDuration` for `durationSeconds` |
| Upstream | `subscribe -> $STS_SDP_BASE_URL/avm/{GUID}/{MSISDN}`; `opt_out -> $STS_SDP_BASE_URL/cancel/{GUID}/{MSISDN}` |

`product` maps to `STS_GUID_<PRODUCT>`. The route does not write consent state locally.

### `/api/whatsapp/webhook`

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/whatsapp/webhook` | Meta verify token | Webhook challenge verification |
| `POST /api/whatsapp/webhook` | Meta HMAC signature | Receive WhatsApp Cloud API messages |

Signed malformed JSON is acknowledged to avoid retry loops. Opt-out messages are logged; local
suppression relay is not implemented in this route.

## Miscellaneous

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/health` | None | Deploy/load-balancer probe, returns `{ status: 'ok' }`. |
| `POST /api/flow-builder/generate` | None | Flow-builder POC: Claude prompt -> visual node spec; no persistence or execution. |
| `/api/dashboard-templates` (`GET`, `POST`, `DELETE`) | User | Direct Supabase saved dashboard layouts for the dormant insight-grid path. |

## Not implemented here

| Route | Status |
|---|---|
| `/api/providers` | Not implemented; provider-like tabs outside SIP trunks are local mock UI. |
| `POST /api/security` | Not implemented. |
| `POST /api/simulate` | Not implemented. |
| Production campaign dialing endpoint | Not in this repo; use CallOps lifecycle and outcome APIs. |

The direct LiveKit CLI (`npm run dial`) still exists for diagnostics through
`scripts/dial-outbound.ts`, but the dashboard has no checked-in HTTP route for direct dialing in
the current codebase.

## Environment variables by route

| Variable | Routes affected |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase login and authenticated route session lookup |
| `CALLOPS_URL` | All CallOps proxy routes |
| `CALLOPS_WEBHOOK_SECRET` | Lifecycle/status and legacy `/api/trunks/*` secret-based proxies |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/livekit/webhook`, diagnostic/server-side signing helpers |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | `/api/livekit/webhook`, direct diagnostics |
| `INWORLD_API_KEY` | `/api/tts/generate` |
| `AVM_SCRIPT_AUDIO_STORAGE_*` | `/api/tts/save`, `/api/scripts` |
| `STS_RELAY_SECRET`, `STS_SDP_BASE_URL`, `STS_GUID_<PRODUCT>` | `/api/sts/mark` |
| WhatsApp verify/app credentials | `/api/whatsapp/webhook`, `lib/whatsapp/client.ts` |
| `ANTHROPIC_API_KEY` | `/api/flow-builder/generate` |

## Related files

| Path | Role |
|---|---|
| `utils/callops.ts` | Shared CallOps HTTP client, item-envelope tolerance, error normalization |
| `utils/supabase/auth.ts` | Session auth helper and Bearer token extraction |
| `app/api/campaigns/route.ts` | Campaign list/create proxy |
| `app/api/campaigns/[id]/route.ts` | Campaign detail/update/archive proxy |
| `app/api/campaigns/[id]/[action]/route.ts` | Lifecycle/status proxy |
| `app/api/campaigns/[id]/contacts/*` | Contacts list/import proxies |
| `app/api/products/*` | Products and script-version proxies |
| `app/api/logs/route.ts`, `app/api/reports/route.ts`, `app/api/leads/route.ts` | Dashboard read-model proxies |
| `app/api/calls/[id]/*` | Call detail, recording, report, and telemetry proxies |
| `app/api/trunks/*`, `app/api/sip-trunks/*`, `app/api/companies/[id]/sip-trunks/route.ts` | SIP trunk management |
| `app/api/livekit/webhook/route.ts` | Signed LiveKit room/egress fallback |
| `app/api/whatsapp/webhook/route.ts` | WhatsApp Cloud API webhook |
| `docs/openapi.json` | evra-callops OpenAPI contract |
