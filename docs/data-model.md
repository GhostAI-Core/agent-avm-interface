# Data model

The Agent AVM Interface is now the **dashboard/control plane** for operational data owned by
**evra-callops**. The Next.js app authenticates operators with Supabase, proxies dashboard reads
and writes to CallOps, uploads voice assets, and keeps a few local UI/audit/reconciliation tables.
CallOps owns dispatch, pacing, retries, LiveKit SIP calls, campaign/contact/product records,
reports, call details, and primary agent outcome ingestion.

Tables grouped by function. ⭐ = still relevant to the migrated model, 🪦 = legacy/parallel or
present in migrations but not directly written by the current dashboard route handlers.

## A. Identity, access & audit

| Table | What it does |
|---|---|
| **profiles** | One row per operator, extends Supabase `auth.users`. `role` (admin/engineer) + biometric/passkey auth (`face_signature`, `passkey_credential`). Operator identity — not the people being called. |
| **system_settings** | Global app config: `whitelisted_ips`, `environment`. |
| **security_logs** | Append-only local audit log exposed by `GET /api/security`. There is no current `POST /api/security`; campaign lifecycle is CallOps-owned. |

## B. Clients & campaigns (what you're calling about)

| Table | What it does |
|---|---|
| **companies** | CallOps-owned clients you run campaigns for, plus point-of-contact fields. The dashboard uses `/api/companies`, which proxies CallOps `/companies`. |
| **products** ⭐ | CallOps-owned product/offer definitions scoped to a company. Products carry the consent-flow/routing meaning that old UI labels (`seeker`, `grace`, etc.) used to imply. |
| **product_script_versions** ⭐ | CallOps-owned script/audio/voice history per product. The Products view can create versions and activate an older version; CampaignModal can preload the current version. |
| **campaigns** | CallOps-owned dialing campaigns. A campaign belongs to a company and may point at `product_id`/`product_version_id`, `sip_trunk_id`, script/voice fields, schedule/pacing knobs, network gate, and lifecycle status. Start/pause/stop are CallOps lifecycle commands, not direct local status writes. |

## C. People you call (M:N contact model)

| Table | What it does |
|---|---|
| **contacts** | CallOps-owned canonical person/number rows. The dashboard lists them through `/api/campaigns/{id}/contacts`. |
| **campaign_contacts** ⭐ | CallOps-owned campaign membership/status join. Contact imports go through `/api/campaigns/{id}/contacts/import`; CallOps owns E.164 normalization, dedupe, status transitions, and rejection summaries. |

## D. Telephony plumbing (placing the call)

| Table | What it does |
|---|---|
| **sip_trunks** | CallOps-owned persisted outbound trunk rows. Campaigns store integer `sip_trunk_id`; CallOps resolves that to the LiveKit `ST_...` trunk and caller ID. `/api/trunks` lists trunks for the campaign wizard, while `/api/sip-trunks/{id}` manages persisted rows. |
| **voip_providers** 🪦 | Legacy provider credentials from before LiveKit. Dead now. |

## E. Compliance & dial-control (the gate)

| Table | What it does |
|---|---|
| **product_consent** ⭐ | **Per-(contact, product) consent** (`opted_in/opted_out/unknown`). Product is now a CallOps product, not just `campaigns.agent`. Opt-out of one product should not affect another. |
| **suppression_list** ⭐ | Global / company-scoped do-not-dial. Hook for the 2026 national DNC opt-out registry; not written by per-product opt-out. |
| **dial_number_state** ⭐ | **Per-phone daily frequency rollover** (`reached`, `attempts`, `next_eligible_at`) — cross-campaign throttle state. Runtime updates are CallOps responsibilities. |
| **compliance_events** ⭐ | Immutable audit of gate decisions. Current dashboard contact/campaign actions proxy to CallOps; do not write this table directly from frontend routes. |

## F. Call results & metrics (what happened)

| Table | What it does |
|---|---|
| **call_records** | Per-call structured record. CallOps is the primary writer. Local code can still update/insert for two fallback paths: signed LiveKit webhook updates (`/api/livekit/webhook`) and authenticated `/api/calls/result` reconciliation when CallOps forwards an outcome whose primary write is missing. |
| **call_events** 🪦 | Legacy/raw event landing table from the older in-database ETL flow. Agents should post primary outcomes to CallOps `/calls/outcome`, not insert raw events here. |
| **intent_stats** | Conversation funnel stats read through CallOps `/intent-stats` routes and surfaced by `/api/intents`; the current dashboard routes do not read this table directly. |
| **call_logs** 🪦 | Older aggregate result table. `/api/reports` now reads CallOps campaign-performance over `call_records`, not local `call_logs`. |
| **script_library / script_audio** ⭐ | CallOps-owned script metadata. `/api/voice-scripts` is the global reuse library; `/api/script-audio` is per-campaign generated script history. Audio bytes are uploaded separately by `/api/tts/save`. |

## G. Dashboard UX

| Table | What it does |
|---|---|
| **dashboard_templates** | Saved dashboard **layouts** (JSONB) per user — arrange/pin/hide widgets. This remains a local Supabase table behind `/api/dashboard-templates`. |

## How it ties together (one call's journey)

```
companies ──< products ──< product_script_versions
     │
     └──< campaigns ──< campaign_contacts >── contacts
              │
              │ operator starts campaign
              ▼
        POST /api/campaigns/{id}/start
              │
              ▼
        CallOps dispatch + compliance gate
        (network, consent, window, retry/frequency, trunk)
              │
              ├── blocked → compliance/audit data in CallOps
              │
              └── allowed → LiveKit SIP call + agent worker
                                │
                                ▼
                       POST CallOps /calls/outcome
                                │
                                ├── primary writes: call_records, reports, leads, intent stats,
                                │   consent/frequency state, recording/session metadata
                                └── optional forward to /api/calls/result
                                    for missing-row reconciliation only
                                │
                                ▼
                  DASHBOARDS poll /api/logs, /api/reports, /api/intents,
                  /api/leads, /api/calls/{id}/*
```

**Throughline:** a **company** owns **products** and **campaigns**; products carry the reusable script
and consent-flow meaning; campaigns import contacts and choose product/trunk/schedule/network settings;
CallOps gates and dispatches calls through LiveKit; agents report outcomes to CallOps; the dashboard
reads the resulting operational model through authenticated `/api/*` proxies. Local Supabase writes are
limited to UI state/audit/storage plus fallback reconciliation paths.

## Notes / cleanup debt

- **`call_logs` vs `call_records`** — `/api/reports` now reads CallOps campaign-performance over
  per-call records. Treat local `call_logs` as legacy unless a route explicitly references it.
- **`voip_providers`** — legacy, safe to retire (LiveKit + `sip_trunks` is the live path).
- **`call_events`** — legacy raw event ingestion remains in migrations, but the active agent contract is
  CallOps `/calls/outcome`; `/api/calls/result` is reconciliation, not an agent target.
- **Network labels** — the current campaign network gate is `campaigns.network_provider` matched against
  CallOps contact `network_provider` values and surfaced by `/api/campaigns/{id}/contacts/network-breakdown`.
  Older prefix-derived labels may still appear in legacy helpers, but CallOps is the operational source.
