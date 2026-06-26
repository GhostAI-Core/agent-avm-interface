## Why

Cale's **2026-06-25 callops release** (evra_callops `CHANGELOG.md`, range `bd8d4dc`..`b2c44c5`, deployed) redesigned the call-result contract and shipped a regulatory two-step consent flow. The deployed agent worker now reports **four** webhooks per call and the dashboard is out of step with the new shape on every axis: it queries the now-**deprecated `agent_outcome`** (which callops no longer writes — `business_disposition` is authoritative), it has no read of the new split call-report/telemetry endpoints, it speaks a legacy outcome vocabulary that callops doesn't define, hardcodes every enum instead of using the `/lookups/*` endpoints, never surfaces `opt_out`, and doesn't persist `campaigns.voice_id` (which callops needs to pick the voice-matched confirm audio). The CHANGELOG's own "Remaining" list is, almost entirely, this dashboard work. Aligning now — right after the contract landed and before more report code accretes on the dead `agent_outcome` field — keeps the dashboard honest and finishes the integration loop.

## What Changes

- **Adopt the 2-tier result model.** A call's result is `outcome` (telephony: `connected, voicemail, no_answer, busy, failed, callback`) + **`business_disposition`** (business result: `subscribe, opt_out, callback, interested`). **BREAKING (display):** stop reading `agent_outcome` for breakdowns; retire the legacy report keys callops doesn't define (`no_speech, hangup, ni, dnq, busy_line`). Surface `opt_out` and the new `interested` disposition.
- **Read the split call detail.** Wire the new `GET /calls/{id}/call-report` (telephony narrative: AMD, SIP, DTMF, playback, disconnect, transfer, `talk_seconds`) and `GET /calls/{id}/telemetry` (model-usage / SDK metrics) into the call-detail view. The legacy combined telemetry payload is gone.
- **Source enums from lookups.** Add a server-side `/api/lookups/[type]` proxy + `useLookup()` hook; replace hardcoded status/outcome/disposition dropdowns and label maps. (`/lookups/agent-outcomes` still exists but is legacy — prefer `call-outcomes` + `business-dispositions`.)
- **Surface campaign summary aggregates** — `connected`, `opt_out`, `calls_total` from `GET /campaigns/{id}`.
- **Consume callops' dashboard-analytics API and delete the local roll-up.** Reports, outcome charts, KPI cards, call-volume, and Call Quality read callops' deployed `GET /companies/{id}/dashboard/{outcomes,call-volume,campaign-performance,live}` and `GET /campaigns/{id}/intent-stats` instead of recomputing analytics from raw `call_records`. **This removes the parallel, drift-prone analytics layer** where the historical opt-out-count bug lived — and supersedes the earlier "fix the local report vocab" approach (callops returns the correct buckets).
- **Persist `voice_id` on campaign script generation** so consent campaigns select the correct confirm audio — **gated on confirming `campaigns.voice_id` exists in the dashboard's Supabase** (a service-role probe on 2026-06-26 says it does not; resolve the DB-sync question with Cale first).
- **Out of scope — documented, NOT built:** (1) per-campaign **network-provider** filter (callops `1df2dff`, likely not yet deployed); (2) migrating voice/script generation onto callops `/script-audio*`; (3) removing the duplicate app-side STS/consent logic (`lib/sts/outcomes.ts`, `app/api/sts/mark`, `calls/result` `OUTCOME_MAP`) that conflicts with FE-zero-control. These are flagged for Cale, not implemented here. This change is display/authoring alignment only; callops owns control + outcome decisioning.

## Capabilities

### New Capabilities

- `call-result-display`: the call log, campaign-detail table, and reports adopt callops' 2-tier result model — `outcome` (telephony) + `business_disposition` (`subscribe`/`opt_out`/`callback`/`interested`) — with the `CallRecord` type updated, the deprecated `agent_outcome` dependency and legacy non-callops vocab retired, and `opt_out`/`interested` surfaced.
- `call-report-detail`: the call-detail view reads callops' split `GET /calls/{id}/call-report` (AMD/SIP/DTMF/playback/disconnect/transfer/talk_seconds) and `GET /calls/{id}/telemetry` (model-usage events) instead of the removed combined telemetry payload.
- `callops-lookups`: a server-side `/api/lookups/[type]` proxy to callops `/lookups/*` and a `useLookup()` hook, with the dashboard's status/outcome/disposition dropdowns and label maps sourced from lookups instead of hardcoded local enums.
- `campaign-outcome-summary`: the campaign view surfaces the `GET /campaigns/{id}` summary aggregates the dashboard currently ignores — `connected`, `opt_out`, `calls_total`.
- `campaign-voice-id`: campaign script generation/edit persists `campaigns.voice_id` (the full Inworld voice id) so callops can select the voice-matched two-step-consent confirm audio. (DB column confirmed present 2026-06-26.)
- `consume-callops-analytics`: the dashboard's reports, outcome charts, KPI cards, call-volume, and Call Quality views read callops' deployed dashboard-analytics endpoints (`/companies/{id}/dashboard/*`, `/campaigns/{id}/intent-stats`) and the duplicate local roll-up of `call_records` is removed — closing the structural hole where the dashboard maintained its own (historically buggy) analytics implementation.

### Modified Capabilities

<!-- None. No committed openspec spec defines the dashboard's outcome-display, call-detail, lookup, campaign-summary, or voice-id behaviour; these are net-new. The legacy vocab being retired lives only in app/page.tsx constants. -->

## Impact

- **Frontend (types)**: `types/index.ts` — `CallRecord` gains `business_disposition`, `started_at`, `ended_at`, `room` (drop `agent_outcome` reliance); add a `CallReport`/`Telemetry` type for the detail reads; add `CampaignSummary`; `campaigns` type gains `voice_id`.
- **Frontend (display)**: `components/CampaignDetail.tsx` (table + outcome filter + CSV + call-detail panel), `lib/tokens.ts` (`statusChipTone`).
- **Frontend (analytics — now server-sourced)**: `app/page.tsx` (`REPORT_KEYS`/`REPORT_HEADERS` removed), `lib/dashboardInsights.tsx` (local roll-up removed), `components/Charts.tsx` + `lib/chartTheme.ts` (OutcomeDonut fed by callops), `components/CallQuality.tsx` (`/intent-stats`); reports/KPI/call-volume read `GET /companies/{id}/dashboard/*`.
- **Frontend (new)**: `app/api/lookups/[type]/route.ts` (server proxy), `hooks/useLookup.ts`, call-report/telemetry detail reads (via server proxy to `GET /calls/{id}/call-report` + `/telemetry`).
- **Campaign save**: `components/CampaignModal.tsx` / `app/api/campaigns/[id]/route.ts` persist `voice_id` (gated on the DB column).
- **APIs (callops, consumed not changed)**: `GET /lookups/*`, `GET /calls/{id}/call-report`, `GET /calls/{id}/telemetry`, `GET /campaigns/{id}`, `GET /companies/{id}/dashboard/{outcomes,call-volume,campaign-performance,live}`, `GET /campaigns/{id}/intent-stats`.
- **DB / migration**: none authored here; **open dependency** — confirm/apply `campaigns.voice_id` (and `network_provider`, `call_session_reports`, `call_model_usage`) in the dashboard's Supabase, or confirm callops uses a separate project.
- **Open questions logged (not implemented)**: network-provider filter; `/script-audio*` vs local `tts/*`; duplicate app-side STS/consent logic vs FE-zero-control.
