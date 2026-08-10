# Data model

The database for the Agent AVM Interface. This app is the **browser-facing control plane** — it
authenticates operators, proxies operational company/campaign/contact/product changes to
**evra-callops**, and renders dashboards. evra-callops owns campaign dispatch, pacing, retries,
LiveKit SIP calls, and outcome ingestion; this app still reads app-owned dashboard tables such as
`call_records`, `call_logs`, `intent_stats`, `security_logs`, and `dashboard_templates`.

Tables grouped by function. ⭐ = added in the 2026-06-18 telephony/compliance work, 🪦 = legacy/parallel.

## A. Identity, access & audit

| Table | What it does |
|---|---|
| **profiles** | One row per operator, extends Supabase `auth.users`. `role` (admin/engineer) + biometric/passkey auth (`face_signature`, `passkey_credential`). Operator identity — not the people being called. |
| **system_settings** | Global app config: `whitelisted_ips`, `environment`. |
| **security_logs** | Append-only audit of operator/system events such as login/security activity. Campaign execution is owned by callops lifecycle/outcome paths. |

## B. Clients & campaigns (what you're calling about)

| Table | What it does |
|---|---|
| **companies** | The **clients** you run campaigns for, plus their point-of-contact (`contact_name/email/phone`). |
| **campaigns** | A campaign = **one product/script flow**. Script (`voice_recording_url`/`voice_path`/`audio_path`), `agent`, `status`, `dialing_speed`, `time_window_start/end`, transfer config, product/version pointers, network gate, and retry/concurrency knobs. Operational create/update/list/archive routes proxy to callops. FK -> `companies`. |

## C. People you call (M:N contact model)

| Table | What it does |
|---|---|
| **contacts** | The **canonical person/number** — `phone`, `first/last_name`, status, retry metadata, network label, and callops-owned DNC/compliance flags. Import/list/actions proxy to callops, which owns normalization and dedupe. |
| **campaign_contacts** ⭐ | Historical M:N join from the in-app dialer era. The current dashboard routes no longer write it directly; callops owns campaign contact membership/status. |

## D. Telephony plumbing (placing the call)

| Table | What it does |
|---|---|
| **sip_trunks** | LiveKit SIP **outbound trunks** — `livekit_trunk_id`, `from_number` (caller ID), optionally scoped to a `company`. Campaigns store `sip_trunk_id`; callops resolves it to a LiveKit `ST_...` trunk at dispatch time. |
| **voip_providers** 🪦 | Legacy provider credentials from before LiveKit. Dead now. |

## E. Compliance & dial-control (the gate)

| Table | What it does |
|---|---|
| **product_consent** ⭐ | **Per-(contact, product) consent** (`opted_in/opted_out/unknown`). Product = `campaigns.agent` or product metadata. Opt-out of one product never affects another. |
| **suppression_list** ⭐ | Global / company-scoped do-not-dial. Hook for the 2026 national DNC opt-out registry; not written by per-product opt-out. |
| **dial_number_state** ⭐ | **Per-phone daily frequency rollover** (`reached`, `attempts`, `next_eligible_at`) — reference schema for cross-campaign throttling (one live answer/day, retry caps, randomized spacing). callops owns the live pre-dial gate. |
| **compliance_events** ⭐ | Immutable audit shape for gate decisions (`gate_pass`/`gate_block`/`opt_out` + `reason` + masked phone). Current live enforcement/auditing belongs with callops. |

## F. Call results & metrics (what happened)

| Table | What it does |
|---|---|
| **call_events** ⭐ | Legacy raw landing table from the in-app outcome pipeline. Current agents should report outcomes to callops `/calls/outcome`; this table is retained only where older migrations/data still reference it. |
| **call_records** | The **per-call structured record** — `outcome`, `talk_seconds`, `cost`, `transferred`, `recording_url`, `room`, `contact_id`. Powers KPI cards, Recent Calls, Call Quality. |
| **intent_stats** | The **conversation funnel** — per campaign/day, how many calls `reached` each `intent` (`step`). Filled by `bump_intent()`. |
| **call_logs** 🪦 | Older **aggregate** result table with count columns (`dialed/connected/qualified/…`). `/api/reports` still reads aggregate rows while callops supplies the operational lifecycle. Parallel to `call_records`. |

## G. Dashboard UX

| Table | What it does |
|---|---|
| **dashboard_templates** | Saved dashboard **layouts** (JSONB) per user — arrange/pin/hide widgets. |

## How it ties together (one call's journey)

```
companies ──< campaigns (= product/script flow) ──< contacts
       ▲                         │                         │
       │                         │                         │
       └──── app/api proxies ────┴──────────────► evra-callops
                                                   │
                               pre-dial gate, pacing, retries, queue
                                                   │
                                                   ▼
                                      LiveKit SIP + agent worker
                                                   │
                               outcomes / recordings / telemetry
                                                   │
                                                   ▼
                         call_records   call_logs   intent_stats
                          (per call)   (aggregate)  (funnel/waterfall)
                                                   │
                                                   ▼
                         DASHBOARDS (KPIs, Recent Calls, Call Quality, Reports)
```

**Throughline:** a **company** owns **campaigns** (each = a product/script flow); callops imports and
dedupes **contacts**, enforces the pre-dial gate and network/provider constraints, dispatches allowed
calls via **sip_trunks** and LiveKit, then writes outcomes that feed **call_records**, **call_logs**, and
**intent_stats**. The dashboard reads those structured tables and sends lifecycle/contact actions back
through callops instead of dialing directly.

## Notes / cleanup debt

- **`call_logs` vs `call_records`** — parallel result models (`call_logs` = older aggregate for
  `/api/reports`; `call_records` = real per-call pipeline for `/api/logs` + Call Quality).
  Consolidate on `call_records` eventually.
- **`voip_providers`** — legacy, safe to retire (LiveKit + `sip_trunks` is the live path).
- **Network labels** — a number's mobile network (Vodacom/MTN/Cell C) is derived from its prefix at
  import/display time (`contacts.network_provider` from callops where available, with `lib/networks.ts`
  helpers for labelling). Note: SA number portability means the prefix is the *original* allocation, not
  a guaranteed current carrier.
