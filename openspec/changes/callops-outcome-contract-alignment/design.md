## Context

Cale's 2026-06-25 callops release (evra_callops `CHANGELOG.md`, deployed) redesigned the call-result contract. Verified against the live API + the CHANGELOG + the dashboard `main`:

- **Result model is now 2-tier:** `outcome` (telephony: `connected, voicemail, no_answer, busy, failed, callback`) + **`business_disposition`** (`subscribe, opt_out, callback, interested`). `agent_outcome` is **deprecated and no longer written**; the CHANGELOG bug-fix notes opt-out counts were broken precisely because the dashboard relied on `agent_outcome`.
- **Split reporting — 4 webhooks per call:** `/calls/outcome` (thin, business-only), `/calls/call-report` (telephony narrative), `/calls/model-usage`, `/calls/events`. New dashboard reads: `GET /calls/{id}/call-report`, `GET /calls/{id}/telemetry` (live; telemetry example returns `{call_id, telemetry:[{source,event_type,payload,occurred_at}]}`). The old combined telemetry POST is removed.
- **Two-step consent:** press 1 → voice-matched "To Confirm Press 1" audio → press 1 again = subscribe. `campaigns.voice_id` (new) selects the confirm WAV. `business_disposition=interested` = pressed once, didn't confirm. Testing override `DTMF_SINGLE_PRESS_SUBSCRIBE=true` is currently on (single press subscribes).
- **Dashboard today:** `CallRecord` has only `outcome`; reports use a legacy vocab (`no_speech/hangup/ni/dnq/busy_line`) absent from callops and conflate disposition values into `outcome`; `app/api/calls/result/route.ts` stores `agent_outcome`/`business_disposition` but nothing displays them; all enums hardcoded, no `/lookups/*` use; `opt_out` never surfaced; no `voice_id` persisted; `Agent='seeker'|'grace'|'sangoma'` is stale vs callops `outbound-recorder`.
- **DB gap — RESOLVED (2026-06-26):** there is a single shared Supabase (no separate dashboard DB). A probe found `campaigns.voice_id` was the only missing piece from the 06-25 release (`network_provider`, `call_session_reports`, `call_model_usage`, `call_session_events`, `sts_reconciliation_state` all already present). Cale's `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS voice_id text;` was applied and verified (service-role read returns `voice_id`). The `campaign-voice-id` capability is therefore un-blocked.

**Graph finding (2026-06-26, fresh build from `1df2dff`, 4351 nodes):** callops also ships a **deployed dashboard-analytics API** — `GET /companies/{id}/dashboard/{outcomes,call-volume,campaign-performance,live}` and `GET /campaigns/{id}/intent-stats` — that computes outcome/disposition/volume aggregates server-side (incl. "opt-out excluded from connected"). The dashboard ignores it and rolls up `call_records` itself (`REPORT_KEYS`, `dashboardInsights`, `OutcomeDonut`, `CallQuality`→`/api/intents`). That parallel layer is where the opt-out-count bug Cale just fixed server-side originated. Closing it is the structural fix this change must include — not just patching the local vocab.

Constraint: **FE-zero-control** ([[fe-zero-control]]) — dashboard authors/displays, callops owns control + outcome decisioning + analytics. All callops reads go through server-side proxies; the credential never reaches the browser.

## Goals / Non-Goals

**Goals:**
- Display callops' 2-tier result (`outcome` + `business_disposition`) with the full disposition vocab (incl. `interested`), retiring the dead `agent_outcome` dependency and the legacy non-callops vocab; surface `opt_out`.
- Read the split `GET /calls/{id}/call-report` + `/telemetry` into the call-detail view.
- Make `/lookups/*` the single source of enum truth (proxy + `useLookup()`).
- Surface `connected`/`opt_out`/`calls_total` from the campaign summary.
- Persist `campaigns.voice_id` on script generation (gated on the column existing).

**Non-Goals:**
- Per-campaign network-provider filter (callops `1df2dff`, likely undeployed). Future.
- Migrating voice/script generation onto callops `/script-audio*`. Open question for Cale.
- Removing the duplicate app-side STS/consent logic (`lib/sts/outcomes.ts`, `sts/mark`, `calls/result` OUTCOME_MAP) — flagged vs FE-zero-control, resolved separately.
- Authoring DB migrations — the new columns/tables are callops' schema; we confirm/consume, not create.

## Decisions

**D1 — 2-tier, business_disposition authoritative.** Read `business_disposition` for all disposition breakdowns/counts/filters; treat `agent_outcome` as dead. *Why:* the CHANGELOG makes it authoritative and stops writing `agent_outcome`; continuing to read it reproduces the opt-out-count bug Cale just fixed server-side. *Alternative rejected:* keep a 3-tier display "for completeness" — it would render a permanently-empty column and mislead.

**D2 — Call-report & telemetry via the same server-proxy pattern.** Add proxied reads for `GET /calls/{id}/call-report` and `/telemetry`, surfaced in the call-detail panel (telephony narrative + model-usage). *Why:* the outcome record is now intentionally thin; telephony/AI detail only exists on these endpoints. *Alternative rejected:* reconstruct telephony detail from Supabase columns directly — bypasses callops as source-of-truth and duplicates its assembly logic.

**D3 — Lookups proxy + cached hook (unchanged from prior design).** `app/api/lookups/[type]/route.ts` (allowlist 7 types, credential server-side, pass errors through) + `hooks/useLookup.ts` (session cache, degrade to empty on failure). Prefer `business-dispositions` + `call-outcomes`; `agent-outcomes` is legacy. *Why:* `business-dispositions` is "fetch live" and will grow; baking enums into the build goes stale.

**D4 — Vocabulary keyed by lookup value, not position.** Chart colours (`lib/chartTheme.ts`) and chip tones (`lib/tokens.ts`) key off lookup `value`s with a neutral default; drop the positional legacy-key arrays. *Why:* resilient to callops adding a disposition.

**D5 — Legacy/missing data → "—", never fabricated.** Pre-contract rows with no `business_disposition` render neutrally. *Why:* matches the thin-outcome reality; inventing a value misleads.

**D6 — voice_id persists via the PUT whitelist (un-gated).** `campaigns.voice_id` now exists in the shared Supabase, so persist it by adding `voice_id` to the campaign PUT allowed-fields whitelist, matching how `name`/`company_id` were added. *Why:* the column is confirmed; no guard needed. *Note:* this is the same whitelist `[[callops-control-parity]]` removed `status` from — keep lifecycle out, add only `voice_id`.

**D7 — Summary read-through (unchanged).** Read `connected`/`opt_out`/`calls_total` from `GET /campaigns/{id}` rather than client roll-up — the only place `opt_out` is available server-side.

**D8 — Consume callops analytics; delete the local roll-up.** Reports, OutcomeDonut, KPI cards, call-volume, and Call Quality read callops' `/companies/{id}/dashboard/*` + `/campaigns/{id}/intent-stats`; remove `REPORT_KEYS`/`REPORT_HEADERS`, the `dashboardInsights` summation, and the positional donut buckets. *Why:* the graph shows callops owns analytics authoritatively (opt-out correctly excluded); keeping a parallel implementation is the structural hole that produced the opt-out bug, and patching its vocab (the prior plan's task 4.5) just preserves the duplication. **This supersedes D3/D4 for the report/chart surfaces** — vocab no longer needs local mapping because callops returns the buckets; D3/D4 still apply to the per-call table display (`call-result-display`), which reads record fields, not analytics. *Alternative rejected:* keep local roll-up "for offline resilience" — it re-creates drift and contradicts FE-zero-control. *Check during build:* `components/CallQuality.tsx`→`/api/intents` may already proxy `/intent-stats`; if so, extend that pattern rather than add a new one.

## Risks / Trade-offs

- **DB-sync ambiguity blocks `campaign-voice-id`** → Mitigation: make "confirm whether dashboard+callops share one Supabase / apply 06-25 migrations" task 1; the voice_id capability stays gated (D6) and ships dark until resolved. Everything else is independent of it.
- **Report vocab change is operator-visible** → Mitigation: it corrects mislabelled data; keep the buckets that genuinely map (`connected/voicemail/no_answer/busy/failed/callback`) and call it out in the change summary.
- **Call-report/telemetry are bearer-auth management endpoints** ([[callops-api-0-2-0-management-surface]]) → Mitigation: route through server proxies; verify the dashboard's callops auth covers these reads in task 1.
- **Touching `dashboardInsights.tsx`/`Charts.tsx` risks report regressions** → Mitigation: change buckets behind existing aggregation helpers; verify KPI cards + OutcomeDonut against a known campaign before/after.

## Migration Plan

Phased, each step independently revertable, no DB authoring:
1. Confirm callops auth reaches call-report/telemetry/lookup reads (DB voice_id already cleared) → 2. Types + lookups proxy/hook (no visual change) → 3. Re-point dropdowns to lookups → 4. Swap to `business_disposition` + retire `agent_outcome`/legacy vocab + the three-tier→two-tier columns → 5. Call-report/telemetry detail panel → 6. Campaign summary aggregates → 7. voice_id persistence (PUT whitelist). Rollback = revert the commit; no data migration; legacy rows need no backfill (D5).

## Open Questions

- **Q1 — RESOLVED (2026-06-26):** single shared Supabase; the only missing 06-25 column was `campaigns.voice_id`, now applied + verified. No further DB action needed.
- **Q2 (Cale):** Should dashboard voice/script generation move onto callops `/script-audio`, `/script-audio/generate`, `/script-audio/save`, retiring local Inworld `tts/*` + the `voice_scripts` table? Out of scope here.
- **Q3 (Cale / architecture):** The app still carries STS/consent decisioning (`lib/sts/outcomes.ts`, `app/api/sts/mark`, `calls/result` `OUTCOME_MAP`) that [[callops-outcome-vocab]] recorded as removed and [[fe-zero-control]] says shouldn't exist — dead legacy to delete, or live?
- **Q4:** Is the per-campaign network-provider filter (callops `1df2dff`) intended to surface in the dashboard's campaign settings, and is it deployed? Deferred here.
