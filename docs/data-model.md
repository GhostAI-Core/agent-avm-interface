# Data model

Agent AVM is now a **dashboard/control plane** for data owned by `evra-callops`. The browser
still signs users in with Supabase Auth, but most operational reads/writes go through this
repo's `app/api/*` proxy routes, which forward the user's Supabase JWT to CallOps. CallOps owns
dispatch, queueing, LiveKit SIP calls, retry state, call outcomes, and most operational tables.

This page describes the model as consumed by this frontend. See `docs/app-api-reference.md` for
the route-by-route proxy map and `docs/CALLOPS_MIGRATION_HANDOVER.md` for migration history.

## Ownership boundaries

| Area | Owner | Notes |
|---|---|---|
| Login/session | Supabase Auth + this frontend | `utils/supabase/*` manages browser/session cookies. |
| Operational data | CallOps | Campaigns, contacts, products, leads, calls, SIP trunks, settings, script library. |
| Dashboard-only data | This repo + Supabase | `security_logs` and `dashboard_templates` still use direct Supabase routes. |
| LiveKit fallback | This repo + Supabase | `POST /api/livekit/webhook` can backfill `call_records` room/recording state. |

## Core entities

| Entity/table | What it represents | Frontend/API usage |
|---|---|---|
| `companies` | Customer organizations. | `/api/companies`; scopes products, campaigns, leads, and SIP trunks. |
| `products` | Data-driven script + consent-flow bundle. | `ProductsView`, campaign wizard product picker, reports product filter. |
| `product_script_versions` | Versioned product script text, voice id, generated audio URL, and measured duration. | `ProductsView` script dialog; campaign create/edit can copy the current version. |
| `campaigns` | A dialing run for a company/product. | `/api/campaigns`; stores lifecycle status, pacing, script URL, trunk, network gate, and product links. |
| `contacts` | Canonical phone records with per-campaign status from CallOps. | `ContactsView`, `/api/campaigns/:id/contacts`, CSV import. |
| `sip_trunks` + trunk/company links | LiveKit outbound trunk catalog and company sharing. | Campaign wizard picker and Telephony SIP Trunks panel. |
| `call_records` | One structured call result. | `/api/logs`, Control Room, Call Quality, Campaign Detail, Leads. |
| `call_sessions` | CallOps session timing/recording layer. | Surfaced indirectly as `duration_seconds`/`on_air_seconds` and recording URLs. |
| `intent_stats` | Per-campaign/day funnel reach counts. | `/api/intents`, Call Quality and dashboard funnel views. |
| `security_logs` | Audit table still read directly from Supabase. | `/api/security`. |
| `dashboard_templates` | Saved Control Room insight layouts. | `/api/dashboard-templates`; legacy support for dormant `InsightDashboard`. |

## Products and campaign scripts

A product replaces the old hardcoded "agent = seeker/grace/sangoma" selector as the business
object operators choose for a campaign.

```text
companies
  └── products
        ├── product_script_versions
        └── campaigns.product_id
```

Important constraints:

- `products.integration_type` is `sts_subscription` or `lead_gen`.
- `sts_subscription` products need an `sts_product_key`; `lead_gen` products do not.
- `product_script_versions.version` increments per product. Activating an older version only
  changes the product's `current_version_id`; already-saved campaigns keep their materialized
  `voice_recording_url` until they are re-saved.
- `campaigns.agent` remains a legacy/product-label field. New code should prefer
  `campaigns.product_id` and report rows' `campaign.product_name` when available.

## Campaign dialing fields

| Field | Meaning |
|---|---|
| `status` | Lifecycle state (`draft`, `running`, `paused`, `stopped`, `completed`, `archived`, `deleted`). Start/pause/stop must go through CallOps lifecycle routes. |
| `dialing_speed`, `max_concurrent` | Pacing controls enforced by CallOps. |
| `max_retries`, `retry_cooldown_seconds` | Retry controls for no-answer/busy-style outcomes. |
| `time_window_start`, `time_window_end` | Daily dialing window. CallOps may set `auto_paused` outside the window. |
| `sip_trunk_id` | Integer CallOps/Supabase trunk row id; CallOps resolves it to the LiveKit `ST_...` id. |
| `voice_recording_url` / `audio_path` | Script audio. The frontend normalizes generated/uploaded audio into the dispatcher-read URL field. |
| `voice_id` | Inworld voice id, used by CallOps/agent flows that need voice-matched confirmation audio. |
| `network_provider` | Optional single dial gate: `Vodacom`, `MTN`, `Cell C`, or null for all networks. |
| `product_id`, `product_version_id`, `sts_product`, `routing_mode` | Product-derived campaign routing and consent-flow fields. |

## Contacts and network gating

Contacts are loaded per campaign from CallOps:

```text
GET /api/campaigns/:id/contacts
  -> GET /campaigns/:id/contacts
  -> GET /campaigns/:id/contacts/network-breakdown
```

The Contacts view treats the network selector as both a visible-list filter and the campaign
dial gate. Changing it persists `campaigns.network_provider` through `PUT /api/campaigns/:id`;
CallOps then enqueues only contacts whose stored `contacts.network_provider` matches. Null means
"all networks." Network labels are based on allocated prefixes and may not reflect ported numbers.

CSV imports are forwarded to CallOps unchanged after client-side parsing. CallOps owns E.164
normalization, dedupe, rejection reporting, contact status, and `network_provider` population.

## Calls, leads, reports, and recordings

```text
CallOps dispatcher + LiveKit agent
  -> POST $CALLOPS_URL/calls/outcome
  -> call_records + contact status + call_sessions
  -> dashboard proxy routes
```

| View/route | Source | Notes |
|---|---|---|
| `/api/logs` | CallOps `/companies/:id/calls` or `/campaigns/:id/calls` | Renames CallOps `duration_seconds` to frontend `on_air_seconds`. |
| `/api/reports` | CallOps `/companies/:id/dashboard/campaign-performance` | Maps raw outcomes into dashboard columns and attaches product names for filtering/display. |
| `/api/leads` | CallOps `/companies/:id/leads` | Shows single and double opt-ins for Lead-Gen campaigns; cost is the persisted per-call cost. |
| `/api/calls/:id` | CallOps `/calls/:id` | Detailed call/contact/campaign record. |
| `/api/calls/:id/recording` | CallOps `/calls/:id/recording` | Signed recording URL; may fall back to session recording when the call record has not been linked yet. |
| `/api/calls/:id/call-report` | CallOps `/calls/:id/call-report` | Telephony narrative: AMD, SIP, DTMF, playback, disconnect, transfer, talk time. |
| `/api/calls/:id/telemetry` | CallOps `/calls/:id/telemetry` | Model/SDK metric events; empty telemetry is valid for script-only calls. |

The local `POST /api/calls/result` route is a secondary reconciliation safety net: CallOps may
forward the same outcome payload here, and the route inserts a `call_records` row only when the
primary CallOps write is missing. Live agents should still report outcomes to CallOps, not this app.

## Data flow

```text
Supabase Auth session
  -> app/page.tsx
  -> app/api/* proxy with Bearer JWT
  -> evra-callops
  -> Supabase operational tables + LiveKit
  -> app/api/logs/reports/intents/leads/calls
  -> Control Room, Campaign Detail, Call Quality, Leads
```

`POST /api/livekit/webhook` remains a signed fallback that updates `call_records` by room for
events such as callee joined, egress ended, or room finished. CallOps outcome ingestion is still
the authoritative path for production call results.

## Known quirks / cleanup debt

- `security_logs` and `dashboard_templates` still use direct Supabase routes while most other
  operational data goes through CallOps.
- `app/api/trunks/*` and `app/api/sip-trunks/*` both exist. The campaign wizard uses
  `/api/trunks` for a compact picker; the Telephony SIP Trunks panel uses company-scoped
  `/api/companies/:id/sip-trunks` and `/api/sip-trunks/:id/*` routes.
- `campaigns.agent` survives for legacy labels only. Prefer product ids/names for new UI and
  reporting behavior.
- `voip_providers` is legacy provider configuration from the pre-LiveKit path.
- `supabase/database-schema.md` is an older generated snapshot; verify current shape against
  migrations and CallOps-owned schema before using it for implementation decisions.
