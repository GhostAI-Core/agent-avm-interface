## 1. Confirm auth (DB already cleared)

- [x] 1.1 DB confirmed: single shared Supabase; only gap was `campaigns.voice_id`, now applied + verified (service-role read returns the column). Q1 resolved — no separate dashboard DB.
- [ ] 1.2 Verify the dashboard's callops proxy/auth reaches the new reads: `GET /calls/{id}/call-report`, `GET /calls/{id}/telemetry`, `GET /lookups/*`, `GET /campaigns/{id}` (bearer/secret held server-side) — note any gap before building

## 2. Types & foundation

- [ ] 2.1 `types/index.ts`: `CallRecord` gains `business_disposition?`, `started_at?`, `ended_at?`, `room?`; remove reliance on `agent_outcome` for display
- [ ] 2.2 Add `CallReport` + `Telemetry` types (telephony narrative + model-usage events) for the detail reads
- [ ] 2.3 Add `CampaignSummary` type (`contacts_total,pending,in_progress,dialed,failed,retry,calls_total,connected,opt_out`); add `voice_id?` to the campaign type
- [ ] 2.4 Deprecate the stale `Agent='seeker'|'grace'|'sangoma'` union (do not use for callops agent selectors)

## 3. Lookups proxy + hook (callops-lookups)

- [ ] 3.1 `app/api/lookups/[type]/route.ts`: allowlist the 7 types (`call-outcomes, agent-outcomes, business-dispositions, contact-statuses, campaign-statuses, calling-windows, timezones`); proxy callops with the server-held credential; reject unknown types 4xx without calling callops; pass callops errors through
- [ ] 3.2 `hooks/useLookup.ts`: fetch + session-cache per type; return `{ items, loading, error }`; tolerate in-flight/failed without throwing
- [ ] 3.3 Re-point the campaign-status filter to `useLookup('campaign-statuses')`
- [ ] 3.4 Re-point the call-outcome/disposition filter (`components/CampaignDetail.tsx`) to `/lookups/call-outcomes` + `/lookups/business-dispositions` (not `agent-outcomes`)
- [ ] 3.5 Stop populating any callops-facing agent selector from the stale `Agent` union

## 4. 2-tier result display — per-call table (call-result-display)

- [ ] 4.1 `components/CampaignDetail.tsx`: render `outcome` and `business_disposition` as two distinct columns/fields; missing disposition shows "—"; support `subscribe/opt_out/callback/interested`
- [ ] 4.2 Migrate per-call `agent_outcome` reads (table + outcome filter) to `business_disposition` (analytics/KPI roll-up is handled by group 5, not here)
- [ ] 4.3 Add `business_disposition` to the call-table CSV export
- [ ] 4.4 `lib/tokens.ts` `statusChipTone()`: key colours off lookup `value`s with a neutral default (no positional/legacy-key binding)

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

- [ ] 7.1 Read the `summary` block from `GET /campaigns/{id}` (via proxy) in the campaign view
- [ ] 7.2 Surface `connected`, `opt_out`, `calls_total`; ensure `opt_out > 0` is never omitted
- [ ] 7.3 Source these from the callops summary, not client-side roll-up

## 8. Campaign voice_id (campaign-voice-id) — un-gated, column present

- [ ] 8.1 Add `voice_id` to the campaign PUT allowed-fields whitelist (`app/api/campaigns/[id]/route.ts`), keeping lifecycle `status` out per [[callops-control-parity]]
- [ ] 8.2 Persist the chosen Inworld `voice_id` on campaign script generation/edit (`components/CampaignModal.tsx`/`VoiceGenerator` save path); a save that omits it leaves the value unchanged

## 9. Validation & open questions

- [ ] 9.1 `npx tsc --noEmit` clean; lint no new errors
- [ ] 9.2 Manual: a connected+opted-out call shows `outcome=connected`/`business_disposition=opt_out` in their own columns; an `interested` call shows distinctly; legacy call shows "—"; a campaign with an opt-out shows the opt_out count
- [ ] 9.3 Manual: open a real call's detail → call-report telephony narrative + telemetry render; script-only call shows no model-usage without error
- [ ] 9.4 Manual: reports/OutcomeDonut/KPI/Call Quality match callops analytics (opt-out excluded from connected); kill the lookups proxy → dropdowns render empty, no crash; data columns unaffected
- [ ] 9.5 Send Cale the remaining open questions (Q2 `/script-audio` vs local tts; Q3 duplicate app-side STS/consent logic vs FE-zero-control; Q4 network-provider filter in dashboard?) — do not build Q2–Q4 here. (Q1 DB-sync resolved.)
- [ ] 9.6 Re-validate (`openspec validate --strict`) and archive when approved
