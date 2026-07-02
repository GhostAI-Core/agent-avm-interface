## ADDED Requirements

### Requirement: Report roll-up is derived from raw call_records

The dashboard's campaign report/outcome roll-up SHALL be computed from the raw per-call `call_records` rows CallOps writes to Supabase, read server-side with the service-role credential (never in the browser). This supersedes, for the reports/outcome table, the `consume-callops-analytics` requirement to source aggregates from CallOps `dashboard/*` endpoints — those endpoints mis-divide the outcome vocab (they drop `subscribed`/`opted_out` and never count `dialed`). CallOps remains the source of truth for control and for the raw per-call facts; the dashboard only derives a display view from them.

#### Scenario: Roll-up counts raw rows

- **WHEN** the reports table renders per-campaign aggregates
- **THEN** the counts are computed from `call_records` rows for that campaign
- **AND** `dialed` equals the attempt (row) count, not a CallOps `call_logs.dialed` value

#### Scenario: Conversions and opt-outs are not dropped

- **WHEN** the raw outcomes include `subscribed` and `opted_out`
- **THEN** `subscribed` is counted (as the success/conversion bucket) and `opted_out` is counted in a dedicated `opt_out` bucket
- **AND** neither is silently discarded the way the CallOps counter tables discard them

#### Scenario: Read is server-side and auth-gated

- **WHEN** `/api/reports` is called
- **THEN** it requires an authenticated session and reads `call_records` with the service-role client server-side
- **AND** the service-role credential never reaches the browser

### Requirement: Reports display only the buckets we produce

The reports table SHALL display only outcome buckets the pipeline actually produces — `dialed`, `connected`, `qualified` (labelled "Subscribed"), `voicemail`, `opt_out` (labelled "Opted Out"), `no_answer`, `failed` — and SHALL NOT display the never-populated dialer buckets (`no_speech`, `hangup`, `ni`, `callback`, `busy_line`) or the misused `dnq`.

#### Scenario: Dead buckets are hidden

- **WHEN** the reports table columns render
- **THEN** `no_speech`, `hangup`, `ni`, `callback`, `busy_line`, and `dnq` are not shown
- **AND** `opt_out` is shown as "Opted Out"

### Requirement: Interim status and switch-back path

The dashboard SHALL treat this roll-up as interim until CallOps' analytics endpoints divide the outcome vocab correctly (count `subscribed`/`opted_out`, increment `dialed`). When they do, the dashboard MAY switch the reports table back to consuming CallOps analytics; the raw-derived view MUST remain a valid equivalent. Control and the campaign-view summary aggregates SHALL be unaffected by this change.

#### Scenario: Campaign-view summary still comes from CallOps

- **WHEN** the campaign detail view shows `connected` / `opt_out` / `calls_total`
- **THEN** those come from CallOps `GET /campaigns/{id}` summary, not from this raw roll-up
