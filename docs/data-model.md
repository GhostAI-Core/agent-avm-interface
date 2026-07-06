# Data model

The Agent AVM dashboard is the **control plane**. Operational data is owned by **evra-callops** and shared in Supabase behind CallOps APIs; this Next.js app should access campaigns, contacts, reports, products, trunks, and call history through `app/api/*` proxies backed by `utils/callops.ts`.

Direct Supabase access in this repo is intentionally narrow: authentication/session, `dashboard_templates`, `security_logs`, generated audio storage, LiveKit webhook fallback writes, and `POST /api/calls/result` reconciliation.

Tables grouped by function. 🪦 = retired/legacy.

## A. Identity, access & audit

| Table | What it does |
|---|---|
| **profiles** | One row per operator, extends Supabase `auth.users`. Stores role (`admin`/`engineer`) and passkey credential metadata. |
| **security_logs** | Append-only audit for dashboard/security events. Read directly by `/api/security`. |
| **dashboard_templates** | Saved dashboard layouts (`layout` JSONB) per user/team. Read/write/delete directly by `/api/dashboard-templates`. |

## B. Clients, products, and campaigns

| Table | What it does |
|---|---|
| **companies** | Client organizations. Listed/created through CallOps `/companies`. |
| **products** | Company-scoped product/script identity. `integration_type` is `sts_subscription` or `lead_gen`; `sts_product_key` is required for STS products; `current_version_id` points at the active script version. |
| **product_script_versions** | Versioned product script rows: `text`, `voice_id`, `audio_url`, `duration_seconds`. New versions do not change product identity. |
| **campaigns** | Dialing campaign. Stores scheduling (`dialing_speed`, `time_window_start/end`), trunk (`sip_trunk_id`), script (`voice_recording_url`, `voice_id`), transfer settings, retry/concurrency settings, `network_provider`, and product linkage (`product_id`, optional `product_version_id`). |

Product fields are resolved by CallOps at campaign save time. `product_id` supersedes legacy `campaigns.agent` for display/filtering, but `agent`, `routing_mode`, and `sts_product` still exist as materialized compatibility fields used by downstream CallOps/STS paths.

## C. People you call

| Table | What it does |
|---|---|
| **contacts** | Campaign-scoped contact rows with `phone`, optional name fields, `status`, retry timestamps, `do_not_call`, and `network_provider`. CallOps owns import normalization, dedupe, status transitions, retry/DNC actions, and queue eligibility. |
| **campaign_contacts** 🪦 | Dropped by `20260703090000_drop_dial_tables.sql`. The dashboard no longer writes an M:N campaign/contact join. |

`contacts.network_provider` is stored by CallOps from the ICASA-prefix carrier label (`Vodacom`, `MTN`, `Cell C`, or unknown). `campaigns.network_provider` is the dial gate: when set, CallOps only enqueues contacts whose stored network matches.

## D. Telephony plumbing

| Table | What it does |
|---|---|
| **sip_trunks** | CallOps-owned SIP trunk catalog. Campaigns store the integer trunk id; CallOps resolves credentials and the LiveKit `ST_...` trunk id. |
| **voip_providers** 🪦 | Legacy provider table from before LiveKit/CallOps trunk ownership. |

Trunk catalog reads fan out through CallOps `GET /companies/{id}/sip-trunks`. Trunk create/update/delete/test-call writes proxy to CallOps LiveKit admin endpoints so credentials never reach the browser.

## E. Script persistence

| Table / store | What it does |
|---|---|
| **script_library** | Global script reuse library for `VoiceGenerator` bubbles. Proxied by `/api/voice-scripts`. |
| **script_audio** | Per-campaign generated script/audio history used when reopening campaign edit/reuse dialogs. Proxied by `/api/script-audio`. |
| **Supabase S3-compatible script storage** | MP3 object storage used by `/api/tts/save`; metadata is best-effort saved to CallOps `script_library`. |
| **voice_scripts** 🪦 | Replaced by CallOps `script_library`; no current frontend path reads/writes it directly. |

## F. Call results & metrics

| Table / aggregate | What it does |
|---|---|
| **call_records** | Per-call structured record written by CallOps outcome ingestion. Contains `campaign_id`, `contact_id`, `phone`, `room`, `outcome`, `business_disposition`, `talk_seconds`, `cost`, `recording_url`, and timestamps. |
| **call_sessions** | CallOps/LiveKit session rows used for room duration and recording fallback. Campaign detail recording routes can fall back from `call_records` to session recording URLs. |
| **intent_stats** | Conversation funnel counts by campaign/day, read through CallOps intent endpoints. |
| **campaign-performance aggregate** | CallOps report endpoint consumed by `/api/reports`; maps `by_outcome` and `total_cost` into dashboard report rows. |
| **call_logs** 🪦 | Legacy aggregate table. `/api/reports` no longer reads it. |
| **call_events** 🪦 | Retired raw event landing table from the older trigger-based path. |

`POST /api/calls/result` is a secondary reconciliation endpoint: CallOps remains the source of truth for `POST /calls/outcome`, and this app inserts a missing `call_records` row only when CallOps forwards a payload whose primary write did not land.

## How it ties together (one campaign's journey)

```text
companies
  ├── products ──< product_script_versions
  └── campaigns
        │ product_id/product_version_id resolved at save time
        │ network_provider optionally gates dialing
        ├── contacts (campaign-scoped status + network_provider)
        ├── script_audio (per-campaign generated audio history)
        └── sip_trunks (integer id selected by wizard)
              │
              ▼
        CallOps start/pause/stop lifecycle
              │
              ▼
        CallOps queue + dispatcher enforce status, time window,
        rate, concurrency, retry, DNC, and network gate
              │
              ▼
        LiveKit agent places SIP call, plays pre-generated script,
        reports outcome to CallOps /calls/outcome
              │
              ▼
        call_records + call_sessions + intent_stats
              │
              ▼
        Dashboard reads through /api/logs, /api/reports,
        /api/intents, /api/campaigns/{id}
```

## Notes / cleanup debt

- **Legacy `agent` is display debt** — reports and campaign detail prefer `product_name`, but some UI surfaces still render the legacy `campaign.agent` chip. New custom products may leave `agent` null.
- **`product_version_id = null` is not live re-resolution** — the current product version is materialized onto the campaign at save time. Re-save the campaign to pick up newly published product audio.
- **Network labels are prefix-derived** — South African number portability means the stored network is the original allocation, not a guaranteed current carrier.
