## ADDED Requirements

<!-- SUPERSEDED (2026-07-02) for the reports/outcome TABLE by change `reports-from-raw-callrecords`:
the CallOps dashboard analytics endpoints mis-divide the outcome vocab (drop subscribed/opted_out,
never count dialed — verified live on evra_callops origin/main increment_call_log). Garth ratified
computing the reports roll-up from raw call_records instead. Control + the campaign-view summary
aggregates below are UNAFFECTED; this supersession is scoped to the reports/outcome table and is
interim until CallOps analytics divide the vocab correctly. -->

### Requirement: Reports and charts consume callops analytics endpoints

The dashboard's report tables, outcome charts, KPI cards, and call-volume views SHALL source their aggregates from callops' deployed dashboard-analytics endpoints rather than rolling up raw `call_records` client- or app-side:

- `GET /companies/{id}/dashboard/outcomes` → `{ outcomes:[{value,count}], agent_outcomes:[{value,count}] }` (telephony outcome + disposition breakdown)
- `GET /companies/{id}/dashboard/call-volume` → `{ series:[{period,calls,connected,failed}], group_by }`
- `GET /companies/{id}/dashboard/campaign-performance` → `{ campaigns:[{campaign_id,name,calls,connected,opt_out,failed,average_talk_seconds}] }`
- `GET /companies/{id}/dashboard/live` → `{ running_campaigns, active_calls, queue_summary }`
- `GET /campaigns/{id}/intent-stats` → `{ campaign_id, connected_total, intents:[{day,intent_name,step,reached}] }`

These reads MUST be proxied server-side so the callops credential never reaches the browser.

#### Scenario: Outcome breakdown comes from callops

- **WHEN** the reports/outcome view renders the outcome breakdown
- **THEN** it reads `GET /companies/{id}/dashboard/outcomes`
- **AND** does not recompute the breakdown by counting raw `call_records` rows

#### Scenario: Campaign performance table is server-sourced

- **WHEN** the reports table lists per-campaign performance
- **THEN** the rows (calls, connected, opt_out, failed, average_talk_seconds) come from `GET /companies/{id}/dashboard/campaign-performance`

#### Scenario: Opt-out is correctly excluded from connected

- **WHEN** the dashboard shows connected vs opt-out figures
- **THEN** the values reflect callops' computation (opt-out excluded from connected)
- **AND** the dashboard does not re-derive a conflicting figure locally

### Requirement: Local analytics roll-up is removed

The dashboard SHALL remove the local analytics roll-up that duplicates callops' computation — the legacy `REPORT_KEYS`/`REPORT_HEADERS` bucket math, the client-side outcome summation in `lib/dashboardInsights.tsx`, and the positional `OutcomeDonut` bucket logic — once the corresponding views read callops analytics. No dashboard view may maintain a parallel outcome/disposition aggregation of `call_records`.

#### Scenario: No parallel aggregation remains

- **WHEN** the codebase is inspected after this change
- **THEN** no report/chart/KPI path computes outcome or disposition counts by aggregating `call_records` locally
- **AND** the legacy non-callops buckets (`no_speech`, `hangup`, `ni`, `dnq`, `busy_line`) no longer exist in the analytics code

### Requirement: Call Quality reads callops intent-stats

The Call Quality view SHALL source its waterfall and connected-total from `GET /campaigns/{id}/intent-stats` (via the existing/extended proxy), not from a local intent computation.

#### Scenario: Waterfall is server-sourced

- **WHEN** the Call Quality waterfall renders for a campaign
- **THEN** `connected_total` and the per-step `intents` come from callops `intent-stats`
