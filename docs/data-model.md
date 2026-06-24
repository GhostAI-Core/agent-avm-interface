# Data model

The database for the Agent AVM Interface. This app is the **control plane** — it manages
campaigns, dispatches calls via LiveKit, and renders dashboards. The in-call audio is handled by
an external LiveKit **agent worker** (Seeker/Grace), which dumps results back into Supabase.

Tables grouped by function. ⭐ = added in the 2026-06-18 telephony/compliance work, 🪦 = legacy/parallel.

## A. Identity, access & audit

| Table | What it does |
|---|---|
| **profiles** | One row per operator, extends Supabase `auth.users`. `role` (admin/engineer) + biometric/passkey auth (`face_signature`, `passkey_credential`). Operator identity — not the people being called. |
| **system_settings** | Global app config: `whitelisted_ips`, `environment`. |
| **security_logs** | Append-only audit of operator/system events (logins, campaign executions). The dial route writes a `campaign_execution` row per run. |

## B. Clients & campaigns (what you're calling about)

| Table | What it does |
|---|---|
| **companies** | The **clients** you run campaigns for, plus their point-of-contact (`contact_name/email/phone`). |
| **campaigns** | A campaign = **one product**. Script (`voice_recording_url`/`voice_path`), `agent` (**= the product**, e.g. seeker/grace), `status`, `dialing_speed`, `time_window_start/end`, transfer config, and gate/behavior knobs: `region`, `require_consent`, `max_attempts_per_day`, `retry_jitter_seconds`, `disclosure_text`, `answer_delay_sec`, `silence_timeout_sec`, `amd_enabled`, `voicemail_action`. FK → `companies`. |

## C. People you call (M:N contact model)

| Table | What it does |
|---|---|
| **contacts** | The **canonical person/number** — `phone`, `first/last_name`, `timezone`. One row per unique number. |
| **campaign_contacts** ⭐ | The **join**: which contact is in which campaign + **per-campaign dialing status** (`pending/in_progress/dialed/failed/retry`) and `retry_count`. `UNIQUE(campaign_id, contact_id)` → a contact appears once per campaign. Lets one contact belong to many campaigns. |

## D. Telephony plumbing (placing the call)

| Table | What it does |
|---|---|
| **sip_trunks** | LiveKit SIP **outbound trunks** — `livekit_trunk_id`, `from_number` (caller ID), optionally scoped to a `company`. The dial route resolves which trunk to dial through. |
| **voip_providers** 🪦 | Legacy provider credentials from before LiveKit. Dead now. |

## E. Compliance & dial-control (the gate)

| Table | What it does |
|---|---|
| **product_consent** ⭐ | **Per-(contact, product) consent** (`opted_in/opted_out/unknown`). Product = `campaigns.agent`. Opt-out of one product never affects another. |
| **suppression_list** ⭐ | Global / company-scoped do-not-dial. Hook for the 2026 national DNC opt-out registry; not written by per-product opt-out. |
| **dial_number_state** ⭐ | **Per-phone daily frequency rollover** (`reached`, `attempts`, `next_eligible_at`) — cross-campaign throttle (one live answer/day, retry caps, randomized spacing). Driven by `claim_dial()` + `record_dial_outcome()`. |
| **compliance_events** ⭐ | Immutable audit of **every gate decision** — `gate_pass`/`gate_block`/`opt_out` + `reason` + masked phone. |

## F. Call results & metrics (what happened)

| Table | What it does |
|---|---|
| **call_events** ⭐ | The **raw landing table** the agent dumps into (`room`, `event_type`, `payload` JSONB). A `BEFORE INSERT` trigger `process_call_event()` ETLs each row into the structured tables. |
| **call_records** | The **per-call structured record** — `outcome`, `talk_seconds`, `cost`, `transferred`, `recording_url`, `room`, `contact_id`. Powers KPI cards, Recent Calls, Call Quality. |
| **intent_stats** | The **conversation funnel** — per campaign/day, how many calls `reached` each `intent` (`step`). Filled by `bump_intent()`. |
| **call_logs** 🪦 | Older **aggregate** result table with count columns (`dialed/connected/qualified/…`). Simulator writes it; `/api/reports` reads it. Parallel to `call_records`. |

## G. Dashboard UX

| Table | What it does |
|---|---|
| **dashboard_templates** | Saved dashboard **layouts** (JSONB) per user — arrange/pin/hide widgets. |

## How it ties together (one call's journey)

```
companies ──< campaigns (= product, agent) ──┐
                                             │ campaign_contacts (join, per-campaign status)
contacts (canonical phone) ──────────────────┘
                                             │
                          DIAL ROUTE pulls pending campaign_contacts
                                             │
            ┌──── THE GATE (lib/compliance/gate.ts) ─────────────┐
            │ region → network(prefix) → product_consent →       │
            │ calling-window → dial_number_state (frequency)     │
            └───────────────┬───────────────────┬───────────────┘
              blocked → compliance_events     allowed
                                                 │ claim_dial() → dial_number_state
                                                 │ dispatch via sip_trunks → LiveKit
                                                 ▼
                                    external agent runs the call
                                                 │ dumps rows →
                                            call_events  ⭐
                                                 │ TRIGGER process_call_event()
                          ┌──────────────────────┼───────────────────────┐
                          ▼                       ▼                       ▼
                    call_records            intent_stats          (opt-out →) product_consent
                  (outcome, cost,          (funnel/waterfall)     record_dial_outcome() →
                   recording, talk)                               dial_number_state
                          │
                          ▼
                  DASHBOARDS (KPIs, Recent Calls, Call Quality, Reports)
```

**Throughline:** a **company** owns **campaigns** (each = a product); **campaign_contacts** puts canonical
**contacts** into campaigns; the **dial route** runs each through the **gate** (reads `product_consent`,
`dial_number_state`, network prefixes, calling window) and audits to **compliance_events**; allowed calls
dial via **sip_trunks**; the agent dumps **call_events**, which a trigger fans out into **call_records**
(metrics), **intent_stats** (funnel), and updates **dial_number_state**/**product_consent**; **dashboards**
read the structured tables.

## Notes / cleanup debt

- **`call_logs` vs `call_records`** — parallel result models (`call_logs` = older aggregate for the
  simulator + `/api/reports`; `call_records` = real per-call pipeline for `/api/logs` + Call Quality).
  Consolidate on `call_records` eventually.
- **`voip_providers`** — legacy, safe to retire (LiveKit + `sip_trunks` is the live path).
- **Network labels** — a number's mobile network (Vodacom/MTN/Cell C) is derived from its prefix at
  display time via `lib/networks.ts` (`networkProvider()`); not stored. Note: SA number portability
  means the prefix is the *original* allocation, not a guaranteed current carrier.
