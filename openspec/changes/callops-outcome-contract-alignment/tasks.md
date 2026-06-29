## 1. Confirm auth (DB already cleared)

- [x] 1.1 DB confirmed: single shared Supabase; only gap was `campaigns.voice_id`, now applied + verified (service-role read returns the column). Q1 resolved — no separate dashboard DB.
- [x] 1.2 Auth probed (2026-06-26). **`/campaigns/{id}` accepts `X-Webhook-Secret` (200).** BUT `/lookups/*`, `/calls/{id}/call-report`, `/calls/{id}/telemetry`, `/companies/{id}/dashboard/*` return **401 "Missing bearer token"** with the webhook secret, and **500 "JWT secret not configured"** with a Supabase service-role/anon JWT — callops' deployment can't verify any token yet. ⇒ **Groups 3, 5, 6 are BLOCKED on callops JWT config (Q5, Cale).** Groups 4 (per-call display from Supabase `call_records` — has `business_disposition`/`agent_outcome`/`outcome`/`room`), 7 (`/campaigns/{id}` summary), 8 (voice_id) are unblocked and built first.
- [ ] 1.3 (Cale, Q5) Resolve callops JWT auth for server-side proxy reads: confirm the JWT-verification secret/JWKS is configured + deployed, and what token the dashboard presents (forward the user's Supabase ES256 session token, or a service credential). Un-gates groups 3/5/6.

## 2. Types & foundation

- [x] 2.1 `types/index.ts`: `CallRecord` gains `business_disposition?`, `started_at?`, `ended_at?`, `room?`; remove reliance on `agent_outcome` for display
- [x] 2.2 Add `CallReport` + `Telemetry` types (telephony narrative + model-usage events) for the detail reads — `CallReport`, `TelemetryEvent`, `Telemetry` in `types/index.ts` (consumers gated on group 6 / JWT)
- [x] 2.3 Add `CampaignSummary` type (`contacts_total,pending,in_progress,dialed,failed,retry,calls_total,connected,opt_out`); add `voice_id?` to the campaign type
- [x] 2.4 Deprecate the stale `Agent='seeker'|'grace'|'sangoma'` union — plain doc note (NOT `@deprecated` JSDoc, which would warn on the legit `campaigns.agent` product-label uses); guidance: never feed a callops agent selector

## 3. Lookups proxy + hook (callops-lookups)

- [ ] 3.1 `app/api/lookups/[type]/route.ts`: allowlist the 7 types (`call-outcomes, agent-outcomes, business-dispositions, contact-statuses, campaign-statuses, calling-windows, timezones`); proxy callops with the server-held credential; reject unknown types 4xx without calling callops; pass callops errors through
- [ ] 3.2 `hooks/useLookup.ts`: fetch + session-cache per type; return `{ items, loading, error }`; tolerate in-flight/failed without throwing
- [ ] 3.3 Re-point the campaign-status filter to `useLookup('campaign-statuses')`
- [ ] 3.4 Re-point the call-outcome/disposition filter (`components/CampaignDetail.tsx`) to `/lookups/call-outcomes` + `/lookups/business-dispositions` (not `agent-outcomes`)
- [ ] 3.5 Stop populating any callops-facing agent selector from the stale `Agent` union

## 4. 2-tier result display — per-call table (call-result-display)

- [x] 4.1 `components/CampaignDetail.tsx`: render `outcome` and `business_disposition` as two distinct columns/fields; missing disposition shows "—"; support `subscribe/opt_out/callback/interested`
- [x] 4.2 Migrate per-call `agent_outcome` reads (table + outcome filter) to `business_disposition` — no per-call display read of `agent_outcome` remains (table + filter use `outcome`/`business_disposition`); the only surviving `agent_outcome` ref is the write path `app/api/calls/result/route.ts`, which is the STS/consent logic flagged out-of-scope (Q3) — not a display read
- [x] 4.3 Add `business_disposition` to the call-table CSV export
- [x] 4.4 `lib/tokens.ts` `statusChipTone()`: keyed off callops lookup `value`s (campaign-statuses + call-outcomes + business-dispositions) with a neutral default; retired the legacy `no_speech/hangup/ni/dnq/busy_line/qualified` keys; added `subscribe/interested/opt_out/busy`

## 5. Consume callops analytics — delete local roll-up (consume-callops-analytics)

- [ ] 5.1 Add server-side proxy reads for `GET /companies/{id}/dashboard/{outcomes,call-volume,campaign-performance,live}` and `GET /campaigns/{id}/intent-stats` (check whether `app/api/intents` already proxies intent-stats — extend, don't duplicate)
- [ ] 5.2 Reports table ← `dashboard/campaign-performance`; OutcomeDonut ← `dashboard/outcomes`; KPI cards (`lib/dashboardInsights.tsx`) ← `dashboard/outcomes` + `campaign-performance`; call-volume chart ← `dashboard/call-volume`
- [ ] 5.3 `components/CallQuality.tsx`: source waterfall + `connected_total` from `/campaigns/{id}/intent-stats`
- [ ] 5.4 **Remove the local roll-up**: delete `REPORT_KEYS`/`REPORT_HEADERS` (`app/page.tsx`), the client-side outcome summation in `lib/dashboardInsights.tsx`, and the positional `OutcomeDonut` bucket logic (`components/Charts.tsx`/`lib/chartTheme.ts`); confirm no path still aggregates `call_records` for outcome/disposition counts
- [ ] 5.5 Verify the OutcomeDonut, KPI cards, reports table, and Call Quality match callops figures (esp. opt-out excluded from connected) before/after

## 6. Split call-report detail (call-report-detail)

- [ ] 6.1 Add server-side proxy reads for `GET /calls/{id}/call-report` and `GET /calls/{id}/telemetry`
- [ ] 6.2 Call-detail panel: render the call-report telephony narrative (AMD category, SIP, DTMF/matched-key, playback, disconnect reason, transfer target, talk_seconds); show an unavailable state when no report
- [ ] 6.3 Call-detail panel: render telemetry model-usage events (e.g. `llm_metrics`, `tts_metrics`); empty list → no model-usage section, no error

## 7. Campaign summary aggregates (campaign-outcome-summary)

- [x] 7.1 Read the `summary` block from `GET /campaigns/{id}` (via proxy) in the campaign view — new `GET` handler in `app/api/campaigns/[id]/route.ts` (X-Webhook-Secret, server-side), fetched in `page.tsx#viewDetailedLogs`
- [x] 7.2 Surface `connected`, `opt_out`, `calls_total` — `CampaignDetail` renders a callops-summary stat row; `opt_out` always shown when `summary` present (0 renders as "0", never dropped)
- [x] 7.3 Source these from the callops summary, not client-side roll-up — values come straight from the proxied `summary` block; no per-call re-summation

> **⚠️ 7.x BLOCKED (found 2026-06-26 in live smoke).** The dashboard side (proxy forwards `json.summary`; view renders only when non-null) is correct and merge-safe, but the **data source does not exist on callops 0.2.0**: `GET /campaigns/{id}` (X-Webhook-Secret, 200) returns **no `summary` key**; `GET /campaigns/{id}/intent-stats` is **401 bearer-only** (same JWT wall as 3/5/6); `/campaigns/{id}/summary` and `/stats` are **404**. ⇒ Group 7 cannot show data until callops either (a) embeds `summary` in the webhook-secret-reachable `GET /campaigns/{id}`, or (b) we re-point to the bearer-only analytics endpoints once Q5 (JWT) is resolved. **Reclassify 7 from "unblocked/done" → built-but-blocked on Q5/Cale.** Added to 9.5.

## 8. Campaign voice_id (campaign-voice-id) — un-gated, column present

- [x] 8.1 Add `voice_id` to the campaign PUT allowed-fields whitelist (`app/api/campaigns/[id]/route.ts`), keeping lifecycle `status` out per [[callops-control-parity]]
- [x] 8.2 Persist the chosen Inworld `voice_id` on campaign script generation — `VoiceGenerator` surfaces the voice id via new `onVoiceIdChange`; `CampaignModal` threads it into the create payload (generate mode only); POST route inserts `voice_id`. Upload mode / omitted save → no `voice_id` written (PUT leaves existing value unchanged)

## 9. Validation & open questions

- [x] 9.1 `npx tsc --noEmit` clean (exit 0, no errors). Lint: 20 errors/5 warnings repo-wide but **none new** from this change — all pre-existing (`page.tsx` `any[]`/setState-in-effect lines untouched by the branch; diff only added the `CampaignSummary` import + `summary` prop). Bar "lint no new errors" met. (2026-06-26)
- [~] 9.2 Manual (2026-06-26, live against campaign 49 with 4 seeded `qa-2tier-*` rows): **PASS** — connected+opt_out shows `outcome=connected`/`business_disposition=opt_out` in distinct columns; `interested`/`subscribe` render distinctly; legacy & failed rows show "—"; CSV carries both columns. **Also fixed under smoke:** (a) `Qualify %`/`CPL` KPIs read the retired `outcome==='qualified'` (permanently 0) — re-pointed to `business_disposition ∈ {subscribe,interested}` per Garth (now 28.57% / R3.77 live); (b) empty-state `colSpan` 8→9 after the Disposition column was added. **NOT verified — the opt_out-count clause:** the callops-summary stat row never renders because the live API has no summary for it (see 7.x finding).
- [ ] 9.3 Manual: open a real call's detail → call-report telephony narrative + telemetry render; script-only call shows no model-usage without error
- [ ] 9.4 Manual: reports/OutcomeDonut/KPI/Call Quality match callops analytics (opt-out excluded from connected); kill the lookups proxy → dropdowns render empty, no crash; data columns unaffected
- [ ] 9.5 Send Cale the open questions: **Q5 (BLOCKING groups 3/5/6) — callops JWT auth not configured on the deployment ("JWT secret not configured"); what token should the dashboard present?**; **Q6 (BLOCKS group 7, found 2026-06-26) — live `GET /campaigns/{id}` returns no `summary` block (no connected/opt_out/calls_total); `intent-stats` is 401 bearer-only, `/summary` & `/stats` are 404. Where do per-campaign outcome aggregates live in 0.2.0 — will you embed `summary` in `GET /campaigns/{id}` (webhook-secret reachable), or must we source them from a bearer-only analytics endpoint?**; Q2 `/script-audio` vs local tts; Q3 duplicate app-side STS/consent logic vs FE-zero-control; Q4 network-provider filter in dashboard? (Q1 DB-sync resolved.)
- [ ] 9.6 Re-validate (`openspec validate --strict`) and archive when approved
