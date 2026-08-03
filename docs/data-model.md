# Data model

The database behind the Agent AVM Interface. This app is the **dashboard/control plane**:
it authenticates operators, proxies operational reads/writes to **evra-callops**, and renders
dashboards. CallOps owns campaign dispatch, contact queue state, LiveKit SIP calls, and primary
call outcome writes.

Tables grouped by function. ⭐ = added in the 2026-06-18 telephony/compliance work, 🪦 = legacy/parallel.

## A. Identity, access & audit

| Table | What it does |
|---|---|
| **profiles** | One row per operator, extends Supabase `auth.users`. `role` (admin/engineer) + biometric/passkey auth (`face_signature`, `passkey_credential`). Operator identity — not the people being called. |
| **system_settings** | Global app config: `whitelisted_ips`, `environment`. |
| **security_logs** | Append-only audit of operator/system events (logins, unauthorized access, system events). |

## B. Clients & campaigns (what you're calling about)

| Table | What it does |
|---|---|
| **companies** | The **clients** you run campaigns for, plus their point-of-contact (`contact_name/email/phone`). |
| **campaigns** | A campaign dials for a product/script. Key fields include `product_id`, optional `product_version_id`, legacy `agent`, `status`, `sip_trunk_id`, `voice_recording_url`/`voice_path`, `dialing_speed`, `time_window_start/end`, retry/concurrency settings, transfer config, and `network_provider` dial gate. FK -> `companies`. |
| **products** | Company-scoped product replacing the old hardcoded `campaigns.agent` pairing. Carries the consent-flow type (`lead_gen` or `sts_subscription`) and optional STS product key. |
| **product_script_versions** | Versioned script/audio metadata for a product; campaigns may track the current version or pin a specific `product_version_id`. |

## C. People you call (M:N contact model)

| Table | What it does |
|---|---|
| **contacts** | Person/number rows used by CallOps for campaign dialing. Includes `phone`, `first/last_name`, `campaign_id`, `status`, retry fields, and `network_provider` for filtering/gating. |
| **campaign_contacts** 🪦 | Older M:N join model. Current CallOps-backed UI paths use CallOps contact endpoints and do not write this table directly. |

## D. Telephony plumbing (placing the call)

| Table | What it does |
|---|---|
| **sip_trunks** | LiveKit SIP **outbound trunks** — `livekit_trunk_id`, `from_number` (caller ID), optionally scoped to a `company`. CallOps resolves and manages trunks for live dispatch. |
| **voip_providers** 🪦 | Legacy provider credentials from before LiveKit. Dead now. |

## E. Compliance & dial-control (the gate)

| Table | What it does |
|---|---|
| **product_consent** ⭐ | **Per-(contact, product) consent** (`opted_in/opted_out/unknown`). New flows should key product consent by product identity rather than only the legacy `campaigns.agent` label. |
| **suppression_list** ⭐ | Global / company-scoped do-not-dial. Hook for the 2026 national DNC opt-out registry; not written by per-product opt-out. |
| **dial_number_state** ⭐ | **Per-phone daily frequency rollover** (`reached`, `attempts`, `next_eligible_at`) — cross-campaign throttle (one live answer/day, retry caps, randomized spacing). Driven by `claim_dial()` + `record_dial_outcome()`. |
| **compliance_events** ⭐ | Immutable audit of **every gate decision** — `gate_pass`/`gate_block`/`opt_out` + `reason` + masked phone. |

## F. Call results & metrics (what happened)

| Table | What it does |
|---|---|
| **call_events** 🪦 | Older raw landing table for agent event dumps. Superseded by CallOps-owned call session/event ingestion. |
| **call_records** | The **per-call structured record** — `outcome`, `business_disposition`, `talk_seconds`, `on_air_seconds`, `cost`, `transferred`, `recording_url`, `room`, `contact_id`. Powers KPI cards, Recent Calls, Call Quality, Leads, and reconciliation fallback. |
| **intent_stats** | The **conversation funnel** — per campaign/day, how many calls `reached` each `intent` (`step`). Filled by `bump_intent()`. |
| **call_logs** 🪦 | Older aggregate result table with count columns (`dialed/connected/qualified/...`). Current `/api/reports` uses CallOps campaign-performance rollups instead. |

## G. Dashboard UX

| Table | What it does |
|---|---|
| **dashboard_templates** | Saved dashboard **layouts** (JSONB) per user. The table/API still exists, but the current fixed `ControlRoom` UI does not expose save/apply controls. |

## How it ties together (one call's journey)

```
companies ──< campaigns (= product, agent) ──┐
                                             │
products ──< product_script_versions          │
                                             │
contacts (campaign_id, status, network_provider)
                                             │
                           CallOps dispatch queue + compliance checks
                                             │
                                             ▼
                                 sip_trunks → LiveKit SIP
                                             │
                                             ▼
                                  external agent runs the call
                                             │
                              CallOps writes outcomes / telemetry
                                             │
                          ┌──────────────────────┼───────────────────────┐
                          ▼                       ▼                       ▼
                    call_records            intent_stats          (opt-out →) product_consent
                  (outcome, cost,          (funnel/waterfall)     consent state
                   recording, talk)
                          │
                          ▼
                  DASHBOARDS (KPIs, Recent Calls, Call Quality, Reports)
```

**Throughline:** a **company** owns **campaigns** and **products**; a campaign points at a product/script
and a set of **contacts**. CallOps applies dispatch rules and compliance checks, dials through
**sip_trunks** and LiveKit, then writes **call_records**, **intent_stats**, product consent, and telemetry.
The dashboard reads those structures through Next.js API routes that proxy to CallOps.

## Notes / cleanup debt

- **`call_logs` vs `call_records`** — `call_logs` is legacy aggregate data. Current dashboard reports
  are CallOps campaign-performance rollups over call data, while `/api/logs` and Call Quality use
  per-call records.
- **`voip_providers`** — legacy, safe to retire (LiveKit + `sip_trunks` is the live path).
- **Network labels** — CallOps stores `contacts.network_provider`; the dashboard network gate persists
  `campaigns.network_provider` so dispatch can skip non-matching contacts.
